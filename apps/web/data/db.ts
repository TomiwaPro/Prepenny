// The phone's own database (ARCHITECTURE.md 3.8), in the browser's IndexedDB
// through Dexie. Each plan's records are kept one by one, the way the engine
// gives them back after an edit (D87), so an edit's writes are saved as they
// are, and Phase 3 can sync each record on its own (ARCHITECTURE.md 3.5).
//
// Nothing here ever writes an amount, a name or a note anywhere but this
// database: no logs, no error reports (CLAUDE.md).

import type { EditCommand, PlanRecords, PlanSettings, RecordWrite } from '@prepenny/engine';
import { Dexie, type EntityTable } from 'dexie';
import type { ClashFacts } from '../lib/clash.ts';
import type { PaymentNumbers } from '../lib/edit.ts';
import type { PaymentAt } from '../lib/payment-at.ts';
import type { SetupProgress } from '../lib/setup-progress.ts';
import type { DbWrite, MirrorRow } from '../lib/sync-rows.ts';
import { clockOn, correctedTime } from './clock.ts';

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
  /**
   * For a plan kept in an account: the change numbers its records were
   * brought down up to (step 3d), so a change made on them knows what it
   * was made on, and what came after is a clash.
   */
  readonly seen?: Seen;
}

/** The plan's change numbers, for its shared records and the person's own (D299). */
export interface Seen {
  readonly shared: number;
  readonly mine: number;
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
export interface UnsentEdit extends MadeChange {
  readonly planId: string;
  /** Its place in the queue. */
  readonly n: number;
  /**
   * Set by step 3c when the server refused it. Since step 3d a refused
   * change is taken off the queue and the person told (PLAN.md item 32), so
   * this is only ever on a change left from before.
   */
  readonly refused?: string;
  /**
   * What was sent the last time, when no answer came back (step 3d): it may
   * have been saved, with only the answer lost on the way. It goes again
   * exactly as it was, with the same edit id, so the server changes nothing
   * the second time if it was (save_edit).
   */
  readonly attempt?: {
    readonly writes: readonly DbWrite[];
    readonly overrides: readonly string[];
    readonly madeAt: string;
  };
}

/** A change as it was made on this phone, to send it, and to make it again after a clash (step 3d). */
export interface MadeChange {
  /** The edit's own id, so sending it twice changes nothing (save_edit). */
  readonly editId: string;
  /** When it was made, by this phone's clock corrected against the server's (D59, data/clock.ts). */
  readonly madeAt: string;
  /** This phone's own time when it was made, before correcting. */
  readonly madeOnPhone?: number;
  /** False when the phone hadn't heard the server's time yet: `madeAt` is corrected when it's sent. */
  readonly clockKnown?: boolean;
  /** What kind of change, as a short code: "tick", "this-and-later", "setup". */
  readonly kind: string;
  readonly writes: readonly RecordWrite[];
  /** How far setup had got with it, for the person's own settings (step 2e). */
  readonly setup?: SetupProgress;
  /** The commands that made it, and the day they were made on (step 3d). Missing on changes from before. */
  readonly commands?: readonly EditCommand[];
  readonly today?: string;
  /** For an undo: the payment numbers its edit was made with (PLAN.md item 4). */
  readonly numbers?: PaymentNumbers;
  /** The records as they were before it: its undo list. */
  readonly before?: readonly RecordWrite[];
  /** The payments it was about, before and after it. */
  readonly payments?: readonly PaymentAt[];
  /** The plan's change numbers its records had been brought down up to. */
  readonly seen?: Seen;
}

/**
 * A change this phone has sent, kept a while (step 3d): so its own changes
 * never count as someone else's, and so when a newer change from another
 * phone replaces it, the phone can say what it was and put it back.
 */
export interface SentEdit extends MadeChange {
  readonly planId: string;
  /** When it was sent, by this phone's own clock, to keep only the newest. */
  readonly sentAt: number;
}

/**
 * A clash or a refused change the person is told about (step 3d), kept until
 * they've seen it. Its words are made from `facts` on the screen.
 * - `kept-theirs`: a newer change from another phone is kept, and this one wasn't sent.
 * - `replaced`: this one was saved, then a newer one from another phone replaced it.
 * - `cant`: it can't be made on the newest records, as when the payment has gone.
 * - `refused`: the account couldn't take it (PLAN.md item 32).
 */
export interface StoredClash {
  readonly id: string;
  readonly planId: string;
  readonly kind: 'kept-theirs' | 'replaced' | 'cant' | 'refused';
  readonly facts: ClashFacts;
  /** For `refused`: the server's code. */
  readonly code?: string;
  /** What "Put mine back" makes again. */
  readonly putBack?: {
    readonly commands: readonly EditCommand[];
    readonly payments: readonly PaymentAt[];
  };
  readonly at: number;
  /** Seen and closed: kept, so a notice heard again isn't shown twice. */
  readonly dismissed?: true;
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
  /** Each person in the plan's nickname, for "Tom changed Rent" (step 3d). */
  readonly nicknames?: Readonly<Record<string, string>>;
}

export type PrePennyDb = Dexie & {
  plans: EntityTable<StoredPlan, 'id'>;
  records: Dexie.Table<StoredRecord, [string, RecordKind, string]>;
  device: EntityTable<DeviceSetting, 'key'>;
  rows: Dexie.Table<StoredRow, [string, string, string]>;
  unsent: Dexie.Table<UnsentEdit, [string, number]>;
  links: EntityTable<PlanLink, 'planId'>;
  sent: Dexie.Table<SentEdit, [string, string]>;
  clashes: EntityTable<StoredClash, 'id'>;
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
  // Step 3d: changes sent from this phone, and clashes to tell the person about.
  db.version(3).stores({
    sent: '[planId+editId], planId',
    clashes: 'id, planId',
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
  /** This phone's own time when it was made: corrected against the server's as it's saved (step 3d). */
  readonly madeOnPhone: number;
  readonly kind: string;
  /** The commands that made it, to make it again after a clash (step 3d). */
  readonly commands?: readonly EditCommand[];
  readonly today?: string;
  readonly numbers?: PaymentNumbers;
  readonly before?: readonly RecordWrite[];
  readonly payments?: readonly PaymentAt[];
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
  await db.transaction('rw', [db.plans, db.records, db.links, db.unsent, db.device], async () => {
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
    const link = await db.links.get(plan.id);
    if (link === undefined) return;
    const last = await db.unsent.where('planId').equals(plan.id).last();
    const clock = await clockOn(db);
    const { madeOnPhone, ...made } = send;
    await db.unsent.put({
      ...made,
      planId: plan.id,
      n: (last?.n ?? 0) + 1,
      madeAt: correctedTime(madeOnPhone, clock),
      madeOnPhone,
      clockKnown: clock !== null,
      writes,
      // What its records had been brought down up to: anything after is a clash (step 3d).
      seen: plan.seen ?? { shared: link.shared, mine: link.mine },
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
