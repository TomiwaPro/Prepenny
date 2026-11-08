// The payments a change is about, found again by their family and payment
// number (D49, PLAN.md item 4), with what each looked like before and after
// the change (step 3d). Worked out when a change is made, so a clash can be
// judged by what the person sees, and a change can be made again on newer
// records after another phone has split a payment's series.
//
// Pure: no network, no storage, no clock.

import {
  type EditCommand,
  type PaymentRef,
  type PlanRecords,
  paymentByNumber,
  paymentNumberOf,
  type Series,
  type Tick,
} from '@prepenny/engine';
import { holidaysFor } from './holidays.ts';

/** One payment as the person sees it: what a change to it can change. */
export interface PaymentFacts {
  readonly name: string;
  /** The day it happens, after any move. */
  readonly date: string;
  readonly amount: number;
  readonly skipped: boolean;
  readonly ticked: boolean;
  readonly note: string | null;
  readonly isEstimate: boolean;
}

/**
 * A payment a change was about, found again by its family and payment
 * number (D49, PLAN.md item 4), as it was before the change and after it.
 * `null` when there was no such payment.
 */
export interface PaymentAt {
  readonly seriesId: string;
  readonly originalDate: string;
  readonly familyId: string;
  readonly number: number;
  readonly before: PaymentFacts | null;
  readonly after: PaymentFacts | null;
}

export const holidaysOf = (records: PlanRecords) =>
  holidaysFor(records.settings?.nation ?? 'england-and-wales');

/** The payment a family has with this payment number, and the series it's in. */
export function paymentInFamily(
  records: PlanRecords,
  familyId: string,
  number: number,
): { readonly series: Series; readonly originalDate: string; readonly facts: PaymentFacts } | null {
  const holidays = holidaysOf(records);
  for (const series of records.series) {
    if (series.familyId !== familyId) continue;
    const payment = paymentByNumber({
      series,
      changes: (records.changes ?? []).filter((one) => one.seriesId === series.id),
      holidays,
      number,
    });
    if (payment === null) continue;
    const ticked = (records.ticks ?? []).some(
      (tick: Tick) =>
        tick.seriesId === series.id &&
        tick.originalDate === payment.originalDate &&
        tick.setAside !== true,
    );
    return {
      series,
      originalDate: payment.originalDate,
      facts: {
        name: payment.name,
        date: payment.date,
        amount: payment.amount,
        skipped: payment.skipped,
        ticked,
        note: payment.note,
        isEstimate: payment.isEstimate,
      },
    };
  }
  return null;
}

/** Every payment a command names, as the engine's PaymentRef. */
export function paymentRefsIn(command: EditCommand): readonly PaymentRef[] {
  switch (command.kind) {
    case 'just-this-one':
    case 'this-and-later':
    case 'remove-this-one':
    case 'remove-this-and-later':
    case 'move':
    case 'move-to-next-payday':
    case 'tick':
    case 'untick':
      return [command];
    case 'update-balance':
    case 'update-from-statement':
      return command.ticks ?? [];
    default:
      return [];
  }
}

/** The command with each payment it names found again by `retarget`. */
export function withRefs(
  command: EditCommand,
  retarget: (ref: PaymentRef) => PaymentRef,
): EditCommand {
  const move = <T extends PaymentRef>(ref: T): T => ({ ...ref, ...retarget(ref) });
  switch (command.kind) {
    case 'just-this-one':
    case 'this-and-later':
    case 'remove-this-one':
    case 'remove-this-and-later':
    case 'move':
    case 'move-to-next-payday':
    case 'tick':
    case 'untick':
      return move(command);
    case 'update-balance':
    case 'update-from-statement':
      return command.ticks === undefined ? command : { ...command, ticks: command.ticks.map(move) };
    default:
      return command;
  }
}

/**
 * The payments these commands are about, before and after them, worked out
 * when the change is made, so they can be found again after another phone
 * has split their series (D49).
 */
