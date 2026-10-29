// What every edit command works with: the checked records, the draft of
// what's changing, and ways to find a payment and its other half.

import type { CheckedRecords } from '../balance/plan.ts';
import { type Day, formatDate, parseDate } from '../dates/day.ts';
import { EngineInputError } from '../errors.ts';
import type { Pence } from '../money/pence.ts';
import { type ChangeIndex, type PaymentOnDays, paymentAtIndex } from '../schedule/payments.ts';
import type { PreparedSeries } from '../schedule/series.ts';
import type { PaymentChange, Series } from '../schedule/types.ts';
import { changeWrite, clean, type Draft, type Draftable } from './records.ts';
import type { EditInput, PaymentRef } from './types.ts';

export type { Draftable };

export interface Context {
  readonly input: EditInput;
  readonly today: Day;
  readonly checked: CheckedRecords;
  readonly byId: ReadonlyMap<string, PreparedSeries>;
  readonly draft: Draft;
}

/** No changes at all: for what the series alone would give. */
export const NO_CHANGES: ChangeIndex = new Map();

/** Refuses the command. Messages name ids and dates only, never amounts, names or notes. */
export function refuse(code: string, message: string): never {
  throw new EngineInputError(code, message);
}

/** One payment of a series, as it is now. */
export interface Found {
  readonly prepared: PreparedSeries;
  /** Its index in the series: 0 is the series' first payment. */
  readonly index: number;
  /** Its payment number, counted from the original series (brief 5.3). */
  readonly number: number;
  readonly originalDate: string;
  /** The payment with its one-off change, if it has one. */
  readonly payment: PaymentOnDays;
}

/** The index of the payment first due on `day`, or −1 when the series has none. */
export function indexOf(prepared: PreparedSeries, day: Day): number {
  const index = prepared.firstIndexOnOrAfter(day);
  return index < prepared.count && prepared.dateAt(index) === day ? index : -1;
}

export function paymentAt(context: Context, prepared: PreparedSeries, index: number): Found {
  return {
    prepared,
    index,
    number: prepared.firstNumber + index,
    originalDate: formatDate(prepared.dateAt(index)),
    payment: paymentAtIndex(prepared, index, context.checked.changes, context.input.holidays),
  };
}

/** The payment a command is about, found by series and original date (brief 5.2). */
export function findPayment(context: Context, ref: PaymentRef): Found {
  if (typeof ref?.seriesId !== 'string' || ref.seriesId === '') {
    refuse('bad-command', 'The command needs the series of the payment.');
  }
  const prepared =
    context.byId.get(ref.seriesId) ??
    refuse('unknown-series', `Series ${ref.seriesId} isn't in the plan.`);
  const day = parseDate(ref.originalDate, `Series ${ref.seriesId}: the payment's original date`);
  const index = indexOf(prepared, day);
  if (index < 0) {
    refuse('no-payment', `Series ${ref.seriesId} has no payment first due on ${ref.originalDate}.`);
  }
  return paymentAt(context, prepared, index);
}

/** True for the shared half of a private transfer (D16). */
export function isSharedHalf(series: Series): boolean {
  return series.mirrorOf !== undefined;
}

/**
 * The other half of a private transfer (D16, ARCHITECTURE.md 3.6), or null
 * for any other series. The shared half names the private half it mirrors.
 */
export function otherHalf(context: Context, series: Series): PreparedSeries | null {
  if (series.mirrorOf !== undefined) {
    return (
      context.byId.get(series.mirrorOf) ??
      refuse('missing-half', `Series ${series.id} mirrors a series that isn't in the plan.`)
    );
  }
  const halves = context.checked.prepared.filter((one) => one.series.mirrorOf === series.id);
  if (halves.length > 1) {
    refuse('two-halves', `Series ${series.id} has more than one shared half.`);
  }
  return halves[0] ?? null;
}

export function outOfStep(series: Series): never {
  return refuse(
    'halves-out-of-step',
    `The two halves of series ${series.id} don't match, so it can't be changed.`,
  );
}

/** The same payment, by number, in the other half of a private transfer, or null. */
export function otherHalfPayment(context: Context, found: Found): Found | null {
  const other = otherHalf(context, found.prepared.series);
  if (other === null) return null;
  const index = found.number - other.firstNumber;
  if (index < 0 || index >= other.count) outOfStep(found.prepared.series);
  return paymentAt(context, other, index);
}

/** True when a change still changes something about its payment. */
export function hasEffect(change: Draftable<PaymentChange>): boolean {
  return (
    change.amount !== undefined ||
    change.newDate !== undefined ||
    change.name !== undefined ||
    change.note !== undefined ||
    change.isEstimate !== undefined ||
    change.skipped === true
  );
}

/** Saves a payment's change, or removes it when it no longer changes anything. */
export function saveChange(context: Context, change: Draftable<PaymentChange>): void {
  const seriesId = change.seriesId as string;
  const originalDate = change.originalDate as string;
  context.draft.set(
    changeWrite(seriesId, originalDate, hasEffect(change) ? clean<PaymentChange>(change) : null),
  );
}

/** What "just this one" can change, checked. */
export interface OneOff {
  readonly amount?: Pence | undefined;
  readonly day?: Day | undefined;
  readonly name?: string | undefined;
  readonly note?: string | undefined;
  readonly isEstimate?: boolean | undefined;
  readonly skipped?: boolean | undefined;
}

const noNote = (note: string | null): string | null => (note === '' ? null : note);

/**
 * Changes one payment (brief 5.4). Each part given is saved only where it
 * differs from what the series alone would give; where it's the same, that
 * part of the change is cleared (D93). A change left with nothing in it is
 * removed.
 */
export function changeOne(context: Context, found: Found, edits: OneOff): void {
  const { prepared, index, originalDate } = found;
  const seriesId = prepared.series.id;
  const plain = paymentAtIndex(prepared, index, NO_CHANGES, context.input.holidays);
  const next: Draftable<PaymentChange> = {
    ...(context.draft.change(seriesId, originalDate) ?? {}),
    seriesId,
    originalDate,
  };
  if (edits.amount !== undefined) {
    next.amount = edits.amount === plain.amount ? undefined : edits.amount;
  }
  if (edits.day !== undefined) {
    next.newDate = edits.day === plain.day ? undefined : formatDate(edits.day);
  }
  if (edits.name !== undefined) {
    next.name = edits.name === plain.name ? undefined : edits.name;
  }
  if (edits.note !== undefined) {
    next.note = noNote(edits.note) === noNote(plain.note) ? undefined : edits.note;
  }
  if (edits.isEstimate !== undefined) {
    next.isEstimate = edits.isEstimate === plain.isEstimate ? undefined : edits.isEstimate;
  }
  if (edits.skipped === true) {
    next.skipped = true;
  }
  saveChange(context, next);
}
