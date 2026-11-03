// Income tax by HMRC's Specification for PAYE tax table routines, version
// 24.0 (D121). Section numbers below are the specification's. Amounts are
// whole pence, with exact whole-number maths: "to 4 decimal places of a
// pound" is kept as units of £0.0001.

import { EngineInputError } from '../errors.ts';
import type { Decimal } from '../money/decimal.ts';
import { type Pence, penceFromBigInt } from '../money/pence.ts';
import type { TaxCode } from './tax-code.ts';
import type { TaxBand, TaxYear } from './tax-year.ts';

/** Weekly tables count 52 weeks to the year, monthly ones 12 months (section 1.5). */
export type TaxTable = 'week' | 'month';

/** £0.0001: the specification works "to 4 decimal places of a pound". */
const UNITS_PER_POUND = 10_000n;
const UNITS_PER_PENNY = 100n;

function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n ? q - 1n : q;
}

function ceilDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a > 0n ? q + 1n : q;
}

function periodsInYear(table: TaxTable): bigint {
  return table === 'week' ? 52n : 12n;
}

/** An amount of pounds × a percentage, in units of £0.0001, without correcting the last place. */
function percentOfUnits(units: bigint, rate: Decimal): bigint {
  return floorDiv(units * rate.units, 100n * 10n ** BigInt(rate.scale));
}

/**
 * Free pay (for a suffix code) or additional pay (for a K code) for week 1
 * or month 1, in pence (section 4.3.1). The code number is split into 500s
 * and a remainder from 1 to 500. The remainder is worth (remainder × £10 +
 * £9) a year, and each 500 is worth £5,000 a year; each is divided by 52 or
 * 12, taken to 4 decimal places of a pound and rounded up to the penny, then
 * added. Code 1257 a week is £49.60 + 2 × £96.16 = £241.92.
 */
export function payAdjustmentForOne(codeNumber: number, table: TaxTable): Pence {
  if (codeNumber === 0) return 0;
  const periods = periodsInYear(table);
  const code = BigInt(codeNumber);
  // The programmers' note in 4.3.1c: take 1 off, divide by 500, add 1 back to the remainder.
  const quotient = (code - 1n) / 500n;
  const remainder = ((code - 1n) % 500n) + 1n;
  const roundedUp = (annualPounds: bigint) =>
    ceilDiv(floorDiv(annualPounds * UNITS_PER_POUND, periods), UNITS_PER_PENNY);
  return penceFromBigInt(roundedUp(remainder * 10n + 9n) + quotient * roundedUp(5000n));
}

/** The tables' figures for period n of a regime (section 3.3.4). */
interface Thresholds {
  /** c: each threshold, cumulative bandwidth × n ÷ 52, in units of £0.0001. */
  readonly c: readonly bigint[];
  /** v: each threshold rounded up to the next whole pound. */
  readonly v: readonly bigint[];
  /** k: the tax on all the bands below each threshold × n ÷ 52, in units of £0.0001. */
  readonly k: readonly bigint[];
}

function thresholdsFor(bands: readonly TaxBand[], n: number, table: TaxTable): Thresholds {
  const periods = periodsInYear(table);
  const c: bigint[] = [];
  const v: bigint[] = [];
  const k: bigint[] = [];
  let cumulativeWidth = 0n;
  let cumulativeTax = 0n;
  for (const band of bands) {
    if (band.width === null) break;
    cumulativeWidth += band.width;
    cumulativeTax += percentOfUnits(band.width * UNITS_PER_POUND, band.rate);
    const threshold = floorDiv(cumulativeWidth * UNITS_PER_POUND * BigInt(n), periods);
    c.push(threshold);
    v.push(ceilDiv(threshold, UNITS_PER_POUND));
    k.push(floorDiv(cumulativeTax * BigInt(n), periods));
  }
  return { c, v, k };
}

/**
 * Tax due to date on taxable pay to date Un, through the regime's bands
 * (sections 4.4.3 and 4.4.4): the income tests find the top rate, Un is
 * rounded down to whole pounds, and the tax formula's result is rounded down
 * to the penny.
 */
function bandedTax(taxablePence: bigint, bands: readonly TaxBand[], n: number, table: TaxTable) {
  if (taxablePence <= 0n) return 0n;
  const { c, v, k } = thresholdsFor(bands, n, table);
  // Income tests: the first threshold, in round pounds, that Un doesn't pass.
  let formula = bands.length; // the top rate, if Un passes every threshold
  for (let i = 0; i < v.length; i += 1) {
    if (taxablePence <= (v[i] as bigint) * 100n) {
      formula = i + 1;
      break;
    }
  }
  const wholePounds = floorDiv(taxablePence, 100n);
  const below = formula - 2; // the threshold under this rate's band, if there is one
  const kBelow = below >= 0 ? (k[below] as bigint) : 0n;
  const cBelow = below >= 0 ? (c[below] as bigint) : 0n;
  const rate = (bands[formula - 1] as TaxBand).rate;
  const units = kBelow + percentOfUnits(wholePounds * UNITS_PER_POUND - cBelow, rate);
  return floorDiv(units, UNITS_PER_PENNY);
}

