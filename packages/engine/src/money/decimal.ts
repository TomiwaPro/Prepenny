import { EngineInputError } from '../errors.ts';

/**
 * An exact decimal number: `units / 10^scale`. "1.1612" is 11612 / 10^4.
 * Rates, percentages and hours are typed and stored as text like this, never
 * as floating point (ARCHITECTURE.md, "For future sessions: the engine").
 */
export interface Decimal {
  readonly units: bigint;
  readonly scale: number;
}

const DECIMAL_TEXT = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

/** Reads an exact decimal written as text, such as "34.5", "1.1612" or "-2". */
export function parseDecimal(text: string, field = 'value'): Decimal {
  const match = typeof text === 'string' ? DECIMAL_TEXT.exec(text) : null;
  if (match === null) {
    throw new EngineInputError(
      'not-a-decimal',
      `${field} must be a number written as text, for example "34.5".`,
    );
  }
  const [, sign = '', whole = '0', fraction = ''] = match;
  const units = BigInt(`${whole}${fraction}`);
  return { units: sign === '-' ? -units : units, scale: fraction.length };
}

/** The exact product of two decimals, with no rounding. */
export function multiplyDecimals(a: Decimal, b: Decimal): Decimal {
  return { units: a.units * b.units, scale: a.scale + b.scale };
}

/** 10 to the power of `scale`, as a whole number. */
export function powerOfTen(scale: number): bigint {
  return 10n ** BigInt(scale);
}

/**
 * `numerator / denominator` rounded to the nearest whole number, with halves
 * going away from zero (D9): 2.5 gives 3 and −2.5 gives −3.
 */
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new EngineInputError('bad-divisor', 'Can only divide by a number above zero.');
  }
  const quotient = numerator / denominator; // BigInt division truncates towards zero
  const remainder = numerator - quotient * denominator;
  const twiceRemainder = remainder < 0n ? -2n * remainder : 2n * remainder;
  if (twiceRemainder >= denominator) {
    return numerator < 0n ? quotient - 1n : quotient + 1n;
  }
  return quotient;
}

/** A decimal rounded to the nearest whole number, halves away from zero (D9). */
export function roundDecimal(value: Decimal): bigint {
  return divideRounded(value.units, powerOfTen(value.scale));
}
