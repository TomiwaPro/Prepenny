import { EngineInputError } from '../errors.ts';
import { type Decimal, divideRounded, parseDecimal, powerOfTen } from './decimal.ts';
import { checkPence, type Pence, penceFromBigInt } from './pence.ts';

/**
 * Money in another currency, in that currency's smallest unit: €1,400.57 is
 * 140057 cents. These functions are for currencies with 2 decimal places,
 * like the euro.
 */
export type MinorUnits = number;

function checkRate(rate: Decimal | string): Decimal {
  const parsed = typeof rate === 'string' ? parseDecimal(rate, 'rate') : rate;
  if (parsed.units <= 0n) {
    throw new EngineInputError('bad-rate', 'A currency rate must be above zero.');
  }
  return parsed;
}

/**
 * Pence into the other currency, where `rate` is units of that currency per
 * £1, as the person typed it (brief 4.6). Rounded once, to the nearest cent,
 * halves away from zero (D9). Call it once for each payment, never on a total.
 *
 * £125.00 at "1.1612" is €145.15. £206.15 at "1.1612" is €239.38138, so €239.38.
 */
export function toOtherCurrency(pence: Pence, rate: Decimal | string): MinorUnits {
  const r = checkRate(rate);
  const exact = BigInt(checkPence(pence, 'amount')) * r.units;
  return penceFromBigInt(divideRounded(exact, powerOfTen(r.scale)), 'converted amount');
}

/**
 * Minor units of the other currency into pence, at units of that currency per
 * £1. Rounded once (D9). €1,400.57 at "1.1612" is £1,206.14.
 */
export function fromOtherCurrency(minor: MinorUnits, rate: Decimal | string): Pence {
  const r = checkRate(rate);
  const exact = BigInt(checkPence(minor, 'amount')) * powerOfTen(r.scale);
  return penceFromBigInt(divideRounded(exact, r.units), 'converted amount');
}
