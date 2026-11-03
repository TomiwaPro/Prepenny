// The phone's own database (ARCHITECTURE.md 3.8), in the browser's IndexedDB
// through Dexie. Each plan's records are kept one by one, the way the engine
// gives them back after an edit (D87), so step 2c can save an edit's writes
// as they are, and Phase 3 can sync each record on its own (ARCHITECTURE.md 3.5).
//
// Nothing here ever writes an amount, a name or a note anywhere but this
// database: no logs, no error reports (CLAUDE.md).

import type { PlanRecords, PlanSettings, RecordWrite } from '@prepenny/engine';
import { Dexie, type EntityTable } from 'dexie';

/** One plan on this phone. */
export interface StoredPlan {
  readonly id: string;
  /** Sam's example plan (brief 4.1, D15), always shown with Sun 25 Oct 2026 as today (D133). */
  readonly isExample: boolean;
  /** For the example: which version of its records this phone holds. */
  readonly exampleVersion?: number;
}

/** The kinds of record, as the engine's edits name them (D87). */
export type RecordKind = RecordWrite['kind'];

/** One record of one plan. */
export interface StoredRecord {
  readonly planId: string;
  readonly kind: RecordKind;
  /** The record's id, or "seriesId|originalDate" for a change or tick ("|set-aside" for that tick). */
  readonly key: string;
  readonly value: unknown;
}

/** This device's own settings (ARCHITECTURE.md 3.8). */
export interface DeviceSetting {
  readonly key: string;
  readonly value: unknown;
}

export type PrePennyDb = Dexie & {
  plans: EntityTable<StoredPlan, 'id'>;
  records: Dexie.Table<StoredRecord, [string, RecordKind, string]>;
  device: EntityTable<DeviceSetting, 'key'>;
};

export function openDb(name = 'prepenny'): PrePennyDb {
  const db = new Dexie(name) as PrePennyDb;
  db.version(1).stores({
    plans: 'id',
    records: '[planId+kind+key], planId',
    device: 'key',
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
    for (const value of (records[list] as readonly unknown[] | undefined) ?? []) {
      rows.push({ planId, kind, key: keyOfValue(kind, value), value });
    }
  }
  if (records.settings !== undefined) {
    rows.push({ planId, kind: 'settings', key: SETTINGS_KEY, value: records.settings });
  }
  return rows;
}

/** A plan's records back from its rows. */
export function recordsOf(rows: readonly StoredRecord[]): PlanRecords {
  const lists: Record<string, unknown[]> = {};
  for (const list of Object.values(listOf)) lists[list] = [];
  let settings: PlanSettings | undefined;
  const sorted = [...rows].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
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

/** Replaces everything stored for a plan with these records, in one go. */
export async function savePlan(db: PrePennyDb, plan: StoredPlan, records: PlanRecords) {
  await db.transaction('rw', db.plans, db.records, async () => {
    await db.records.where('planId').equals(plan.id).delete();
    await db.records.bulkPut(rowsOf(plan.id, records));
    await db.plans.put(plan);
  });
}

/** A plan's records, from the phone. */
export async function loadRecords(db: PrePennyDb, planId: string): Promise<PlanRecords> {
  return recordsOf(await db.records.where('planId').equals(planId).toArray());
}

/** Saves an edit's writes (D87): each one replaces its record, or removes it when its value is null. */
export async function saveWrites(db: PrePennyDb, planId: string, writes: readonly RecordWrite[]) {
  await db.transaction('rw', db.records, async () => {
    for (const write of writes) {
      const key = [planId, write.kind, keyOfWrite(write)] as [string, RecordKind, string];
      if (write.value === null) {
        await db.records.delete(key);
      } else {
        await db.records.put({ planId, kind: write.kind, key: key[2], value: write.value });
      }
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
