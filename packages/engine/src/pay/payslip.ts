// "Check my payslip" (brief 4.15): the figures on a payslip beside what the
// calculator expected, and each one that differs, by how much. The words
// people see ("Ask your payroll team") come with the screens in Phase 2.

import type { EditCommand, PaymentRef } from '../edit/types.ts';
import { checkPence, type Pence } from '../money/pence.ts';
import { workOutTakeHome } from './take-home.ts';
import type { TaxYear, TaxYearFile } from './tax-year.ts';
import type { TakeHome, TakeHomeInput } from './types.ts';

/** The figures a payslip shows. Any can be left out. */
export interface Payslip {
  readonly gross?: Pence;
  readonly pension?: Pence;
  readonly tax?: Pence;
  readonly nationalInsurance?: Pence;
  readonly studentLoan?: Pence;
  readonly postgraduateLoan?: Pence;
  readonly takeHome?: Pence;
  readonly grossForTaxSoFar?: Pence;
  readonly taxPaidSoFar?: Pence;
}

/** The payslip's figures, in the order a payslip lists them. */
export const PAYSLIP_FIGURES = [
  'gross',
  'pension',
  'tax',
  'nationalInsurance',
  'studentLoan',
  'postgraduateLoan',
  'takeHome',
  'grossForTaxSoFar',
  'taxPaidSoFar',
] as const satisfies readonly (keyof Payslip)[];

export type PayslipFigure = (typeof PAYSLIP_FIGURES)[number];

/** One figure that isn't what the calculator expected. */
export interface PayslipDifference {
  readonly figure: PayslipFigure;
  readonly expected: Pence;
  readonly onPayslip: Pence;
  /** The payslip's figure minus the expected one: above zero when the payslip's is more. */
  readonly difference: Pence;
}

export interface PayslipCheck {
  readonly expected: TakeHome;
  /** Empty when every figure typed in is what was expected. */
  readonly differences: readonly PayslipDifference[];
}

/**
 * Figures a payslip can show 1p away from the calculator without anything
 * being wrong: some payroll software uses HMRC's National Insurance tables,
 * which can differ from the exact percentage method by 1p, and take-home pay
 * with it (brief 8.6, D140).
 */
const ONE_PENNY_ALLOWED: ReadonlySet<PayslipFigure> = new Set(['nationalInsurance', 'takeHome']);

/**
 * Works out what the payslip should show from its pay lines and settings,
 * and lists every figure typed in that differs, with how much by. National
 * Insurance and take-home pay 1p away aren't listed (D140).
 */
export function checkPayslip(
  input: TakeHomeInput,
  payslip: Payslip,
  files?: readonly TaxYearFile[] | ReadonlyMap<string, TaxYear>,
): PayslipCheck {
  const expected = workOutTakeHome(input, files);
  const differences: PayslipDifference[] = [];
  for (const figure of PAYSLIP_FIGURES) {
    const onPayslip = payslip[figure];
    if (onPayslip === undefined) continue;
    checkPence(onPayslip, `The payslip's ${figure}`);
    const difference = onPayslip - expected[figure];
    if (difference !== 0 && !(ONE_PENNY_ALLOWED.has(figure) && Math.abs(difference) <= 1)) {
      differences.push({
        figure,
        expected: expected[figure],
        onPayslip,
        difference,
      });
    }
  }
  return { expected, differences };
}

/**
 * The edit that puts take-home pay into the plan as a payday's estimate
 * (brief 4.15, "One tap adds it to the plan"): just this one payday, at the
 * take-home amount, marked as an estimate.
 */
export function takeHomeAsEstimate(payday: PaymentRef, result: TakeHome): EditCommand {
  return {
    kind: 'just-this-one',
    seriesId: payday.seriesId,
    originalDate: payday.originalDate,
    edits: { amount: Math.max(0, result.takeHome), isEstimate: true },
  };
}
