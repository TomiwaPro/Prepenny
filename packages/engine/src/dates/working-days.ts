import { EngineInputError } from '../errors.ts';
import { type Day, lastDayOfMonth, SATURDAY, weekday } from './day.ts';

/** Anything that knows which days are bank holidays, such as a BankHolidayCalendar. */
export interface BankHolidayLookup {
  isBankHoliday(day: Day): boolean;
}

/**
 * The longest run of days that aren't working days the engine accepts. The
 * longest real run is about 5 (Christmas on a Friday: Fri, Sat, Sun, Mon).
 * Hitting this limit means the bank holiday list is wrong.
 */
export const LONGEST_RUN_WITHOUT_A_WORKING_DAY = 14;

/** Saturday or Sunday. */
export function isWeekend(day: Day): boolean {
  return weekday(day) >= SATURDAY;
}

/** Not a Saturday, Sunday or bank holiday. */
export function isWorkingDay(day: Day, holidays: BankHolidayLookup): boolean {
  return !isWeekend(day) && !holidays.isBankHoliday(day);
}

function stepToWorkingDay(day: Day, holidays: BankHolidayLookup, step: 1 | -1): Day {
  let candidate = day;
  for (let tries = 0; tries <= LONGEST_RUN_WITHOUT_A_WORKING_DAY; tries += 1) {
    if (isWorkingDay(candidate, holidays)) {
      return candidate;
    }
    candidate += step;
  }
  throw new EngineInputError(
    'no-working-day',
    `No working day within ${LONGEST_RUN_WITHOUT_A_WORKING_DAY} days. The bank holiday list looks wrong.`,
  );
}

/** The day itself if it's a working day, otherwise the working day before it. */
export function workingDayOnOrBefore(day: Day, holidays: BankHolidayLookup): Day {
  return stepToWorkingDay(day, holidays, -1);
}

/** The day itself if it's a working day, otherwise the working day after it. */
export function workingDayOnOrAfter(day: Day, holidays: BankHolidayLookup): Day {
  return stepToWorkingDay(day, holidays, 1);
}

/** The last working day of the month (Priya's salary, brief 8.5). */
export function lastWorkingDayOfMonth(
  year: number,
  month: number,
  holidays: BankHolidayLookup,
): Day {
  return workingDayOnOrBefore(lastDayOfMonth(year, month), holidays);
}
