// "Add a payment" (brief 4.3, 4.4, D86, D150, D160, D199): what the sheet's
// boxes say, checked and turned into the engine's new payment. Every
// mistake comes back as the box it's in, so the sheet can explain it there
// in words. The engine checks it all again when it's saved (D149).

import {
  type BankHolidayLookup,
  type Direction,
  daysInMonth,
  formatDate,
  type HolidayRule,
  lastWorkingDayOfMonth,
  type MonthlyDay,
  type NewSeries,
  type PaymentType,
  parseDate,
  partsOfDay,
  type Schedule,
  type WeekdayPosition,
  weekday,
} from '@prepenny/engine';
import { parseAmount } from './amount.ts';

export type HowOften = 'once' | 'weekly' | 'monthly' | 'dates';
export type Ends = 'never' | 'after' | 'on';
/** Where in the month a monthly payment falls, from the next payment's date (D199). */
export type MonthlyOn = 'day' | 'weekday' | 'last-weekday' | 'last-day' | 'last-working-day';

export interface PaymentForm {
  readonly direction: Direction;
  readonly name: string;
  readonly amount: string;
  /** The account it leaves, or arrives in for money coming in. */
  readonly accountId: string;
  /** For money moving between accounts: the account it arrives in. */
  readonly toAccountId: string;
  /** "Next payment" (D86): today or later (D150). */
  readonly date: string;
  readonly howOften: HowOften;
  readonly weeks: string;
  readonly months: string;
  readonly monthlyOn: MonthlyOn;
  readonly leaveOut: boolean;
  readonly leftOut: readonly number[];
  /** For "On chosen dates": the dates after the next payment. */
  readonly laterDates: readonly string[];
  readonly ends: Ends;
  readonly count: string;
  readonly endDate: string;
  readonly differentLast: boolean;
  readonly lastAmount: string;
  readonly holidayRule: HolidayRule;
  readonly type: PaymentType;
  /** "", "debt:<id>" or "goal:<id>" (D160). */
  readonly link: string;
  readonly isEstimate: boolean;
  readonly note: string;
}

export type PaymentField =
  | 'name'
  | 'amount'
  | 'toAccount'
  | 'date'
  | 'weeks'
  | 'months'
  | 'leaveOut'
  | 'dates'
  | 'count'
  | 'endDate'
  | 'lastAmount';

/** Which mistakes to explain: each is a key of `strings.addPayment`. */
export type PaymentErrors = Partial<Record<PaymentField, PaymentMistake>>;

export type PaymentMistake =
  | 'nameError'
  | 'amountError'
  | 'sameAccount'
  | 'beforeToday'
  | 'dateError'
  | 'weeksError'
  | 'monthsError'
  | 'leaveOutError'
  | 'leaveOutNext'
  | 'datesError'
  | 'howManyError'
  | 'lastDateError';

/** The order the boxes come in, so focus goes to the first mistake. */
export const FIELD_ORDER: readonly PaymentField[] = [
  'name',
  'amount',
  'toAccount',
  'date',
  'weeks',
  'months',
  'leaveOut',
  'dates',
  'count',
  'endDate',
  'lastAmount',
];

/** A new form: going out, once, today, from the first account. */
export function blankPayment(today: string, accountId: string, toAccountId: string): PaymentForm {
  return {
    direction: 'out',
    name: '',
    amount: '',
    accountId,
    toAccountId,
    date: today,
    howOften: 'once',
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
    holidayRule: 'keep',
    type: 'other',
    link: '',
    isEstimate: false,
    note: '',
  };
}

/** The type a new payment starts with, for each direction (D79, D199). */
export function typeFor(direction: Direction): PaymentType {
  return direction === 'transfer' ? 'savings' : 'other';
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function readDate(text: string): string | null {
  if (!DATE.test(text)) return null;
  try {
    return formatDate(parseDate(text));
  } catch {
    return null;
  }
}

function wholeNumber(text: string, least: number, most: number): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value >= least && value <= most ? value : null;
}

/** Where in its month a date falls, for the monthly choices (D199). */
export function monthlyChoices(date: string, holidays: BankHolidayLookup): MonthlyOn[] {
  const valid = readDate(date);
  if (valid === null) return ['day'];
  const day = parseDate(valid);
  const { year, month, day: dayOfMonth } = partsOfDay(day);
  const length = daysInMonth(year, month);
  const choices: MonthlyOn[] = ['day'];
  if (dayOfMonth <= 28) choices.push('weekday');
  if (dayOfMonth + 7 > length) choices.push('last-weekday');
  if (dayOfMonth === length) choices.push('last-day');
  if (lastWorkingDayOfMonth(year, month, holidays) === day) choices.push('last-working-day');
  return choices;
}

/** "the second Friday": which of its weekday in the month a date is, 1 to 4. */
export function positionInMonth(date: string): number {
  return Math.ceil(partsOfDay(parseDate(date)).day / 7);
}

