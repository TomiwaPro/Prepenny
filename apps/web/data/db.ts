// The phone's own database (ARCHITECTURE.md 3.8), in the browser's IndexedDB
// through Dexie. Each plan's records are kept one by one, the way the engine
// gives them back after an edit (D87), so an edit's writes are saved as they
// are, and Phase 3 can sync each record on its own (ARCHITECTURE.md 3.5).
//
// Nothing here ever writes an amount, a name or a note anywhere but this
// database: no logs, no error reports (CLAUDE.md).

import type { PlanRecords, PlanSettings, RecordWrite } from '@prepenny/engine';
import { Dexie, type EntityTable } from 'dexie';
import type { SetupProgress } from '../lib/setup-progress.ts';
import type { MirrorRow } from '../lib/sync-rows.ts';

/** One plan on this phone. */
export interface StoredPlan {
  readonly id: string;
  /** Sam's example plan (brief 4.1, D15), always shown with Sun 25 Oct 2026 as today (D133). */
  readonly isExample: boolean;
  /** For the example: which version of its records this phone holds, as a fingerprint. */
  readonly exampleVersion?: string;
  /**
   * The person has changed the example to try things out (D182). A changed
   * example is kept when the app's own example changes, until "Start again
   * with the example".
   */
  readonly edited?: boolean;
  /**
   * The person's own plan only: how far first-time setup has got (step 2e).
   * Leaving part-way keeps it, and PrePenny carries on from there.
   */
  readonly setup?: SetupProgress;
  /**
   * The person's own plan only: whose it is, once they've signed up or
   * signed in on this phone (brief 4.13 "Try first", step 3b). Their sign-in
   * id. It stays on the phone until step 3c sends it to the server.
   */
  readonly owner?: string;
}

/** Which plan the app shows: the person's own, or the example (step 2e). */
export type Showing = 'own' | 'example';

/** The kinds of record, as the engine's edits name them (D87). */
export type RecordKind = RecordWrite['kind'];

/** One record of one plan. */
export interface StoredRecord {
  readonly planId: string;
  readonly kind: RecordKind;
  /** The record's id, or "seriesId|originalDate" for a change or tick ("|set-aside" for that tick). */
  readonly key: string;
  /**
   * The record's place among its kind, so lists come back in the order they
   * were made: the first account added stays first (D168).
   */
  readonly seq: number;
  readonly value: unknown;
}

/** This device's own settings (ARCHITECTURE.md 3.8). */
export interface DeviceSetting {
  readonly key: string;
  readonly value: unknown;
}

/**
 * One row as the server last gave it to this phone (step 3c): the phone's
 * copy of the server, so it knows each record's version and whether
 * anything is left to send.
 */
export type StoredRow = MirrorRow & { readonly planId: string };

/**
 * One change made on this phone and not sent yet (ARCHITECTURE.md 3.5): the
 * engine's writes, in the order they were made. Sent one at a time; taken
 * off once the server has saved it.
 */
export interface UnsentEdit {
  readonly planId: string;
  /** Its place in the queue. */
  readonly n: number;
  /** The edit's own id, so sending it twice changes nothing (save_edit). */
  readonly editId: string;
  /** When it was made, by this phone's clock (D59; corrected in step 3d). */
  readonly madeAt: string;
  /** What kind of change, as a short code: "tick", "this-and-later", "setup". */
  readonly kind: string;
  readonly writes: readonly RecordWrite[];
  /** How far setup had got with it, for the person's own settings (step 2e). */
  readonly setup?: SetupProgress;
  /** Set when the server refused it, with the refusal's code. What happens then is step 3d. */
  readonly refused?: string;
}

/**
 * A plan on this phone that's kept in the person's account (step 3c): who
 * it's for, and the change numbers this phone has brought down so far, for
 * the plan's shared records and for the person's own (D299).
 */
export interface PlanLink {
  readonly planId: string;
  readonly personId: string;
  readonly shared: number;
  readonly mine: number;
  /**
   * The first copy is still going up: one cut off part-way is sent again
   * from where it stopped (step 3c fix). Gone once all of it has arrived.
   */
  readonly sending?: true;
}

export type PrePennyDb = Dexie & {
  plans: EntityTable<StoredPlan, 'id'>;
  records: Dexie.Table<StoredRecord, [string, RecordKind, string]>;
  device: EntityTable<DeviceSetting, 'key'>;
  rows: Dexie.Table<StoredRow, [string, string, string]>;
  unsent: Dexie.Table<UnsentEdit, [string, number]>;
  links: EntityTable<PlanLink, 'planId'>;
};

export function openDb(name = 'prepenny'): PrePennyDb {
  const db = new Dexie(name) as PrePennyDb;
  db.version(1).stores({
    plans: 'id',
    records: '[planId+kind+key], planId',
    device: 'key',
  });
  // Step 3c: the server's rows, the changes not sent yet, and which plans are kept in an account.
  db.version(2).stores({
    rows: '[planId+table+id], planId',
    unsent: '[planId+n], planId',
    links: 'planId',
  });
  return db;
}

