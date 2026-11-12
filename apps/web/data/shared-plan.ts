'use client';

// What this phone knows about the plan being shared (steps 3f and 3g), from
// the server's rows as it last saw them: who it is, each person's name and
// role, which accounts, debts and goals are shared, which payments are
// locked to someone ("From Jess", D16), whose pay each shared payment is
// (D303), who added each account, debt and goal, and who last changed each
// payment and when ("Changed by Tom", brief 4.14). The engine's records
// don't hold any of this: privacy is the server's (D290).
//
// Only for a plan kept in an account. A plan on this phone only is nobody
// else's, so it has nothing shared.

import { useEffect, useState } from 'react';
import type { ChangeMark } from '../lib/changed-by.ts';
import { openDb } from './db.ts';
import { onPlanBroughtDown } from './sync.ts';

export type PlanRole = 'owner' | 'editor' | 'viewer';

export interface SharedPlan {
  readonly personId: string;
  /** Each person in the plan's name, by id, this person's own included. */
  readonly nicknames: Readonly<Record<string, string>>;
  /** Each person in the plan's role, by id (step 3g). */
  readonly roles: Readonly<Record<string, PlanRole>>;
  /** Accounts everyone in the plan sees. Every other one on this phone is this person's own, private. */
  readonly sharedAccounts: ReadonlySet<string>;
  /** Debts and savings goals everyone in the plan sees (D65). */
  readonly sharedDebts: ReadonlySet<string>;
  readonly sharedGoals: ReadonlySet<string>;
  /** Payments locked to someone else, such as "From Jess" on Tom's phone, by series id. */
  readonly lockedTo: ReadonlyMap<string, string>;
  /** Payments locked to anyone, this person included: whose money "From Jess" is, for a shared goal (D464). */
  readonly lockedToAnyone: ReadonlyMap<string, string>;
  /** Whose pay each payment is, by series id (D303). */
  readonly paidTo: ReadonlyMap<string, string>;
  /** Each series' family, by series id, for claiming pay (D418). */
  readonly familyOf: ReadonlyMap<string, string>;
  /** Who added each account, debt and goal, as "accounts|id": only they make a shared one private (D462). */
  readonly addedBy: ReadonlyMap<string, string>;
  /**
   * Who last changed each payment's parts, and when (step 3g): its series
   * ("series|id"), its one-off change and its tick ("change|seriesId|date",
   * "tick|seriesId|date").
   */
  readonly marks: ReadonlyMap<string, ChangeMark>;
  /** Each series' version on the server, for telling a series a change made from one that only ended it. */
  readonly seriesVersion: ReadonlyMap<string, number>;
}

function markOf(row: {
  readonly editBy?: string;
  readonly editMadeAt?: string;
  readonly editSavedAt?: string;
  readonly editKind?: string;
}): ChangeMark | null {
  if (row.editBy === undefined || row.editMadeAt === undefined) return null;
  // When it reached the account, which no phone can set (D492); what the phone said only from an older server.
  return { by: row.editBy, at: row.editSavedAt ?? row.editMadeAt, kind: row.editKind ?? '' };
}

