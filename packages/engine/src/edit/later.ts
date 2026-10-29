// "This and all later ones" and "Remove this and later" (brief 5.4,
// ARCHITECTURE.md 2.3, D60, D88 to D92). Both reach every later series of
// the family, so a payment split off earlier is changed or removed too.

import { addDays, type Day, formatDate, parseDate } from '../dates/day.ts';
import { checkPenceNotNegative, type Pence } from '../money/pence.ts';
import { paymentAtIndex } from '../schedule/payments.ts';
import { type PreparedSeries, prepareSeries } from '../schedule/series.ts';
import type { EndRule, PaymentChange, Schedule, Series } from '../schedule/types.ts';
import {
  type Context,
  checkHalvesMatch,
  type Draftable,
  type Found,
  findPayment,
  hasEffect,
  indexOf,
  isSharedHalf,
  NO_CHANGES,
  otherHalfPayment,
  outOfStep,
  refuse,
} from './context.ts';
import { changeWrite, clean, sameValue, seriesWrite, tickWrite } from './records.ts';
import type { PaymentRef, RecordWrite, ThisAndLaterEdits } from './types.ts';

/** A payment and the rest of its family after it. */
interface Stretch {
  /** The series holding the payment. */
  readonly first: PreparedSeries;
  /** The payment's index in `first`. */
  readonly index: number;
  /** The family's later series, split from it after this payment (D49), in order. */
  readonly later: readonly PreparedSeries[];
}

function stretchFrom(context: Context, found: Found): Stretch {
  const first = found.prepared;
  const later = context.checked.prepared
    .filter(
      (one) => one.series.familyId === first.series.familyId && one.firstNumber > first.firstNumber,
    )
    .sort((a, b) => a.firstNumber - b.firstNumber);
  return { first, index: found.index, later };
}

/** Each series of a stretch, with the index its part starts at. */
function partsOf(stretch: Stretch): [PreparedSeries, number][] {
  return [
    [stretch.first, stretch.index],
    ...stretch.later.map((one): [PreparedSeries, number] => [one, 0]),
  ];
}

/**
 * The end rule that stops a series just before the payment at `index`:
 * by count if it ends after a number of payments, otherwise by date, the
 * day before that payment's original date (brief 5.4, ARCHITECTURE.md 2.3).
 */
function endBefore(prepared: PreparedSeries, index: number): EndRule {
  return prepared.series.end.kind === 'after'
    ? { kind: 'after', payments: prepared.firstNumber + index }
    : { kind: 'on', date: formatDate(addDays(prepared.dateAt(index), -1)) };
}

/**
 * The series ended just before the payment at `index`. It loses any
 * different last amount: that belongs to the family's last payment, which
 * now comes later or is gone (D89, D92).
 */
function endedBefore(prepared: PreparedSeries, index: number): Series {
  return clean<Series>({
    ...prepared.series,
    end: endBefore(prepared, index),
    lastAmount: undefined,
  });
}

function removeSeries(context: Context, prepared: PreparedSeries): void {
  const id = prepared.series.id;
  context.draft.set(seriesWrite(id, null));
  for (const day of context.checked.changes.get(id)?.keys() ?? []) {
    context.draft.set(changeWrite(id, formatDate(day), null));
  }
  for (const day of context.checked.ticks.get(id)?.keys() ?? []) {
    context.draft.set(tickWrite(id, formatDate(day), null));
  }
}

/** Both halves of a private transfer, or just the one stretch, after checking they match. */
function stretches(context: Context, found: Found): { mine: Stretch; other: Stretch | null } {
  const mine = stretchFrom(context, found);
  const otherFound = otherHalfPayment(context, found);
  if (otherFound === null) return { mine, other: null };
  const other = stretchFrom(context, otherFound);
  if ((other.index === 0) !== (mine.index === 0) || other.later.length !== mine.later.length) {
    outOfStep(found.prepared.series);
  }
  mine.later.forEach((one, i) => {
    checkHalvesMatch(one.series, (other.later[i] as PreparedSeries).series);
  });
  return { mine, other };
}

/**
 * Removes this payment and every later one: the series ends just before it,
 * and later series of the family are removed (brief 5.4, D88, D92). On a
 * series' first payment, the series itself is removed. The one-off changes
 * of removed payments go too. Refused when a payment it would remove is
 * ticked as paid, because the money really went (D83, D92).
 */