export function paymentsAt(
  before: PlanRecords,
  after: PlanRecords,
  commands: readonly EditCommand[],
): PaymentAt[] {
  const holidays = holidaysOf(before);
  const found: PaymentAt[] = [];
  const seen = new Set<string>();
  for (const command of commands) {
    for (const ref of paymentRefsIn(command)) {
      const key = `${ref.seriesId}|${ref.originalDate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const series = before.series.find((one) => one.id === ref.seriesId);
      if (series === undefined) continue;
      const number = paymentNumberOf({ series, holidays, originalDate: ref.originalDate });
      if (number === null) continue;
      found.push({
        seriesId: ref.seriesId,
        originalDate: ref.originalDate,
        familyId: series.familyId,
        number,
        before: paymentInFamily(before, series.familyId, number)?.facts ?? null,
        after: paymentInFamily(after, series.familyId, number)?.facts ?? null,
      });
    }
  }
  return found;
}

/**
 * The commands again, each payment found on the newest records by its
 * family and number, so a change to one payment still lands on it after
 * another phone has split its series. A tick in an Update balance on a
 * payment already ticked there is left out, as it's done already, and so is
 * one on a payment that's no longer there.
 */
export function onNewestRecords(
  records: PlanRecords,
  commands: readonly EditCommand[],
  payments: readonly PaymentAt[],
): EditCommand[] {
  const holidays = holidaysOf(records);
  const at = new Map(payments.map((one) => [`${one.seriesId}|${one.originalDate}`, one]));
  const retarget = (ref: PaymentRef): PaymentRef => {
    const where = at.get(`${ref.seriesId}|${ref.originalDate}`);
    if (where === undefined) return ref;
    const series = records.series.find((one) => one.id === ref.seriesId);
    if (
      series !== undefined &&
      paymentNumberOf({ series, holidays, originalDate: ref.originalDate }) === where.number
    ) {
      return ref;
    }
    const found = paymentInFamily(records, where.familyId, where.number);
    return found === null ? ref : { seriesId: found.series.id, originalDate: found.originalDate };
  };
  const ticked = (ref: PaymentRef & { readonly setAside?: true }) =>
    (records.ticks ?? []).some(
      (tick) =>
        tick.seriesId === ref.seriesId &&
        tick.originalDate === ref.originalDate &&
        (tick.setAside === true) === (ref.setAside === true),
    );
  /**
   * A payment still to tick: it's there, and not removed just this once. A
   * payment removed moves no money, so leaving its tick out of an Update
   * balance changes no figure, and the balance typed in is still saved.
   */
  const stillThere = (ref: PaymentRef) => {
    if ((records.budgets ?? []).some((budget) => budget.id === ref.seriesId)) return true;
    const series = records.series.find((one) => one.id === ref.seriesId);
    if (series === undefined) return false;
    if (paymentNumberOf({ series, holidays, originalDate: ref.originalDate }) === null)
      return false;
    return !(records.changes ?? []).some(
      (change) =>
        change.seriesId === ref.seriesId &&
        change.originalDate === ref.originalDate &&
        change.skipped === true,
    );
  };
  return commands.flatMap((command) => {
    const moved = withRefs(command, retarget);
    if (
      (moved.kind === 'update-balance' || moved.kind === 'update-from-statement') &&
      moved.ticks !== undefined
    ) {
      return [{ ...moved, ticks: moved.ticks.filter((tick) => !ticked(tick) && stillThere(tick)) }];
    }
    return [moved];
  });
}

/** The payments a change is mainly about: the ones its payment commands name, not the ticks inside an Update balance. */
export function mainPayments(
  commands: readonly EditCommand[] | undefined,
  payments: readonly PaymentAt[],
): PaymentAt[] {
  if (commands === undefined) return [...payments];
  const keys = new Set(
    commands
      .filter((one) => one.kind !== 'update-balance' && one.kind !== 'update-from-statement')
      .flatMap((one) => paymentRefsIn(one).map((ref) => `${ref.seriesId}|${ref.originalDate}`)),
  );
  return payments.filter((one) => keys.has(`${one.seriesId}|${one.originalDate}`));
}
