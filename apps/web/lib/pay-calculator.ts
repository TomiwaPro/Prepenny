// The take-home pay calculator (brief 4.15, D120 to D128): its boxes as the
// person types them, read into the engine's take-home pay input, worked out
// by the engine, and "Check my payslip" (D140). It runs on the phone itself,
// with no background worker and nothing sent anywhere, so the public page
// works with nothing saved and no network (step 2g). Words come from the
// strings file; this file only reads boxes and says which one is wrong.

import {
  checkPayslip,
  type EditCommand,
  EngineInputError,
  type EstimateReason,
  type FixedPay,
  type OtherDeduction,
  type PayFrequency,
  type PayLine,
  type PayLineKind,
  type PayProfile,
  type PaySettings,
  type PayslipDifference,
  type PayWeek,
  type Pence,
  type Pension,
  parseDate,
  parseTaxCode,
  payPeriodOf,
  type StudentLoanPlan,
  type TakeHome,
  type TakeHomeInput,
  taxYearFor,
  taxYearsOf,
  workOutTakeHome,
  type YearSoFar,
} from '@prepenny/engine';
import { amountForTyping, parseAmount } from './amount.ts';

export type LoanPlan = 'none' | Exclude<StudentLoanPlan, 'postgraduate'>;

export interface PayLineForm {
  readonly key: string;
  readonly kind: PayLineKind;
  readonly hours: string;
  readonly rate: string;
}

/** A fixed amount, such as a shift premium, or a deduction, such as union fees. */
export interface NamedAmountForm {
  readonly key: string;
  readonly name: string;
  readonly amount: string;
}

export interface CalculatorForm {
  readonly lines: readonly PayLineForm[];
  readonly extras: readonly NamedAmountForm[];
  /** The payday, "YYYY-MM-DD": it sets the tax year and the tax week or month. */
  readonly payDate: string;
  readonly frequency: PayFrequency;
  readonly taxCode: string;
  readonly basis: 'cumulative' | 'week-one';
  readonly pension: boolean;
  readonly pensionPercent: string;
  /** The band of earnings it's worked on for each pay period, which can be left empty. */
  readonly pensionLower: string;
  readonly pensionUpper: string;
  readonly pensionWhen: Pension['when'];
  readonly studentLoan: LoanPlan;
  readonly postgraduate: boolean;
  readonly deductions: readonly NamedAmountForm[];
  /** "From your last payslip": its tax week or month, and its figures, which can be left empty. */
  readonly soFarPeriod: string;
  readonly grossSoFar: string;
  readonly taxSoFar: string;
}

export type CalculatorField =
  | 'payDate'
  | 'taxCode'
  | 'pensionPercent'
  | 'pensionLower'
  | 'pensionUpper'
  | 'soFarPeriod'
  | 'grossSoFar'
  | 'taxSoFar'
  | 'lines'
  | `hours-${string}`
  | `rate-${string}`
  | `extra-${string}`
  | `extraName-${string}`
  | `deduction-${string}`
  | `deductionName-${string}`;

export type CalculatorMistake =
  | 'dateError'
  | 'noTaxYear'
  | 'taxCodeError'
  | 'percentError'
  | 'amountError'
  | 'bandError'
  | 'periodError'
  | 'periodAfter'
  | 'soFarBoth'
  | 'linesError'
  | 'hoursError'
  | 'rateError'
  | 'nameError';

export type CalculatorErrors = Partial<Record<CalculatorField, CalculatorMistake>>;

const HOURS = /^\d{1,3}(?:\.\d{1,2})?$/;
const RATE = /^\d{1,4}(?:\.\d{1,4})?$/;
const PERCENT = /^\d{1,3}(?:\.\d{1,2})?$/;
const PERIOD = /^\d{1,2}$/;

/** The most pay lines, extras and deductions the calculator takes. */
export const MOST_LINES = 8;

/** The pay period a payday is in: the tax week (or month) and how far apart paydays are in the tables. */
export interface PeriodOf {
  readonly taxYear: string;
  readonly period: number;
  readonly step: number;
  /** "week" or "month", for the words. */
  readonly table: 'week' | 'month';
}

/** The tax week or month of a payday, or null when there's no tax year file for it (D128). */
export function periodOf(payDate: string, frequency: PayFrequency): PeriodOf | null {
  try {
    const day = parseDate(payDate, 'The payday');
    const year = taxYearFor(day, taxYearsOf());
    const { period, step, table } = payPeriodOf(day, frequency, year);
    return { taxYear: year.id, period, step, table };
  } catch {
    return null;
  }
}

