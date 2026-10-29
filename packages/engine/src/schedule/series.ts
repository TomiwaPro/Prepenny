import {
  addDays,
  type Day,
  dayOfMonthOrLast,
  lastDayOfMonth,
  monthFromNumber,
  monthNumberOfDay,
  parseDate,
  weekdayOfMonth,
} from '../dates/day.ts';
import { parseTime } from '../dates/time.ts';
import { type BankHolidayLookup, lastWorkingDayOfMonth } from '../dates/working-days.ts';
import { EngineInputError } from '../errors.ts';
import { checkPenceNotNegative, type Pence } from '../money/pence.ts';
import { type MonthlyDay, PAYMENT_TYPES, type Schedule, type Series } from './types.ts';

/** A checked series, ready to give the date of any payment directly. */
export interface PreparedSeries {
  readonly series: Series;
  readonly start: Day;
  readonly firstNumber: number;
  readonly cycle: readonly Pence[] | null;
  readonly cycleOffset: number;
  /**
   * How many payments this series has, after its end rule. Infinity when it
   * never ends. Indexes below are local: index 0 is this series' first payment,
   * which is payment number `firstNumber`.
   */
  readonly count: number;
  /**
   * A later series of the same family carries on from this one (D49): one
   * split from it, with a higher first number. Its last payment isn't the
   * family's last, so it isn't "last" and doesn't take a different last amount.
   */
  readonly continues: boolean;
  /** The original date of the payment at this index, worked out from the start. */
  dateAt(index: number): Day;
  /** The index of the first payment whose original date is on or after `day`. */
  firstIndexOnOrAfter(day: Day): number;
}

interface DatesOfSchedule {
  readonly count: number;
  dateAt(index: number): Day;
  firstIndexOnOrAfter(day: Day): number;
}

function fail(seriesId: string, code: string, message: string): never {
  throw new EngineInputError(code, `Series ${seriesId}: ${message}`);
}

function checkWholeNumber(
  seriesId: string,
  value: unknown,
  low: number,
  high: number,
  what: string,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < low || value > high) {
    fail(seriesId, 'bad-number', `${what} must be a whole number from ${low} to ${high}.`);
  }
  return value;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function once(start: Day): DatesOfSchedule {
  return {
    count: 1,
    dateAt: () => start,
    firstIndexOnOrAfter: (day) => (day <= start ? 0 : 1),
  };
}

function everyFewDays(start: Day, stepInDays: number): DatesOfSchedule {
  return {
    count: Number.POSITIVE_INFINITY,
    // Weekly: start + 7 × every × k days (brief 5.3).
    dateAt: (index) => addDays(start, stepInDays * index),
    firstIndexOnOrAfter: (day) => (day <= start ? 0 : Math.ceil((day - start) / stepInDays)),
  };
}

function chosenDates(seriesId: string, start: Day, dates: readonly string[]): DatesOfSchedule {
  if (!Array.isArray(dates)) {
    fail(seriesId, 'bad-schedule', 'chosen dates must be a list of dates.');
  }
  const days = dates.map((date, i) => parseDate(date, `Series ${seriesId}: chosen date ${i + 1}`));
  const sorted = [...days].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === sorted[i - 1]) {
      // Changes and ticks are found by series and original date (brief 5.2),
      // so two payments of one series can't share a date.
      fail(seriesId, 'repeated-date', 'the same chosen date is listed twice.');
    }
  }
  const fromStart = sorted.filter((day) => day >= start);
  const firstIndexOnOrAfter = (day: Day): number => {
    let low = 0;
    let high = fromStart.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((fromStart[middle] as Day) < day) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  };
  return {
    count: fromStart.length,
    dateAt: (index) => fromStart[index] as Day,
    firstIndexOnOrAfter,
  };
}

function checkMonthlyDay(seriesId: string, on: MonthlyDay): MonthlyDay {
  switch (on?.kind) {
    case 'day':
      checkWholeNumber(seriesId, on.day, 1, 31, 'The day of the month');
      return on;
    case 'last-day':
    case 'last-working-day':
      return on;
    case 'weekday':
      checkWholeNumber(seriesId, on.weekday, 1, 7, 'The weekday');
      if (![1, 2, 3, 4, 'last'].includes(on.position)) {
        fail(seriesId, 'bad-schedule', 'the position must be 1 to 4, or last.');
      }
      return on;
    default:
      return fail(seriesId, 'bad-schedule', 'the day of the month is missing or unknown.');
  }
}