function monthlyDay(on: MonthlyOn, date: string): MonthlyDay {
  const day = parseDate(date);
  const parts = partsOfDay(day);
  switch (on) {
    case 'day':
      return { kind: 'day', day: parts.day };
    case 'weekday':
      return {
        kind: 'weekday',
        weekday: weekday(day),
        position: positionInMonth(date) as WeekdayPosition,
      };
    case 'last-weekday':
      return { kind: 'weekday', weekday: weekday(day), position: 'last' };
    case 'last-day':
      return { kind: 'last-day' };
    case 'last-working-day':
      return { kind: 'last-working-day' };
  }
}

/** The month (1 to 12) of a date. */
export function monthOf(date: string): number {
  return partsOfDay(parseDate(date)).month;
}

/** Checks the form and turns it into the engine's new payment, or says which boxes need changing. */
export function buildPayment(
  form: PaymentForm,
  today: string,
  holidays: BankHolidayLookup,
):
  | { readonly ok: true; readonly series: Omit<NewSeries, 'id'> }
  | {
      readonly ok: false;
      readonly errors: PaymentErrors;
    } {
  const errors: PaymentErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'nameError';
  const amount = parseAmount(form.amount);
  if (amount === null) errors.amount = 'amountError';
  if (form.direction === 'transfer' && form.accountId === form.toAccountId) {
    errors.toAccount = 'sameAccount';
  }
  const date = readDate(form.date);
  if (date === null) errors.date = 'dateError';
  else if (date < today) errors.date = 'beforeToday';

  let schedule: Schedule = { kind: 'once' };
  if (form.howOften === 'weekly') {
    const every = wholeNumber(form.weeks, 1, 52);
    if (every === null) errors.weeks = 'weeksError';
    else schedule = { kind: 'weekly', every };
  } else if (form.howOften === 'monthly') {
    const every = wholeNumber(form.months, 1, 12);
    if (every === null) errors.months = 'monthsError';
    const leaveOut = form.leaveOut ? [...new Set(form.leftOut)].sort((a, b) => a - b) : [];
    if (leaveOut.length >= 12) errors.leaveOut = 'leaveOutError';
    else if (date !== null && leaveOut.includes(monthOf(date))) errors.leaveOut = 'leaveOutNext';
    if (every !== null && date !== null) {
      const on = monthlyChoices(date, holidays).includes(form.monthlyOn) ? form.monthlyOn : 'day';
      schedule = {
        kind: 'monthly',
        every,
        on: monthlyDay(on, date),
        ...(leaveOut.length === 0 ? {} : { leaveOut }),
      };
    }
  } else if (form.howOften === 'dates') {
    const later = form.laterDates.map(readDate);
    const all = date === null ? [] : [date, ...later];
    if (
      date !== null &&
      (later.some((one) => one === null || one <= date) || new Set(all).size !== all.length)
    ) {
      errors.dates = 'datesError';
    } else if (date !== null) {
      schedule = { kind: 'dates', dates: (all as string[]).sort() };
    }
  }

  const repeats = form.howOften === 'weekly' || form.howOften === 'monthly';
  let end: NewSeries['end'] = { kind: 'never' };
  if (repeats && form.ends === 'after') {
    const payments = wholeNumber(form.count, 1, 999);
    if (payments === null) errors.count = 'howManyError';
    else end = { kind: 'after', payments };
  } else if (repeats && form.ends === 'on') {
    const endDate = readDate(form.endDate);
    if (endDate === null || (date !== null && endDate < date)) errors.endDate = 'lastDateError';
    else end = { kind: 'on', date: endDate };
  }
  const ends = repeats && form.ends !== 'never';
  let lastAmount: number | null = null;
  if (ends && form.differentLast) {
    lastAmount = parseAmount(form.lastAmount);
    if (lastAmount === null) errors.lastAmount = 'amountError';
  }

  if (Object.keys(errors).length > 0 || amount === null || date === null) {
    return { ok: false, errors };
  }

  const [linkKind, linkId] = form.link.split(':');
  const note = form.note.trim();
  const holidayRule =
    schedule.kind === 'monthly' && schedule.on.kind === 'last-working-day'
      ? 'keep'
      : form.holidayRule;
  return {
    ok: true,
    series: {
      accountId: form.accountId,
      ...(form.direction === 'transfer' ? { toAccountId: form.toAccountId } : {}),
      name,
      direction: form.direction,
      amount,
      start: date,
      schedule,
      end,
      ...(lastAmount === null ? {} : { lastAmount }),
      holidayRule,
      type: form.type,
      ...(linkKind === 'debt' && linkId !== undefined && form.direction === 'out'
        ? { debtId: linkId }
        : {}),
      ...(linkKind === 'goal' && linkId !== undefined ? { goalId: linkId } : {}),
      isEstimate: form.isEstimate,
      ...(note === '' ? {} : { note }),
    },
  };
}