/** The tax week or month of the payslip just before a payday: the one it starts on (D124). */
export function periodBefore(payDate: string, frequency: PayFrequency): string {
  const found = periodOf(payDate, frequency);
  if (found === null || found.period - found.step < 1) return '';
  return String(found.period - found.step);
}

const optional = (text: string): Pence | null | 'bad' =>
  text.trim() === '' ? null : (parseAmount(text) ?? 'bad');

/** Whatever the boxes say, read into the engine's input, or the boxes that need a change. */
export function readCalculator(
  form: CalculatorForm,
  lineName: (kind: PayLineKind) => string,
):
  | { readonly ok: true; readonly input: TakeHomeInput }
  | { readonly ok: false; readonly errors: CalculatorErrors } {
  const errors: CalculatorErrors = {};
  const found = form.payDate === '' ? null : periodOf(form.payDate, form.frequency);
  if (form.payDate === '') errors.payDate = 'dateError';
  else if (found === null) errors.payDate = 'noTaxYear';
  try {
    parseTaxCode(form.taxCode);
  } catch {
    errors.taxCode = 'taxCodeError';
  }

  const lines: PayLine[] = [];
  for (const line of form.lines) {
    const hours = line.hours.trim();
    const rate = line.rate.trim().replace(/^£\s*/, '');
    if (hours === '' && rate === '') continue;
    if (!HOURS.test(hours)) errors[`hours-${line.key}`] = 'hoursError';
    if (!RATE.test(rate)) errors[`rate-${line.key}`] = 'rateError';
    lines.push({ name: lineName(line.kind), kind: line.kind, hours, rate });
  }
  const fixed: FixedPay[] = [];
  for (const extra of form.extras) {
    const amount = optional(extra.amount);
    if (amount === null && extra.name.trim() === '') continue;
    if (amount === null || amount === 'bad') errors[`extra-${extra.key}`] = 'amountError';
    if (extra.name.trim() === '') errors[`extraName-${extra.key}`] = 'nameError';
    if (typeof amount === 'number') fixed.push({ name: extra.name.trim(), amount });
  }
  if (lines.length === 0 && fixed.length === 0) errors.lines = 'linesError';

  let pension: Pension | undefined;
  if (form.pension) {
    const percent = form.pensionPercent.trim().replace(/%$/, '');
    if (!PERCENT.test(percent) || Number(percent) > 100) errors.pensionPercent = 'percentError';
    const lower = optional(form.pensionLower);
    const upper = optional(form.pensionUpper);
    if (lower === 'bad') errors.pensionLower = 'amountError';
    if (upper === 'bad') errors.pensionUpper = 'amountError';
    if (typeof lower === 'number' && typeof upper === 'number' && upper < lower) {
      errors.pensionUpper = 'bandError';
    }
    pension = {
      percent,
      ...(typeof lower === 'number' ? { lower } : {}),
      ...(typeof upper === 'number' ? { upper } : {}),
      when: form.pensionWhen,
    };
  }

  const deductions: OtherDeduction[] = [];
  for (const one of form.deductions) {
    const amount = optional(one.amount);
    if (amount === null && one.name.trim() === '') continue;
    if (amount === null || amount === 'bad') errors[`deduction-${one.key}`] = 'amountError';
    if (one.name.trim() === '') errors[`deductionName-${one.key}`] = 'nameError';
    if (typeof amount === 'number') deductions.push({ name: one.name.trim(), amount });
  }

  // From the last payslip: both figures, or neither (brief 4.15).
  let soFar: YearSoFar | undefined;
  const gross = optional(form.grossSoFar);
  const tax = optional(form.taxSoFar);
  if (gross === 'bad') errors.grossSoFar = 'amountError';
  if (tax === 'bad') errors.taxSoFar = 'amountError';
  if ((gross === null) !== (tax === null)) {
    if (gross === null) errors.grossSoFar = 'soFarBoth';
    else errors.taxSoFar = 'soFarBoth';
  }
  if (typeof gross === 'number' && typeof tax === 'number' && found !== null) {
    const period = form.soFarPeriod.trim();
    if (!PERIOD.test(period) || Number(period) < 1) errors.soFarPeriod = 'periodError';
    else if (Number(period) >= found.period) errors.soFarPeriod = 'periodAfter';
    else
      soFar = { taxYear: found.taxYear, period: Number(period), grossForTax: gross, taxPaid: tax };
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const studentLoans: StudentLoanPlan[] = [
    ...(form.studentLoan === 'none' ? [] : [form.studentLoan]),
    ...(form.postgraduate ? (['postgraduate'] as const) : []),
  ];
  const settings: PaySettings = {
    frequency: form.frequency,
    taxCode: form.taxCode.trim(),
    basis: form.basis,
    ...(pension === undefined ? {} : { pension }),
    ...(studentLoans.length === 0 ? {} : { studentLoans }),
    ...(deductions.length === 0 ? {} : { otherDeductions: deductions }),
  };
  return {
    ok: true,
    input: {
      settings,
      lines,
      ...(fixed.length === 0 ? {} : { fixed }),
      payDate: form.payDate,
      ...(soFar === undefined ? {} : { soFar }),
    },
  };
}

export type Worked =
  | { readonly ok: true; readonly input: TakeHomeInput; readonly result: TakeHome }
  | { readonly ok: false; readonly errors: CalculatorErrors }
  | { readonly ok: false; readonly refused: string };

/** Take-home pay from the boxes, worked out by the engine on this phone. */
export function workOutCalculator(
  form: CalculatorForm,
  lineName: (kind: PayLineKind) => string,
): Worked {
  const read = readCalculator(form, lineName);
  if (!read.ok) return read;
  try {
    return { ok: true, input: read.input, result: workOutTakeHome(read.input) };
  } catch (error) {
    return { ok: false, refused: error instanceof EngineInputError ? error.code : 'unexpected' };
  }
}

/** "Check my payslip": the figures from a payslip, each of which can be left empty. */
export interface PayslipForm {
  readonly gross: string;
  readonly pension: string;
  readonly tax: string;
  readonly nationalInsurance: string;
  readonly studentLoan: string;
  readonly postgraduateLoan: string;
  readonly takeHome: string;
  readonly grossForTaxSoFar: string;
  readonly taxPaidSoFar: string;
}

export type PayslipBox = keyof PayslipForm;

export const PAYSLIP_BOXES: readonly PayslipBox[] = [
  'gross',
  'pension',
  'tax',
  'nationalInsurance',
  'studentLoan',
  'postgraduateLoan',
  'takeHome',
  'grossForTaxSoFar',
  'taxPaidSoFar',
];

export const blankPayslip: PayslipForm = {
  gross: '',
  pension: '',
  tax: '',
  nationalInsurance: '',
  studentLoan: '',
  postgraduateLoan: '',
  takeHome: '',
  grossForTaxSoFar: '',
  taxPaidSoFar: '',
};

export type PayslipChecked =
  | { readonly ok: true; readonly differences: readonly PayslipDifference[] }
  | { readonly ok: false; readonly boxes: readonly PayslipBox[] }
  | { readonly ok: false; readonly none: true };

/**
 * Each payslip figure typed in beside what the calculator expected. National
 * Insurance and take-home pay 1p away aren't listed (D140). It never says
 * which is right: the words ask the person to ask their payroll team.
 */
export function checkPayslipForm(input: TakeHomeInput, form: PayslipForm): PayslipChecked {
  const payslip: Record<string, Pence> = {};
  const bad: PayslipBox[] = [];
  for (const box of PAYSLIP_BOXES) {
    const amount = optional(form[box]);
    if (amount === 'bad') bad.push(box);
    else if (amount !== null) payslip[box] = amount;
  }
  if (bad.length > 0) return { ok: false, boxes: bad };
  if (Object.keys(payslip).length === 0) return { ok: false, none: true };
  return { ok: true, differences: checkPayslip(input, payslip).differences };
}

export type { EstimateReason };

// In the app: starting from the plan's own pay, and saving to it.

/** A saved pay week, as the calculator can start from it. */
export interface SavedWeek {
  readonly id: string;
  readonly name: string;
  readonly lines: readonly PayLine[];
  readonly fixed: readonly FixedPay[];
}

let nextKey = 0;
/** A key for a new row of boxes, unique while the page is open. */
export function rowKey(): string {
  nextKey += 1;
  return `row-${nextKey}`;
}

export function blankLine(): PayLineForm {
  return { key: rowKey(), kind: 'basic', hours: '', rate: '' };
}

export function blankAmount(name = ''): NamedAmountForm {
  return { key: rowKey(), name, amount: '' };
}

/** The calculator's boxes before anything is typed: 1257L on the cumulative basis, paid weekly. */
export function blankCalculator(payDate: string): CalculatorForm {
  return {
    lines: [blankLine()],
    extras: [],
    payDate,
    frequency: 'weekly',
    taxCode: '1257L',
    basis: 'cumulative',
    pension: false,
    pensionPercent: '',
    pensionLower: '',
    pensionUpper: '',
    pensionWhen: 'before-tax',
    studentLoan: 'none',
    postgraduate: false,
    deductions: [],
    soFarPeriod: periodBefore(payDate, 'weekly'),
    grossSoFar: '',
    taxSoFar: '',
  };
}

/** A saved week's lines and extras in the boxes. */
export function linesFromWeek(week: {
  readonly lines: readonly PayLine[];
  readonly fixed?: readonly FixedPay[];
}): Pick<CalculatorForm, 'lines' | 'extras'> {
  return {
    lines:
      week.lines.length === 0
        ? [blankLine()]
        : week.lines.map((line) => ({
            key: rowKey(),
            kind: line.kind,
            hours: line.hours,
            rate: line.rate,
          })),
    extras: (week.fixed ?? []).map((one) => ({
      key: rowKey(),
      name: one.name,
      amount: amountForTyping(one.amount),
    })),
  };
}

/**
 * The boxes filled in from the plan's pay (step 2g): the main pay's tax
 * settings, the payday's own saved week, and the last payslip's year so far
 * when it's from the same tax year as the payday.
 */
export function calculatorFromPlan(
  payDate: string,
  profile: PayProfile | null,
  week: SavedWeek | null,
): CalculatorForm {
  const blank = blankCalculator(payDate);
  if (profile === null) return week === null ? blank : { ...blank, ...linesFromWeek(week) };
  const frequency = profile.frequency;
  const loans = profile.studentLoans ?? [];
  const plan = loans.find(
    (one): one is Exclude<StudentLoanPlan, 'postgraduate'> => one !== 'postgraduate',
  );
  const found = periodOf(payDate, frequency);
  const soFar =
    profile.soFar !== undefined &&
    found !== null &&
    profile.soFar.taxYear === found.taxYear &&
    profile.soFar.period < found.period
      ? profile.soFar
      : null;
  return {
    ...blank,
    ...(week === null ? {} : linesFromWeek(week)),
    frequency,
    taxCode: profile.taxCode,
    basis: profile.basis,
    pension: profile.pension !== undefined,
    pensionPercent: profile.pension?.percent ?? '',
    pensionLower:
      profile.pension?.lower === undefined ? '' : amountForTyping(profile.pension.lower),
    pensionUpper:
      profile.pension?.upper === undefined ? '' : amountForTyping(profile.pension.upper),
    pensionWhen: profile.pension?.when ?? 'before-tax',
    studentLoan: plan ?? 'none',
    postgraduate: loans.includes('postgraduate'),
    deductions: (profile.otherDeductions ?? []).map((one) => ({
      key: rowKey(),
      name: one.name,
      amount: amountForTyping(one.amount),
    })),
    soFarPeriod: soFar === null ? periodBefore(payDate, frequency) : String(soFar.period),
    grossSoFar: soFar === null ? '' : amountForTyping(soFar.grossForTax),
    taxSoFar: soFar === null ? '' : amountForTyping(soFar.taxPaid),
  };
}

/** What "Save as a pay week" needs to know about the plan's main pay (step 2g). */
export interface MainPayLinks {
  /** A series of the main pay's family, to link the pay week to. */
  readonly seriesId: string;
  readonly name: string;
  readonly payProfileId: string | null;
  /** How many steps its amount pattern has: 1 with one amount. */
  readonly steps: number;
  /** It has saved pay weeks linked already, so they're left as they are. */
  readonly hasPayWeeks: boolean;
}

/**
 * "Save as a pay week" (brief 4.15, D5, D154): the lines and extras saved as
 * a pay week on the main pay's tax settings. With no tax settings saved yet,
 * the calculator's are saved for it first. When the main pay has no saved
 * week, this one is linked to every payday, so "I did overtime" can work out
 * its figures (D5). A pay week already linked stays as it is.
 */
export function saveWeekCommands(
  input: TakeHomeInput,
  main: MainPayLinks,
  name: string,
  ids: { readonly weekId: string; readonly profileId: string },
): EditCommand[] {
  const commands: EditCommand[] = [];
  const profileId = main.payProfileId ?? ids.profileId;
  if (main.payProfileId === null) {
    commands.push({
      kind: 'add-pay-profile',
      profile: {
        id: profileId,
        name: main.name,
        ...input.settings,
        ...(input.soFar === undefined ? {} : { soFar: input.soFar }),
      },
    });
  }
  const week: PayWeek = {
    id: ids.weekId,
    name,
    payProfileId: profileId,
    lines: input.lines,
    ...(input.fixed === undefined ? {} : { fixed: input.fixed }),
  };
  commands.push({ kind: 'add-pay-week', week });
  if (!main.hasPayWeeks) {
    commands.push({
      kind: 'link-pay',
      seriesId: main.seriesId,
      payProfileId: profileId,
      cyclePayWeeks: Array.from({ length: Math.max(1, main.steps) }, () => ids.weekId),
    });
  }
  return commands;
}
