// "I did overtime" and "I missed a shift" (brief 4.3, D5, D44): the payday a
// shift is paid on (D131), and how much it changes that payday's take-home
// pay, with any change to the extras (D130).

import {
  type Day,
  dayOfMonthOrLast,
  lastDayOfMonth,
  monthFromNumber,
  monthNumberOfDay,
  parseDate,
  partsOfDay,
} from '../dates/day.ts';
import { EngineInputError } from '../errors.ts';
import type { Pence } from '../money/pence.ts';
import { MOST_DAYS_COVERED_BEFORE } from './records.ts';
import { workOutTakeHome } from './take-home.ts';
import type { PayFrequency, TaxYear } from './tax-year.ts';
import type { CoveredTo, FixedPay, PayLine, PaySettings, TakeHome, YearSoFar } from './types.ts';

/**
 * The last day of work a payday pays for (D131), from the payday's date
 * from its schedule, before any weekend or bank holiday move. Sam's Fri 6 Nov
 * covers up to Sun 1 Nov (5 days before). Pay on the last working day
 * covering work up to the 15th: Fri 29 Jan 2027 covers up to Fri 15 Jan.
 */
export function lastDayCovered(coveredTo: CoveredTo, paydayOriginal: Day): Day {
  if (coveredTo.kind === 'days-before') return paydayOriginal - coveredTo.days;
  // Monthly pay: the payday's own month, or the month before (D142).
  const { year, month } = monthFromNumber(
    monthNumberOfDay(paydayOriginal) - (coveredTo.monthBefore === true ? 1 : 0),
  );
  return coveredTo.kind === 'last-day'
    ? lastDayOfMonth(year, month)
    : dayOfMonthOrLast(year, month, coveredTo.day);
}

/**
 * The last day of work each payday covers (D131, D142), from the one
 * example setup asks for: "Fri 6 Nov pays for work up to Sun 1 Nov".
 * `payday` is a payday's date from its schedule, before any weekend or bank
 * holiday move, and `upTo` the last day of work it pays for, both
 * "YYYY-MM-DD".
 *
 * - Monthly pay keeps a day of the month: in the payday's own month, or in
 *   the month before ("Fri 5 Dec pays for work up to Mon 30 Nov"). A month's
 *   last day is kept as "the last day", so it's the 31st in a long month and
 *   the 28th in February (D142).
 * - Any other pay keeps the number of days before payday, 0 to 62.
 *
 * Refused when the work ends after a payday that isn't monthly, more than 62
 * days before it, or for monthly pay outside the payday's month and the
 * month before.
 */
export function coveredToFromDates(
  frequency: PayFrequency,
  payday: string,
  upTo: string,
): CoveredTo {
  const paid = parseDate(payday, 'The payday');
  const last = parseDate(upTo, 'The last day of work it pays for');
  if (frequency !== 'monthly') {
    const days = paid - last;
    if (days < 0 || days > MOST_DAYS_COVERED_BEFORE) {
      throw new EngineInputError(
        'covered-to-too-far',
        `A payday covers work up to 0 to ${MOST_DAYS_COVERED_BEFORE} days before it: ${upTo} is ${days < 0 ? 'after' : 'too long before'} ${payday}.`,
      );
    }
    return { kind: 'days-before', days };
  }
  const monthsBefore = monthNumberOfDay(paid) - monthNumberOfDay(last);
  if (monthsBefore !== 0 && monthsBefore !== 1) {
    throw new EngineInputError(
      'covered-to-too-far',
      `Monthly pay covers work up to a day in its own month or the month before, and ${upTo} isn't for ${payday}.`,
    );
  }
  const { year, month, day } = partsOfDay(last);
  const before = monthsBefore === 1 ? ({ monthBefore: true } as const) : {};
  return last === lastDayOfMonth(year, month)
    ? { kind: 'last-day', ...before }
    : { kind: 'day-of-month', day, ...before };
}

export interface PayChangeInput {
  readonly settings: PaySettings;
  readonly soFar?: YearSoFar;
  /** The payday, "YYYY-MM-DD". */
  readonly payDate: string;
  /** The payday's pay week (D5). */
  readonly lines: readonly PayLine[];
  readonly fixed?: readonly FixedPay[];
  /** The lines of the overtime and missed shifts already saved for this payday. */
  readonly earlier: readonly PayLine[];
  /** Their changes to the extras, if they have any (D130). */
  readonly earlierExtras?: readonly FixedPay[];
  /** This change: overtime hours, or minus the hours of a missed shift. */
  readonly change: PayLine;
  /** This change's own change to the extras, if it has one (D130). */
  readonly changeExtras?: FixedPay;
}

export interface PayChange {
  /** Take-home with the change minus take-home without it (D5). */
  readonly change: Pence;
  readonly with: TakeHome;
  readonly without: TakeHome;
}

/**
 * Take-home pay with and without the change, from the payday's pay week and
 * anything already saved for it, extras included (D5, D130). Both use the same year so far: any pay
 * periods between the last payslip and the payday count as paid the payday's
 * own pay week, with no overtime or missed shifts (D124). So two shifts on
 * one payday add up to exactly what both together would change.
 */
export function workOutPayChange(
  input: PayChangeInput,
  years: ReadonlyMap<string, TaxYear>,
): PayChange {
  const base = {
    settings: input.settings,
    payDate: input.payDate,
    fixed: input.fixed ?? [],
    ...(input.soFar === undefined ? {} : { soFar: input.soFar }),
  };
  const usual = workOutTakeHome({ ...base, lines: input.lines }, years);
  const earlierFixed = [...base.fixed, ...(input.earlierExtras ?? [])];
  const without = workOutTakeHome(
    {
      ...base,
      lines: [...input.lines, ...input.earlier],
      fixed: earlierFixed,
      assumedPayBetween: usual.payForTax,
    },
    years,
  );
  const withChange = workOutTakeHome(
    {
      ...base,
      lines: [...input.lines, ...input.earlier, input.change],
      fixed:
        input.changeExtras === undefined ? earlierFixed : [...earlierFixed, input.changeExtras],
      assumedPayBetween: usual.payForTax,
    },
    years,
  );
  return { change: withChange.takeHome - without.takeHome, with: withChange, without };
}
