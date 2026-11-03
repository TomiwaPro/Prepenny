// The take-home pay calculator's records and results (brief 4.15,
// ARCHITECTURE.md 3.4). Hours, rates and percentages are exact decimals
// written as text; money is whole pence.

import type { Pence } from '../money/pence.ts';
import type { PayFrequency, StudentLoanPlan } from './tax-year.ts';

/** The kinds of pay line (brief 4.15). */
export const PAY_LINE_KINDS = ['basic', 'overtime', 'nights', 'weekends', 'holiday'] as const;
export type PayLineKind = (typeof PAY_LINE_KINDS)[number];

/** Hours × rate: "34.5" hours at "12.71" an hour, worked out exactly and rounded once (D9). */
export interface PayLine {
  readonly name: string;
  readonly kind: PayLineKind;
  /** Hours as text, such as "34.5". Below zero takes hours off, for a missed shift. */
  readonly hours: string;
  /** Pounds an hour as text, such as "12.71". */
  readonly rate: string;
}

/** A fixed amount of pay, such as a shift premium or a bonus. */
export interface FixedPay {
  readonly name: string;
  readonly amount: Pence;
}

/** Any other deduction typed in, such as union fees. Taken after tax. */
export interface OtherDeduction {
  readonly name: string;
  readonly amount: Pence;
}

/**
 * Workplace pension (brief 4.15): a percentage of the earnings in a band for
 * the pay period, taken before tax (a net pay arrangement) or after tax.
 */
export interface Pension {
  /** A percentage as text, such as "4". */
  readonly percent: string;
  /** The bottom of the band for one pay period, such as £120.00 a week. Left out means from £0. */
  readonly lower?: Pence;
  /** The top of the band for one pay period, such as £967.00 a week. Left out means no top. */
  readonly upper?: Pence;
  readonly when: 'before-tax' | 'after-tax';
}

/** "Gross for tax so far" and "Tax paid so far" from a payslip (brief 4.15). */
export interface YearSoFar {
  /** The tax year they're for, "2026-27". */
  readonly taxYear: string;
  /** The tax week or month they include: 28 for a weekly payslip in tax week 28. */
  readonly period: number;
  /** Gross for tax so far: all pay for tax this tax year to that payslip, included. */
  readonly grossForTax: Pence;
  /** Tax paid so far, to that payslip, included. */
  readonly taxPaid: Pence;
}

/** One job's tax settings (ARCHITECTURE.md 3.4). */
export interface PaySettings {
  readonly frequency: PayFrequency;
  /** As on the payslip: "1257L", "S1257L", "C1257L", "BR", "D0", "NT", "K475", "1257L W1". */
  readonly taxCode: string;
  /** The cumulative basis, or week 1/month 1. A code ending in W1, M1 or X is always week 1/month 1. */
  readonly basis: 'cumulative' | 'week-one';
  /** The National Insurance category letter. A unless the payslip says otherwise. */
  readonly niCategory?: string;
  readonly pension?: Pension;
  /** At most one of Plans 1, 2, 4 and 5, and a Postgraduate loan if there is one. */
  readonly studentLoans?: readonly StudentLoanPlan[];
  readonly otherDeductions?: readonly OtherDeduction[];
}

/**
 * The last day of work a payday pays for (D131), asked once in setup: "Fri
 * 6 Nov pays for work up to Sun 1 Nov". A shift is paid on the first payday
 * whose last day covered is on or after the shift.
 */
export type CoveredTo =
  /**
   * Monthly pay: up to this day of the payday's month, 1 to 31, or the
   * month's last day when the month is shorter. The payday's month is the
   * month of its date from the schedule, before any weekend or bank holiday
   * move. Pay on the last working day covering work up to the 15th: Thu 31
   * Dec 2026 covers up to Tue 15 Dec. With `monthBefore`, it's that day of
   * the month before: pay on the 5th for work up to the 28th of last month (D142).
   */
  | { readonly kind: 'day-of-month'; readonly day: number; readonly monthBefore?: true }
  /**
   * Monthly pay: up to the last day of the payday's month, or with
   * `monthBefore` of the month before: "Fri 5 Dec pays for work up to Mon 30
   * Nov" (D142).
   */
  | { readonly kind: 'last-day'; readonly monthBefore?: true }
  /**
   * Any other pay: up to this many days before the payday's date from the
   * schedule, before any weekend or bank holiday move, 0 to 62. Sam's is 5:
   * Fri 6 Nov covers up to Sun 1 Nov.
   */
  | { readonly kind: 'days-before'; readonly days: number };

