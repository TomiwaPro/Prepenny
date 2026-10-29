import { EngineInputError } from '../errors.ts';
import { type Decimal, multiplyDecimals, parseDecimal, roundDecimal } from './decimal.ts';

/**
 * Money in whole pence: £4.53 is 453 (brief 5.1). Never a fraction and never
 * floating point. Every amount that enters the engine is checked with
 * `Number.isSafeInteger`.
 */
export type Pence = number;

/** True when the value is a whole number of pence the engine can work with. */
export function isPence(value: unknown): value is Pence {
  return Number.isSafeInteger(value);
}

/** Checks a value is whole pence, and returns it. */
export function checkPence(value: unknown, field: string): Pence {
  if (!isPence(value)) {
    throw new EngineInputError('not-pence', `${field} must be a whole number of pence.`);
  }
  return value;
}

/** Checks a value is whole pence and not below zero, and returns it. */
export function checkPenceNotNegative(value: unknown, field: string): Pence {
  const pence = checkPence(value, field);
  if (pence < 0) {
    throw new EngineInputError('negative-pence', `${field} can't be below zero.`);
  }
  return pence;
}

/** Turns a whole number from exact maths back into pence, checking it fits. */
export function penceFromBigInt(value: bigint, field = 'result'): Pence {
  const pence = Number(value);
  if (!Number.isSafeInteger(pence)) {
    throw new EngineInputError('too-large', `${field} is too large to work with.`);
  }
  return pence;
}

/** Adds amounts of pence, checking the total still fits. */
export function sumPence(amounts: Iterable<Pence>): Pence {
  let total = 0;
  for (const amount of amounts) {
    total += amount;
  }
  return checkPence(total, 'total');
}

/**
 * Reads pounds written as text into pence: "603.06" is 60306, "-30" is −3000.
 * At most 2 decimal places. A machine format for data and tests; screens use
 * the app's own formatter.
 */
export function parsePounds(text: string, field = 'amount'): Pence {
  const decimal = parseDecimal(text, field);
  if (decimal.scale > 2) {
    throw new EngineInputError('too-many-decimals', `${field} can have at most 2 decimal places.`);
  }
  return penceFromBigInt(decimal.units * 10n ** BigInt(2 - decimal.scale), field);
}

/**
 * Writes pence as pounds text: 60306 is "603.06", −3000 is "-30.00". A machine
 * format for data and tests; screens use a proper minus sign and £ (VOICE.md).
 */
export function formatPounds(pence: Pence): string {
  checkPence(pence, 'amount');
  const sign = pence < 0 ? '-' : '';
  const absolute = Math.abs(pence);
  const pennies = absolute % 100;
  const pounds = (absolute - pennies) / 100; // exact: a whole number divisible by 100
  return `${sign}${pounds}.${pennies.toString().padStart(2, '0')}`;
}

/** An exact number of pounds, such as 438.495, rounded once to pence (D9). */
export function poundsToPence(pounds: Decimal): Pence {
  return penceFromBigInt(roundDecimal({ units: pounds.units * 100n, scale: pounds.scale }));
}

/**
 * Pence times an exact decimal, rounded once to the nearest penny with halves
 * away from zero (D9). For example 43319 × "0.04" is 1732.76, which is 1733.
 */
export function multiplyPence(amount: Pence, factor: Decimal | string): Pence {
  const exact = multiplyDecimals(
    { units: BigInt(checkPence(amount, 'amount')), scale: 0 },
    typeof factor === 'string' ? parseDecimal(factor, 'factor') : factor,
  );
  return penceFromBigInt(roundDecimal(exact));
}

/**
 * Two exact decimals multiplied, as pounds, then rounded once to pence (D9).
 * Hours × rate on a pay line: "34.5" × "12.71" is £438.495, which is 43850.
 */
export function multiplyToPence(quantity: Decimal | string, poundsEach: Decimal | string): Pence {
  const a = typeof quantity === 'string' ? parseDecimal(quantity, 'quantity') : quantity;
  const b = typeof poundsEach === 'string' ? parseDecimal(poundsEach, 'rate') : poundsEach;
  return poundsToPence(multiplyDecimals(a, b));
}
