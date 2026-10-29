import { addDays, type Day, formatDate, parseDate } from '../dates/day.ts';
import {
  type BankHolidayLookup,
  LONGEST_RUN_WITHOUT_A_WORKING_DAY,
  workingDayOnOrAfter,
  workingDayOnOrBefore,
} from '../dates/working-days.ts';
import { EngineInputError } from '../errors.ts';
import { checkPenceNotNegative, type Pence } from '../money/pence.ts';
import { markFamilies, type PreparedSeries, prepareSeries } from './series.ts';
import type { HolidayRule, Payment, PaymentChange, Series } from './types.ts';

/** A payment with its dates as day numbers, for the engine's own use. */
export interface PaymentOnDays extends Omit<Payment, 'originalDate' | 'date'> {
  readonly originalDay: Day;
  readonly day: Day;
}

interface CheckedChange {
  readonly change: PaymentChange;
  readonly newDay: Day | null;
}

/** Changes, found by series and original date (brief 5.2). */
export type ChangeIndex = ReadonlyMap<string, ReadonlyMap<Day, CheckedChange>>;

/** Checks the changes and indexes them by series and original date. */
export function indexChanges(changes: readonly PaymentChange[]): ChangeIndex {
  if (!Array.isArray(changes)) {
    throw new EngineInputError('bad-change', 'The changes must be a list.');
  }
  const index = new Map<string, Map<Day, CheckedChange>>();
  changes.forEach((change, i) => {
    const what = `Change ${i + 1}`;
    if (typeof change?.seriesId !== 'string' || change.seriesId === '') {
      throw new EngineInputError('bad-change', `${what} needs a series.`);
    }
    const originalDay = parseDate(change.originalDate, `${what}: the original date`);
    const newDay =
      change.newDate === undefined ? null : parseDate(change.newDate, `${what}: the new date`);
    if (change.amount !== undefined) {
      checkPenceNotNegative(change.amount, `${what}: the amount`);
    }
    if (change.name !== undefined && typeof change.name !== 'string') {
      throw new EngineInputError('bad-change', `${what}: the name must be text.`);
    }
    if (change.note !== undefined && typeof change.note !== 'string') {
      throw new EngineInputError('bad-change', `${what}: the note must be text.`);
    }
    for (const flag of ['isEstimate', 'skipped'] as const) {
      if (change[flag] !== undefined && typeof change[flag] !== 'boolean') {
        throw new EngineInputError('bad-change', `${what}: ${flag} must be true or false.`);
      }
    }
    const forSeries = index.get(change.seriesId) ?? new Map<Day, CheckedChange>();
    if (forSeries.has(originalDay)) {
      throw new EngineInputError(
        'repeated-change',
        `${what}: series ${change.seriesId} already has a change for ${change.originalDate}.`,
      );
    }
    forSeries.set(originalDay, { change, newDay });
    index.set(change.seriesId, forSeries);
  });
  return index;
}

/** Moves a date off a weekend or bank holiday, if the series asks for that (brief 4.3). */
export function applyHolidayRule(day: Day, rule: HolidayRule, holidays: BankHolidayLookup): Day {
  switch (rule) {
    case 'keep':
      return day;
    case 'working-day-before':
      return workingDayOnOrBefore(day, holidays);
    case 'working-day-after':
      return workingDayOnOrAfter(day, holidays);
  }
}

function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/**
 * The payment at a local index of a prepared series. In order (brief 5.3, D4,
 * D38): the date from the schedule; the amount from the change, else the last
 * amount on the last payment, else the pattern, else the series amount; then
 * the weekend and bank holiday rule; then a moved date and a skip.
 */
export function paymentAtIndex(
  prepared: PreparedSeries,
  index: number,
  changes: ChangeIndex,
  holidays: BankHolidayLookup,
): PaymentOnDays {
  const { series, cycle } = prepared;
  const number = prepared.firstNumber + index;
  const originalDay = prepared.dateAt(index);
  const found = changes.get(series.id)?.get(originalDay);
  const change = found?.change;
  // The family's last payment: a later series of the family carries on after
  // this series' last one (D49).
  const isLast = index === prepared.count - 1 && !prepared.continues;

  let amount: Pence;
  if (change?.amount !== undefined) {
    amount = change.amount;
  } else if (isLast && series.lastAmount !== undefined) {
    amount = series.lastAmount;
  } else if (cycle !== null) {
    amount = cycle[mod(number + prepared.cycleOffset, cycle.length)] as Pence;
  } else {
    amount = series.amount;
  }

  const ruleDay = applyHolidayRule(originalDay, series.holidayRule, holidays);
  const newDay = found?.newDay ?? null;

  return {
    seriesId: series.id,
    number,
    originalDay,
    day: newDay ?? ruleDay,
    accountId: series.accountId,
    toAccountId: series.toAccountId ?? null,
    direction: series.direction,
    amount,
    name: change?.name ?? series.name,
    // An empty note is no note: a one-off change can clear the series' note.
    note: (change?.note ?? series.note ?? '') || null,
    type: series.type,
    isEstimate: change?.isEstimate ?? series.isEstimate,
    isLast,
    movedByRule: ruleDay !== originalDay,
    moved: newDay !== null && newDay !== ruleDay,
    skipped: change?.skipped ?? false,
    changed: change !== undefined,
  };
}

