// Take-home pay for one payday (brief 4.15, ARCHITECTURE.md 2.7): pay lines,
// pension, income tax on the cumulative basis or week 1/month 1, employee
// National Insurance, student loans and any other deductions.

import { type Day, parseDate, partsOfDay } from '../dates/day.ts';
import { EngineInputError } from '../errors.ts';
import { type Decimal, parseDecimal } from '../money/decimal.ts';
import {
  checkPence,
  checkPenceNotNegative,
  multiplyPence,
  multiplyToPence,
  type Pence,
  sumPence,
} from '../money/pence.ts';
import { payAdjustmentForOne, type TaxTable, taxForPeriod } from './income-tax.ts';
import { employeeNationalInsurance } from './national-insurance.ts';
import { checkStudentLoans, studentLoanDeduction } from './student-loans.ts';
import { parseTaxCode, type TaxCode } from './tax-code.ts';
import {
  PAY_FREQUENCIES,
  type PayFrequency,
  type TaxYear,
  type TaxYearFile,
  taxYearFor,
  taxYearsOf,
} from './tax-year.ts';
import {
  type EstimateReason,
  type FixedPay,
  PAY_LINE_KINDS,
  type PayLine,
  type PaySettings,
  type TakeHome,
  type TakeHomeInput,
  type WorkedPayLine,
  type YearSoFar,
} from './types.ts';

/** Where a payday sits in its tax year, and which tables it uses (CWG2 1.7 and 1.13). */
export interface PayPeriod {
  /** The tax week (1 to 53), the week number for pay every 2 or 4 weeks (2 to 54, 4 to 56), or the tax month. */
  readonly period: number;
  readonly table: TaxTable;
  /** How far apart paydays are in the tables: 1, 2 or 4 weeks, or 1 month. */
  readonly step: number;
  /** Week 53, 54 or 56: worked out on its own with the tables for week 1, 2 or 4 (CWG2 1.13). */
  readonly extra: boolean;
}

const STEP: Readonly<Record<PayFrequency, number>> = {
  weekly: 1,
  'two-weekly': 2,
  'four-weekly': 4,
  monthly: 1,
};

/**
 * The tax period of a payday. Weekly pay uses the tax week the payday is in,
 * and monthly pay the tax month (6th to 5th). Pay every 2 or 4 weeks uses
 * week 2 or 4 for the year's first payday, then 4 or 8 and so on (CWG2 1.7):
 * paydays 14 or 28 days apart make it the payday's place in the tax year.
 */
export function payPeriodOf(payday: Day, frequency: PayFrequency, year: TaxYear): PayPeriod {
  const days = payday - year.firstDay;
  switch (frequency) {
    case 'weekly': {
      const period = Math.floor(days / 7) + 1;
      return { period, table: 'week', step: 1, extra: period === 53 };
    }
    case 'two-weekly': {
      const period = 2 * (Math.floor(days / 14) + 1);
      return { period, table: 'week', step: 2, extra: period > 52 };
    }
    case 'four-weekly': {
      const period = 4 * (Math.floor(days / 28) + 1);
      return { period, table: 'week', step: 4, extra: period > 52 };
    }
    case 'monthly': {
      // Tax months run from the 6th to the 5th, starting on 6 April.
      const day = partsOfDay(payday);
      const first = partsOfDay(year.firstDay);
      const months = (day.year - first.year) * 12 + (day.month - 4) - (day.day < 6 ? 1 : 0);
      return { period: months + 1, table: 'month', step: 1, extra: false };
    }
  }
}

function bad(code: string, message: string): never {
  throw new EngineInputError(code, message);
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string') bad('bad-pay', `${what} must be text.`);
  return value;
}

/** Checks the settings of a job, and reads its tax code. */
export function checkSettings(settings: PaySettings): { code: TaxCode; weekOne: boolean } {
  if (settings === null || typeof settings !== 'object')
    bad('bad-pay', 'The pay needs its settings.');
  if (!(PAY_FREQUENCIES as readonly string[]).includes(settings.frequency)) {
    bad('bad-pay', 'How often pay comes must be weekly, every 2 weeks, every 4 weeks or monthly.');
  }
  if (settings.basis !== 'cumulative' && settings.basis !== 'week-one') {
    bad('bad-pay', 'The tax basis must be cumulative or week 1/month 1.');
  }
  const code = parseTaxCode(settings.taxCode);
  if (settings.niCategory !== undefined && !/^[A-Z]$/.test(settings.niCategory)) {
    bad('bad-ni-category', 'The National Insurance category is one capital letter, such as A.');
  }
  const pension = settings.pension;
  if (pension !== undefined) {
    const rate = parseDecimal(pension.percent, 'The pension percentage');
    if (rate.units < 0n || rate.units > 100n * 10n ** BigInt(rate.scale)) {
      bad('bad-pension', 'The pension percentage must be from 0 to 100.');
    }
    if (pension.when !== 'before-tax' && pension.when !== 'after-tax') {
      bad('bad-pension', 'The pension is taken before tax or after tax.');
    }
    const lower =
      pension.lower === undefined ? 0 : checkPenceNotNegative(pension.lower, 'The pension band');
    if (pension.upper !== undefined && checkPence(pension.upper, 'The pension band') < lower) {
      bad('bad-pension', 'The top of the pension band is below its bottom.');
    }
  }
  checkStudentLoans(settings.studentLoans ?? []);
  for (const one of settings.otherDeductions ?? []) {
    text(one?.name, 'A deduction’s name');
    // A deduction takes money off: below zero it would add to take-home pay.
    checkPenceNotNegative(one.amount, 'A deduction');
  }
  return { code, weekOne: settings.basis === 'week-one' || code.weekOne };
}

