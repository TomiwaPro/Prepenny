// Budget periods (D29, D61, D108, D111): weeks from the main payday's weekday
// or Monday, months from one main payday to the day before the next or by
// calendar month, and a pay-later card's statement periods.

import {
  addDays,
  addMonths,
  type Day,
  dayFromParts,
  dayOfMonthOrLast,
  lastDayOfMonth,
  MONDAY,
  monthFromNumber,
  monthNumberOfDay,
  partsOfDay,
  type Weekday,
  weekday,
} from '../dates/day.ts';
import type { MainPaydays } from '../periods/main-pay.ts';
import type { PreparedSeries } from '../schedule/series.ts';
import type { CheckedBudget } from './check.ts';

/** One period's first and last day. A pay-later period also has its bill date. */
export interface Bounds {
  readonly start: Day;
  readonly end: Day;
  /** Pay-later only: the bill that pays for this period, after its last day. */
  readonly bill: Day | null;
}

/** Finds the period a day is in. Periods follow on from each other with no gaps. */
export interface BudgetCalendar {
  periodOf(day: Day): Bounds;
}

/** Weeks starting on one weekday. */
export function weeks(starting: Weekday): BudgetCalendar {
  return {
    periodOf: (day) => {
      const start = addDays(day, -((weekday(day) - starting + 7) % 7));
      return { start, end: addDays(start, 6), bill: null };
    },
  };
}

/** Calendar months, from the 1st. */
export const calendarMonths: BudgetCalendar = {
  periodOf: (day) => {
    const { year, month } = partsOfDay(day);
    return { start: dayFromParts(year, month, 1), end: lastDayOfMonth(year, month), bill: null };
  },
};

/**
 * Months from one main payday to the day before the next (D29). Before the
 * first main payday and after the last, the periods carry on in whole months
 * from the nearest one, so they still follow on with no gaps (D108).
 */
export function payMonths(main: MainPaydays): BudgetCalendar {
  return {
    periodOf: (day) => {
      const last = main.lastOnOrBefore(day);
      const next = main.firstAfter(day);
      if (last !== null && next !== null)
        return { start: last, end: addDays(next, -1), bill: null };
      if (last === null && next === null) return calendarMonths.periodOf(day);
      if (last === null) {
        // Before the first payday: whole months back from it.
        const first = next as Day;
        let back = 1;
        while (addMonths(first, -back) > day) back += 1;
        return {
          start: addMonths(first, -back),
          end: addDays(addMonths(first, -back + 1), -1),
          bill: null,
        };
      }
      // After the last payday: whole months on from it.
      let on = 0;
      while (addMonths(last, on + 1) <= day) on += 1;
      return { start: addMonths(last, on), end: addDays(addMonths(last, on + 1), -1), bill: null };
    },
  };
}

/**
 * A pay-later card's statement periods (D61, D111). The bill for month m is
 * on the bill day, or the month's last day when it's shorter. Its statement
 * period ends the day before the bill, unless the card's own statement day
 * is set: then it ends on that statement day, in the bill's month when the
 * statement day comes before the bill day and in the month before otherwise,
 * but never on or after the bill date. It starts the day after the period
 * before it ends.
 */
export function statementPeriods(billDay: number, statementDay: number | null): BudgetCalendar {
  const billIn = (m: number): Day => {
    const { year, month } = monthFromNumber(m);
    return dayOfMonthOrLast(year, month, billDay);
  };
  const endIn = (m: number): Day => {
    const bill = billIn(m);
    if (statementDay === null) return addDays(bill, -1);
    const { year, month } = monthFromNumber(statementDay < billDay ? m : m - 1);
    return Math.min(dayOfMonthOrLast(year, month, statementDay), addDays(bill, -1));
  };
  return {
    periodOf: (day) => {
      let m = monthNumberOfDay(day);
      while (endIn(m - 1) >= day) m -= 1;
      while (endIn(m) < day) m += 1;
      return { start: addDays(endIn(m - 1), 1), end: endIn(m), bill: billIn(m) };
    },
  };
}

/** What the budget periods need to know about the main pay (D29, D108). */
export interface BudgetPay {
  /** Weekly budgets start on this weekday. */
  readonly weekStarts: Weekday;
  /** True when `weekStarts` is the main payday's weekday, not Monday by default. */
  readonly weeksFromPay: boolean;
  /** Monthly budgets run payday to payday with these paydays, or by calendar month when null. */
  readonly monthlyPaydays: MainPaydays | null;
}

/**
 * How budget periods line up with the main pay (D29, D108). A weekly budget
 * starts on the main payday's weekday when the main pay comes every few
 * weeks, and on Monday otherwise (irregular pay too, D14). A monthly budget
 * runs from payday to payday when the main pay is monthly, and by calendar
 * month otherwise. The main pay's schedule is the one its family follows
 * today: the series with the highest first number that has started by
 * today, or its first series when none has.
 */
export function budgetPay(
  main: MainPaydays | null,
  familyId: string | null,
  prepared: readonly PreparedSeries[],
  today: Day,
): BudgetPay {
  const plain: BudgetPay = { weekStarts: MONDAY, weeksFromPay: false, monthlyPaydays: null };
  if (main === null || main.kind === 'irregular' || familyId === null) return plain;
  const family = prepared
    .filter((one) => one.series.familyId === familyId)
    .sort((a, b) => a.firstNumber - b.firstNumber);
  const started = family.filter((one) => one.start <= today);
  const now = started.at(-1) ?? family[0];
  if (now === undefined) return plain;
  const schedule = now.series.schedule;
  if (schedule.kind === 'weekly') {
    return { weekStarts: weekday(now.start), weeksFromPay: true, monthlyPaydays: null };
  }
  if (schedule.kind === 'monthly' && schedule.every === 1) {
    return { weekStarts: MONDAY, weeksFromPay: false, monthlyPaydays: main };
  }
  return plain;
}

/** Whether a budget's periods line up with the paydays of the pay it follows (D29, D108). */
export function followsPaydays(budget: CheckedBudget, pay: BudgetPay): boolean {
  if (budget.billDay !== null) return false;
  return budget.budget.every === 'week' ? pay.weeksFromPay : pay.monthlyPaydays !== null;
}

/** The periods a budget follows (D29, D61). */
export function calendarOf(budget: CheckedBudget, pay: BudgetPay): BudgetCalendar {
  if (budget.billDay !== null) return statementPeriods(budget.billDay, budget.statementDay);
  if (budget.budget.every === 'week') return weeks(pay.weekStarts);
  return pay.monthlyPaydays === null ? calendarMonths : payMonths(pay.monthlyPaydays);
}
