import { EngineInputError } from '../errors.ts';

/**
 * A calendar date as a whole number of days since Thu 1 Jan 1970, which is
 * day 0. Dates have no time and no time zone (brief 5.1). Inside the engine
 * every date is a Day; at its edges dates are "YYYY-MM-DD" text.
 */
export type Day = number;

/** Day of the week, ISO style: 1 is Monday and 7 is Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const MONDAY: Weekday = 1;
export const TUESDAY: Weekday = 2;
export const WEDNESDAY: Weekday = 3;
export const THURSDAY: Weekday = 4;
export const FRIDAY: Weekday = 5;
export const SATURDAY: Weekday = 6;
export const SUNDAY: Weekday = 7;

/** Years a PrePenny date can be in. Anything else is a typing mistake. */
export const FIRST_YEAR = 1900;
export const LAST_YEAR = 2999;

export interface DateParts {
  readonly year: number;
  /** 1 is January, 12 is December. */
  readonly month: number;
  readonly day: number;
}

const DATE_TEXT = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** True for leap years: 2028 and 2000 are, 2100 isn't. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** How many days the month has. `month` is 1 to 12. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  const days = DAYS_IN_MONTH[month - 1];
  if (days === undefined) {
    throw new EngineInputError('bad-month', 'A month must be 1 to 12.');
  }
  return days;
}

function checkParts(year: number, month: number, day: number): void {
  if (!Number.isInteger(year) || year < FIRST_YEAR || year > LAST_YEAR) {
    throw new EngineInputError('bad-year', `A year must be ${FIRST_YEAR} to ${LAST_YEAR}.`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new EngineInputError('bad-month', 'A month must be 1 to 12.');
  }
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) {
    throw new EngineInputError('bad-day', 'That day is not in that month.');
  }
}

// Days from civil dates and back, using whole-number maths only
// (Howard Hinnant's "chrono-compatible low-level date algorithms").
function daysFromCivil(year: number, month: number, day: number): Day {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const monthFromMarch = (month + 9) % 12;
  const dayOfYear = Math.floor((153 * monthFromMarch + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(days: Day): DateParts {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthFromMarch = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthFromMarch + 2) / 5) + 1;
  const month = monthFromMarch < 10 ? monthFromMarch + 3 : monthFromMarch - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

/** The Day for a year, month (1 to 12) and day of the month. */
export function dayFromParts(year: number, month: number, day: number): Day {
  checkParts(year, month, day);
  return daysFromCivil(year, month, day);
}

/** The year, month and day of the month of a Day. */
export function partsOfDay(day: Day): DateParts {
  return civilFromDays(day);
}

/**
 * Reads a "YYYY-MM-DD" date. Anything else, or a date that doesn't exist such
 * as "2027-02-29", is refused.
 */
export function parseDate(text: string, field = 'date'): Day {
  const match = typeof text === 'string' ? DATE_TEXT.exec(text) : null;
  if (match === null) {
    throw new EngineInputError('bad-date', `${field} must be a date written as YYYY-MM-DD.`);
  }
  const [, year = '', month = '', day = ''] = match;
  try {
    return dayFromParts(Number(year), Number(month), Number(day));
  } catch {
    throw new EngineInputError('bad-date', `${field} (${text}) is not a real date.`);
  }
}

/** Writes a Day as "YYYY-MM-DD". */
export function formatDate(day: Day): string {
  const { year, month, day: dayOfMonth } = civilFromDays(day);
  const mm = month.toString().padStart(2, '0');
  const dd = dayOfMonth.toString().padStart(2, '0');
  return `${year.toString().padStart(4, '0')}-${mm}-${dd}`;
}

/** The day of the week: 1 is Monday, 7 is Sunday. Day 0 was a Thursday. */
export function weekday(day: Day): Weekday {
  return (((((day + 3) % 7) + 7) % 7) + 1) as Weekday;
}

/** The day `count` days later (or earlier, when `count` is below zero). */
export function addDays(day: Day, count: number): Day {
  return day + count;
}

/** A month counted as a single number, so months can be added: year × 12 + (month − 1). */
export function monthNumber(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/** The year and month (1 to 12) of a month number. */
export function monthFromNumber(value: number): { readonly year: number; readonly month: number } {
  const year = Math.floor(value / 12);
  return { year, month: value - year * 12 + 1 };
}

/** The month number of a Day. */
export function monthNumberOfDay(day: Day): number {
  const { year, month } = civilFromDays(day);
  return monthNumber(year, month);
}

/**
 * The same day of the month, `count` months later. When that month is shorter,
 * it's the month's last day: 31 Jan plus 1 month is 28 Feb (29 in a leap year).
 */
export function addMonths(day: Day, count: number): Day {
  const parts = civilFromDays(day);
  const target = monthFromNumber(monthNumber(parts.year, parts.month) + count);
  const dayOfMonth = Math.min(parts.day, daysInMonth(target.year, target.month));
  return dayFromParts(target.year, target.month, dayOfMonth);
}

/** The given day of the month, or the month's last day when the month is shorter. */
export function dayOfMonthOrLast(year: number, month: number, dayOfMonth: number): Day {
  return dayFromParts(year, month, Math.min(dayOfMonth, daysInMonth(year, month)));
}

/** The last day of the month. */
export function lastDayOfMonth(year: number, month: number): Day {
  return dayFromParts(year, month, daysInMonth(year, month));
}

/** Which one in the month: the first to the fourth, or the last. */
export type WeekdayPosition = 1 | 2 | 3 | 4 | 'last';

/**
 * "First Monday" style dates: the `position` `weekdayWanted` of the month.
 * The first Monday of Nov 2026 is Mon 2 Nov; the last Friday is Fri 27 Nov.
 */
export function weekdayOfMonth(
  year: number,
  month: number,
  weekdayWanted: Weekday,
  position: WeekdayPosition,
): Day {
  if (position === 'last') {
    const last = lastDayOfMonth(year, month);
    return last - ((weekday(last) - weekdayWanted + 7) % 7);
  }
  const first = dayFromParts(year, month, 1);
  return first + ((weekdayWanted - weekday(first) + 7) % 7) + 7 * (position - 1);
}
