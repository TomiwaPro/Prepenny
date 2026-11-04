// First-time setup's boxes (brief 4.1, step 2e), checked and turned into the
// engine's commands (D149). Each step's form becomes one or more commands,
// saved as one change. Every mistake comes back as the box it's in, so the
// screen can explain it there in words; the engine checks it all again.
// Nothing here has words of its own: mistakes are keys into the strings file.

import {
  type AccountKind,
  type BankHolidayLookup,
  type BudgetEvery,
  type BudgetLeaves,
  coveredToFromDates,
  type Debt,
  type DebtEdits,
  type DebtKind,
  type EditCommand,
  EngineInputError,
  type HolidayRule,
  lastWorkingDayOfMonth,
  type MinimumRule,
  type NewSeries,
  type PayFrequency,
  type PaymentType,
  parseDate,
  parseTaxCode,
  partsOfDay,
  type Schedule,
  type Series,
  workOutPayments,
} from '@prepenny/engine';
import { amountForTyping, parseAmount, parseSignedAmount } from './amount.ts';
import {
  buildWhen,
  holidayRuleFor,
  type MonthlyOn,
  monthlyChoices,
  monthlyDay,
  type PaymentErrors,
  readDate,
  type WhenForm,
} from './new-payment.ts';

// Shared

/** A blank "when": no date picked yet, every month, never ending. */
export function blankWhen(howOften: WhenForm['howOften'] = 'monthly'): WhenForm {
  return {
    date: '',
    howOften,
    weeks: '1',
    months: '1',
    monthlyOn: 'day',
    leaveOut: false,
    leftOut: [],
    laterDates: [],
    ends: 'never',
    count: '',
    endDate: '',
    differentLast: false,
    lastAmount: '',
  };
}

/** A whole number of pence from a box that may be left empty. */
export function optionalAmount(text: string): number | null | 'bad' {
  if (text.trim() === '') return null;
  return parseAmount(text) ?? 'bad';
}

const PERCENT = /^\d{1,3}(?:\.\d{1,2})?$/;
const RATE = /^\d{1,4}(?:\.\d{1,4})?$/;
const HOURS = /^\d{1,3}(?:\.\d{1,2})?$/;

/** A percentage above 0 and up to 100, as text the engine reads exactly. */
function percentOf(text: string): string | null {
  const trimmed = text.trim().replace(/%$/, '').trim();
  if (!PERCENT.test(trimmed)) return null;
  const value = Number(trimmed);
  return value > 0 && value <= 100 ? trimmed : null;
}

/** A rate or hours above zero, as text the engine reads exactly. */
function positiveDecimal(text: string, pattern: RegExp): string | null {
  const trimmed = text.trim().replace(/^£/, '').trim();
  if (!pattern.test(trimmed)) return null;
  return Number(trimmed) > 0 ? trimmed : null;
}

// Step 1: your account

export interface AccountForm {
  readonly name: string;
  readonly kind: AccountKind;
  /** What the bank shows today. A minus sign, or `overdrawn`, makes it below zero. */
  readonly balance: string;
  readonly overdrawn: boolean;
  /** Empty for none. */
  readonly overdraft: string;
  /** "Warn me when it goes under": £20.00 suggested (D47). */
  readonly warning: string;
}

export type AccountMistake = 'nameError' | 'balanceError' | 'overdraftError' | 'warningError';
export type AccountErrors = Partial<Record<keyof AccountForm, AccountMistake>>;

export function blankAccount(first: boolean, name = ''): AccountForm {
  return {
    name,
    kind: first ? 'current' : 'savings',
    balance: '',
    overdrawn: false,
    overdraft: '',
    warning: '20.00',
  };
}

/** True once something has been typed in an account form that starts empty. */
export function accountTyped(form: AccountForm): boolean {
  return form.balance.trim() !== '' || form.overdraft.trim() !== '';
}

export function buildAccount(
  form: AccountForm,
  today: string,
  ids: { readonly accountId: string; readonly balanceId: string },
  now: string,
):
  | { readonly ok: true; readonly command: EditCommand }
  | { readonly ok: false; readonly errors: AccountErrors } {
  const errors: AccountErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'nameError';
  const typed = parseSignedAmount(form.balance);
  if (typed === null) errors.balance = 'balanceError';
  const overdraft = optionalAmount(form.overdraft);
  if (overdraft === 'bad') errors.overdraft = 'overdraftError';
  const warning = form.warning.trim() === '' ? 0 : parseSignedAmount(form.warning);
  if (warning === null) errors.warning = 'warningError';
  if (Object.keys(errors).length > 0 || typed === null || overdraft === 'bad' || warning === null) {
    return { ok: false, errors };
  }
  const balance = form.overdrawn ? -Math.abs(typed) : typed;
  return {
    ok: true,
    command: {
      kind: 'add-account',
      account: {
        id: ids.accountId,
        name,
        kind: form.kind,
        overdraftLimit: overdraft ?? 0,
        warningLevel: warning,
      },
      balance: { id: ids.balanceId, balance, checkedOn: today, checkedAt: now },
    },
  };
}

// Step 2: how you're paid

/** Every pay choice in brief 4.1. */
export const PAY_OFTEN = [
  'weekly',
  'two-weekly',
  'four-weekly',
  'monthly',
  'last-working-day',
  'dates',
  'irregular',
] as const;