/** Where each list of records lives in PlanRecords. */
const listOf = {
  account: 'accounts',
  'balance-update': 'balanceUpdates',
  series: 'series',
  change: 'changes',
  tick: 'ticks',
  debt: 'debts',
  budget: 'budgets',
  spend: 'spends',
  goal: 'goals',
  'pay-profile': 'payProfiles',
  'pay-week': 'payWeeks',
  'pay-adjustment': 'payAdjustments',
} as const satisfies Record<Exclude<RecordKind, 'settings'>, keyof PlanRecords>;

type ListKind = keyof typeof listOf;

const SETTINGS_KEY = 'settings';

function keyOfValue(kind: ListKind, value: unknown): string {
  const record = value as {
    id?: string;
    seriesId?: string;
    originalDate?: string;
    setAside?: true;
  };
  if (kind === 'change' || kind === 'tick') {
    return `${record.seriesId}|${record.originalDate}${record.setAside === true ? '|set-aside' : ''}`;
  }
  if (typeof record.id !== 'string') throw new Error(`A ${kind} record needs an id.`);
  return record.id;
}

/** The database key of one write (D87). */
export function keyOfWrite(write: RecordWrite): string {
  if (write.kind === 'settings') return SETTINGS_KEY;
  if (write.kind === 'change' || write.kind === 'tick') {
    const setAside = write.kind === 'tick' && write.setAside === true;
    return `${write.seriesId}|${write.originalDate}${setAside ? '|set-aside' : ''}`;
  }
  return write.id;
}

/** Every record of a plan as rows, for saving a whole plan at once. */
export function rowsOf(planId: string, records: PlanRecords): StoredRecord[] {
  const rows: StoredRecord[] = [];
  for (const [kind, list] of Object.entries(listOf) as [ListKind, keyof PlanRecords][]) {
    const values = (records[list] as readonly unknown[] | undefined) ?? [];
    values.forEach((value, seq) => {
      rows.push({ planId, kind, key: keyOfValue(kind, value), seq, value });
    });
  }
  if (records.settings !== undefined) {
    rows.push({ planId, kind: 'settings', key: SETTINGS_KEY, seq: 0, value: records.settings });
  }
  return rows;
}