function monthly(
  seriesId: string,
  start: Day,
  every: number,
  on: MonthlyDay,
  leaveOut: readonly number[],
  holidays: BankHolidayLookup,
): DatesOfSchedule {
  // The schedule's date in a month, worked out for that month alone (brief 5.3).
  const dateInMonth = (monthValue: number): Day => {
    const { year, month } = monthFromNumber(monthValue);
    switch (on.kind) {
      case 'day':
        return dayOfMonthOrLast(year, month, on.day);
      case 'last-day':
        return lastDayOfMonth(year, month);
      case 'last-working-day':
        return lastWorkingDayOfMonth(year, month, holidays);
      case 'weekday':
        return weekdayOfMonth(year, month, on.weekday, on.position);
    }
  };

  // Month 0 is the start's month, or the next one when the schedule's date in
  // the start's month is before the start.
  let firstMonth = monthNumberOfDay(start);
  if (dateInMonth(firstMonth) < start) {
    firstMonth += 1;
  }

  // Months left out are passed over and don't count as payments. Which months
  // are left out repeats every `period` steps, so payment k can still be found
  // directly, without walking through the payments before it.
  const left = new Set(leaveOut);
  const period = 12 / greatestCommonDivisor(every, 12);
  const keptSteps: number[] = [];
  for (let step = 0; step < period; step += 1) {
    if (!left.has(monthFromNumber(firstMonth + every * step).month)) {
      keptSteps.push(step);
    }
  }
  const kept = keptSteps.length;
  if (kept === 0) {
    fail(seriesId, 'no-payments', 'every month it falls in is left out.');
  }

  const stepAt = (index: number): number =>
    Math.floor(index / kept) * period + (keptSteps[index % kept] as number);
  const keptBefore = (step: number): number => {
    const inPeriod = step % period;
    return Math.floor(step / period) * kept + keptSteps.filter((s) => s < inPeriod).length;
  };
  const dateAt = (index: number): Day => dateInMonth(firstMonth + every * stepAt(index));

  return {
    count: Number.POSITIVE_INFINITY,
    dateAt,
    firstIndexOnOrAfter: (day) => {
      // A month's date is always inside that month, so the answer is at or
      // after the first step in `day`'s month.
      const step = Math.max(0, Math.ceil((monthNumberOfDay(day) - firstMonth) / every));
      let index = keptBefore(step);
      while (dateAt(index) < day) {
        index += 1;
      }
      return index;
    },
  };
}

function datesOf(
  series: Series,
  start: Day,
  schedule: Schedule,
  holidays: BankHolidayLookup,
): DatesOfSchedule {
  const id = series.id;
  switch (schedule?.kind) {
    case 'once':
      return once(start);
    case 'weekly':
      return everyFewDays(start, 7 * checkWholeNumber(id, schedule.every, 1, 52, 'Every N weeks'));
    case 'irregular':
      return everyFewDays(start, 7);
    case 'monthly': {
      const every = checkWholeNumber(id, schedule.every, 1, 12, 'Every N months');
      const leaveOut = schedule.leaveOut ?? [];
      if (!Array.isArray(leaveOut)) {
        fail(id, 'bad-schedule', 'the months to leave out must be a list.');
      }
      for (const month of leaveOut) {
        checkWholeNumber(id, month, 1, 12, 'A month to leave out');
      }
      return monthly(id, start, every, checkMonthlyDay(id, schedule.on), leaveOut, holidays);
    }
    case 'dates':
      return chosenDates(id, start, schedule.dates);
    default:
      return fail(id, 'bad-schedule', 'the schedule is missing or unknown.');
  }
}