/**
 * Every payment of one prepared series whose date, after the weekend and bank
 * holiday rule and any move, is from `from` to `to`, both included.
 */
export function paymentsOfSeriesBetween(
  prepared: PreparedSeries,
  from: Day,
  to: Day,
  changes: ChangeIndex,
  holidays: BankHolidayLookup,
): PaymentOnDays[] {
  // The weekend and bank holiday rule moves a date by at most this many days,
  // so these are all the payments it could bring into the window.
  const margin = LONGEST_RUN_WITHOUT_A_WORKING_DAY;
  const firstCandidate = addDays(from, -margin);
  const lastCandidate = addDays(to, margin);
  const found: PaymentOnDays[] = [];

  for (
    let index = prepared.firstIndexOnOrAfter(firstCandidate);
    index < prepared.count && prepared.dateAt(index) <= lastCandidate;
    index += 1
  ) {
    const payment = paymentAtIndex(prepared, index, changes, holidays);
    if (payment.day >= from && payment.day <= to) {
      found.push(payment);
    }
  }

  // Payments moved into the window from further away.
  for (const [originalDay, { newDay }] of changes.get(prepared.series.id) ?? []) {
    if (newDay === null || newDay < from || newDay > to) {
      continue;
    }
    if (originalDay >= firstCandidate && originalDay <= lastCandidate) {
      continue; // already looked at above
    }
    const index = prepared.firstIndexOnOrAfter(originalDay);
    if (index < prepared.count && prepared.dateAt(index) === originalDay) {
      found.push(paymentAtIndex(prepared, index, changes, holidays));
    }
  }
  return found;
}

/** Writes a payment's dates as "YYYY-MM-DD" for the engine's edge. */
export function paymentWithDates(payment: PaymentOnDays): Payment {
  const { originalDay, day, ...rest } = payment;
  return { ...rest, originalDate: formatDate(originalDay), date: formatDate(day) };
}

export interface PaymentsRequest {
  readonly series: readonly Series[];
  readonly changes?: readonly PaymentChange[];
  /** The plan's bank holidays, usually a BankHolidayCalendar for its nation. */
  readonly holidays: BankHolidayLookup;
  /** "YYYY-MM-DD", included. */
  readonly from: string;
  /** "YYYY-MM-DD", included. */
  readonly to: string;
}

/**
 * Works out every payment from `from` to `to`, from the series and their
 * changes (brief 5.2, 5.3). In date order; on the same day, in the order the
 * series were given, then by payment number. Skipped payments are included,
 * marked as skipped. Nothing is stored and nothing is read from a clock.
 */
export function workOutPayments(request: PaymentsRequest): Payment[] {
  const from = parseDate(request.from, 'from');
  const to = parseDate(request.to, 'to');
  if (to < from) {
    throw new EngineInputError('bad-window', '"to" must be on or after "from".');
  }
  const changes = indexChanges(request.changes ?? []);
  const seen = new Set<string>();
  const all: { payment: PaymentOnDays; order: number }[] = [];

  const prepared = request.series.map((series) => {
    const one = prepareSeries(series, request.holidays);
    if (seen.has(series.id)) {
      throw new EngineInputError('repeated-series', `Series ${series.id} is listed twice.`);
    }
    seen.add(series.id);
    return one;
  });
  markFamilies(prepared).forEach((one, order) => {
    for (const payment of paymentsOfSeriesBetween(one, from, to, changes, request.holidays)) {
      all.push({ payment, order });
    }
  });

  all.sort(
    (a, b) =>
      a.payment.day - b.payment.day || a.order - b.order || a.payment.number - b.payment.number,
  );
  return all.map(({ payment }) => paymentWithDates(payment));
}

export interface PaymentNumberRequest {
  readonly series: Series;
  readonly changes?: readonly PaymentChange[];
  readonly holidays: BankHolidayLookup;
  /** Payment number k, counted from the original series. */
  readonly number: number;
}

/**
 * Payment number k of a series, worked out directly from the series start
 * (brief 5.3). `null` when the series has no payment with that number. Only
 * this series is looked at, so `isLast` is its own last payment.
 */
export function paymentByNumber(request: PaymentNumberRequest): Payment | null {
  const prepared = prepareSeries(request.series, request.holidays);
  const index = request.number - prepared.firstNumber;
  if (!Number.isInteger(request.number) || index < 0 || index >= prepared.count) {
    return null;
  }
  const changes = indexChanges(request.changes ?? []);
  return paymentWithDates(paymentAtIndex(prepared, index, changes, request.holidays));
}
