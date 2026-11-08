// Clashes (step 3d, D59, ARCHITECTURE.md 3.5). A change made on this phone
// waits in the queue until it can be sent. By then another phone may have
// changed the same thing. This works out, for one waiting change, what to
// do, from the records this phone has, which are only what the person can
// read: a partner's private records are never here, so they can never be
// part of a clash or its words.
//
// - Nobody else has changed what this change is about since it was made:
//   it's sent as it is.
// - Someone has: the change's own commands are made again on the newest
//   records, as the engine would make them now. When that keeps everything
//   the other change did, both are kept, and nobody needs telling.
// - When it would undo something the other change did, they clash, and the
//   newest wins: newest by when it was made, by each phone's clock corrected
//   against the server's (D59). This change is sent and replaces theirs, and
//   they're told; or theirs is kept, this change isn't sent, and this
//   person is told, with "Put mine back".
// - When the change can't be made on the newest records any more, as when
//   the payment has gone, it isn't sent, and the person is told.
//
// Pure: no network, no storage, no clock. Runs in the background worker.
// Nothing here writes an amount, a name or a note anywhere but its answer.

import {
  applyWrites,
  type EditCommand,
  EngineInputError,
  type PlanRecords,
  type RecordWrite,
  sameValue,
} from '@prepenny/engine';
import { type PaymentNumbers, runEdit, runEdits } from './edit.ts';
import {
  onNewestRecords,
  type PaymentAt,
  type PaymentFacts,
  paymentInFamily,
} from './payment-at.ts';
import type { SetupProgress } from './setup-progress.ts';
import {
  type DbWrite,
  type MirrorRow,
  mirrorMap,
  paymentRowId,
  recordsFromRows,
  type SyncPlan,
  settingsRowId,
  type Table,
  writesForEdit,
} from './sync-rows.ts';

// ---------------------------------------------------------------------------
// Which row on the server each of the engine's records is.

/** The server row an engine record is kept in (lib/sync-rows.ts). */
export function rowOf(plan: SyncPlan, write: RecordWrite): { table: Table; id: string } {
  switch (write.kind) {
    case 'account':
      return { table: 'accounts', id: write.id };
    case 'balance-update':
      return { table: 'balance_updates', id: write.id };
    case 'series':
      return { table: 'series', id: write.id };
    case 'debt':
      return { table: 'debts', id: write.id };
    case 'budget':
      return { table: 'budgets', id: write.id };
    case 'spend':
      return { table: 'spends', id: write.id };
    case 'goal':
      return { table: 'goals', id: write.id };
    case 'pay-profile':
      return { table: 'pay_profiles', id: write.id };
    case 'pay-week':
      return { table: 'pay_weeks', id: write.id };
    case 'pay-adjustment':
      return { table: 'pay_adjustments', id: write.id };
    case 'change':
      return {
        table: 'payment_changes',
        id: paymentRowId(plan.planId, 'payment_changes', write.seriesId, write.originalDate),
      };
    case 'tick':
      return {
        table: 'ticks',
        id: paymentRowId(
          plan.planId,
          'ticks',
          write.seriesId,
          write.originalDate,
          write.setAside === true,
        ),
      };
    case 'settings':
      return { table: 'settings', id: settingsRowId(plan.planId, plan.personId) };
  }
}

