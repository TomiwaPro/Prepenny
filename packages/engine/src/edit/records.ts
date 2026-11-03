// Keeping track of the records an edit touches: what they were before, and
// what they are after. Nothing here is stored or sent anywhere.

import type { Account, BalanceUpdate, PlanSettings, Tick } from '../balance/types.ts';
import type { Spend } from '../budgets/types.ts';
import type { Debt } from '../debts/types.ts';
import { EngineInputError } from '../errors.ts';
import type { PayAdjustment } from '../pay/types.ts';
import type { PaymentChange, Series } from '../schedule/types.ts';
import type { Edit, PlanRecords, RecordWrite } from './types.ts';

/** The kinds of record, in the order an edit lists them. Kinds added in step 2a come last. */
const KIND_ORDER: readonly RecordWrite['kind'][] = [
  'series',
  'change',
  'tick',
  'balance-update',
  'debt',
  'spend',
  'pay-adjustment',
  'account',
  'budget',
  'goal',
  'pay-profile',
  'pay-week',
  'settings',
];

/** The kinds of record found by their own id. */
type ById = Exclude<RecordWrite, { kind: 'change' | 'tick' | 'settings' }>;

const BY_ID: readonly RecordWrite['kind'][] = KIND_ORDER.filter(
  (kind) => kind !== 'change' && kind !== 'tick' && kind !== 'settings',
);

function isById(write: RecordWrite): write is ById {
  return BY_ID.includes(write.kind);
}

/** One text that names a record: its kind, then its id, or its series and original date. */
export function keyOf(write: RecordWrite): string {
  switch (write.kind) {
    case 'settings':
      return JSON.stringify([write.kind]);
    case 'account':
    case 'series':
    case 'balance-update':
    case 'debt':
    case 'spend':
    case 'pay-adjustment':
    case 'budget':
    case 'goal':
    case 'pay-profile':
    case 'pay-week':
      return JSON.stringify([write.kind, write.id]);
    case 'change':
      return JSON.stringify([write.kind, write.seriesId, write.originalDate]);
    case 'tick':
      // A payment's tick and its money set aside's tick are two records (D116).
      return write.setAside === true
        ? JSON.stringify([write.kind, write.seriesId, write.originalDate, 'set-aside'])
        : JSON.stringify([write.kind, write.seriesId, write.originalDate]);
  }
}

function checkWrite(write: RecordWrite, what: string): void {
  const text = (value: unknown) => typeof value === 'string' && value !== '';
  const known =
    write !== null &&
    typeof write === 'object' &&
    KIND_ORDER.includes(write.kind) &&
    (write.kind === 'settings' ||
      (isById(write) ? text(write.id) : text(write.seriesId) && text(write.originalDate)));
  if (
    !known ||
    (write.kind === 'tick' && write.setAside !== undefined && write.setAside !== true) ||
    (write.value !== null && (typeof write.value !== 'object' || write.value === null))
  ) {
    throw new EngineInputError('bad-edit', `${what} isn't a record the engine knows.`);
  }
}

/**
 * True when two records hold the same values. A field set to undefined counts
 * as not there, so `{ note: undefined }` is the same as `{}`.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameValue(item, b[i]))
    );
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keysOf = (record: Record<string, unknown>) =>
    Object.keys(record).filter((key) => record[key] !== undefined);
  const keys = keysOf(left);
  return (
    keys.length === keysOf(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
  );
}

/** A record being put together: every field can still be set or cleared. */
export type Draftable<T> = { -readonly [K in keyof T]?: T[K] | undefined };

/**
 * A copy of a record without the fields set to undefined, so saved records
 * stay tidy. Name the record's type: `clean<Series>({ ...series, note: undefined })`.
 */
export function clean<T extends object>(record: Draftable<T>): T {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) copy[key] = value;
  }
  return copy as T;
}

/**
 * The records an edit is working on. It starts as the stored records, takes
 * every write in order, and at the end gives the writes that changed
 * something, with how those records looked before (ARCHITECTURE.md 2.3).
 */
export class Draft {
  readonly #now = new Map<string, RecordWrite>();
  readonly #before = new Map<string, RecordWrite>();

