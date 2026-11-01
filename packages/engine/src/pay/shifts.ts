// "I did overtime" and "I missed a shift" (brief 4.3, D5, D44): the payday a
// shift is paid on, and how much it changes that payday's take-home pay.

import { type Day, type Weekday, weekday } from '../dates/day.ts';
import type { Pence } from '../money/pence.ts';
import { workOutTakeHome } from './take-home.ts';
import type { TaxYear } from './tax-year.ts';
import type { FixedPay, PayLine, PaySettings, TakeHome, YearSoFar } from './types.ts';

/** The first day of the working week a day is in, for a week that starts on `starts`. */
export function workWeekStart(day: Day, starts: Weekday): Day {
  return day - ((weekday(day) - starts + 7) % 7);
}

/**
 * The first day a shift can be paid (D125): the start of its working week,
 * moved on by the weeks pay is behind. The shift is paid on the first payday
 * on or after it. Sam's shift on Mon 26 Oct 2026, in a week from Monday, one
 * week behind: from Mon 2 Nov, so Fri 6 Nov.
 */
export function shiftPaidFrom(workedOn: Day, starts: Weekday, weeksBehind: number): Day {
  return workWeekStart(workedOn, starts) + 7 * weeksBehind;
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
  /** This change: overtime hours, or minus the hours of a missed shift. */
  readonly change: PayLine;
}

export interface PayChange {
  /** Take-home with the change minus take-home without it (D5). */
  readonly change: Pence;
  readonly with: TakeHome;
  readonly without: TakeHome;
}

/**
 * Take-home pay with and without the change, from the payday's pay week and
 * anything already saved for it (D5). Both use the same year so far: any pay
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
  const without = workOutTakeHome(
    { ...base, lines: [...input.lines, ...input.earlier], assumedPayBetween: usual.payForTax },
    years,
  );
  const withChange = workOutTakeHome(
    {
      ...base,
      lines: [...input.lines, ...input.earlier, input.change],
      assumedPayBetween: usual.payForTax,
    },
    years,
  );
  return { change: withChange.takeHome - without.takeHome, with: withChange, without };
}
