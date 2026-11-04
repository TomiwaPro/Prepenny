// "Your job" (step 2h): the boxes for one job's details, as the person types
// them, read into the engine's change to a pay profile (D154). The tax and
// deduction boxes and the last payslip's figures are the pay calculator's
// own (brief 4.15), so both ask the same way. The overtime rate and the last
// day of work a payday covers are asked as setup asks them (D131, D142).
// Only what differs from the saved job is sent (D153).

import {
  type CoveredTo,
  coveredToFromDates,
  EngineInputError,
  type PayProfile,
  type PayProfileEdits,
  sameValue,
} from '@prepenny/engine';
import type { JobCard } from './job-view.ts';
import { readDate } from './new-payment.ts';
import {
  type CalculatorErrors,
  calculatorFromPlan,
  readTaxBoxes,
  type TaxBoxesForm,
} from './pay-calculator.ts';

export interface JobForm extends TaxBoxesForm {
  readonly overtimeRate: string;
  /** The last day of work the next payday covers, "YYYY-MM-DD", or empty. */
  readonly coveredTo: string;
}

export type JobMistake = 'rateError' | 'coveredToError' | 'coveredToTooFar';

export interface JobErrors extends CalculatorErrors {
  readonly overtimeRate?: JobMistake;
  readonly coveredTo?: JobMistake;
}

const RATE = /^\d{1,4}(?:\.\d{1,4})?$/;

/** The boxes filled in from the saved job, as the calculator fills them from the plan (step 2g). */
export function jobFormOf(job: JobCard, today: string): JobForm {
  const tax = calculatorFromPlan(job.next?.date ?? today, job.profile, null);
  return {
    payDate: tax.payDate,
    frequency: tax.frequency,
    taxCode: tax.taxCode,
    basis: tax.basis,
    pension: tax.pension,
    pensionPercent: tax.pensionPercent,
    pensionLower: tax.pensionLower,
    pensionUpper: tax.pensionUpper,
    pensionWhen: tax.pensionWhen,
    studentLoan: tax.studentLoan,
    postgraduate: tax.postgraduate,
    deductions: tax.deductions,
    soFarPeriod: tax.soFarPeriod,
    grossSoFar: tax.grossSoFar,
    taxSoFar: tax.taxSoFar,
    overtimeRate: job.profile.overtimeRate ?? '',
    coveredTo: job.coveredUpTo ?? '',
  };
}

/** One part of a change: the new value when it differs from the saved one, null to clear it. */
function differs<T>(now: T | undefined, next: T | undefined): T | null | undefined {
  if (sameValue(now ?? null, next ?? null)) return undefined;
  return next === undefined ? null : next;
}

interface JobParts {
  readonly taxCode: string;
  readonly basis: PayProfile['basis'];
  readonly pension: PayProfile['pension'];
  readonly studentLoans: PayProfile['studentLoans'];
  readonly otherDeductions: PayProfile['otherDeductions'];
  readonly soFar: PayProfile['soFar'];
  readonly overtimeRate: PayProfile['overtimeRate'];
  readonly coveredTo: PayProfile['coveredTo'];
}

/** What the boxes say, part by part, with any box that needs a change added to `errors`. */
function readParts(
  form: JobForm,
  job: JobCard,
  errors: { -readonly [K in keyof JobErrors]: JobErrors[K] },
): JobParts {
  const { settings, soFar } = readTaxBoxes(form, errors);

  // The overtime rate can be left empty by someone who never does overtime.
  const rateText = form.overtimeRate.trim().replace(/^£/, '').trim();
  let overtimeRate: string | undefined;
  if (rateText !== '') {
    if (!RATE.test(rateText) || Number(rateText) <= 0) errors.overtimeRate = 'rateError';
    else overtimeRate = rateText;
  }

  // The last day covered stays once it's set: without it, a shift has no payday (D131).
  let coveredTo: CoveredTo | undefined = job.profile.coveredTo;
  const upTo = form.coveredTo.trim() === '' ? null : readDate(form.coveredTo);
  if (job.next === null) {
    // With no payday to come, the box isn't shown, and what's saved stays.
  } else if (form.coveredTo.trim() === '') {
    if (job.profile.coveredTo !== undefined) errors.coveredTo = 'coveredToError';
  } else if (upTo === null) {
    errors.coveredTo = 'coveredToError';
  } else {
    try {
      coveredTo = coveredToFromDates(job.frequency, job.next.originalDate, upTo);
    } catch (error) {
      if (!(error instanceof EngineInputError)) throw error;
      errors.coveredTo = 'coveredToTooFar';
    }
  }
  return {
    taxCode: settings.taxCode,
    basis: settings.basis,
    pension: settings.pension,
    studentLoans: settings.studentLoans,
    otherDeductions: settings.otherDeductions,
    soFar,
    overtimeRate,
    coveredTo,
  };
}

/**
 * The change to the saved job, or the boxes that need a change. Only a part
 * the person changed is sent, so a saved figure the boxes can't show, such
 * as a payslip from the tax year before, is never cleared by mistake. A
 * change with nothing in it means nothing differs.
 */
export function readJob(
  form: JobForm,
  initial: JobForm,
  job: JobCard,
):
  | { readonly ok: true; readonly edits: PayProfileEdits }
  | { readonly ok: false; readonly errors: JobErrors } {
  const errors: { -readonly [K in keyof JobErrors]: JobErrors[K] } = {};
  const parts = readParts(form, job, errors);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const started = readParts(initial, job, {});
  const now: PayProfile = job.profile;
  const edits: Record<string, unknown> = {};
  for (const key of Object.keys(parts) as (keyof JobParts)[]) {
    if (sameValue(parts[key] ?? null, started[key] ?? null)) continue;
    const change = differs(now[key], parts[key]);
    if (change === undefined) continue;
    if ((key === 'taxCode' || key === 'basis') && change === null) continue;
    edits[key] = change;
  }
  return { ok: true, edits: edits as PayProfileEdits };
}
