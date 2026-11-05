// Words for Your job (step 2h): each saved detail as one plain line, and
// what a change did to paydays still to come (D154). Every word comes from
// the strings file.

import type { PayProfile, StudentLoanPlan } from '@prepenny/engine';
import { strings } from '../strings/en-GB.ts';
import { formatDay } from './dates.ts';
import type { JobCard, PaydayChange } from './job-view.ts';
import { formatMoney, rateWords } from './money.ts';

const t = strings.job;
const pay = strings.pay;

/** The most paydays named in the undo bar; the rest are counted. */
const MOST_NAMED = 2;

/** " Your pay on Fri 6 Nov is now £771.00." for each payday that changes, after the bar's first words. */
export function paydayChangeWords(changes: readonly PaydayChange[], today: string): string {
  if (changes.length === 0) return '';
  const named = changes
    .slice(0, MOST_NAMED)
    .map((one) => t.savedPayday(formatDay(one.date, today), formatMoney(one.after)));
  const more = changes.length - MOST_NAMED;
  return ` ${[...named, ...(more > 0 ? [t.savedMore(more)] : [])].join(' ')}`;
}

export function taxCodeWords(profile: PayProfile): string {
  return t.taxCodeLine(profile.taxCode, profile.basis === 'week-one');
}

export function pensionWords(profile: PayProfile): string {
  const pension = profile.pension;
  if (pension === undefined) return t.none;
  const from = pension.lower === undefined ? null : formatMoney(pension.lower);
  const to = pension.upper === undefined ? null : formatMoney(pension.upper);
  const band =
    from === null && to === null
      ? null
      : t.pensionBand(from, to, pay.periodWords[profile.frequency]);
  return t.pensionLine(pension.percent, band, pension.when === 'before-tax');
}

export function loanWords(profile: PayProfile): string {
  const loans = profile.studentLoans ?? [];
  const plan = loans.find(
    (one): one is Exclude<StudentLoanPlan, 'postgraduate'> => one !== 'postgraduate',
  );
  const postgraduate = loans.includes('postgraduate');
  if (plan === undefined) return postgraduate ? t.postgraduateOnly : t.none;
  return postgraduate ? t.loanAndPostgraduate(pay.plans[plan]) : pay.plans[plan];
}

export function deductionWords(profile: PayProfile): string {
  const deductions = profile.otherDeductions ?? [];
  if (deductions.length === 0) return t.none;
  return deductions.map((one) => t.deduction(one.name, formatMoney(one.amount))).join(', ');
}

export function soFarWords(profile: PayProfile): string {
  const soFar = profile.soFar;
  if (soFar === undefined) return t.soFarNone;
  return t.soFarLine(
    profile.frequency === 'monthly' ? 'month' : 'week',
    soFar.period,
    pay.taxYearWords(soFar.taxYear),
    formatMoney(soFar.grossForTax),
    formatMoney(soFar.taxPaid),
  );
}

export function overtimeWords(profile: PayProfile): string {
  return profile.overtimeRate === undefined
    ? t.notSet
    : t.overtimeRateLine(rateWords(profile.overtimeRate));
}

export function coveredWords(job: JobCard, today: string): string {
  if (job.next === null || job.coveredUpTo === null) return t.notSet;
  return t.coveredLine(formatDay(job.next.date, today), formatDay(job.coveredUpTo, today));
}

/**
 * Which paydays a usual week is for: every payday, some weeks of the pattern
 * ("paydays" for pay that isn't weekly, D280), earlier paydays, or none.
 */
export function weekForWords(
  steps: readonly number[],
  of: number,
  until: string | null = null,
  today = '',
  weekly = true,
): string {
  if (steps.length === 0) return until === null ? t.weekKept : t.weekUntil(formatDay(until, today));
  if (steps.length === of) return t.weekEvery;
  const list =
    steps.length === 1
      ? String(steps[0])
      : `${steps.slice(0, -1).join(', ')} and ${steps[steps.length - 1]}`;
  return t.weekSteps(list, steps.length > 1, of, weekly);
}