/** A plan's records back from its rows. */
export function recordsOf(rows: readonly StoredRecord[]): PlanRecords {
  const lists: Record<string, unknown[]> = {};
  for (const list of Object.values(listOf)) lists[list] = [];
  let settings: PlanSettings | undefined;
  const sorted = [...rows].sort(
    (a, b) => (a.seq ?? 0) - (b.seq ?? 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  for (const row of sorted) {
    if (row.kind === 'settings') {
      settings = row.value as PlanSettings;
      continue;
    }
    lists[listOf[row.kind]]?.push(row.value);
  }
  return {
    ...(lists as unknown as PlanRecords),
    ...(settings === undefined ? {} : { settings }),
  };
}

/**
 * The plan as it's to be saved, keeping whose it is from the phone: the plan
 * in memory may have been loaded before the person signed in, and saving it
 * must never take their mark off it (D306, D314).
 */
async function keepingOwner(db: PrePennyDb, plan: StoredPlan): Promise<StoredPlan> {
  if (plan.owner !== undefined) return plan;
  const owner = (await db.plans.get(plan.id))?.owner;
  return owner === undefined ? plan : { ...plan, owner };
}

/** Replaces everything stored for a plan with these records, in one go. */
export async function savePlan(db: PrePennyDb, plan: StoredPlan, records: PlanRecords) {
  await db.transaction('rw', db.plans, db.records, async () => {
    const kept = await keepingOwner(db, plan);
    await db.records.where('planId').equals(plan.id).delete();
    await db.records.bulkPut(rowsOf(plan.id, records));
    await db.plans.put(kept);
  });
}

/** A plan's records, from the phone. */
export async function loadRecords(db: PrePennyDb, planId: string): Promise<PlanRecords> {
  return recordsOf(await db.records.where('planId').equals(planId).toArray());
}

/**
 * Saves an edit's writes (D87): each one replaces its record, keeping its
 * place, or removes it when its value is null. A new record goes last among its kind.
 */
export async function saveWrites(db: PrePennyDb, planId: string, writes: readonly RecordWrite[]) {
  await db.transaction('rw', db.records, async () => {
    for (const write of writes) {
      const key = [planId, write.kind, keyOfWrite(write)] as [string, RecordKind, string];
      if (write.value === null) {
        await db.records.delete(key);
        continue;
      }
      const existing = await db.records.get(key);
      let seq = existing?.seq;
      if (seq === undefined) {
        const sameKind = await db.records
          .where('planId')
          .equals(planId)
          .filter((row) => row.kind === write.kind)
          .toArray();
        seq = sameKind.reduce((last, row) => Math.max(last, (row.seq ?? 0) + 1), 0);
      }
      await db.records.put({ planId, kind: write.kind, key: key[2], seq, value: write.value });
    }
  });
}

/**
 * Asks the browser to keep this phone's data even when space runs low
 * (ARCHITECTURE.md 7, iPhone home-screen apps). Answers whether it will.
 */
export async function askToKeepData(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || navigator.storage?.persist === undefined) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** The plan a change was for isn't this phone's own plan any more (D351). */
export class PlanGone extends Error {
  constructor() {
    super('plan-gone');
  }
}

/** A change as it's sent to the server once the plan is kept in an account (step 3c). */
export interface ChangeToSend {
  readonly editId: string;
  readonly madeAt: string;
  readonly kind: string;
}

/**
 * Saves one change to a plan (D87): its writes, and for the example, that
 * it has been changed (D182). All in one go, so nothing is half saved. When
 * the plan is kept in an account, the change joins the queue to send in the
 * same go (step 3c), so it's never saved without being queued, or the
 * other way round. The example is never sent anywhere. `isNew` for a plan
 * being made now; any other plan must still be on the phone.
 */
export async function saveChange(
  db: PrePennyDb,
  plan: StoredPlan,
  writes: readonly RecordWrite[],
  send?: ChangeToSend,
  isNew = false,
): Promise<StoredPlan> {
  let saved: StoredPlan = plan.isExample ? { ...plan, edited: true } : plan;
  await db.transaction('rw', [db.plans, db.records, db.links, db.unsent], async () => {
    // A plan removed from this phone, as when the account's plan has come
    // down in its place, is never saved back by a screen that still had it
    // open (D351). Only setup's "Make my plan" makes a new one.
    if (!plan.isExample && !isNew && (await db.plans.get(plan.id)) === undefined) {
      throw new PlanGone();
    }
    // Nor is a new plan started beside one that has just come down.
    if (isNew && ((await ownPlanOnPhone(db))?.id ?? plan.id) !== plan.id) throw new PlanGone();
    saved = await keepingOwner(db, saved);
    await saveWrites(db, plan.id, writes);
    await db.plans.put(saved);
    if (plan.isExample || send === undefined) return;
    if ((await db.links.get(plan.id)) === undefined) return;
    const last = await db.unsent.where('planId').equals(plan.id).last();
    await db.unsent.put({
      planId: plan.id,
      n: (last?.n ?? 0) + 1,
      editId: send.editId,
      madeAt: send.madeAt,
      kind: send.kind,
      writes,
      ...(saved.setup === undefined ? {} : { setup: saved.setup }),
    });
  });
  return saved;
}

/** How many changes on this phone haven't been sent yet, for one plan. */
export async function unsentCount(db: PrePennyDb, planId: string): Promise<number> {
  return db.unsent.where('planId').equals(planId).count();
}

/**
 * True when the example on this phone should be replaced by the app's own:
 * it isn't there, or it's an older version the person hasn't changed (D165, D182).
 */
export function exampleNeedsReplacing(stored: StoredPlan | undefined, version: string): boolean {
  if (stored === undefined) return true;
  return stored.exampleVersion !== version && stored.edited !== true;
}

/** Where this phone keeps which plan the app shows. */
const SHOWING = 'showing';

/** Which plan this phone shows, or undefined when nothing has been chosen yet. */
export async function showingOnPhone(db: PrePennyDb): Promise<Showing | undefined> {
  const value = (await db.device.get(SHOWING))?.value;
  return value === 'own' || value === 'example' ? value : undefined;
}

export async function setShowing(db: PrePennyDb, showing: Showing): Promise<void> {
  await db.device.put({ key: SHOWING, value: showing });
}

/**
 * The person's own plan on this phone, or undefined before they start one.
 * There's one for now; shared plans come in Phase 3.
 */
export async function ownPlanOnPhone(db: PrePennyDb): Promise<StoredPlan | undefined> {
  const plans = await db.plans.toArray();
  return plans.find((plan) => !plan.isExample);
}

/**
 * Makes the person's own plan on this phone theirs, once they've signed up or
 * signed in (brief 4.13 "Try first", step 3b). A plan already someone else's
 * stays theirs: it can only be left by someone signing in on a phone whose
 * last person never signed out, as when a sign-in ends by itself (D306).
 */
export async function claimOwnPlan(
  db: PrePennyDb,
  personId: string,
): Promise<'mine' | 'no-plan' | 'someone-else'> {
  return db.transaction('rw', db.plans, async () => {
    const own = await ownPlanOnPhone(db);
    if (own === undefined) return 'no-plan';
    if (own.owner === personId) return 'mine';
    if (own.owner !== undefined) return 'someone-else';
    await db.plans.put({ ...own, owner: personId });
    return 'mine';
  });
}
