import { addDays, type Day, MONDAY, weekday } from '../dates/day.ts';
import {
  type BankHolidayLookup,
  LONGEST_RUN_WITHOUT_A_WORKING_DAY,
} from '../dates/working-days.ts';
import { type ChangeIndex, paymentsOfSeriesBetween } from '../schedule/payments.ts';
import type { PreparedSeries } from '../schedule/series.ts';

/**
 * The main pay's paydays (D14, D81). A main payday is a day a payment of the
 * main pay lands, after the weekend and bank holiday rule and any move. A
 * removed (skipped) payment isn't a payday. When the main pay is irregular,
 * every Monday is a main payday instead, so plan periods are weeks from
 * Monday to Sunday (D14, D66).
 */
export interface MainPaydays {
  readonly kind: 'regular' | 'irregular';
  /** The first main payday strictly after `day`, or null when there's none. */
  firstAfter(day: Day): Day | null;
  /** The last main payday on or before `day`, or null when there's none. */
  lastOnOrBefore(day: Day): Day | null;
  /** Every main payday from `from` to `to`, both included, in order. */
  between(from: Day, to: Day): Day[];
}

// How far to look for the next or last payday. Pay as far apart as once a
// year is found in the first few looks; after about 22 years there's none.
const FIRST_LOOK_IN_DAYS = 64;
const FURTHEST_LOOK_IN_DAYS = 8192;

function irregular(): MainPaydays {
  const lastOnOrBefore = (day: Day): Day => addDays(day, -(weekday(day) - MONDAY));
  return {
    kind: 'irregular',
    firstAfter: (day) => addDays(lastOnOrBefore(day), 7),
    lastOnOrBefore,
    between: (from, to) => {
      const mondays: Day[] = [];
      for (let monday = addDays(lastOnOrBefore(addDays(from, -1)), 7); monday <= to; monday += 7) {
        mondays.push(monday);
      }
      return mondays;
    },
  };
}

function regular(
  family: readonly PreparedSeries[],
  changes: ChangeIndex,
  holidays: BankHolidayLookup,
): MainPaydays {
  // The earliest and latest day any payment of the family could land on, so
  // the search can stop.
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  for (const prepared of family) {
    earliest = Math.min(earliest, addDays(prepared.start, -LONGEST_RUN_WITHOUT_A_WORKING_DAY));
    if (prepared.count === Number.POSITIVE_INFINITY) {
      latest = Number.POSITIVE_INFINITY;
    } else if (prepared.count > 0) {
      latest = Math.max(
        latest,
        addDays(prepared.dateAt(prepared.count - 1), LONGEST_RUN_WITHOUT_A_WORKING_DAY),
      );
    }
    for (const { newDay } of changes.get(prepared.series.id)?.values() ?? []) {
      if (newDay !== null) {
        earliest = Math.min(earliest, newDay);
        latest = Math.max(latest, newDay);
      }
    }
  }

  const between = (from: Day, to: Day): Day[] => {
    const days = new Set<Day>();
    for (const prepared of family) {
      for (const payment of paymentsOfSeriesBetween(prepared, from, to, changes, holidays)) {
        if (!payment.skipped) {
          days.add(payment.day);
        }
      }
    }
    return [...days].sort((a, b) => a - b);
  };

  return {
    kind: 'regular',
    firstAfter: (day) => {
      const from = addDays(day, 1);
      for (let look = FIRST_LOOK_IN_DAYS; look <= FURTHEST_LOOK_IN_DAYS; look *= 2) {
        if (from > latest) return null;
        const found = between(from, addDays(day, look));
        if (found.length > 0) return found[0] as Day;
      }
      return null;
    },
    lastOnOrBefore: (day) => {
      for (let look = FIRST_LOOK_IN_DAYS; look <= FURTHEST_LOOK_IN_DAYS; look *= 2) {
        if (day < earliest) return null;
        const found = between(addDays(day, 1 - look), day);
        if (found.length > 0) return found.at(-1) as Day;
      }
      return null;
    },
    between,
  };
}

/**
 * The main paydays for the family the person chose as their main pay (D14).
 * Null when there's no main pay, or no series in that family.
 */
export function mainPaydaysOf(
  familyId: string | null,
  series: readonly PreparedSeries[],
  changes: ChangeIndex,
  holidays: BankHolidayLookup,
): MainPaydays | null {
  if (familyId === null) return null;
  const family = series.filter((prepared) => prepared.series.familyId === familyId);
  if (family.length === 0) return null;
  if (family.some((prepared) => prepared.series.schedule.kind === 'irregular')) {
    return irregular();
  }
  return regular(family, changes, holidays);
}
