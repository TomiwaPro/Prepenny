// Employee National Insurance by the exact percentage method (D122), from
// HMRC's National Insurance guidance for software developers 2026 to 2027:
// the earnings from the primary threshold up to the upper earnings limit at
// the category's main rate, rounded, plus the earnings above the limit at its
// upper rate, rounded (section 5, step 7).

import { EngineInputError } from '../errors.ts';
import type { Decimal } from '../money/decimal.ts';
import { type Pence, penceFromBigInt } from '../money/pence.ts';
import type { PayFrequency, TaxYear } from './tax-year.ts';

/**
 * Pence × a percentage, rounded as the National Insurance rules say (section
 * 4): "£0.005 or less is disregarded", so HMRC looks only at the third
 * decimal place of a pound, rounding down at 5 or less and up at 6 or more.
 * £67.5558 is £67.55, and £67.5568 is £67.56.
 */
export function niRound(amount: Pence, rate: Decimal): Pence {
  if (amount <= 0) return 0;
  // Tenths of a penny are the third decimal place of a pound.
  const tenths = (BigInt(amount) * rate.units * 10n) / (100n * 10n ** BigInt(rate.scale));
  const pence = tenths / 10n;
  return penceFromBigInt(tenths % 10n >= 6n ? pence + 1n : pence, 'National Insurance');
}

/** The employee's National Insurance on one payday's earnings. Category A unless another is given. */
export function employeeNationalInsurance(
  earnings: Pence,
  frequency: PayFrequency,
  category: string,
  year: TaxYear,
): Pence {
  const rates = year.nationalInsurance.employeeRates.get(category);
  if (rates === undefined) {
    throw new EngineInputError(
      'bad-ni-category',
      'That National Insurance category letter isn’t one for this tax year.',
    );
  }
  const { primaryThreshold, upperEarningsLimit } = year.nationalInsurance.thresholds[frequency];
  const main = Math.max(0, Math.min(earnings, upperEarningsLimit) - primaryThreshold);
  const above = Math.max(0, earnings - upperEarningsLimit);
  return niRound(main, rates.main) + niRound(above, rates.upper);
}
