// Makes one change with the engine (brief 5.4, D87): the stored records and
// one command go in; the edit (the records to save, and the undo) and the
// records after it come out. Runs in the background worker. The engine
// refuses what it can't do with a code, never with words for the screen.

import {
  applyWrites,
  type Edit,
  type EditCommand,
  EngineInputError,
  editPlan,
  type PlanRecords,
  paymentNumberOf,
  type RecordWrite,
  sameValue,
} from '@prepenny/engine';
import { holidaysFor } from './holidays.ts';
import { onNewestRecords, type PaymentAt, paymentsAt } from './payment-at.ts';
import { editInputOf } from './plan-input.ts';

/**
 * The payment number of each one-off change and tick an undo would put
 * back, as it was when the edit was made (PLAN.md item 4), by recordKey.
 * Null for a pay-later bill, or a payment no series has.
 */
export type PaymentNumbers = Readonly<Record<string, number | null>>;

export interface EditResult {
  readonly edit: Edit;
  /** The records once the edit is saved. */
  readonly records: PlanRecords;
  /** For its undo: which payment each change and tick it would put back was on. */
  readonly numbers: PaymentNumbers;
  /**
   * The payments its commands were about, before and after, so the change
   * can be made again on newer records after a clash (step 3d).
   */
  readonly payments: readonly PaymentAt[];
}

/** The payment number of a series' payment on its original date, in these records. */
function numberIn(records: PlanRecords, seriesId: string, originalDate: string): number | null {
  const series = records.series.find((one) => one.id === seriesId);
  if (series === undefined) return null;
  const holidays = holidaysFor(records.settings?.nation ?? 'england-and-wales');
  return paymentNumberOf({ series, holidays, originalDate });
}

/** The payment numbers of the changes and ticks in a list of writes that put something back. */
export function numbersOf(records: PlanRecords, writes: readonly RecordWrite[]): PaymentNumbers {
  const numbers: Record<string, number | null> = {};
  for (const write of writes) {
    if ((write.kind !== 'change' && write.kind !== 'tick') || write.value === null) continue;
    numbers[recordKey(write)] = numberIn(records, write.seriesId, write.originalDate);
  }
  return numbers;
}

/**
 * One change, made by the engine. An undo given the payment numbers its
 * edit was made with (PLAN.md item 4) is refused when a change or tick it
 * puts back would now be on a different payment: a series' dates have moved
 * since, as another phone's "this and all later ones" can do.
 */
export function runEdit(
  records: PlanRecords,
  today: string,
  command: EditCommand,
  numbers?: PaymentNumbers,
): EditResult {
  const edit = editPlan(editInputOf(records, today), command);
  const after = applyWrites(records, edit.writes);
  if (command.kind === 'undo' && numbers !== undefined) {
    for (const write of edit.writes) {
      if ((write.kind !== 'change' && write.kind !== 'tick') || write.value === null) continue;
      const key = recordKey(write);
      if (!(key in numbers)) continue;
      if (numberIn(after, write.seriesId, write.originalDate) !== numbers[key]) {
        throw new EngineInputError(
          'changed-since',
          `Series ${write.seriesId}: the payment on ${write.originalDate} has moved since, so this can't be undone.`,
        );
      }
    }
  }
  return {
    edit,
    records: after,
    numbers: numbersOf(records, edit.undo),
    payments: paymentsAt(records, after, [command]),
  };
}

/** Which record a write is about, so two writes to the same record can be told apart. */
export function recordKey(write: RecordWrite): string {
  switch (write.kind) {
    case 'settings':
      return 'settings';
    case 'change':
      return `change|${write.seriesId}|${write.originalDate}`;
    case 'tick':
      return `tick|${write.seriesId}|${write.originalDate}${write.setAside === true ? '|set-aside' : ''}`;
    default:
      return `${write.kind}|${write.id}`;
  }
}

/**
 * Several commands made one after another, each on the records the one
 * before left, as one edit (step 2e): for each record, how it was before the
 * first and how it is after the last, as What if's Keep does (D135). So one
 * undo takes all of them back (D87). A record that ends as it started isn't
 * in it.
 */
export function runEdits(
  records: PlanRecords,
  today: string,
  given: readonly EditCommand[],
  /**
   * The payments the commands were about when they were first made: each is
   * found again on these records by its family and number, as for "Put mine
   * back" after a clash (step 3d).
   */
  madeOn?: readonly PaymentAt[],
): EditResult {
  const commands = madeOn === undefined ? given : onNewestRecords(records, given, madeOn);
  let now = records;
  const order: string[] = [];
  const first = new Map<string, RecordWrite>();
  const last = new Map<string, RecordWrite>();
  for (const command of commands) {
    const edit = editPlan(editInputOf(now, today), command);
    edit.writes.forEach((write, index) => {
      const key = recordKey(write);
      if (!first.has(key)) {
        const before = edit.undo[index];
        if (before === undefined) throw new Error('An edit has no undo for one of its writes.');
        first.set(key, before);
        order.push(key);
      }
      last.set(key, write);
    });
    now = applyWrites(now, edit.writes);
  }
  const writes: RecordWrite[] = [];
  const undo: RecordWrite[] = [];
  for (const key of order) {
    const after = last.get(key);
    const before = first.get(key);
    if (after === undefined || before === undefined) continue;
    if (sameValue(after.value, before.value)) continue;
    writes.push(after);
    undo.push(before);
  }
  return {
    edit: { writes, undo },
    records: now,
    numbers: numbersOf(records, undo),
    payments: paymentsAt(records, now, commands),
  };
}