/** A record as it is in these records, or null when it isn't there. */
export function valueIn(records: PlanRecords, write: RecordWrite): unknown {
  const byId = (list: readonly { readonly id: string }[] | undefined, id: string) =>
    list?.find((one) => one.id === id) ?? null;
  switch (write.kind) {
    case 'account':
      return byId(records.accounts, write.id);
    case 'balance-update':
      return byId(records.balanceUpdates, write.id);
    case 'series':
      return byId(records.series, write.id);
    case 'debt':
      return byId(records.debts, write.id);
    case 'budget':
      return byId(records.budgets, write.id);
    case 'spend':
      return byId(records.spends, write.id);
    case 'goal':
      return byId(records.goals, write.id);
    case 'pay-profile':
      return byId(records.payProfiles, write.id);
    case 'pay-week':
      return byId(records.payWeeks, write.id);
    case 'pay-adjustment':
      return byId(records.payAdjustments, write.id);
    case 'change':
      return (
        (records.changes ?? []).find(
          (one) => one.seriesId === write.seriesId && one.originalDate === write.originalDate,
        ) ?? null
      );
    case 'tick':
      return (
        (records.ticks ?? []).find(
          (one) =>
            one.seriesId === write.seriesId &&
            one.originalDate === write.originalDate &&
            (one.setAside === true) === (write.setAside === true),
        ) ?? null
      );
    case 'settings':
      return records.settings ?? null;
  }
}

const keyOfWrite = (write: RecordWrite): string => {
  switch (write.kind) {
    case 'settings':
      return 'settings';
    case 'change':
      return `change|${write.seriesId}|${write.originalDate}`;
    case 'tick':
      return `tick|${write.seriesId}|${write.originalDate}${write.setAside === true ? '|s' : ''}`;
    default:
      return `${write.kind}|${write.id}`;
  }
};

// ---------------------------------------------------------------------------
// The words' facts: built here, put into words on the screen (strings file).

/** What a change did to a payment or a record, for the words. */
export type Action =
  | { readonly kind: 'amount'; readonly amount: number }
  | { readonly kind: 'moved'; readonly to: string }
  | { readonly kind: 'removed' }
  | { readonly kind: 'paid' }
  | { readonly kind: 'not-paid' }
  | { readonly kind: 'changed' };

/** Everything the words of a clash need, all from records this person can read. */
export interface ClashFacts {
  /** Whose change it was: their person id. */
  readonly by: string | null;
  /** The name of the payment or record it was about, as this phone has it. */
  readonly name: string;
  /** For one payment: its date, "YYYY-MM-DD". */
  readonly on: string | null;
  readonly theirs: Action;
  readonly ours: Action;
}

function paymentAction(before: PaymentFacts | null, after: PaymentFacts | null): Action {
  if (after === null || (after.skipped && before?.skipped !== true)) return { kind: 'removed' };
  if (before !== null && after.ticked !== before.ticked) {
    return { kind: after.ticked ? 'paid' : 'not-paid' };
  }
  if (before !== null && after.date !== before.date) return { kind: 'moved', to: after.date };
  if (before === null || after.amount !== before.amount) {
    return { kind: 'amount', amount: after.amount };
  }
  return { kind: 'changed' };
}

function recordAction(before: unknown, after: unknown): Action {
  if (after === null) return { kind: 'removed' };
  const amountOf = (value: unknown) =>
    typeof value === 'object' && value !== null && 'amount' in value
      ? (value as { amount: unknown }).amount
      : undefined;
  const amount = amountOf(after);
  if (typeof amount === 'number' && amount !== amountOf(before)) return { kind: 'amount', amount };
  return { kind: 'changed' };
}

/** The name a record goes by, from these records. */
function nameOf(records: PlanRecords, write: RecordWrite, value: unknown): string {
  const named = (thing: unknown) =>
    typeof thing === 'object' && thing !== null && 'name' in thing
      ? String((thing as { name: unknown }).name ?? '')
      : '';
  switch (write.kind) {
    case 'balance-update': {
      const accountId = (value as { accountId?: string } | null)?.accountId;
      return named(records.accounts.find((one) => one.id === accountId));
    }
    case 'spend': {
      const budgetId = (value as { budgetId?: string } | null)?.budgetId;
      return named((records.budgets ?? []).find((one) => one.id === budgetId));
    }
    case 'change':
    case 'tick':
      return (
        named(records.series.find((one) => one.id === write.seriesId)) ||
        named((records.budgets ?? []).find((one) => one.id === write.seriesId))
      );
    default:
      return named(value);
  }
}