async function read(planId: string): Promise<SharedPlan | null> {
  const db = openDb();
  try {
    const link = await db.links.get(planId);
    if (link === undefined) return null;
    const rows = await db.rows.where('planId').equals(planId).toArray();
    const sharedAccounts = new Set<string>();
    const sharedDebts = new Set<string>();
    const sharedGoals = new Set<string>();
    const lockedTo = new Map<string, string>();
    const lockedToAnyone = new Map<string, string>();
    const paidTo = new Map<string, string>();
    const familyOf = new Map<string, string>();
    const addedBy = new Map<string, string>();
    const marks = new Map<string, ChangeMark>();
    const seriesVersion = new Map<string, number>();
    for (const row of rows) {
      if (row.createdBy !== undefined) addedBy.set(`${row.table}|${row.id}`, row.createdBy);
      const mark = markOf(row);
      if (row.table === 'payment_changes' || row.table === 'ticks') {
        const series = row.values.series_id ?? row.values.budget_id;
        const date = row.values.original_date;
        if (mark !== null && typeof series === 'string' && typeof date === 'string') {
          const key = `${row.table === 'ticks' ? 'tick' : 'change'}|${series}|${date}`;
          const before = marks.get(key);
          if (before === undefined || Date.parse(before.at) < Date.parse(mark.at)) {
            marks.set(key, mark);
          }
        }
        continue;
      }
      if (row.deleted) continue;
      if (row.table === 'accounts' && row.privateTo === null) sharedAccounts.add(row.id);
      if (row.table === 'debts' && row.privateTo === null) sharedDebts.add(row.id);
      if (row.table === 'goals' && row.privateTo === null) sharedGoals.add(row.id);
      if (row.table !== 'series') continue;
      if (mark !== null) marks.set(`series|${row.id}`, mark);
      seriesVersion.set(row.id, row.version);
      const locked = row.values.locked_to;
      const paid = row.values.paid_to;
      const family = row.values.family_id;
      if (typeof locked === 'string') {
        lockedToAnyone.set(row.id, locked);
        if (locked !== link.personId) lockedTo.set(row.id, locked);
      }
      if (typeof paid === 'string') paidTo.set(row.id, paid);
      if (typeof family === 'string') familyOf.set(row.id, family);
    }
    const roles: Record<string, PlanRole> = {};
    for (const [person, role] of Object.entries(link.roles ?? {})) {
      roles[person] = role === 'owner' || role === 'viewer' ? role : 'editor';
    }
    return {
      personId: link.personId,
      nicknames: link.nicknames ?? {},
      roles,
      sharedAccounts,
      sharedDebts,
      sharedGoals,
      lockedTo,
      lockedToAnyone,
      paidTo,
      familyOf,
      addedBy,
      marks,
      seriesVersion,
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/**
 * The plan's sharing, read again whenever the plan on the phone changes
 * (`version`) or something is brought down from the account.
 */
export function useSharedPlan(planId: string | null, version: number): SharedPlan | null {
  const [shared, setShared] = useState<SharedPlan | null>(null);
  const [heard, setHeard] = useState(0);
  useEffect(() => onPlanBroughtDown(() => setHeard((n) => n + 1)), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again when the plan or the account changes
  useEffect(() => {
    if (planId === null) {
      setShared(null);
      return;
    }
    let live = true;
    void read(planId).then((found) => {
      if (live) setShared(found);
    });
    return () => {
      live = false;
    };
  }, [planId, version, heard]);
  return shared;
}

/** This person's name in the plan, or null when they haven't given one. */
export function myName(shared: SharedPlan | null): string | null {
  if (shared === null) return null;
  const name = shared.nicknames[shared.personId];
  return name === undefined || name === '' ? null : name;
}

/** Someone else's name in the plan, or null when they haven't given one. */
export function nameOf(shared: SharedPlan | null, person: string): string | null {
  const name = shared?.nicknames[person];
  return name === undefined || name === '' ? null : name;
}

/** Whether someone else is in the plan: "Changed by" and Activity's names only matter then. */
export function hasPartner(shared: SharedPlan | null): boolean {
  if (shared === null) return false;
  return Object.keys({ ...shared.roles, ...shared.nicknames }).some(
    (person) => person !== shared.personId,
  );
}

/** This person's own role, "editor" when the phone hasn't heard it yet. */
export function myRole(shared: SharedPlan | null): PlanRole {
  if (shared === null) return 'editor';
  return shared.roles[shared.personId] ?? 'editor';
}

/** The other person in the plan, with their name when they've given one. */
export function partnerOf(
  shared: SharedPlan | null,
): { readonly id: string; readonly name: string | null } | null {
  if (shared === null) return null;
  const id = Object.keys({ ...shared.roles, ...shared.nicknames }).find(
    (person) => person !== shared.personId,
  );
  if (id === undefined) return null;
  return { id, name: nameOf(shared, id) };
}
