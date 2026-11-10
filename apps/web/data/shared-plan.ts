'use client';

// What this phone knows about the plan being shared (step 3f), from the
// server's rows as it last saw them: who it is, each person's name, which
// accounts are shared, which payments are locked to someone else ("From
// Jess", D16) and whose pay each shared payment is (D303). The engine's
// records don't hold any of this: privacy is the server's (D290).
//
// Only for a plan kept in an account. A plan on this phone only is nobody
// else's, so it has nothing shared.

import { useEffect, useState } from 'react';
import { openDb } from './db.ts';
import { onPlanBroughtDown } from './sync.ts';

export interface SharedPlan {
  readonly personId: string;
  /** Each person in the plan's name, by id, this person's own included. */
  readonly nicknames: Readonly<Record<string, string>>;
  /** Accounts everyone in the plan sees. Every other one on this phone is this person's own, private. */
  readonly sharedAccounts: ReadonlySet<string>;
  /** Payments locked to someone else, such as "From Jess" on Tom's phone, by series id. */
  readonly lockedTo: ReadonlyMap<string, string>;
  /** Whose pay each payment is, by series id (D303). */
  readonly paidTo: ReadonlyMap<string, string>;
  /** Each series' family, by series id, for claiming pay (D418). */
  readonly familyOf: ReadonlyMap<string, string>;
}

async function read(planId: string): Promise<SharedPlan | null> {
  const db = openDb();
  try {
    const link = await db.links.get(planId);
    if (link === undefined) return null;
    const rows = await db.rows.where('planId').equals(planId).toArray();
    const sharedAccounts = new Set<string>();
    const lockedTo = new Map<string, string>();
    const paidTo = new Map<string, string>();
    const familyOf = new Map<string, string>();
    for (const row of rows) {
      if (row.deleted) continue;
      if (row.table === 'accounts' && row.privateTo === null) sharedAccounts.add(row.id);
      if (row.table !== 'series') continue;
      const locked = row.values.locked_to;
      const paid = row.values.paid_to;
      const family = row.values.family_id;
      if (typeof locked === 'string' && locked !== link.personId) lockedTo.set(row.id, locked);
      if (typeof paid === 'string') paidTo.set(row.id, paid);
      if (typeof family === 'string') familyOf.set(row.id, family);
    }
    return {
      personId: link.personId,
      nicknames: link.nicknames ?? {},
      sharedAccounts,
      lockedTo,
      paidTo,
      familyOf,
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