// ---------------------------------------------------------------------------
// Settling one waiting change.

/** A change made on this phone, as it waits in the queue (data/db.ts). */
export interface QueuedChange {
  readonly writes: readonly RecordWrite[];
  /** The records as they were before it (its undo list), when known. */
  readonly before?: readonly RecordWrite[];
  /** The commands that made it, to make it again on newer records. Missing on changes made before step 3d. */
  readonly commands?: readonly EditCommand[];
  readonly today?: string;
  /** For an undo: the payment numbers its edit was made with (PLAN.md item 4). */
  readonly numbers?: PaymentNumbers;
  readonly payments?: readonly PaymentAt[];
  /** The plan's change numbers this phone had when it was made. */
  readonly seen?: { readonly shared: number; readonly mine: number };
  /** When it was made, by this phone's clock corrected against the server's. */
  readonly madeAt: string;
  readonly setup?: SetupProgress;
}

export interface SettleAsk {
  readonly plan: SyncPlan;
  readonly rows: readonly MirrorRow[];
  readonly change: QueuedChange;
  /** The edits this phone has sent, so its own changes never clash with each other. */
  readonly ours: readonly string[];
}

export type Settled =
  /** Send these writes. `overrides`: the edits this change replaces, whose people are told. */
  | {
      readonly kind: 'send';
      readonly writes: readonly DbWrite[];
      readonly overrides: readonly string[];
    }
  /** It's so already, as when both phones ticked the same payment: nothing to send. */
  | { readonly kind: 'done' }
  /** A newer change is kept, and this one isn't sent. */
  | { readonly kind: 'kept-theirs'; readonly facts: ClashFacts }
  /** It can't be made on the newest records, as when the payment has gone. */
  | { readonly kind: 'cant'; readonly facts: ClashFacts };

const rowKey = (table: Table, id: string) => `${table}|${id}`;