/** All of the rounded-down pay to date at one rate: codes BR and D (sections 5, 6, 9 and 10). */
function flatTax(payPence: bigint, rate: Decimal): bigint {
  if (payPence <= 0n) return 0n;
  const wholePounds = floorDiv(payPence, 100n);
  return floorDiv(percentOfUnits(wholePounds * UNITS_PER_POUND, rate), UNITS_PER_PENNY);
}

/** One payday's tax, and the year to date after it. */
export interface TaxForPeriod {
  /** Tax taken this payday. Below zero is a refund. */
  readonly tax: Pence;
  /** Pay for tax to date, this payday's included (Pn). */
  readonly payToDate: Pence;
  /** Tax to date after this payday, as taken (Ln, after the regulatory limit). */
  readonly taxToDate: Pence;
  /** The tax this payday would have taken without the regulatory limit, when the limit cut it. */
  readonly beforeLimit: Pence | null;
}

export interface TaxForPeriodInput {
  readonly code: TaxCode;
  readonly year: TaxYear;
  readonly table: TaxTable;
  /** The week or month number of the tables to use: the tax week, or 2, 4… for pay every 2 or 4 weeks. */
  readonly period: number;
  /** Each payday on its own (week 1/month 1 basis), not adding up the year (section 8). */
  readonly nonCumulative: boolean;
  /** This payday's pay for tax (pn): gross pay less any pension taken before tax. */
  readonly pay: Pence;
  /** Pay for tax to date before this payday, P(n − 1). Ignored for week 1/month 1. */
  readonly payToDateBefore: Pence;
  /** Tax to date before this payday, L(n − 1). Ignored for week 1/month 1. */
  readonly taxToDateBefore: Pence;
}

/**
 * Works out one payday's tax (sections 4 to 11). Cumulative codes work out
 * tax due to date and take off the tax to date already paid. The overriding
 * regulatory limit (4.5.2) stops any one payday taking more than half its pay,
 * and on the cumulative basis the tax it stops is taken later where it can be.
 */
export function taxForPeriod(input: TaxForPeriodInput): TaxForPeriod {
  const { code, year, table, nonCumulative } = input;
  const n = input.period;
  if (!Number.isInteger(n) || n < 1 || n > (table === 'week' ? 52 : 12)) {
    throw new EngineInputError('bad-period', 'The tax period is outside the tax year.');
  }
  const pay = BigInt(input.pay);
  const before = nonCumulative ? 0n : BigInt(input.payToDateBefore);
  const taxBefore = nonCumulative ? 0n : BigInt(input.taxToDateBefore);
  const payToDate = before + pay;
  // NT has no Scottish or Welsh version, and takes no tax whatever the bands.
  const regime =
    year.regimes[code.kind === 'no-tax' ? 'england-and-northern-ireland' : code.regime];
  const bands = regime.bands;
  const rateAt = (position: number): Decimal => {
    const band = bands[position - 1];
    if (band === undefined) {
      throw new EngineInputError(
        'bad-tax-code',
        'That D code goes above the top rate of tax for this tax year.',
      );
    }
    return band.rate;
  };

  let due: bigint;
  switch (code.kind) {
    case 'suffix': {
      const freePay = BigInt(payAdjustmentForOne(code.number, table)) * BigInt(n);
      due = bandedTax(payToDate - freePay, bands, n, table);
      break;
    }
    case 'k': {
      const additionalPay = BigInt(payAdjustmentForOne(code.number, table)) * BigInt(n);
      due = bandedTax(payToDate + additionalPay, bands, n, table);
      break;
    }
    case 'basic-rate':
      due = flatTax(payToDate, rateAt(regime.basicRate));
      break;
    case 'd':
      due = flatTax(payToDate, rateAt(regime.basicRate + code.above));
      break;
    case 'no-tax':
      due = 0n;
      break;
  }
  let tax = due - taxBefore;
  let beforeLimit: bigint | null = null;
  if (tax > 0n) {
    // The overriding regulatory limit, on positive pay only (4.5.2 and 4.5.4).
    const limit = pay > 0n ? flatTax100(pay, year.maxRate) : 0n;
    if (tax > limit) {
      beforeLimit = tax;
      tax = limit;
    }
  }
  return {
    tax: penceFromBigInt(tax, 'Tax'),
    payToDate: penceFromBigInt(payToDate, 'Pay to date'),
    taxToDate: penceFromBigInt(taxBefore + tax, 'Tax to date'),
    beforeLimit: beforeLimit === null ? null : penceFromBigInt(beforeLimit, 'Tax'),
  };
}

/** A percentage of pay in pence, to 4 decimal places of a pound, rounded down to the penny (4.5.2). */
function flatTax100(payPence: bigint, rate: Decimal): bigint {
  return floorDiv(percentOfUnits(payPence * UNITS_PER_PENNY, rate), UNITS_PER_PENNY);
}