export type PayOften = (typeof PAY_OFTEN)[number];

export type IncomeKind = Extract<PaymentType, 'pay' | 'benefits' | 'other'>;

export interface IncomeForm {
  readonly name: string;
  readonly kind: IncomeKind;
  readonly often: PayOften;
  /** "Next payday" (D86). */
  readonly date: string;
  readonly monthlyOn: MonthlyOn;
  /** For chosen dates: the dates after the next payday. */
  readonly laterDates: readonly string[];
  /** One amount, or the first of the pattern. */
  readonly amount: string;
  /** "My pay changes in a pattern" (brief 4.1): up to 8 amounts. */
  readonly pattern: boolean;
  readonly amounts: readonly string[];
  readonly holidayRule: HolidayRule;
  readonly accountId: string;
  readonly isEstimate: boolean;
  /** Set aside part of it, as Kofi does for tax (D64). */
  readonly setAside: boolean;
  readonly percent: string;
  readonly setAsideTo: string;
}

/** The most amounts in a pattern (brief 4.1). */
export const MOST_IN_PATTERN = 8;

export type IncomeField =
  | 'name'
  | 'date'
  | 'dates'
  | 'amount'
  | 'amounts'
  | 'setAsideTo'
  | 'percent';

export type IncomeMistake =
  | 'nameError'
  | 'dateError'
  | 'beforeToday'
  | 'notLastWorkingDay'
  | 'datesError'
  | 'amountError'
  | 'patternError'
  | 'sameAccount'
  | 'percentError';

export type IncomeErrors = Partial<Record<IncomeField, IncomeMistake>>;

export function blankIncome(accountId: string, otherAccountId: string, name = ''): IncomeForm {
  return {
    name,
    kind: 'pay',
    often: 'weekly',
    date: '',
    monthlyOn: 'day',
    laterDates: [],
    amount: '',
    pattern: false,
    amounts: ['', ''],
    // Most pay arrives early when payday is a weekend or bank holiday.
    holidayRule: 'working-day-before',
    accountId,
    isEstimate: false,
    setAside: false,
    percent: '',
    setAsideTo: otherAccountId,
  };
}

/** True once a name or an amount has been typed in an income form that starts empty. */
export function incomeTyped(form: IncomeForm, startName: string): boolean {
  return (
    (form.name.trim() !== '' && form.name.trim() !== startName) ||
    form.amount.trim() !== '' ||
    form.amounts.some((one) => one.trim() !== '') ||
    form.date !== ''
  );
}

/** The schedule for a pay choice, from its next payday. */
export function payScheduleOf(
  form: IncomeForm,
  date: string,
  holidays: BankHolidayLookup,
): Schedule {
  switch (form.often) {
    case 'weekly':
      return { kind: 'weekly', every: 1 };
    case 'two-weekly':
      return { kind: 'weekly', every: 2 };
    case 'four-weekly':
      return { kind: 'weekly', every: 4 };
    case 'monthly': {
      const on = monthlyChoices(date, holidays).includes(form.monthlyOn) ? form.monthlyOn : 'day';
      return { kind: 'monthly', every: 1, on: monthlyDay(on, date) };
    }
    case 'last-working-day':
      return { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } };
    case 'dates':
      return { kind: 'dates', dates: [date, ...form.laterDates].sort() };
    case 'irregular':
      return { kind: 'irregular' };
  }
}

/** The last working day of the month a date is in, or of the next month when that's passed. */
export function nextLastWorkingDay(today: string, holidays: BankHolidayLookup): string {
  const { year, month } = partsOfDay(parseDate(today));
  const thisMonth = lastWorkingDayOfMonth(year, month, holidays);
  const day =
    thisMonth >= parseDate(today)
      ? thisMonth
      : lastWorkingDayOfMonth(
          month === 12 ? year + 1 : year,
          month === 12 ? 1 : month + 1,
          holidays,
        );
  return formatDay(day);
}