  constructor(records: PlanRecords) {
    for (const value of records.series) {
      this.#now.set(keyOf(seriesWrite(value.id, value)), seriesWrite(value.id, value));
    }
    for (const value of records.changes ?? []) {
      const write = changeWrite(value.seriesId, value.originalDate, value);
      this.#now.set(keyOf(write), write);
    }
    for (const value of records.ticks ?? []) {
      const write = tickWrite(value.seriesId, value.originalDate, value, value.setAside === true);
      this.#now.set(keyOf(write), write);
    }
    for (const value of records.balanceUpdates) {
      const write: RecordWrite = { kind: 'balance-update', id: value.id, value };
      this.#now.set(keyOf(write), write);
    }
    for (const value of records.debts ?? []) {
      const write: RecordWrite = { kind: 'debt', id: value.id, value };
      this.#now.set(keyOf(write), write);
    }
    for (const value of records.spends ?? []) {
      const write: RecordWrite = { kind: 'spend', id: value.id, value };
      this.#now.set(keyOf(write), write);
    }
    for (const value of records.payAdjustments ?? []) {
      const write: RecordWrite = { kind: 'pay-adjustment', id: value.id, value };
      this.#now.set(keyOf(write), write);
    }
    const byId: [RecordWrite['kind'], readonly { readonly id: string }[] | undefined][] = [
      ['account', records.accounts],
      ['budget', records.budgets],
      ['goal', records.goals],
      ['pay-profile', records.payProfiles],
      ['pay-week', records.payWeeks],
    ];
    for (const [kind, list] of byId) {
      for (const value of list ?? []) {
        const write = { kind, id: value.id, value } as RecordWrite;
        this.#now.set(keyOf(write), write);
      }
    }
    if (records.settings !== undefined) {
      const write: RecordWrite = { kind: 'settings', value: records.settings };
      this.#now.set(keyOf(write), write);
    }
  }

  /** The record as it is now in this edit, or null when there's none. */
  get(write: RecordWrite): RecordWrite['value'] {
    return this.#now.get(keyOf(write))?.value ?? null;
  }

  /** Saves a record, or removes it when `value` is null. */
  set(write: RecordWrite): void {
    const key = keyOf(write);
    if (!this.#before.has(key)) {
      this.#before.set(key, this.#now.get(key) ?? { ...write, value: null });
    }
    this.#now.set(key, write);
  }

  change(seriesId: string, originalDate: string): PaymentChange | null {
    return this.get(changeWrite(seriesId, originalDate, null)) as PaymentChange | null;
  }

  /** The payment's tick, or with `setAside` its money set aside's tick (D116). */
  tick(seriesId: string, originalDate: string, setAside = false): Tick | null {
    return this.get(tickWrite(seriesId, originalDate, null, setAside)) as Tick | null;
  }