export function settleChange(ask: SettleAsk): Settled {
  const { plan, rows, change } = ask;
  const ours = new Set(ask.ours);
  const mirror = mirrorMap(rows);
  const server = recordsFromRows(rows).records;
  const send = (writes: readonly RecordWrite[], overrides: readonly string[]): Settled => ({
    kind: 'send',
    writes: writesForEdit(rows, writes, plan, change.setup).writes,
    overrides,
  });

  /** A row someone else saved after this change was made, or null. */
  const byOthers = (table: Table, id: string): MirrorRow | null => {
    const row = mirror.get(rowKey(table, id));
    const seen = change.seen;
    if (row === undefined || seen === undefined) return null;
    if (row.seq <= (row.privateTo === null ? seen.shared : seen.mine)) return null;
    if (typeof row.editId === 'string' && ours.has(row.editId)) return null;
    return row;
  };
  const payments = change.payments ?? [];
  /** Rows of a payment's family, and its own change and tick, saved by someone else since. */
  const othersOnPayment = (at: PaymentAt): MirrorRow[] => {
    const found: MirrorRow[] = [];
    // Every series of its family, removed ones included.
    for (const one of rows) {
      if (one.table !== 'series' || one.values.family_id !== at.familyId) continue;
      const row = byOthers('series', one.id);
      if (row !== null) found.push(row);
    }
    for (const table of ['payment_changes', 'ticks'] as const) {
      const row = byOthers(table, paymentRowId(plan.planId, table, at.seriesId, at.originalDate));
      if (row !== null) found.push(row);
    }
    return found;
  };

  // 1. Has anyone else changed what this change is about since it was made?
  const touched = [
    ...change.writes.flatMap((write) => {
      const { table, id } = rowOf(plan, write);
      const row = byOthers(table, id);
      return row === null ? [] : [row];
    }),
    ...payments.flatMap(othersOnPayment),
  ];
  if (touched.length === 0) return send(change.writes, []);

  // A payment the other phone removed can't be changed here, whichever was
  // newer: making this change again wouldn't bring it back. Removed on both
  // phones, it's done.
  for (const at of payments) {
    if (!removedNow(at.before, paymentInFamily(server, at.familyId, at.number)?.facts ?? null)) {
      continue;
    }
    if (othersOnPayment(at).length === 0) continue;
    if (removedNow(at.before, at.after)) return { kind: 'done' };
    return { kind: 'cant', facts: factsFor(server, change, touched, []) };
  }

  // 2. Made again on the newest records.
  const holder = { writes: change.writes as readonly RecordWrite[] };
  if (change.commands !== undefined && change.today !== undefined) {
    const commands = onNewestRecords(server, change.commands, payments);
    try {
      const only = commands.length === 1 ? commands[0] : undefined;
      holder.writes =
        only !== undefined
          ? runEdit(server, change.today, only, change.numbers).edit.writes
          : runEdits(server, change.today, commands).edit.writes;
    } catch (error) {
      if (!(error instanceof EngineInputError)) throw error;
      const already =
        commands.length === 1 &&
        ((commands[0]?.kind === 'tick' && error.code === 'already-ticked') ||
          (commands[0]?.kind === 'untick' && error.code === 'not-ticked'));
      if (already) return { kind: 'done' };
      return { kind: 'cant', facts: factsFor(server, change, touched, []) };
    }
  }
  const again = holder.writes;
  const merged = applyWrites(server, again);

  // 3. Would it undo something someone else changed? Record by record...
  const before = new Map((change.before ?? []).map((write) => [keyOfWrite(write), write]));
  const clashing: { readonly write: RecordWrite | null; readonly rows: MirrorRow[] }[] = [];
  for (const write of again) {
    const { table, id } = rowOf(plan, write);
    const row = byOthers(table, id);
    if (row === null) continue;
    const theirs = valueIn(server, write);
    const base = before.get(keyOfWrite(write));
    if (undoesTheirs(base === undefined ? UNKNOWN : base.value, theirs, write.value)) {
      clashing.push({ write, rows: [row] });
    }
  }
  // ...and payment by payment, as the person sees them.
  for (const at of payments) {
    const theirs = paymentInFamily(server, at.familyId, at.number)?.facts ?? null;
    const after = paymentInFamily(merged, at.familyId, at.number)?.facts ?? null;
    // Removing a payment the other phone changed undoes their change too.
    const removesTheirs =
      removedNow(at.before, after) && !removedNow(at.before, theirs) && theirs !== null;
    if (
      !sameValue(theirs, at.before) &&
      (removesTheirs || !keepsWhatTheyChanged(at.before, theirs, after))
    ) {
      const others = othersOnPayment(at);
      if (others.length > 0) clashing.push({ write: null, rows: others });
    }
  }
  if (clashing.length === 0) return send(again, []);

  // 4. The newest change wins (D59).
  const theirRows = clashing.flatMap((one) => one.rows);
  const newest = theirRows
    .map((row) => row.editMadeAt ?? '')
    .sort()
    .at(-1);
  if (newest !== undefined && newest !== '' && change.madeAt > newest) {
    const edits = [
      ...new Set(theirRows.flatMap((row) => (typeof row.editId === 'string' ? [row.editId] : []))),
    ];
    return send(again, edits);
  }
  return { kind: 'kept-theirs', facts: factsFor(server, change, theirRows, clashing) };
}

const UNKNOWN = Symbol('unknown');

/** True when a payment that was there is gone, or removed just this once, now. */
function removedNow(before: PaymentFacts | null, now: PaymentFacts | null): boolean {
  if (before === null || before.skipped) return false;
  return now === null || now.skipped;
}

/**
 * True when writing `ours` over a record would undo something someone else
 * changed in it: a field they changed from `base` that `ours` sets otherwise.
 * When the record as this phone first saw it isn't known, any difference counts.
 */
