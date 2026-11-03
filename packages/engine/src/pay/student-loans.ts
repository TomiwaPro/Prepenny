// Student loan and Postgraduate loan deductions, from HMRC's "Collection of
// student loans from 6 April 2026" (sections 3 and 4). Each is worked out on
// the earnings that National Insurance is due on, for this payday only.

import { EngineInputError } from '../errors.ts';
import { type Pence, penceFromBigInt } from '../money/pence.ts';
import type { PayFrequency, StudentLoanPlan, TaxYear } from './tax-year.ts';

const PERIODS_IN_YEAR: Readonly<Record<PayFrequency, bigint>> = {
  weekly: 52n,
  'two-weekly': 26n,
  'four-weekly': 13n,
  monthly: 12n,
};

/**
 * The threshold for one payday: the annual threshold ÷ the number of paydays
 * in a year, rounded down to the penny. Plan 2 weekly is £29,385 ÷ 52 = £565.09.
 */
export function studentLoanThreshold(
  plan: StudentLoanPlan,
  frequency: PayFrequency,
  year: TaxYear,
): Pence {
  return penceFromBigInt(
    BigInt(year.studentLoans[plan].annualThreshold) / PERIODS_IN_YEAR[frequency],
    'Student loan threshold',
  );
}

/**
 * The deduction for one plan: the plan's rate on the earnings above its
 * threshold, rounded down to the whole pound.
 */
export function studentLoanDeduction(
  plan: StudentLoanPlan,
  earnings: Pence,
  frequency: PayFrequency,
  year: TaxYear,
): Pence {
  const above = earnings - studentLoanThreshold(plan, frequency, year);
  if (above <= 0) return 0;
  const rate = year.studentLoans[plan].rate;
  const pence = (BigInt(above) * rate.units) / (100n * 10n ** BigInt(rate.scale));
  return penceFromBigInt((pence / 100n) * 100n, 'Student loan');
}

/**
 * Checks the plans a pay profile has: each at most once, and only one of
 * Plans 1, 2, 4 and 5, because an employer uses only one of them through
 * payroll; a Postgraduate loan can go with it (HMRC, section 1).
 */
export function checkStudentLoans(plans: readonly StudentLoanPlan[]): void {
  if (!Array.isArray(plans)) {
    throw new EngineInputError('bad-student-loan', 'The student loans must be a list.');
  }
  const seen = new Set<string>();
  let undergraduate = 0;
  for (const plan of plans) {
    if (!['plan-1', 'plan-2', 'plan-4', 'plan-5', 'postgraduate'].includes(plan)) {
      throw new EngineInputError('bad-student-loan', 'That isn’t a student loan plan.');
    }
    if (seen.has(plan)) {
      throw new EngineInputError('bad-student-loan', 'A student loan plan is listed twice.');
    }
    seen.add(plan);
    if (plan !== 'postgraduate') undergraduate += 1;
  }
  if (undergraduate > 1) {
    throw new EngineInputError(
      'two-student-loan-plans',
      'Payroll takes only one of Plans 1, 2, 4 and 5. Choose the one on the payslip.',
    );
  }
}