function formatDay(day: number): string {
  const { year, month, day: date } = partsOfDay(day);
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${date
    .toString()
    .padStart(2, '0')}`;
}

/** Whether a date is its month's last working day. */
function isLastWorkingDay(date: string, holidays: BankHolidayLookup): boolean {
  const day = parseDate(date);
  const { year, month } = partsOfDay(day);
  return lastWorkingDayOfMonth(year, month, holidays) === day;
}

/** The pay frequency a pay profile needs, or null for pay that can't have one (D154). */
export function payFrequencyOf(schedule: Schedule): PayFrequency | null {
  if (schedule.kind === 'weekly') {
    if (schedule.every === 1) return 'weekly';
    if (schedule.every === 2) return 'two-weekly';
    if (schedule.every === 4) return 'four-weekly';
    return null;
  }
  if (schedule.kind === 'monthly' && schedule.every === 1) return 'monthly';
  return null;
}

export function buildIncome(
  form: IncomeForm,
  today: string,
  holidays: BankHolidayLookup,
  canSetAside: boolean,
):
  | { readonly ok: true; readonly series: Omit<NewSeries, 'id'> }
  | { readonly ok: false; readonly errors: IncomeErrors } {
  const errors: IncomeErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'nameError';
  const date = readDate(form.date);
  if (date === null) errors.date = 'dateError';
  else if (date < today) errors.date = 'beforeToday';
  else if (form.often === 'last-working-day' && !isLastWorkingDay(date, holidays)) {
    errors.date = 'notLastWorkingDay';
  }
  if (form.often === 'dates' && date !== null) {
    const later = form.laterDates.map(readDate);
    const all = [date, ...later];
    if (later.some((one) => one === null || one <= date) || new Set(all).size !== all.length) {
      errors.dates = 'datesError';
    }
  }
  let amount: number | null = null;
  let cycle: number[] | null = null;
  if (form.pattern && form.often !== 'irregular') {
    const amounts = form.amounts.map(parseAmount);
    if (
      amounts.length < 2 ||
      amounts.length > MOST_IN_PATTERN ||
      amounts.some((one) => one === null)
    ) {
      errors.amounts = 'patternError';
    } else {
      cycle = amounts as number[];
      amount = cycle[0] ?? null;
    }
  } else {
    amount = parseAmount(form.amount);
    if (amount === null) errors.amount = 'amountError';
  }
  let setAside: Series['setAside'];
  if (canSetAside && form.setAside) {
    const percent = percentOf(form.percent);
    if (percent === null) errors.percent = 'percentError';
    if (form.setAsideTo === form.accountId) errors.setAsideTo = 'sameAccount';
    if (percent !== null && form.setAsideTo !== form.accountId) {
      setAside = { percent, accountId: form.setAsideTo };
    }
  }
  if (Object.keys(errors).length > 0 || date === null || amount === null) {
    return { ok: false, errors };
  }
  const schedule = payScheduleOf(form, date, holidays);
  return {
    ok: true,
    series: {
      accountId: form.accountId,
      name,
      direction: 'in',
      amount,
      ...(cycle === null ? {} : { amountCycle: cycle, cycleOffset: 0 }),
      start: date,
      schedule,
      end: { kind: 'never' },
      holidayRule: holidayRuleFor(schedule, form.holidayRule),
      type: form.kind,
      ...(setAside === undefined ? {} : { setAside }),
      // An irregular weekly estimate is always an estimate (brief 4.1).
      isEstimate: form.often === 'irregular' ? true : form.isEstimate,
    },
  };
}

/**
 * The first paydays of a pay series, as the dates it lands on and its dates
 * from the schedule, from today: for the pattern's boxes and "pays for work up to".
 */
export function firstPaydays(
  series: Omit<NewSeries, 'id'>,
  today: string,
  holidays: BankHolidayLookup,
  count: number,
): { readonly date: string; readonly originalDate: string }[] {
  const to = formatDay(parseDate(today) + 7 * 4 * Math.max(count, 1) + 400);
  const full: Series = {
    ...series,
    id: 'preview',
    familyId: 'preview',
    familyCreatedAt: '1970-01-01T00:00:00Z',
  };
  try {
    return workOutPayments({ series: [full], holidays, from: today, to })
      .slice(0, count)
      .map((payment) => ({ date: payment.date, originalDate: payment.originalDate }));
  } catch {
    return [];
  }
}

// Step 2: extra hours and missed shifts (D5, D131, D142)

export interface PayDetailsForm {
  /** Which income they're paid in: a series id. */
  readonly seriesId: string;
  readonly overtimeRate: string;
  readonly taxCode: string;
  /** The last day of work the next payday covers (D131). */
  readonly coveredTo: string;
  /** Save the usual week now, or do it later (D5). */
  readonly usual: 'now' | 'later';
  /** The usual rate an hour. */
  readonly rate: string;
  /** Each payday of the pattern's usual hours and extras, or one for pay with no pattern. */
  readonly weeks: readonly { readonly hours: string; readonly extras: string }[];
}

export type PayDetailsField = 'overtimeRate' | 'taxCode' | 'coveredTo' | 'rate' | 'weeks';
export type PayDetailsMistake =
  | 'rateError'
  | 'taxCodeError'
  | 'coveredToError'
  | 'coveredToTooFar'
  | 'hoursError'
  | 'extrasError';
export type PayDetailsErrors = Partial<Record<PayDetailsField, PayDetailsMistake>>;

export function blankPayDetails(seriesId: string, steps: number): PayDetailsForm {
  return {
    seriesId,
    overtimeRate: '',
    taxCode: '1257L',
    coveredTo: '',
    usual: 'now',
    rate: '',
    weeks: Array.from({ length: Math.max(steps, 1) }, () => ({ hours: '', extras: '' })),
  };
}

/** The ids a pay profile and its pay weeks are saved with. */
export interface PayDetailsIds {
  readonly profileId: string;
  readonly weekIds: readonly string[];
}

export function buildPayDetails(
  form: PayDetailsForm,
  pay: { readonly series: Series; readonly payday: string },
  ids: PayDetailsIds,
  names: {
    readonly week: (step: number, of: number) => string;
    readonly basic: string;
    readonly extras: string;
  },
):
  | { readonly ok: true; readonly commands: EditCommand[] }
  | { readonly ok: false; readonly errors: PayDetailsErrors } {
  const errors: PayDetailsErrors = {};
  const frequency = payFrequencyOf(pay.series.schedule);
  const overtimeRate = positiveDecimal(form.overtimeRate, RATE);
  if (overtimeRate === null) errors.overtimeRate = 'rateError';
  const taxCode = form.taxCode.trim().toUpperCase();
  try {
    parseTaxCode(taxCode);
  } catch {
    errors.taxCode = 'taxCodeError';
  }
  let coveredTo: ReturnType<typeof coveredToFromDates> | null = null;
  const upTo = readDate(form.coveredTo);
  if (upTo === null || frequency === null) errors.coveredTo = 'coveredToError';
  else {
    try {
      coveredTo = coveredToFromDates(frequency, pay.payday, upTo);
    } catch (error) {
      if (!(error instanceof EngineInputError)) throw error;
      errors.coveredTo = 'coveredToTooFar';
    }
  }
  const steps = pay.series.amountCycle?.length ?? 1;
  let weeks: { hours: string; extras: number | null }[] = [];
  let rate: string | null = null;
  if (form.usual === 'now') {
    rate = positiveDecimal(form.rate, RATE);
    if (rate === null) errors.rate = 'rateError';
    weeks = form.weeks.slice(0, steps).map((week) => {
      const hours = positiveDecimal(week.hours, HOURS);
      const extras = optionalAmount(week.extras);
      if (hours === null) errors.weeks ??= 'hoursError';
      if (extras === 'bad') errors.weeks ??= 'extrasError';
      return { hours: hours ?? '', extras: extras === 'bad' ? null : extras };
    });
    if (weeks.length !== steps) errors.weeks ??= 'hoursError';
  }
  if (
    Object.keys(errors).length > 0 ||
    frequency === null ||
    coveredTo === null ||
    overtimeRate === null
  ) {
    return { ok: false, errors };
  }
  const commands: EditCommand[] = [
    {
      kind: 'add-pay-profile',
      profile: {
        id: ids.profileId,
        name: pay.series.name,
        frequency,
        taxCode,
        basis: 'cumulative',
        overtimeRate,
        coveredTo,
      },
    },
  ];
  if (form.usual === 'now' && rate !== null) {
    weeks.forEach((week, index) => {
      commands.push({
        kind: 'add-pay-week',
        week: {
          id: ids.weekIds[index] ?? `${ids.profileId}-${index}`,
          name: names.week(index + 1, steps),
          payProfileId: ids.profileId,
          lines: [{ name: names.basic, kind: 'basic', hours: week.hours, rate: rate as string }],
          ...(week.extras === null || week.extras === 0
            ? {}
            : { fixed: [{ name: names.extras, amount: week.extras }] }),
        },
      });
    });
  }
  commands.push({
    kind: 'link-pay',
    seriesId: pay.series.id,
    payProfileId: ids.profileId,
    ...(form.usual === 'now'
      ? {
          cyclePayWeeks: weeks.map((_, index) => ids.weekIds[index] ?? `${ids.profileId}-${index}`),
        }
      : {}),
  });
  return { ok: true, commands };
}

// Steps 3 and 4: rent and bills

export interface OutgoingForm extends WhenForm {
  readonly name: string;
  readonly amount: string;
  readonly accountId: string;
  readonly isEstimate: boolean;
}

export type OutgoingErrors = PaymentErrors;

/** True once an amount has been typed. */
export function outgoingTyped(form: OutgoingForm): boolean {
  return form.amount.trim() !== '';
}

/**
 * A payment going out. Rent and bills move to the next working day on a
 * weekend or bank holiday, as Direct Debits and standing orders usually do;
 * debt payments keep their date (D231). Add a payment still lets people
 * choose (D199).
 */
export function buildOutgoing(
  form: OutgoingForm,
  type: PaymentType,
  today: string,
  holidays: BankHolidayLookup,
):
  | { readonly ok: true; readonly series: Omit<NewSeries, 'id'> }
  | { readonly ok: false; readonly errors: OutgoingErrors } {
  const errors: OutgoingErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'nameError';
  const amount = parseAmount(form.amount);
  if (amount === null) errors.amount = 'amountError';
  const when = buildWhen(form, today, holidays, errors);
  if (Object.keys(errors).length > 0 || amount === null || when === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    series: {
      accountId: form.accountId,
      name,
      direction: 'out',
      amount,
      start: when.start,
      schedule: when.schedule,
      end: when.end,
      ...(when.lastAmount === null ? {} : { lastAmount: when.lastAmount }),
      holidayRule: holidayRuleFor(when.schedule, type === 'debt' ? 'keep' : 'working-day-after'),
      type,
      isEstimate: form.isEstimate,
    },
  };
}

// Step 5: debts

/** Currencies offered for a debt: each is counted in hundredths (D98, D153). */
export const DEBT_CURRENCIES = ['GBP', 'EUR', 'USD'] as const;
export type DebtCurrency = (typeof DEBT_CURRENCIES)[number];

export interface DebtForm extends OutgoingForm {
  readonly kind: DebtKind;
  readonly currency: DebtCurrency;
  /** Units of the currency per £1 (brief 4.6). */
  readonly rate: string;
  /** What's owed now, in the debt's currency. */
  readonly owed: string;
  /** What it started at, if known, for the progress bar. */
  readonly started: string;
  /** Credit cards: the yearly interest rate, if any. */
  readonly interest: string;
  /** Credit cards: the statement day, needed with an interest rate (D13). */
  readonly statementDay: string;
  /** Credit cards: "0% until", if it has an offer (D106). */
  readonly zeroUntil: string;
  /** Credit cards: the minimum payment, not known, typed from the statement, or a rule (D101). */
  readonly minimum: 'none' | 'typed' | 'rule';
  readonly minimumAmount: string;
  /** The rule's percentage of the balance: 1 in "interest plus 1% of the balance". */
  readonly minimumPercent: string;
  /** The rule's lowest minimum: £5 in "at least £5". */
  readonly minimumAtLeast: string;
  /** "I don't have payments planned for it yet". */
  readonly noPayments: boolean;
}

export type DebtField =
  | 'name'
  | 'owed'
  | 'started'
  | 'rate'
  | 'interest'
  | 'statementDay'
  | 'zeroUntil'
  | 'minimumAmount'
  | 'minimumPercent'
  | 'minimumAtLeast'
  | keyof PaymentErrors;

export type DebtMistake =
  | 'owedError'
  | 'startedError'
  | 'currencyRateError'
  | 'interestError'
  | 'statementDayError'
  | 'statementDayNeeded'
  | 'zeroUntilError'
  | 'minimumError'
  | 'percentError'
  | NonNullable<PaymentErrors[keyof PaymentErrors]>;

export type DebtErrors = Partial<Record<DebtField, DebtMistake>>;

export function blankDebt(accountId: string): DebtForm {
  return {
    ...blankWhen('monthly'),
    name: '',
    amount: '',
    accountId,
    isEstimate: false,
    kind: 'pay-later',
    currency: 'GBP',
    rate: '',
    owed: '',
    started: '',
    interest: '',
    statementDay: '',
    zeroUntil: '',
    minimum: 'none',
    minimumAmount: '',
    minimumPercent: '1',
    minimumAtLeast: '5.00',
    noPayments: false,
  };
}

/** A debt's card details as the engine wants them, or the mistakes in them (D98, D101, D106). */
interface CardDetails {
  readonly interestRate: string | null;
  readonly statementDay: number | null;
  readonly zeroInterestUntil: string | null;
  readonly minimumRule: MinimumRule | null;
}

function cardDetailsOf(form: DebtForm, errors: DebtErrors): CardDetails {
  const none: CardDetails = {
    interestRate: null,
    statementDay: null,
    zeroInterestUntil: null,
    minimumRule: null,
  };
  if (form.kind !== 'credit-card') return none;
  let interestRate: string | null = null;
  if (form.interest.trim() !== '') {
    interestRate = positiveDecimal(form.interest.replace(/%$/, ''), PERCENT);
    if (interestRate === null || Number(interestRate) > 100) errors.interest = 'interestError';
  }
  let minimumRule: MinimumRule | null = null;
  if (form.minimum === 'typed') {
    const amount = parseAmount(form.minimumAmount);
    if (amount === null) errors.minimumAmount = 'minimumError';
    else minimumRule = { kind: 'typed', amount };
  } else if (form.minimum === 'rule') {
    const percent = positiveDecimal(form.minimumPercent.replace(/%$/, ''), PERCENT);
    if (percent === null || Number(percent) > 100) errors.minimumPercent = 'percentError';
    const atLeast = form.minimumAtLeast.trim() === '' ? 0 : parseAmount(form.minimumAtLeast);
    if (atLeast === null) errors.minimumAtLeast = 'minimumError';
    if (percent !== null && atLeast !== null) minimumRule = { kind: 'rule', percent, atLeast };
  }
  let statementDay: number | null = null;
  const typed = form.statementDay.trim();
  const needed = form.interest.trim() !== '' || form.minimum === 'rule';
  if (typed !== '') {
    const day = Number(typed);
    if (!/^\d{1,2}$/.test(typed) || day < 1 || day > 31) errors.statementDay = 'statementDayError';
    else statementDay = day;
  } else if (needed) {
    errors.statementDay = form.interest.trim() !== '' ? 'statementDayError' : 'statementDayNeeded';
  }
  let zeroInterestUntil: string | null = null;
  if (form.zeroUntil.trim() !== '') {
    zeroInterestUntil = readDate(form.zeroUntil);
    if (zeroInterestUntil === null) errors.zeroUntil = 'zeroUntilError';
  }
  return { interestRate, statementDay, zeroInterestUntil, minimumRule };
}

/** A stored debt as its form starts in the change sheet (D153). */
export function debtFormOf(debt: Debt, accountId: string): DebtForm {
  const minimum = debt.minimumRule;
  return {
    ...blankDebt(accountId),
    name: debt.name,
    kind: debt.kind,
    currency: (DEBT_CURRENCIES as readonly string[]).includes(debt.currency)
      ? (debt.currency as DebtCurrency)
      : 'GBP',
    rate: debt.rate ?? '',
    owed: amountForTyping(debt.balance),
    started: amountForTyping(debt.startingBalance),
    interest: debt.interestRate ?? '',
    statementDay: debt.statementDay === undefined ? '' : String(debt.statementDay),
    zeroUntil: debt.zeroInterestUntil ?? '',
    minimum: minimum === undefined ? 'none' : minimum.kind,
    minimumAmount: minimum?.kind === 'typed' ? amountForTyping(minimum.amount) : '',
    minimumPercent: minimum?.kind === 'rule' ? minimum.percent : '1',
    minimumAtLeast: minimum?.kind === 'rule' ? amountForTyping(minimum.atLeast) : '5.00',
    noPayments: true,
  };
}

/**
 * The change to a debt's details (D153): only what differs is sent, and a
 * credit card's own fields are cleared when it becomes another kind (D98).
 * Its balance changes with Update from statement, not here, and its
 * currency never changes, because the balance is kept in it (D246).
 */
export function buildDebtChange(
  form: DebtForm,
  debt: Debt,
):
  | { readonly ok: true; readonly command: EditCommand | null }
  | { readonly ok: false; readonly errors: DebtErrors } {
  const errors: DebtErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'nameError';
  const started = optionalAmount(form.started);
  if (started === 'bad') errors.started = 'startedError';
  // The currency stays as it is: the balance is kept in it (D246).
  let rate: string | null = null;
  if (debt.currency !== 'GBP') {
    rate = positiveDecimal(form.rate, RATE);
    if (rate === null) errors.rate = 'currencyRateError';
  }
  const card = cardDetailsOf(form, errors);
  if (Object.keys(errors).length > 0 || started === 'bad') return { ok: false, errors };
  const edits: { -readonly [K in keyof DebtEdits]: DebtEdits[K] } = {};
  if (name !== debt.name) edits.name = name;
  if (form.kind !== debt.kind) edits.kind = form.kind;
  if (rate !== (debt.rate ?? null)) edits.rate = rate;
  const startingBalance = started ?? debt.balance;
  if (startingBalance !== debt.startingBalance) edits.startingBalance = startingBalance;
  if (card.interestRate !== (debt.interestRate ?? null)) edits.interestRate = card.interestRate;
  if (card.statementDay !== (debt.statementDay ?? null)) edits.statementDay = card.statementDay;
  if (card.zeroInterestUntil !== (debt.zeroInterestUntil ?? null)) {
    edits.zeroInterestUntil = card.zeroInterestUntil;
  }
  if (JSON.stringify(card.minimumRule) !== JSON.stringify(debt.minimumRule ?? null)) {
    edits.minimumRule = card.minimumRule;
  }
  if (Object.keys(edits).length === 0) return { ok: true, command: null };
  return { ok: true, command: { kind: 'change-debt', debtId: debt.id, edits } };
}

export function debtTyped(form: DebtForm): boolean {
  return form.name.trim() !== '' || form.owed.trim() !== '' || form.amount.trim() !== '';
}

export function buildDebt(
  form: DebtForm,
  today: string,
  holidays: BankHolidayLookup,
  ids: { readonly debtId: string; readonly seriesId: string },
  now: string,
):
  | { readonly ok: true; readonly commands: EditCommand[] }
  | { readonly ok: false; readonly errors: DebtErrors } {
  const errors: DebtErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'nameError';
  const owed = parseAmount(form.owed);
  if (owed === null) errors.owed = 'owedError';
  const started = optionalAmount(form.started);
  if (started === 'bad') errors.started = 'startedError';
  let rate: string | null = null;
  if (form.currency !== 'GBP') {
    rate = positiveDecimal(form.rate, RATE);
    if (rate === null) errors.rate = 'currencyRateError';
  }
  const card = cardDetailsOf(form, errors);
  let payment: ReturnType<typeof buildOutgoing> | null = null;
  if (!form.noPayments) {
    payment = buildOutgoing({ ...form, name: name === '' ? '-' : name }, 'debt', today, holidays);
    if (!payment.ok) Object.assign(errors, payment.errors);
  }
  if (Object.keys(errors).length > 0 || owed === null || started === 'bad') {
    return { ok: false, errors };
  }
  const commands: EditCommand[] = [
    {
      kind: 'add-debt',
      debt: {
        id: ids.debtId,
        name,
        kind: form.kind,
        currency: form.currency,
        ...(rate === null ? {} : { rate }),
        balance: owed,
        balanceOn: today,
        balanceAt: now,
        startingBalance: started ?? owed,
        ...(card.interestRate === null ? {} : { interestRate: card.interestRate }),
        ...(card.zeroInterestUntil === null ? {} : { zeroInterestUntil: card.zeroInterestUntil }),
        ...(card.statementDay === null ? {} : { statementDay: card.statementDay }),
        ...(card.minimumRule === null ? {} : { minimumRule: card.minimumRule }),
      },
    },
  ];
  if (payment?.ok === true) {
    commands.push({
      kind: 'add-payment',
      series: { ...payment.series, id: ids.seriesId, debtId: ids.debtId },
      madeAt: now,
    });
  }
  return { ok: true, commands };
}

// Step 6: spending money

export interface BudgetForm {
  readonly name: string;
  readonly amount: string;
  readonly every: BudgetEvery;
  readonly leaves: BudgetLeaves;
  /** A pay-later bill's day of the month (D32). */
  readonly billDay: string;
  readonly accountId: string;
  /** "Already spent this week" (or "this month"), which can be left empty (D230). */
  readonly alreadySpent: string;
}

export type BudgetField = 'name' | 'amount' | 'billDay' | 'alreadySpent';
export type BudgetMistake = 'nameError' | 'amountError' | 'billDayError' | 'alreadySpentError';
export type BudgetErrors = Partial<Record<BudgetField, BudgetMistake>>;

export function blankBudget(name: string, every: BudgetEvery, accountId: string): BudgetForm {
  return {
    name,
    amount: '',
    every,
    leaves: 'at-start',
    billDay: '',
    accountId,
    alreadySpent: '',
  };
}

export function budgetTyped(form: BudgetForm): boolean {
  return form.amount.trim() !== '';
}

/**
 * The time a spend is recorded at to count as inside a balance: a moment
 * before that balance was typed in (D2, D33, D230).
 */
export function justBefore(time: string): string {
  return new Date(Date.parse(time) - 1).toISOString();
}

/** An account's latest balance update: when it was typed in and its date. Null when it has none. */
export function latestBalanceAt(
  updates: readonly {
    readonly accountId: string;
    readonly checkedAt: string;
    readonly checkedOn: string;
  }[],
  accountId: string,
): { readonly checkedAt: string; readonly checkedOn: string } | null {
  let latest: { checkedAt: string; checkedOn: string } | null = null;
  for (const update of updates) {
    if (update.accountId !== accountId) continue;
    if (latest === null || Date.parse(update.checkedAt) > Date.parse(latest.checkedAt)) {
      latest = { checkedAt: update.checkedAt, checkedOn: update.checkedOn };
    }
  }
  return latest;
}

/**
 * A budget in setup (D230): it starts today, so its first week or month is
 * the one with today in it. What's already spent this week or month is
 * saved as a spend for today, recorded just before the account's balance
 * was typed in, so it's inside that balance (D2) and only what's left
 * leaves today. Left empty, the whole amount leaves today. When the
 * balance was typed on an earlier day, PrePenny can't tell how much of it
 * the balance shows, so the spend is recorded now and the whole amount
 * still leaves today, the safe choice; a pay-later card's spending never
 * leaves the bank, so it isn't asked (D246).
 */
export function buildBudget(
  form: BudgetForm,
  today: string,
  ids: { readonly budgetId: string; readonly spendId: string },
  now: string,
  /** The account's latest balance update. */
  balance: { readonly checkedAt: string; readonly checkedOn: string } | null,
):
  | { readonly ok: true; readonly commands: EditCommand[] }
  | { readonly ok: false; readonly errors: BudgetErrors } {
  const errors: BudgetErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'nameError';
  const amount = parseAmount(form.amount);
  if (amount === null || amount === 0) errors.amount = 'amountError';
  let billDay: number | null = null;
  if (form.leaves === 'pay-later') {
    const day = Number(form.billDay.trim());
    if (!/^\d{1,2}$/.test(form.billDay.trim()) || day < 1 || day > 31)
      errors.billDay = 'billDayError';
    else billDay = day;
  }
  const spent = form.leaves === 'pay-later' ? null : optionalAmount(form.alreadySpent);
  if (spent === 'bad') errors.alreadySpent = 'alreadySpentError';
  if (Object.keys(errors).length > 0 || amount === null || spent === 'bad') {
    return { ok: false, errors };
  }
  const commands: EditCommand[] = [
    {
      kind: 'add-budget',
      budget: {
        id: ids.budgetId,
        accountId: form.accountId,
        name,
        amount,
        // A pay-later bill comes once a month (D107).
        every: form.leaves === 'pay-later' ? 'month' : form.every,
        leaves: form.leaves,
        rollOver: false,
        startsOn: today,
        ...(billDay === null ? {} : { billDay }),
        createdAt: now,
      },
    },
  ];
  if (spent !== null && spent > 0) {
    commands.push(alreadySpentCommand(ids, spent, today, now, balance));
  }
  return { ok: true, commands };
}

/**
 * "Already spent this week" as a spend for today (D230, D246): recorded just
 * before the account's balance was typed in when that was today, so it's
 * inside the balance and only what's left leaves today; otherwise recorded
 * now, so the whole amount still leaves today. Setup and Add a budget share
 * it (step 2g).
 */
export function alreadySpentCommand(
  ids: { readonly budgetId: string; readonly spendId: string },
  spent: number,
  today: string,
  now: string,
  balance: { readonly checkedAt: string; readonly checkedOn: string } | null,
): EditCommand {
  return {
    kind: 'spend',
    spend: {
      id: ids.spendId,
      budgetId: ids.budgetId,
      amount: spent,
      spentOn: today,
      recordedAt:
        balance !== null && balance.checkedOn === today ? justBefore(balance.checkedAt) : now,
    },
  };
}

// Step 7: savings

/** "Each payday", or a "when" of its own. */
export type MoveOften = 'payday' | 'own';

export interface GoalForm extends WhenForm {
  readonly name: string;
  readonly target: string;
  readonly targetDate: string;
  /** The account it's kept in, or "new" for a new savings account. */
  readonly keptIn: string;
  readonly newName: string;
  readonly newBalance: string;
  /** Already saved towards it. */
  readonly saved: string;
  /** How much moves into it, if anything. */
  readonly move: string;
  readonly moveOften: MoveOften;
  readonly fromAccountId: string;
}

export const NEW_ACCOUNT = 'new';

export type GoalField =
  | 'name'
  | 'target'
  | 'targetDate'
  | 'newName'
  | 'newBalance'
  | 'saved'
  | 'move'
  | 'fromAccount'
  | keyof PaymentErrors;

export type GoalMistake =
  | 'nameError'
  | 'targetError'
  | 'targetDateError'
  | 'newNameError'
  | 'balanceError'
  | 'savedError'
  | 'moveError'
  | 'sameAccount'
  | NonNullable<PaymentErrors[keyof PaymentErrors]>;

export type GoalErrors = Partial<Record<GoalField, GoalMistake>>;

export function blankGoal(keptIn: string, fromAccountId: string, hasPayday: boolean): GoalForm {
  return {
    ...blankWhen('monthly'),
    name: '',
    target: '',
    targetDate: '',
    keptIn,
    newName: '',
    newBalance: '',
    saved: '',
    move: '',
    moveOften: hasPayday ? 'payday' : 'own',
    fromAccountId,
  };
}

export function goalTyped(form: GoalForm): boolean {
  return form.name.trim() !== '' || form.target.trim() !== '';
}

/** The main pay's schedule for "Each payday": its next payday and how it repeats. */
export interface EachPayday {
  readonly start: string;
  readonly schedule: Schedule;
  readonly holidayRule: HolidayRule;
}

/**
 * "Each payday": the main pay's own schedule from its next payday on or
 * after today (step 2e). Pay on the last working day starts on the day it
 * lands, which its schedule gives (D145); any other starts on its date from
 * the schedule, so the weekday or day of the month stays the same.
 */
export function eachPaydayOf(
  series: readonly Series[],
  mainPayFamilyId: string | null,
  today: string,
  holidays: BankHolidayLookup,
): EachPayday | null {
  const pay = series.find((one) => one.familyId === mainPayFamilyId && one.direction === 'in');
  if (pay === undefined) return null;
  const { schedule } = pay;
  if (schedule.kind === 'once' || schedule.kind === 'irregular') return null;
  const next = firstPaydays(pay, today, holidays, 1)[0];
  if (next === undefined) return null;
  const lastWorkingDay = schedule.kind === 'monthly' && schedule.on.kind === 'last-working-day';
  const start = lastWorkingDay ? next.date : next.originalDate;
  return {
    start,
    schedule:
      schedule.kind === 'dates'
        ? { kind: 'dates', dates: schedule.dates.filter((one) => one >= start) }
        : schedule,
    holidayRule: pay.holidayRule,
  };
}

export function buildGoal(
  form: GoalForm,
  today: string,
  holidays: BankHolidayLookup,
  ids: {
    readonly goalId: string;
    readonly seriesId: string;
    readonly accountId: string;
    readonly balanceId: string;
  },
  now: string,
  eachPayday: EachPayday | null,
  moveName: (goal: string) => string,
):
  | { readonly ok: true; readonly commands: EditCommand[] }
  | { readonly ok: false; readonly errors: GoalErrors } {
  const errors: GoalErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'nameError';
  const target = parseAmount(form.target);
  if (target === null || target === 0) errors.target = 'targetError';
  let targetDate: string | null = null;
  if (form.targetDate.trim() !== '') {
    targetDate = readDate(form.targetDate);
    if (targetDate === null || targetDate < today) errors.targetDate = 'targetDateError';
  }
  const saved = optionalAmount(form.saved);
  if (saved === 'bad') errors.saved = 'savedError';
  const commands: EditCommand[] = [];
  let keptIn = form.keptIn;
  if (form.keptIn === NEW_ACCOUNT) {
    const account = buildAccount(
      {
        ...blankAccount(false, form.newName),
        balance: form.newBalance === '' ? '0' : form.newBalance,
        warning: '0',
      },
      today,
      { accountId: ids.accountId, balanceId: ids.balanceId },
      now,
    );
    if (form.newName.trim() === '') errors.newName = 'newNameError';
    if (!account.ok) {
      if (account.errors.balance !== undefined) errors.newBalance = 'balanceError';
    } else {
      commands.push(account.command);
    }
    keptIn = ids.accountId;
  }
  const move = optionalAmount(form.move);
  if (move === 'bad' || move === 0) errors.move = 'moveError';
  let when: {
    start: string;
    schedule: Schedule;
    end: NewSeries['end'];
    lastAmount: number | null;
    holidayRule: HolidayRule;
  } | null = null;
  if (move !== null && move !== 'bad' && move !== 0) {
    if (form.fromAccountId === keptIn) errors.fromAccount = 'sameAccount';
    if (form.moveOften === 'payday' && eachPayday !== null) {
      when = { ...eachPayday, end: { kind: 'never' }, lastAmount: null };
    } else {
      const own = buildWhen(form, today, holidays, errors as PaymentErrors);
      if (own !== null) when = { ...own, holidayRule: 'keep' };
    }
  }
  if (Object.keys(errors).length > 0 || target === null || saved === 'bad') {
    return { ok: false, errors };
  }
  commands.push({
    kind: 'add-goal',
    goal: {
      id: ids.goalId,
      name,
      target,
      ...(targetDate === null ? {} : { targetDate }),
      accountId: keptIn,
      startingAmount: saved ?? 0,
    },
  });
  if (when !== null && typeof move === 'number') {
    commands.push({
      kind: 'add-payment',
      series: {
        id: ids.seriesId,
        accountId: form.fromAccountId,
        toAccountId: keptIn,
        name: moveName(name),
        direction: 'transfer',
        amount: move,
        start: when.start,
        schedule: when.schedule,
        end: when.end,
        ...(when.lastAmount === null ? {} : { lastAmount: when.lastAmount }),
        holidayRule: when.holidayRule,
        type: 'savings',
        goalId: ids.goalId,
        isEstimate: false,
      },
      madeAt: now,
    });
  }
  return { ok: true, commands };
}