function undoesTheirs(base: unknown, theirs: unknown, ours: unknown): boolean {
  if (sameValue(theirs, ours)) return false;
  if (base === UNKNOWN || theirs === null || ours === null) return true;
  if (typeof theirs !== 'object' || typeof ours !== 'object') return true;
  if (base !== null && typeof base !== 'object') return true;
  // A record that wasn't there before: everything in theirs is what they set.
  const b = (base ?? {}) as Record<string, unknown>;
  const t = theirs as Record<string, unknown>;
  const o = ours as Record<string, unknown>;
  const fields = new Set([...Object.keys(b), ...Object.keys(t), ...Object.keys(o)]);
  for (const field of fields) {
    if (!sameValue(t[field], b[field]) && !sameValue(o[field], t[field])) return true;
  }
  return false;
}

/** True when every part of the payment someone else changed is kept as they left it. */
function keepsWhatTheyChanged(
  before: PaymentFacts | null,
  theirs: PaymentFacts | null,
  after: PaymentFacts | null,
): boolean {
  if (theirs === null) return after === null;
  if (after === null) return false;
  if (before === null) return sameValue(theirs, after);
  for (const field of Object.keys(theirs) as (keyof PaymentFacts)[]) {
    if (!sameValue(theirs[field], before[field]) && !sameValue(after[field], theirs[field])) {
      return false;
    }
  }
  return true;
}

/** The newest of these rows' edits: whose it was. */
function newestBy(rows: readonly MirrorRow[]): string | null {
  const newest = [...rows]
    .sort((a, b) => (a.editMadeAt ?? '').localeCompare(b.editMadeAt ?? ''))
    .at(-1);
  return newest?.editBy ?? null;
}

/**
 * The words' facts for a clash: the payment it was about when there is one,
 * otherwise the first record, with what each change did to it.
 */
function factsFor(
  server: PlanRecords,
  change: QueuedChange,
  rows: readonly MirrorRow[],
  clashing: readonly { readonly write: RecordWrite | null }[],
): ClashFacts {
  const by = newestBy(rows);
  const at = change.payments?.[0];
  if (at !== undefined) {
    const theirs = paymentInFamily(server, at.familyId, at.number)?.facts ?? null;
    return {
      by,
      name: at.before?.name ?? at.after?.name ?? theirs?.name ?? '',
      on: at.originalDate,
      theirs: paymentAction(at.before, theirs),
      ours: paymentAction(at.before, at.after),
    };
  }
  const write = clashing.find((one) => one.write !== null)?.write ?? change.writes[0];
  if (write === undefined) {
    return { by, name: '', on: null, theirs: { kind: 'changed' }, ours: { kind: 'changed' } };
  }
  const base = (change.before ?? []).find((one) => keyOfWrite(one) === keyOfWrite(write));
  const original = change.writes.find((one) => keyOfWrite(one) === keyOfWrite(write)) ?? write;
  const theirs = valueIn(server, write);
  return {
    by,
    name: nameOf(server, write, theirs ?? original.value) || nameOf(server, write, original.value),
    on: null,
    theirs: recordAction(base?.value ?? null, theirs),
    ours: recordAction(base?.value ?? null, original.value),
  };
}

// ---------------------------------------------------------------------------
// A change this phone sent that a newer one replaced, told by a notice.

export interface ReplacedAsk {
  readonly rows: readonly MirrorRow[];
  /** The change as this phone sent it. */
  readonly change: QueuedChange;
  /** Who replaced it. */
  readonly by: string | null;
}

/** The words' facts for a change of this phone's that a newer one replaced. */
export function replacedFacts(ask: ReplacedAsk): ClashFacts {
  const server = recordsFromRows(ask.rows).records;
  return { ...factsFor(server, ask.change, [], []), by: ask.by };
}