/**
 * A pay profile (ARCHITECTURE.md 3.4): one job's tax settings, the latest
 * payslip's year so far, and what "I did overtime" and "I missed a shift" need.
 */
export interface PayProfile extends PaySettings {
  readonly id: string;
  /** From the last payslip, for exact tax on the cumulative basis. */
  readonly soFar?: YearSoFar;
  /** Remembered for "I did overtime" (brief 4.3): pounds an hour as text. */
  readonly overtimeRate?: string;
  /** The last day of work each payday pays for, for finding the payday a shift is paid on (D131). */
  readonly coveredTo?: CoveredTo;
}

/** A saved pay week (D5): the usual lines of one kind of week, such as "3-shift week". */
export interface PayWeek {
  readonly id: string;
  readonly payProfileId: string;
  readonly lines: readonly PayLine[];
  readonly fixed?: readonly FixedPay[];
}

/**
 * "I did overtime" or "I missed a shift" (D5, D44), saved on the payday the
 * shift is paid on. Found by the pay series' family and the payday's payment
 * number, so a split or a moved date never loses it (D123).
 */
export interface PayAdjustment {
  readonly id: string;
  /** The family of the pay series (D49). */
  readonly familyId: string;
  /** The payment number of the payday, counted from the family's first series (brief 5.3). */
  readonly number: number;
  readonly kind: 'overtime' | 'missed-shift';
  /** The day of the shift, "YYYY-MM-DD". */
  readonly workedOn: string;
  readonly hours: string;
  readonly rate: string;
  /**
   * A change to the pay week's extras, such as its shift premium, bonus or
   * allowance (D130): added for overtime, taken off for a missed shift.
   * Above zero, or left out when the extras stay as they are.
   */
  readonly extras?: Pence;
  /** The change to the payday's take-home pay, worked out when it was saved (D5). Below zero for a missed shift. */
  readonly change: Pence;
  /** The tax year of the payday, "2026-27". */
  readonly taxYear: string;
}

/** What the calculator needs for one payday. */
export interface TakeHomeInput {
  readonly settings: PaySettings;
  readonly lines: readonly PayLine[];
  readonly fixed?: readonly FixedPay[];
  /** The payday, "YYYY-MM-DD". It sets the tax year and the tax week or month. */
  readonly payDate: string;
  /** From the last payslip before this payday. Without it, the result is an estimate. */
  readonly soFar?: YearSoFar;
  /**
   * Pay for tax to assume for each pay period between `soFar` and this payday,
   * when there are any. This payday's own pay for tax unless given (D124).
   */
  readonly assumedPayBetween?: Pence;
}

/** One pay line as worked out. */
export interface WorkedPayLine {
  readonly name: string;
  readonly kind: PayLineKind;
  readonly hours: string;
  readonly rate: string;
  readonly amount: Pence;
}

/** Why a result is an estimate. */
export type EstimateReason =
  /** No "Gross for tax so far" and "Tax paid so far" were given. */
  | 'no-year-so-far'
  /** They were from a payslip before the one just before this payday (D124). */
  | 'year-so-far-earlier'
  /** They were from the tax year before. */
  | 'year-so-far-last-year';

/** Take-home pay and its breakdown (brief 4.15). */
export interface TakeHome {
  readonly taxYear: string;
  readonly frequency: PayFrequency;
  /** The tax week (1 to 53, or 2 to 54 and 4 to 56 for every 2 or 4 weeks) or tax month (1 to 12). */
  readonly period: number;
  readonly lines: readonly WorkedPayLine[];
  readonly fixed: readonly FixedPay[];
  readonly gross: Pence;
  readonly pension: Pence;
  /** Gross pay less any pension taken before tax. */
  readonly payForTax: Pence;
  /** Below zero is a refund. */
  readonly tax: Pence;
  readonly nationalInsurance: Pence;
  /** Plan 1, 2, 4 or 5, if there is one. */
  readonly studentLoan: Pence;
  readonly postgraduateLoan: Pence;
  readonly otherDeductions: readonly OtherDeduction[];
  readonly takeHome: Pence;
  /** "Gross for tax so far" after this payday, as the next payslip would show it. */
  readonly grossForTaxSoFar: Pence;
  /** "Tax paid so far" after this payday. */
  readonly taxPaidSoFar: Pence;
  /** The tax the regulatory limit stopped this payday from taking, if it did (0 otherwise). */
  readonly taxHeldBack: Pence;
  /** Exact when the year so far was from the payslip just before, or tax is week 1/month 1. */
  readonly isEstimate: boolean;
  readonly estimateReason: EstimateReason | null;
}
