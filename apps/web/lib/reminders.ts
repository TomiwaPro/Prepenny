// Which reminders are due, and their words (step 4e, brief 4.11, D560 to
// D565). PrePenny's server runs this when each one is due, with the plan as
// the person's own phone reads it from the account (D564), so it takes in a
// partner's changes and changes from the person's other phones.
//
// - Payday, at 9am: "Payday: update your balance."
// - The evening before money goes out, at 7pm, naming the biggest: "Rent
//   goes out tomorrow. You'll have £4.53 left until Friday." (D565)
// - A shortfall, when it first appears and again at 9am the day before, one
//   a day at most: "You'll be £40.00 short on Sun 1 Nov." (D565)
// - The weekly summary, on Sundays at 6pm: "This week: 5 payments going
//   out, £1,336.07 in all. Lowest point ahead: £4.53 on Sun 1 Nov." (D565)
// - Nothing between 9pm and 8am: what's due then waits until 8am (D560).
// - With amounts hidden, no amount at all (D561).
//
// Times are UK time, through the clock changes (D560): the moment is read on
// a UK clock with the phone's own time zone rules (Intl), never by adding an
// hour.
//
// Pure: the moment is passed in, and nothing is written anywhere but the
// return value. Never log what it returns (CLAUDE.md).

import {
  addDays,
  formatDate,
  type PlanRecords,
  type PlanRow,
  parseDate,
  SUNDAY,
  weekday,
  workOutPayments,
} from '@prepenny/engine';
import { strings } from '../strings/en-GB.ts';
import { formatDay, weekdayName } from './dates.ts';
import { holidaysOf } from './holidays.ts';
import { homeAccountId, workOutHomePlan } from './home.ts';
import { formatMoney } from './money.ts';