export function removeThisAndLater(context: Context, ref: PaymentRef): void {
  const found = findPayment(context, ref);
  const { mine, other } = stretches(context, found);
  const all = other === null ? [mine] : [mine, other];
  for (const stretch of all) {
    for (const [prepared, from] of partsOf(stretch)) {
      for (const day of context.checked.ticks.get(prepared.series.id)?.keys() ?? []) {
        if (indexOf(prepared, day) >= from) {
          refuse(
            'ticked',
            `Series ${prepared.series.id}: the payment first due on ${formatDate(day)} is ticked as paid, so it can't be removed. Untick it first.`,
          );
        }
      }
    }
  }
  for (const { first, index, later } of all) {
    if (index === 0) {
      removeSeries(context, first);
    } else {
      context.draft.set(seriesWrite(first.series.id, endedBefore(first, index)));
      for (const day of context.checked.changes.get(first.series.id)?.keys() ?? []) {
        if (indexOf(first, day) >= index) {
          context.draft.set(changeWrite(first.series.id, formatDate(day), null));
        }
      }
    }
    for (const one of later) removeSeries(context, one);
  }
}

/** "This and all later ones" edits, checked. */
interface LaterEdits {
  readonly amount?: Pence | undefined;
  readonly name?: string | undefined;
  readonly note?: string | undefined;
  readonly isEstimate?: boolean | undefined;
  readonly day?: Day | undefined;
  readonly schedule?: Schedule | undefined;
}

function checkEdits(edits: ThisAndLaterEdits, what: string): LaterEdits {
  if (edits === null || typeof edits !== 'object') {
    refuse('bad-command', `${what}: the command needs its edits.`);
  }
  for (const field of ['name', 'note'] as const) {
    if (edits[field] !== undefined && typeof edits[field] !== 'string') {
      refuse('bad-command', `${what}: the ${field} must be text.`);
    }
  }
  if (edits.isEstimate !== undefined && typeof edits.isEstimate !== 'boolean') {
    refuse('bad-command', `${what}: isEstimate must be true or false.`);
  }
  if (
    edits.schedule !== undefined &&
    (edits.schedule === null || typeof edits.schedule !== 'object')
  ) {
    refuse('bad-command', `${what}: the schedule is missing or unknown.`);
  }
  return {
    amount:
      edits.amount === undefined
        ? undefined
        : checkPenceNotNegative(edits.amount, `${what}: the amount`),
    name: edits.name,
    note: edits.note,
    isEstimate: edits.isEstimate,
    day: edits.date === undefined ? undefined : parseDate(edits.date, `${what}: the date`),
    schedule: edits.schedule,
  };
}

/** One series of a stretch: the old one, where its part starts, and the series it becomes. */
interface Piece {
  readonly old: PreparedSeries;
  readonly from: number;
  readonly series: Series;
}

/** The original date of the family's payment just before the stretch, or null when there's none. */
function previousDate(context: Context, stretch: Stretch): Day | null {
  const { first, index } = stretch;
  if (index > 0) return first.dateAt(index - 1);
  const number = first.firstNumber - 1;
  const holder = context.checked.prepared.find(
    (one) =>
      one.series.familyId === first.series.familyId &&
      one.firstNumber <= number &&
      number < one.firstNumber + one.count,
  );
  return holder === undefined ? null : holder.dateAt(number - holder.firstNumber);
}

/**
 * Gives every piece the new date and schedule (D91): the first piece starts
 * on the new date, and each later one on the date the new schedule gives its
 * first payment number. The number of payments never changes, so a series
 * that ended on a date now ends after the same number of payments. Null when
 * the dates come out exactly as they were.
 */