  /** The edit: every record whose value changed, in a fixed order, and its "before" copy. */
  result(): Edit {
    const writes: RecordWrite[] = [];
    const undo: RecordWrite[] = [];
    const keys = [...this.#before.keys()].sort((a, b) => {
      const kindA = KIND_ORDER.indexOf((this.#now.get(a) as RecordWrite).kind);
      const kindB = KIND_ORDER.indexOf((this.#now.get(b) as RecordWrite).kind);
      return kindA - kindB || (a < b ? -1 : a > b ? 1 : 0);
    });
    for (const key of keys) {
      const before = this.#before.get(key) as RecordWrite;
      const after = this.#now.get(key) as RecordWrite;
      if (!sameValue(before.value, after.value)) {
        writes.push(after);
        undo.push(before);
      }
    }
    return { writes, undo };
  }
}

export function seriesWrite(id: string, value: Series | null): RecordWrite {
  return { kind: 'series', id, value };
}

export function changeWrite(
  seriesId: string,
  originalDate: string,
  value: PaymentChange | null,
): RecordWrite {
  return { kind: 'change', seriesId, originalDate, value };
}

/** A tick record. With `setAside`, the tick for the payment's money set aside (D116). */
export function tickWrite(
  seriesId: string,
  originalDate: string,
  value: Tick | null,
  setAside = false,
): RecordWrite {
  return setAside
    ? { kind: 'tick', seriesId, originalDate, setAside: true, value }
    : { kind: 'tick', seriesId, originalDate, value };
}

/** Checks the writes of an edit given back to the engine, as undo does. */
export function checkWrites(writes: unknown, what: string): readonly RecordWrite[] {
  if (!Array.isArray(writes)) {
    throw new EngineInputError('bad-edit', `${what} must be a list of records.`);
  }
  writes.forEach((write, i) => {
    checkWrite(write as RecordWrite, `${what}, record ${i + 1}`);
  });
  return writes as readonly RecordWrite[];
}

function applyToList<T>(
  list: readonly T[],
  writes: readonly RecordWrite[],
  kind: RecordWrite['kind'],
  keyOfRecord: (record: T) => string,
): T[] {
  const result: (T | null)[] = [...list];
  const position = new Map(list.map((record, i) => [keyOfRecord(record), i]));
  for (const write of writes) {
    if (write.kind !== kind) continue;
    const key = keyOf(write);
    const at = position.get(key);
    const value = write.value as T | null;
    if (at === undefined) {
      if (value !== null) {
        position.set(key, result.length);
        result.push(value);
      }
    } else {
      result[at] = value;
      if (value === null) position.delete(key);
    }
  }
  return result.filter((record): record is T => record !== null);
}

/**
 * The records with an edit's writes saved: each record replaced where it is,
 * removed, or added at the end. A helper for the app's own copy and for
 * tests; it changes nothing it's given.
 */
/**
 * One list of records with an edit's writes saved, by id. A list that wasn't
 * given stays not given, unless the edit adds to it.
 */
function applyById<R extends { readonly id: string }>(
  list: readonly R[] | undefined,
  writes: readonly RecordWrite[],
  kind: ById['kind'],
): readonly R[] | undefined {
  if (list === undefined && !writes.some((write) => write.kind === kind)) return undefined;
  return applyToList<R>(list ?? [], writes, kind, (one) =>
    keyOf({ kind, id: one.id, value: null } as RecordWrite),
  );
}

export function applyWrites<T extends PlanRecords>(records: T, writes: readonly RecordWrite[]): T {
  // Debts are left as they were given, missing or not, unless the edit changes one.
  const debts =
    records.debts === undefined && !writes.some((write) => write.kind === 'debt')
      ? {}
      : {
          debts: applyToList<Debt>(records.debts ?? [], writes, 'debt', (one) =>
            keyOf({ kind: 'debt', id: one.id, value: null }),
          ),
        };
  // Spends too: left as given unless the edit changes one.
  const spends =
    records.spends === undefined && !writes.some((write) => write.kind === 'spend')
      ? {}
      : {
          spends: applyToList<Spend>(records.spends ?? [], writes, 'spend', (one) =>
            keyOf({ kind: 'spend', id: one.id, value: null }),
          ),
        };
  // Pay adjustments too.
  const payAdjustments =
    records.payAdjustments === undefined && !writes.some((write) => write.kind === 'pay-adjustment')
      ? {}
      : {
          payAdjustments: applyToList<PayAdjustment>(
            records.payAdjustments ?? [],
            writes,
            'pay-adjustment',
            (one) => keyOf({ kind: 'pay-adjustment', id: one.id, value: null }),
          ),
        };
  const optional: Record<string, unknown> = {};
  const lists: [keyof PlanRecords, ById['kind']][] = [
    ['budgets', 'budget'],
    ['goals', 'goal'],
    ['payProfiles', 'pay-profile'],
    ['payWeeks', 'pay-week'],
  ];
  for (const [field, kind] of lists) {
    const list = applyById(records[field] as readonly { id: string }[] | undefined, writes, kind);
    if (list !== undefined) optional[field] = list;
  }
  // The plan's settings: one record, left as given unless the edit changes it.
  let settings: PlanSettings | null | undefined = records.settings;
  for (const write of writes) {
    if (write.kind === 'settings') settings = write.value;
  }
  const { settings: _settings, ...rest } = records;
  const result: Record<string, unknown> = {
    ...rest,
    ...(settings === undefined || settings === null ? {} : { settings }),
    ...debts,
    ...spends,
    ...payAdjustments,
    ...(optional as Partial<T>),
    accounts: applyToList<Account>(records.accounts, writes, 'account', (one) =>
      keyOf({ kind: 'account', id: one.id, value: null }),
    ),
    series: applyToList<Series>(records.series, writes, 'series', (one) =>
      keyOf(seriesWrite(one.id, null)),
    ),
    changes: applyToList<PaymentChange>(records.changes ?? [], writes, 'change', (one) =>
      keyOf(changeWrite(one.seriesId, one.originalDate, null)),
    ),
    ticks: applyToList<Tick>(records.ticks ?? [], writes, 'tick', (one) =>
      keyOf(tickWrite(one.seriesId, one.originalDate, null, one.setAside === true)),
    ),
    balanceUpdates: applyToList<BalanceUpdate>(
      records.balanceUpdates,
      writes,
      'balance-update',
      (one) => keyOf({ kind: 'balance-update', id: one.id, value: null }),
    ),
  };
  return result as T;
}