/** Hours × rate for each line, rounded once per line (D9). */
function workLines(lines: readonly PayLine[]): WorkedPayLine[] {
  if (!Array.isArray(lines)) bad('bad-pay', 'The pay lines must be a list.');
  return lines.map((line, i) => {
    const what = `Pay line ${i + 1}`;
    text(line?.name, `${what}: the name`);
    if (!(PAY_LINE_KINDS as readonly string[]).includes(line.kind)) {
      bad('bad-pay', `${what}: the kind must be basic, overtime, nights, weekends or holiday.`);
    }
    const hours = parseDecimal(line.hours, `${what}: the hours`);
    const rate = parseDecimal(line.rate, `${what}: the rate`);
    if (rate.units < 0n) bad('bad-pay', `${what}: the rate can't be below zero.`);
    return {
      name: line.name,
      kind: line.kind,
      hours: line.hours,
      rate: line.rate,
      amount: multiplyToPence(hours, rate),
    };
  });
}

/** A percentage as a factor: "4" is 0.04. */
function percentFactor(percent: string): Decimal {
  const rate = parseDecimal(percent, 'percentage');
  return { units: rate.units, scale: rate.scale + 2 };
}

/**
 * The pension on a payday: the percentage of the earnings inside the band,
 * rounded once to the nearest penny (D9). Week 26: 4% × (£553.19 − £120.00)
 * is £17.3276, so £17.33.
 */
export function pensionOn(gross: Pence, settings: PaySettings): Pence {
  const pension = settings.pension;
  if (pension === undefined) return 0;
  const top = pension.upper === undefined ? gross : Math.min(gross, pension.upper);
  const inBand = Math.max(0, top - (pension.lower ?? 0));
  return multiplyPence(inBand, percentFactor(pension.percent));
}

function checkSoFar(soFar: YearSoFar, frequency: PayFrequency): void {
  if (soFar === null || typeof soFar !== 'object')
    bad('bad-year-so-far', 'The year so far is missing.');
  text(soFar.taxYear, 'The year so far’s tax year');
  checkPence(soFar.grossForTax, 'Gross for tax so far');
  checkPence(soFar.taxPaid, 'Tax paid so far');
  const step = STEP[frequency];
  const last = frequency === 'monthly' ? 12 : 52 + step;
  if (
    !Number.isInteger(soFar.period) ||
    soFar.period < step ||
    soFar.period > last ||
    soFar.period % step !== 0
  ) {
    bad('bad-year-so-far', 'The year so far must be for a tax week or month of this pay.');
  }
}

