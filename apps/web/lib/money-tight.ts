// "Free, confidential help is available." on Home (step 4g, D584 to D586,
// the owner's answer to PLAN.md question 9, brief 4.16, and D592): when
// three pay periods in a row each have a short day, starting with the one
// we're in now or the next one, a calm card under the lowest point, with
// "See where to get help" and "Not now", which hides it for 30 days.
//
// Whether the plan is short runs in the background worker with the rest of
// Home (lib/home.ts). "Not now" is kept on this phone only, in the browser's
// small store, like the home-screen suggestion (D547): nothing is sent
// anywhere, and signing out removes it with everything else (D308).

import {
  addDays,
  formatDate,
  groupIntoPeriods,
  type Plan,
  type PlanPeriod,
  type PlanRecords,
  parseDate,
} from '@prepenny/engine';

/** How many pay periods in a row must each have a short day (D584, D592). */
export const PERIODS_RUNNING = 3;

/** How long "Not now" hides the card (D584). */
export const HIDDEN_FOR_DAYS = 30;

/**
 * The first short day in each of three pay periods in a row, or null when
 * there aren't three in a row with one (D592, which replaces the first
 * point of D585).
 *
 * - **Three pay periods in a row,** starting with the pay period today is
 *   in (from today to the day before the next main payday) or with the
 *   next one. Each runs from a main payday to the day before the next
 *   (D14). With no main pay, they're calendar months, as on Coming up
 *   (D84). The run starting now is the one given, when both are short.
 * - **A short day** is a day whose end-of-day balance is under the
 *   overdraft floor in any open account: "Short" on Coming up (brief 5.5).
 *   In the pay period today is in, only today and later count.
 * - Home looks 12 months ahead (D178), so the periods must start within
 *   that; a period cut off by the plan's end counts by the part inside it.
 */
export function shortDaysRunning(plan: Plan, records: PlanRecords): readonly string[] | null {
  const closed = new Set(
    records.accounts.filter((account) => account.closed === true).map((account) => account.id),
  );
  const open = plan.accounts.filter((account) => !closed.has(account.account.id));
  // The pay period today is in comes first, from today on (`from`).
  const periods = groupIntoPeriods(plan, 'pay').accounts[0]?.periods ?? [];
  const firstShort = (period: PlanPeriod): string | null => {
    let first: string | null = null;
    for (const account of open) {
      for (const day of account.days) {
        if (day.date < period.from || day.date > period.to || day.status !== 'short') continue;
        if (first === null || day.date < first) first = day.date;
        break;
      }
    }
    return first;
  };
  const shortOn = periods.slice(0, PERIODS_RUNNING + 1).map(firstShort);
  for (const start of [0, 1]) {
    const run = shortOn.slice(start, start + PERIODS_RUNNING);
    if (run.length === PERIODS_RUNNING && run.every((day) => day !== null)) {
      return run as string[];
    }
  }
  return null;
}

/** Where "Not now" is kept on this phone. */
export const MONEY_HELP_KEY = 'prepenny-money-help';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The day "Not now" was tapped, if it was and is as written. */
export function readNotNow(text: string | null): string | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== 'object') return null;
    const { notNowOn } = value as Record<string, unknown>;
    return typeof notNowOn === 'string' && DAY.test(notNowOn) ? notNowOn : null;
  } catch {
    return null;
  }
}

/**
 * Whether "Not now" still hides the card today: for 30 days from the day it
 * was tapped, that day included, so tapped on Wed 18 Nov it's hidden up to
 * Thu 17 Dec and shows again on Fri 18 Dec.
 */
export function hiddenByNotNow(notNowOn: string | null, today: string): boolean {
  if (notNowOn === null) return false;
  return today < formatDate(addDays(parseDate(notNowOn), HIDDEN_FOR_DAYS));
}

/** Reads "Not now" from this phone; none when the phone keeps nothing. */
export function notNowOnThisPhone(): string | null {
  try {
    return readNotNow(localStorage.getItem(MONEY_HELP_KEY));
  } catch {
    return null;
  }
}

/** Keeps "Not now" on this phone, if it can. */
export function keepNotNow(today: string): void {
  try {
    localStorage.setItem(MONEY_HELP_KEY, JSON.stringify({ notNowOn: today }));
  } catch {
    // Nothing kept: the card stays away until PrePenny is opened again.
  }
}