function checkSeries(series: Series): void {
  if (typeof series?.id !== 'string' || series.id === '') {
    throw new EngineInputError('bad-series', 'A series needs an id.');
  }
  const id = series.id;
  if (typeof series.accountId !== 'string' || series.accountId === '') {
    fail(id, 'bad-series', 'it needs an account.');
  }
  if (typeof series.name !== 'string') {
    fail(id, 'bad-series', 'its name must be text.');
  }
  if (series.note !== undefined && typeof series.note !== 'string') {
    fail(id, 'bad-series', 'its note must be text.');
  }
  if (!['in', 'out', 'transfer'].includes(series.direction)) {
    fail(id, 'bad-series', 'the direction must be in, out or transfer.');
  }
  if (series.direction === 'transfer') {
    if (typeof series.toAccountId !== 'string' || series.toAccountId === '') {
      fail(id, 'bad-series', 'a transfer needs the account it goes to.');
    }
    if (series.toAccountId === series.accountId) {
      fail(id, 'bad-series', 'a transfer must go to a different account.');
    }
  } else if (series.toAccountId !== undefined) {
    fail(id, 'bad-series', 'only a transfer has an account it goes to.');
  }
  if (!['keep', 'working-day-before', 'working-day-after'].includes(series.holidayRule)) {
    fail(id, 'bad-series', 'the weekend and bank holiday rule is unknown.');
  }
  if (typeof series.isEstimate !== 'boolean') {
    fail(id, 'bad-series', 'it must say whether it is an estimate.');
  }
  if (!(PAYMENT_TYPES as readonly unknown[]).includes(series.type)) {
    fail(id, 'bad-series', `the type must be one of ${PAYMENT_TYPES.join(', ')}.`);
  }
  if (typeof series.familyId !== 'string' || series.familyId === '') {
    fail(id, 'bad-series', 'it needs a family.');
  }
  parseTime(series.familyCreatedAt, `Series ${id}: when its family was created`);
  checkPenceNotNegative(series.amount, `Series ${id}: the amount`);
  if (series.lastAmount !== undefined) {
    checkPenceNotNegative(series.lastAmount, `Series ${id}: the last amount`);
  }
  if (series.amountCycle !== undefined) {
    if (
      !Array.isArray(series.amountCycle) ||
      series.amountCycle.length < 1 ||
      series.amountCycle.length > 8
    ) {
      fail(id, 'bad-cycle', 'an amount pattern has 1 to 8 amounts.');
    }
    series.amountCycle.forEach((amount, i) => {
      checkPenceNotNegative(amount, `Series ${id}: pattern amount ${i + 1}`);
    });
  }
  if (series.cycleOffset !== undefined && !Number.isSafeInteger(series.cycleOffset)) {
    fail(id, 'bad-cycle', 'the pattern offset must be a whole number.');
  }
  if (series.firstNumber !== undefined) {
    checkWholeNumber(id, series.firstNumber, 0, Number.MAX_SAFE_INTEGER, 'The first number');
  }
  for (const field of ['splitFrom', 'mirrorOf'] as const) {
    const value = series[field];
    if (value !== undefined && (typeof value !== 'string' || value === '' || value === id)) {
      fail(id, 'bad-series', `${field} must be the id of another series.`);
    }
  }
}

/**
 * Checks a series and prepares it, so the date of payment k comes straight
 * from the start and k, never from the payment before (brief 5.3).
 *
 * The end rule counts payments by number, and a date end compares original
 * dates, so the weekend and bank holiday rule and moved dates never add or
 * remove a payment (D78).
 */
export function prepareSeries(series: Series, holidays: BankHolidayLookup): PreparedSeries {
  checkSeries(series);
  const id = series.id;
  const start = parseDate(series.start, `Series ${id}: the start`);
  const firstNumber = series.firstNumber ?? 0;
  const dates = datesOf(series, start, series.schedule, holidays);

  let count = dates.count;
  const end = series.end;
  switch (end?.kind) {
    case 'never':
      break;
    case 'after': {
      const total = checkWholeNumber(
        id,
        end.payments,
        1,
        Number.MAX_SAFE_INTEGER,
        'After N payments',
      );
      count = Math.min(count, Math.max(0, total - firstNumber));
      break;
    }
    case 'on': {
      const last = parseDate(end.date, `Series ${id}: the end date`);
      count = Math.min(count, dates.firstIndexOnOrAfter(addDays(last, 1)));
      break;
    }
    default:
      fail(id, 'bad-end', 'the end rule is missing or unknown.');
  }

  return {
    series,
    start,
    firstNumber,
    cycle: series.amountCycle ?? null,
    cycleOffset: series.cycleOffset ?? 0,
    count,
    continues: false,
    dateAt: dates.dateAt,
    firstIndexOnOrAfter: dates.firstIndexOnOrAfter,
  };
}

/**
 * Marks each prepared series that a later series of its family carries on
 * from: one with a higher first number (D49, ARCHITECTURE.md 2.3). A family
 * is a series and the series split from it, so after a split the old
 * series' last payment isn't the family's last.
 */
export function markFamilies(prepared: readonly PreparedSeries[]): PreparedSeries[] {
  const highest = new Map<string, number>();
  for (const one of prepared) {
    const family = one.series.familyId;
    highest.set(family, Math.max(highest.get(family) ?? 0, one.firstNumber));
  }
  return prepared.map((one) => {
    const continues = (highest.get(one.series.familyId) ?? 0) > one.firstNumber;
    return continues === one.continues ? one : { ...one, continues };
  });
}