/** The tax year before another: "2025-26" before "2026-27". */
function yearBefore(name: string): string {
  const start = Number(name.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/**
 * Works out take-home pay for one payday (brief 4.15).
 *
 * The year so far: with "Gross for tax so far" and "Tax paid so far" from
 * the payslip just before, cumulative tax is exact. Without them, or from an
 * earlier payslip, each pay period in between counts as paid this payday's
 * pay for tax (or `assumedPayBetween`), with the tax the cumulative basis
 * would have taken, and the result is an estimate (D124). Week 1/month 1
 * needs no year so far.
 */
export function workOutTakeHome(
  input: TakeHomeInput,
  files: readonly TaxYearFile[] | ReadonlyMap<string, TaxYear> = taxYearsOf(),
): TakeHome {
  const years = files instanceof Map ? files : taxYearsOf(files as readonly TaxYearFile[]);
  const { settings } = input;
  const { code, weekOne } = checkSettings(settings);
  const payday = parseDate(input.payDate, 'The payday');
  const year = taxYearFor(payday, years);
  const { period, table, step, extra } = payPeriodOf(payday, settings.frequency, year);

  const lines = workLines(input.lines);
  const fixed: FixedPay[] = (input.fixed ?? []).map((one, i) => {
    text(one?.name, `Fixed pay ${i + 1}: the name`);
    return { name: one.name, amount: checkPence(one.amount, `Fixed pay ${i + 1}`) };
  });
  const gross = sumPence([...lines.map((line) => line.amount), ...fixed.map((one) => one.amount)]);
  const pension = pensionOn(gross, settings);
  const payForTax = settings.pension?.when === 'before-tax' ? gross - pension : gross;

  // The year so far before this payday.
  let payBefore = 0;
  let taxBefore = 0;
  let reason: EstimateReason | null = null;
  let from = 0; // the last period the year so far covers
  if (input.soFar !== undefined) {
    checkSoFar(input.soFar, settings.frequency);
    if (input.soFar.taxYear === year.id) {
      if (input.soFar.period >= period) {
        bad('bad-year-so-far', 'The year so far must be from a payslip before this payday.');
      }
      payBefore = input.soFar.grossForTax;
      taxBefore = input.soFar.taxPaid;
      from = input.soFar.period;
    } else if (input.soFar.taxYear === yearBefore(year.id)) {
      reason = 'year-so-far-last-year';
    } else {
      bad('bad-year-so-far', 'The year so far is from another tax year.');
    }
  } else {
    reason = 'no-year-so-far';
  }

  const cumulative = !weekOne && !extra;
  let tax: Pence;
  let taxHeldBack = 0;
  if (cumulative) {
    // The pay periods between the year so far and this payday (D124).
    const assumed =
      input.assumedPayBetween === undefined
        ? payForTax
        : checkPence(input.assumedPayBetween, 'The pay assumed in between');
    for (let gap = from + step; gap < period; gap += step) {
      const between = taxForPeriod({
        code,
        year,
        table,
        period: gap,
        nonCumulative: false,
        pay: assumed,
        payToDateBefore: payBefore,
        taxToDateBefore: taxBefore,
      });
      payBefore = between.payToDate;
      taxBefore = between.taxToDate;
      reason ??= 'year-so-far-earlier';
    }
    const result = taxForPeriod({
      code,
      year,
      table,
      period,
      nonCumulative: false,
      pay: payForTax,
      payToDateBefore: payBefore,
      taxToDateBefore: taxBefore,
    });
    tax = result.tax;
    taxHeldBack = result.beforeLimit === null ? 0 : result.beforeLimit - result.tax;
  } else {
    // Week 1/month 1, and week 53, 54 or 56, use the first period's tables on their own.
    const result = taxForPeriod({
      code,
      year,
      table,
      period: step,
      nonCumulative: true,
      pay: payForTax,
      payToDateBefore: 0,
      taxToDateBefore: 0,
    });
    tax = result.tax;
    taxHeldBack = result.beforeLimit === null ? 0 : result.beforeLimit - result.tax;
    if (extra && !weekOne && code.kind === 'suffix') {
      // CWG2 1.13.1: no tax if the free pay to week 52 covers the year's pay.
      const freePayToWeek52 = payAdjustmentForOne(code.number, 'week') * 52;
      if (input.soFar?.taxYear === year.id && input.soFar.period === 52) {
        if (freePayToWeek52 >= input.soFar.grossForTax + payForTax) {
          tax = 0;
          taxHeldBack = 0;
        }
      } else {
        reason ??= 'no-year-so-far';
      }
    }
    // Week 1/month 1 needs no year so far: the tax is exact either way.
    if (weekOne) reason = null;
  }

  const niEarnings = gross;
  const nationalInsurance = employeeNationalInsurance(
    niEarnings,
    settings.frequency,
    settings.niCategory ?? 'A',
    year,
  );
  let studentLoan = 0;
  let postgraduateLoan = 0;
  for (const plan of settings.studentLoans ?? []) {
    const deduction = studentLoanDeduction(plan, niEarnings, settings.frequency, year);
    if (plan === 'postgraduate') postgraduateLoan = deduction;
    else studentLoan = deduction;
  }
  const otherDeductions = (settings.otherDeductions ?? []).map((one) => ({
    name: one.name,
    amount: one.amount,
  }));
  const takeHome = checkPence(
    gross -
      pension -
      tax -
      nationalInsurance -
      studentLoan -
      postgraduateLoan -
      sumPence(otherDeductions.map((one) => one.amount)),
    'Take-home pay',
  );
  return {
    taxYear: year.id,
    frequency: settings.frequency,
    period,
    lines,
    fixed,
    gross,
    pension,
    payForTax,
    tax,
    nationalInsurance,
    studentLoan,
    postgraduateLoan,
    otherDeductions,
    takeHome,
    grossForTaxSoFar: payBefore + payForTax,
    taxPaidSoFar: taxBefore + tax,
    taxHeldBack,
    isEstimate: reason !== null,
    estimateReason: reason,
  };
}