function redate(context: Context, stretch: Stretch, pieces: readonly Piece[], edits: LaterEdits) {
  const { first, index } = stretch;
  const id = first.series.id;
  const j = first.firstNumber + index;
  const anchor = edits.day ?? first.dateAt(index);
  const schedule = edits.schedule ?? first.series.schedule;
  const reference = prepareSeries(
    clean<Series>({
      ...first.series,
      start: formatDate(anchor),
      schedule,
      end: { kind: 'never' } as const,
      firstNumber: j,
      lastAmount: undefined,
    }),
    context.input.holidays,
  );
  // The payment before this one keeps its date, so the new date must come
  // after it, or payments would double up on the same days (D91).
  const previous = previousDate(context, stretch);
  if (previous !== null && anchor <= previous) {
    refuse(
      'date-before-earlier-payment',
      `Series ${id}: the new date must be after ${formatDate(previous)}, the date of the payment before it.`,
    );
  }
  if (reference.count === 0 || reference.dateAt(0) !== anchor) {
    refuse(
      'date-not-in-schedule',
      `Series ${id}: ${formatDate(anchor)} isn't a date the schedule gives.`,
    );
  }
  let changed = false;
  const redated = pieces.map((piece): Piece => {
    const firstNumber = piece.series.firstNumber ?? 0;
    const offset = firstNumber - j;
    const oldCount = piece.old.count - piece.from;
    if (offset >= reference.count) {
      refuse('dates-dont-fit', `Series ${id}: the new dates would lose a payment.`);
    }
    const start = reference.dateAt(offset);
    const end: EndRule =
      piece.series.end.kind === 'on'
        ? { kind: 'after', payments: firstNumber + oldCount }
        : piece.series.end;
    const series = clean<Series>({ ...piece.series, start: formatDate(start), schedule, end });
    if (prepareSeries(series, context.input.holidays).count !== oldCount) {
      refuse('dates-dont-fit', `Series ${id}: the new dates would add or lose a payment.`);
    }
    if (start !== piece.old.dateAt(piece.from) || !sameValue(schedule, piece.old.series.schedule)) {
      changed = true;
    }
    return { ...piece, series };
  });
  return changed ? redated : null;
}

/** A one-off change without the parts the edit replaces (D60). Ticks always stay. */
function withoutReplaced(
  change: PaymentChange,
  edits: LaterEdits,
  datesChanged: boolean,
): Draftable<PaymentChange> {
  return {
    ...change,
    amount: edits.amount === undefined ? change.amount : undefined,
    name: edits.name === undefined ? change.name : undefined,
    note: edits.note === undefined ? change.note : undefined,
    isEstimate: edits.isEstimate === undefined ? change.isEstimate : undefined,
    newDate: datesChanged ? undefined : change.newDate,
  };
}

/**
 * Applies "this and all later ones" to one stretch. `newId` names the new
 * series when the payment isn't its series' first. `mirrorOfNew` is what the
 * new series mirrors, when this stretch is the shared half of a private
 * transfer (D94).
 */
