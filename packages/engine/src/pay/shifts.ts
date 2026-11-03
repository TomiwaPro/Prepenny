// "I did overtime" and "I missed a shift" (brief 4.3, D5, D44): the payday a
// shift is paid on (D131), and how much it changes that payday's take-home
// pay, with any change to the extras (D130).

import { type Day, dayOfMonthOrLast, lastDayOfMonth, partsOfDay } from '../dates/day.ts';
import type { Pence } from '../money/pence.ts';
import { workOutTakeHome } from './take-home.ts';
import type { TaxYear } from './tax-year.ts';
import type { CoveredTo, FixedPay, PayLine, PaySettings, TakeHome, YearSoFar } from './types.ts';

/**
 * The last day of work a payday pays for (D131), from the payday's date
 * from its schedule, before any weekend or bank holiday move. Sam's Fri 6 Nov
 * covers up to Sun 1 Nov (5 days before). Pay on the last working day
 * covering work up to the 15th: Fri 29 Jan 2027 covers up to Fri 15 Jan.
 */
export function lastDayCovered(coveredTo: CoveredTo, paydayOriginal: Day): Day {
  switch (coveredTo.kind) {
    case 'days-before':
      return paydayOriginal - coveredTo.days;
    case 'day-of-month': {
      const { year, month } = partsOfDay(paydayOriginal);
      return dayOfMonthOrLast(year, month, coveredTo.day);
    }
    case 'last-day': {
      const { year, month } = partsOfDay(paydayOriginal);
      return lastDayOfMonth(year, month);
    }
  }
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