export const REMINDER_KINDS = ['payday', 'evening', 'shortfall', 'weekly'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** What the person has turned on under More (D560, D561). Everything is off at the start. */
export interface ReminderChoices {
  readonly payday: boolean;
  readonly evening: boolean;
  readonly shortfall: boolean;
  readonly weekly: boolean;
  readonly hideAmounts: boolean;
}

export const NO_REMINDERS: ReminderChoices = {
  payday: false,
  evening: false,
  shortfall: false,
  weekly: false,
  hideAmounts: false,
};

/** The UK's time zone: GMT in winter, BST in summer. */
export const UK_TIME_ZONE = 'Europe/London';

/** When each reminder comes, on a UK clock (D560). */
export const REMINDER_HOURS = {
  /** Quiet hours start: nothing from 9pm. */
  quietFrom: 21,
  /** Quiet hours end: anything due waits until 8am. */
  quietTo: 8,
  payday: 9,
  evening: 19,
  /** A shortfall's second warning, the day before (D565). */
  shortfallDayBefore: 9,
  weekly: 18,
} as const;

/** A moment on a UK clock. */
export interface UkClock {
  /** "YYYY-MM-DD". */
  readonly date: string;
  readonly hour: number;
  readonly minute: number;
}

const ukParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** A UTC moment, "2026-10-30T09:00:00Z", on a UK clock. */
export function ukClock(moment: string): UkClock {
  const time = Date.parse(moment);
  if (Number.isNaN(time)) throw new RangeError('Not a time.');
  const parts = Object.fromEntries(
    ukParts.formatToParts(new Date(time)).map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Whether it's quiet hours on a UK clock: 9pm to 8am (D560). */
export function isQuiet(clock: UkClock): boolean {
  return clock.hour >= REMINDER_HOURS.quietFrom || clock.hour < REMINDER_HOURS.quietTo;
}

/** A shortfall, by its account and its first short day only: never an amount (D564). */
export interface ShortfallMark {
  readonly accountId: string;
  readonly date: string;
}

export interface DueReminder {
  readonly kind: ReminderKind;
  /**
   * What makes it once only, with its kind: the payday, tomorrow's date for
   * the evening one, the Monday for the weekly one, and today for a
   * shortfall, so there's one a day at most. Dates only.
   */
  readonly key: string;
  /** The words, with the amounts or without (D561). */
  readonly text: string;
  /** For a shortfall, which one it's about, so it's known from then on. */
  readonly shortfall?: ShortfallMark;
}

export interface RemindersInput {
  /** The plan as the person's own phone reads it from the account (D564). */
  readonly records: PlanRecords;
  /** Now, a UTC time such as "2026-10-31T19:00:00Z". */
  readonly now: string;
  readonly choices: ReminderChoices;
  /** The shortfalls the person has been told about already: accounts and dates only. */
  readonly knownShortfalls: readonly ShortfallMark[];
}

export interface RemindersNow {
  /** What's due now, at most one of each kind. */
  readonly due: readonly DueReminder[];
  /**
   * The shortfalls still to be known as told about: those known already
   * that are still there. A new one is added once its warning has gone.
   * One that's gone away is forgotten, so if it comes back it's new again.
   */
  readonly stillKnown: readonly ShortfallMark[];
}

const sameMark = (a: ShortfallMark, b: ShortfallMark) =>
  a.accountId === b.accountId && a.date === b.date;

const nextDay = (date: string, count = 1) => formatDate(addDays(parseDate(date), count));

/**
 * Money going out, as Coming up lists it (D565): payments, pay-later bills
 * and budgets leaving an account, but not money moved between the person's
 * own accounts (a transfer, money set aside, or a private transfer whose two
 * halves they both see), nor anything ticked as gone already.
 */
function goesOut(row: PlanRow, bothHalves: ReadonlySet<string>): boolean {
  if (row.flow !== 'out' || row.change >= 0 || row.ticked || row.atStart) return false;
  if (row.kind !== 'payment' && row.kind !== 'bill' && row.kind !== 'budget') return false;
  return row.kind !== 'payment' || !bothHalves.has(row.payment.seriesId);
}

/** The series of private transfers whose two halves this person sees: a move between their own accounts. */
function halvesSeen(records: PlanRecords): Set<string> {
  const ids = new Set(records.series.map((one) => one.id));
  const both = new Set<string>();
  for (const one of records.series) {
    if (one.mirrorOf !== undefined && ids.has(one.mirrorOf)) {
      both.add(one.id);
      both.add(one.mirrorOf);
    }
  }
  return both;
}

/** Works out which reminders are due now, with their words. */
export function workOutReminders(input: RemindersInput): RemindersNow {
  const { records, choices } = input;
  const clock = ukClock(input.now);
  const today = clock.date;
  const open = records.accounts.filter((one) => one.closed !== true);
  if (open.length === 0 || !Object.values({ ...choices, hideAmounts: false }).some(Boolean)) {
    return { due: [], stillKnown: [] };
  }
  const plan = workOutHomePlan(records, today);
  const homeId = homeAccountId(records);
  const hide = choices.hideAmounts;
  const words = strings.reminders.notification;
  const money = (pence: number) => formatMoney(pence);
  const day = (date: string) => formatDay(date, today);
  const nameOf = (accountId: string) =>
    plan.accounts.find((one) => one.account.id === accountId)?.account.name ?? '';

  // Every shortfall there is now, from today on, 12 months ahead: its account
  // and first short day (D82).
  const shortfallsNow = plan.accounts
    .filter((one) => one.account.closed !== true)
    .flatMap((one) =>
      one.shortfalls.map((short) => ({
        accountId: one.account.id,
        date: short.date,
        amount: short.amount,
      })),
    );
  const stillKnown = choices.shortfall
    ? input.knownShortfalls.filter((known) => shortfallsNow.some((now) => sameMark(now, known)))
    : [];

  const due: DueReminder[] = [];
  if (isQuiet(clock)) return { due, stillKnown };
  const bothHalves = halvesSeen(records);

  // Payday, at 9am (D560): the person's own main pay coming in today, while
  // it isn't ticked and the balance hasn't been updated today already.
  if (choices.payday && clock.hour >= REMINDER_HOURS.payday && isPayday(records, today)) {
    due.push({ kind: 'payday', key: today, text: words.payday });
  }

  // The evening before money goes out, at 7pm (D560, D565).
  if (choices.evening && clock.hour >= REMINDER_HOURS.evening) {
    const tomorrow = nextDay(today);
    const out = plan.accounts
      .flatMap((one) => one.rows)
      .filter((row) => row.date === tomorrow && goesOut(row, bothHalves))
      // A budget spread across the days leaves a little every day: it isn't
      // named every evening, though what it leaves is in the figure (D566).
      .filter((row) => row.kind !== 'budget' || !isSpread(records, row.budgetId));
    const biggest = out.reduce<PlanRow | undefined>(
      (most, row) => (most === undefined || row.change < most.change ? row : most),
      undefined,
    );
    if (biggest !== undefined) {
      const name = biggest.payment.name;
      const first = out.length === 1 ? words.goesOut(name) : words.goOut(name, out.length - 1);
      let text = first;
      if (!hide) {
        text = `${first} ${leftWords(biggest.accountId, tomorrow)}`;
      }
      due.push({ kind: 'evening', key: tomorrow, text });
    }
  }

  // A shortfall (D560, D565): a new one, at any time outside quiet hours,
  // or, from 9am, one that starts tomorrow. One a day at most: the earliest.
  if (choices.shortfall) {
    const tomorrow = nextDay(today);
    const candidates = shortfallsNow.filter(
      (short) =>
        !stillKnown.some((known) => sameMark(known, short)) ||
        (clock.hour >= REMINDER_HOURS.shortfallDayBefore && short.date === tomorrow),
    );
    const first = [...candidates].sort(
      (a, b) =>
        (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
        Number(b.accountId === homeId) - Number(a.accountId === homeId),
    )[0];
    if (first !== undefined) {
      const date = day(first.date);
      const home = first.accountId === homeId;
      const text = hide
        ? home
          ? words.shortHidden(date)
          : words.accountShortHidden(nameOf(first.accountId), date)
        : home
          ? words.short(money(first.amount), date)
          : words.accountShort(nameOf(first.accountId), money(first.amount), date);
      due.push({
        kind: 'shortfall',
        key: today,
        text,
        shortfall: { accountId: first.accountId, date: first.date },
      });
    }
  }

  // The weekly summary, on Sundays at 6pm (D560, D565): Monday to Sunday,
  // every account the person can see, a budget spread across the days
  // counted once, as Coming up lists it; then Home's lowest point ahead.
  if (
    choices.weekly &&
    weekday(parseDate(today)) === SUNDAY &&
    clock.hour >= REMINDER_HOURS.weekly
  ) {
    const monday = nextDay(today);
    const sunday = nextDay(today, 7);
    const rows = plan.accounts
      .flatMap((one) => one.rows)
      .filter((row) => row.date >= monday && row.date <= sunday && goesOut(row, bothHalves));
    const spreadSeen = new Set<string>();
    let count = 0;
    let total = 0;
    for (const row of rows) {
      total -= row.change;
      if (row.kind === 'budget' && row.budgetId !== null && isSpread(records, row.budgetId)) {
        const key = `${row.accountId}|${row.budgetId}`;
        if (spreadSeen.has(key)) continue;
        spreadSeen.add(key);
      }
      count += 1;
    }
    const home = plan.accounts.find((one) => one.account.id === homeId);
    const lowest = home?.lowestPoint;
    const week = hide ? words.weekHidden(count) : words.week(count, money(total));
    const low =
      lowest === undefined
        ? ''
        : hide
          ? ` ${words.lowestHidden(day(lowest.date))}`
          : ` ${words.lowest(money(lowest.balance), day(lowest.date))}`;
    due.push({ kind: 'weekly', key: monday, text: `${week}${low}` });
  }

  return { due, stillKnown };

  /**
   * "You'll have £4.53 left until Friday" (D565): the lowest the account
   * goes, at the end of any day from tomorrow to the day before the next
   * main payday after tomorrow. When it's short, the first short day.
   */
  function leftWords(accountId: string, tomorrow: string): string {
    const account = plan.accounts.find((one) => one.account.id === accountId);
    if (account === undefined) return '';
    const payday = plan.mainPaydays.find((date) => date > tomorrow) ?? null;
    const lastDay = payday === null ? tomorrow : nextDay(payday, -1);
    const days = account.days.filter((one) => one.date >= tomorrow && one.date <= lastDay);
    const short = days.find((one) => one.balance < account.floor);
    const home = accountId === homeId;
    const name = account.account.name ?? '';
    if (short !== undefined) {
      const amount = money(account.floor - short.balance);
      return home
        ? words.short(amount, day(short.date))
        : words.accountShort(name, amount, day(short.date));
    }
    const lowest = days.reduce<(typeof days)[number] | undefined>(
      (low, one) => (low === undefined || one.balance < low.balance ? one : low),
      undefined,
    );
    if (lowest === undefined) return '';
    const amount = money(lowest.balance);
    if (payday === null) {
      return home ? words.left(amount) : words.accountLeft(name, amount);
    }
    // The day's name within a week of tomorrow, otherwise the date (D565).
    const until = parseDate(payday) - parseDate(tomorrow) <= 6 ? weekdayName(payday) : day(payday);
    return home ? words.leftUntil(amount, until) : words.accountLeftUntil(name, amount, until);
  }
}

function isSpread(records: PlanRecords, budgetId: string | null): boolean {
  return (records.budgets ?? []).some((one) => one.id === budgetId && one.leaves === 'spread');
}

/**
 * Whether today is the person's payday: their own main pay (D14) comes in
 * today, isn't ticked, and the balance of the account it comes into hasn't
 * been updated today already.
 */
function isPayday(records: PlanRecords, today: string): boolean {
  const family = records.settings?.mainPayFamilyId ?? null;
  if (family === null) return false;
  const pay = workOutPayments({
    series: records.series.filter((one) => one.familyId === family),
    changes: records.changes ?? [],
    payAdjustments: records.payAdjustments ?? [],
    holidays: holidaysOf(records),
    from: today,
    to: today,
  }).filter((one) => !one.skipped && one.date === today && one.direction === 'in');
  if (pay.length === 0) return false;
  const ticks = records.ticks ?? [];
  const waiting = pay.filter(
    (one) =>
      !ticks.some(
        (tick) =>
          tick.seriesId === one.seriesId &&
          tick.originalDate === one.originalDate &&
          tick.setAside !== true,
      ),
  );
  if (waiting.length === 0) return false;
  return !waiting.every((one) =>
    records.balanceUpdates.some(
      (update) => update.accountId === one.accountId && update.checkedOn === today,
    ),
  );
}