function changeStretch(
  context: Context,
  stretch: Stretch,
  edits: LaterEdits,
  newId: string | null,
  mirrorOfNew: string | null,
): void {
  const { first, index } = stretch;
  const holidays = context.input.holidays;
  const j = first.firstNumber + index;
  const editedIsLast = paymentAtIndex(first, index, NO_CHANGES, holidays).isLast;

  const edited = (series: Series, holdsThisPayment: boolean): Series => {
    const next: Draftable<Series> = { ...series };
    if (edits.name !== undefined) next.name = edits.name;
    if (edits.note !== undefined) next.note = edits.note === '' ? undefined : edits.note;
    if (edits.isEstimate !== undefined) next.isEstimate = edits.isEstimate;
    if (edits.amount !== undefined) {
      // One amount for every payment from here on, in place of any pattern
      // (D90). The different last amount stays, unless this is the last payment.
      next.amount = edits.amount;
      next.amountCycle = undefined;
      next.cycleOffset = undefined;
      if (holdsThisPayment && editedIsLast) next.lastAmount = undefined;
    }
    return clean<Series>(next);
  };

  let pieces: Piece[] = [];
  if (index === 0) {
    // On a series' first payment, the whole series changes (brief 5.4).
    pieces.push({ old: first, from: 0, series: edited(first.series, true) });
  } else {
    // A new series starts at this payment: same family (D49), same payment
    // numbers, so the pattern and "after N payments" carry on (ARCHITECTURE.md 2.3).
    const split = clean<Series>({
      ...first.series,
      id: newId as string,
      start: formatDate(first.dateAt(index)),
      firstNumber: j,
      splitFrom: first.series.id,
      mirrorOf: isSharedHalf(first.series) ? (mirrorOfNew ?? undefined) : undefined,
    });
    pieces.push({ old: first, from: index, series: edited(split, true) });
  }
  for (const one of stretch.later) {
    pieces.push({ old: one, from: 0, series: edited(one.series, false) });
  }

  let datesChanged = false;
  if (edits.day !== undefined || edits.schedule !== undefined) {
    const redated = redate(context, stretch, pieces, edits);
    if (redated !== null) {
      pieces = redated;
      datesChanged = true;
    }
  }

  // Changes and ticks move across by payment number (brief 5.4). All the
  // removals first, so a record moving onto another's old date isn't lost.
  const removals: RecordWrite[] = [];
  const saves: RecordWrite[] = [];
  for (const piece of pieces) {
    const oldId = piece.old.series.id;
    const newId = piece.series.id;
    const inPlace = newId === oldId;
    const target = datesChanged ? prepareSeries(piece.series, holidays) : null;
    const newDate = (oldIndex: number) =>
      formatDate(
        target === null ? piece.old.dateAt(oldIndex) : target.dateAt(oldIndex - piece.from),
      );

    for (const [day, { change }] of context.checked.changes.get(oldId) ?? []) {
      const oldIndex = indexOf(piece.old, day);
      if (oldIndex < 0) {
        // Belongs to no payment. When the dates change in place, it could
        // land on a new payment by chance, so it goes.
        if (inPlace && datesChanged) removals.push(changeWrite(oldId, formatDate(day), null));
        continue;
      }
      if (oldIndex < piece.from) continue;
      removals.push(changeWrite(oldId, formatDate(day), null));
      const originalDate = newDate(oldIndex);
      const moved = {
        ...withoutReplaced(change, edits, datesChanged),
        seriesId: newId,
        originalDate,
      };
      // Dropped only when the parts it replaces were all it changed (D60).
      if (hasEffect(moved) || !hasEffect(change)) {
        saves.push(changeWrite(newId, originalDate, clean<PaymentChange>(moved)));
      }
    }
    for (const [day, { tick }] of context.checked.ticks.get(oldId) ?? []) {
      const oldIndex = indexOf(piece.old, day);
      if (oldIndex < 0) {
        if (inPlace && datesChanged) removals.push(tickWrite(oldId, formatDate(day), null));
        continue;
      }
      if (oldIndex < piece.from) continue;
      removals.push(tickWrite(oldId, formatDate(day), null));
      const originalDate = newDate(oldIndex);
      saves.push(tickWrite(newId, originalDate, { ...tick, seriesId: newId, originalDate }));
    }
  }
  for (const write of removals) context.draft.set(write);
  for (const write of saves) context.draft.set(write);

  if (index > 0) {
    context.draft.set(seriesWrite(first.series.id, endedBefore(first, index)));
  }
  for (const piece of pieces) {
    context.draft.set(seriesWrite(piece.series.id, piece.series));
  }
}

function checkNewId(context: Context, id: unknown, field: string): string {
  if (typeof id !== 'string' || id === '') {
    refuse('needs-id', `The command needs ${field} for the new series.`);
  }
  if (context.byId.has(id)) {
    refuse('id-taken', `Series ${id} already exists, so it can't be the new series.`);
  }
  return id;
}

/**
 * "This and all later ones" (brief 5.4, ARCHITECTURE.md 2.3, D60, D88 to
 * D91): splits the series at this payment, or on its first payment changes
 * the whole series, and changes every later series of the family too. A
 * private transfer's two halves change together (D94).
 */
export function thisAndLater(
  context: Context,
  ref: PaymentRef,
  rawEdits: ThisAndLaterEdits,
  newSeriesId: string,
  newOtherHalfSeriesId: string | undefined,
): void {
  const found = findPayment(context, ref);
  const edits = checkEdits(rawEdits, `Series ${ref.seriesId}`);
  const shared = isSharedHalf(found.prepared.series);
  if (shared && (edits.name !== undefined || edits.note !== undefined)) {
    refuse(
      'shared-half',
      `Series ${ref.seriesId} is the shared half of a private transfer, which has no name or note of its own.`,
    );
  }
  const { mine, other } = stretches(context, found);
  const splits = mine.index > 0;
  const newId = splits ? checkNewId(context, newSeriesId, 'newSeriesId') : null;
  if (other === null) {
    changeStretch(context, mine, edits, newId, null);
    return;
  }
  const otherId = splits ? checkNewId(context, newOtherHalfSeriesId, 'newOtherHalfSeriesId') : null;
  if (splits && otherId === newId) {
    refuse('id-taken', 'The two halves need different ids for their new series.');
  }
  changeStretch(context, mine, edits, newId, otherId);
  const otherEdits = shared ? edits : { ...edits, name: undefined, note: undefined };
  changeStretch(context, other, otherEdits, otherId, newId);
}
