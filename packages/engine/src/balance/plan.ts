import { addDays, type Day, formatDate, parseDate } from '../dates/day.ts';
import { type Moment, parseTime } from '../dates/time.ts';
import {
  type BankHolidayLookup,
  LONGEST_RUN_WITHOUT_A_WORKING_DAY,
} from '../dates/working-days.ts';
import { EngineInputError } from '../errors.ts';
import { checkPence, checkPenceNotNegative, type Pence } from '../money/pence.ts';
import { type MainPaydays, mainPaydaysOf } from '../periods/main-pay.ts';
import {
  type ChangeIndex,
  indexChanges,
  type PaymentOnDays,
  paymentAtIndex,
  paymentsOfSeriesBetween,
  paymentWithDates,
} from '../schedule/payments.ts';
import { markFamilies, type PreparedSeries, prepareSeries } from '../schedule/series.ts';
import type { Payment } from '../schedule/types.ts';
import { compareRows } from './order.ts';
import { findShortfalls, lowestAndFirstUnder, statusOf } from './shortfalls.ts';
import { type CheckedTick, indexTicks, type TickIndex } from './ticks.ts';
import {
  ACCOUNT_KINDS,
  type Account,
  type AccountPlan,
  type BalanceUpdate,
  type DayBalance,
  type Flow,
  type Plan,
  type PlanInput,
  type PlanRow,
} from './types.ts';

/** A payment the plan looks at, with its tick if it has one. */
interface PlannedPayment {
  readonly payment: PaymentOnDays;
  readonly prepared: PreparedSeries;
  readonly familyCreatedAt: Moment;
  readonly tick: CheckedTick | null;
  /** Written out once, and shared by both rows of a transfer. */
  withDates: Payment | null;
}

/** Where an account starts: its latest balance update (brief 5.5, D33). */
export interface Start {
  readonly update: BalanceUpdate;
  readonly day: Day;
  readonly at: Moment;
}

/** One account's rows and days, with day numbers for the engine's own use. */
export interface AccountWork {
  readonly account: Account;
  readonly floor: Pence;
  readonly start: Start;
  readonly rows: PlanRow[];
  /** The day number of each row in `rows`. */
  readonly rowDays: Day[];
  /** `days[i]` is the end of day `start.day + i`. */
  readonly days: DayBalance[];
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function checkAccounts(accounts: readonly Account[]): Map<string, Account> {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new EngineInputError('bad-account', 'The plan needs at least one account.');
  }
  const byId = new Map<string, Account>();
  accounts.forEach((account, i) => {
    if (!isNonEmptyText(account?.id)) {
      throw new EngineInputError('bad-account', `Account ${i + 1} needs an id.`);
    }
    const what = `Account ${account.id}`;
    if (byId.has(account.id)) {
      throw new EngineInputError('repeated-account', `${what} is listed twice.`);
    }
    if (!(ACCOUNT_KINDS as readonly unknown[]).includes(account.kind)) {
      throw new EngineInputError(
        'bad-account',
        `${what}: the kind must be one of ${ACCOUNT_KINDS.join(', ')}.`,
      );
    }
    checkPenceNotNegative(account.overdraftLimit, `${what}: the overdraft limit`);
    checkPence(account.warningLevel, `${what}: the warning level`);
    byId.set(account.id, account);
  });
  return byId;
}

/** The latest balance update for each account, by time (D33). */
function latestBalances(
  updates: readonly BalanceUpdate[],
  accounts: ReadonlyMap<string, Account>,
  today: Day,
): { starts: Map<string, Start>; accountOfUpdate: Map<string, string> } {
  if (!Array.isArray(updates)) {
    throw new EngineInputError('bad-balance', 'The balance updates must be a list.');
  }
  const starts = new Map<string, Start>();
  const accountOfUpdate = new Map<string, string>();
  updates.forEach((update, i) => {
    if (!isNonEmptyText(update?.id)) {
      throw new EngineInputError('bad-balance', `Balance update ${i + 1} needs an id.`);
    }
    const what = `Balance update ${update.id}`;
    if (accountOfUpdate.has(update.id)) {
      throw new EngineInputError('repeated-balance', `${what} is listed twice.`);
    }
    if (!accounts.has(update.accountId)) {
      throw new EngineInputError('unknown-account', `${what} is for an account not in the plan.`);
    }
    checkPence(update.balance, `${what}: the balance`);
    const day = parseDate(update.checkedOn, `${what}: the balance date`);
    if (day > today) {
      throw new EngineInputError(
        'balance-after-today',
        `${what}: the balance date is after today.`,
      );
    }
    const at = parseTime(update.checkedAt, `${what}: when it was made`);
    accountOfUpdate.set(update.id, update.accountId);
    const latest = starts.get(update.accountId);
    if (latest !== undefined && latest.at === at) {
      throw new EngineInputError(
        'same-time-balances',
        `${what}: account ${update.accountId} has two balance updates at the same time.`,
      );
    }
    if (latest === undefined || at > latest.at) {
      starts.set(update.accountId, { update, day, at });
    }
  });
  for (const id of accounts.keys()) {
    if (!starts.has(id)) {
      throw new EngineInputError('no-balance', `Account ${id} has no balance update.`);
    }
  }
  return { starts, accountOfUpdate };
}

function prepareAll(
  input: RecordsToCheck,
  accounts: ReadonlyMap<string, Account>,
): { prepared: PreparedSeries[]; familyTimes: Map<string, Moment> } {
  if (!Array.isArray(input.series)) {
    throw new EngineInputError('bad-series', 'The series must be a list.');
  }
  const prepared: PreparedSeries[] = [];
  const seen = new Set<string>();
  const familyTimes = new Map<string, Moment>();
  for (const series of input.series) {
    const one = prepareSeries(series, input.holidays);
    if (seen.has(series.id)) {
      throw new EngineInputError('repeated-series', `Series ${series.id} is listed twice.`);
    }
    seen.add(series.id);
    if (!accounts.has(series.accountId)) {
      throw new EngineInputError(
        'unknown-account',
        `Series ${series.id} is for an account not in the plan.`,
      );
    }
    if (series.toAccountId !== undefined && !accounts.has(series.toAccountId)) {
      throw new EngineInputError(
        'unknown-account',
        `Series ${series.id} goes to an account not in the plan.`,
      );
    }
    const created = parseTime(series.familyCreatedAt, `Series ${series.id}: family time`);
    const known = familyTimes.get(series.familyId);
    if (known !== undefined && known !== created) {
      throw new EngineInputError(
        'family-times-differ',
        `Series ${series.id}: family ${series.familyId} has two different creation times.`,
      );
    }
    familyTimes.set(series.familyId, created);
    prepared.push(one);
  }
  return { prepared: markFamilies(prepared), familyTimes };
}

/** The stored records of a plan, and what's needed to check them. */
export type RecordsToCheck = Pick<
  PlanInput,
  'accounts' | 'balanceUpdates' | 'series' | 'changes' | 'ticks' | 'holidays'
>;

/** A plan's records, checked and ready to work with. */
export interface CheckedRecords {
  readonly accounts: ReadonlyMap<string, Account>;
  /** Each account's latest balance update. */
  readonly starts: ReadonlyMap<string, Start>;
  /** The account of every balance update, by its id. */
  readonly accountOfUpdate: ReadonlyMap<string, string>;
  /** Every series, prepared, with its family marked (D49). */
  readonly prepared: readonly PreparedSeries[];
  readonly familyTimes: ReadonlyMap<string, Moment>;
  readonly changes: ChangeIndex;
  readonly ticks: TickIndex;
}

/**
 * Checks every record of a plan the way the plan needs them: accounts, a
 * balance update for each, series, changes and ticks. Refuses anything the
 * engine can't work with (D85), with a message that holds no money data.
 */
export function checkRecords(input: RecordsToCheck, today: Day): CheckedRecords {
  const accounts = checkAccounts(input.accounts);
  const { starts, accountOfUpdate } = latestBalances(input.balanceUpdates, accounts, today);
  const { prepared, familyTimes } = prepareAll(input, accounts);
  const changes = indexChanges(input.changes ?? []);
  const ticks = indexTicks(input.ticks ?? []);
  return { accounts, starts, accountOfUpdate, prepared, familyTimes, changes, ticks };
}

/**
 * Every payment the plan could need: all of each series' payments from its
 * start to the plan's last day (unticked ones before a balance date are
 * overdue, brief 5.5), plus every ticked payment, wherever its date, because
 * a payment paid early goes on the day it was paid (D1).
 */
function collectPayments(
  prepared: readonly PreparedSeries[],
  familyTimes: ReadonlyMap<string, Moment>,
  changes: ChangeIndex,
  ticks: TickIndex,
  to: Day,
  holidays: BankHolidayLookup,
): PlannedPayment[] {
  const all: PlannedPayment[] = [];
  for (const one of prepared) {
    const id = one.series.id;
    let from = addDays(one.start, -LONGEST_RUN_WITHOUT_A_WORKING_DAY);
    for (const { newDay } of changes.get(id)?.values() ?? []) {
      if (newDay !== null && newDay < from) from = newDay;
    }
    const ticksOfSeries = ticks.get(id);
    const familyCreatedAt = familyTimes.get(one.series.familyId) as Moment;
    const found = new Set<Day>();
    const add = (payment: PaymentOnDays) => {
      found.add(payment.originalDay);
      all.push({
        payment,
        prepared: one,
        familyCreatedAt,
        tick: ticksOfSeries?.get(payment.originalDay) ?? null,
        withDates: null,
      });
    };
    if (from <= to) {
      for (const payment of paymentsOfSeriesBetween(one, from, to, changes, holidays)) {
        add(payment);
      }
    }
    // Ticked payments dated after the plan's last day.
    for (const originalDay of ticksOfSeries?.keys() ?? []) {
      if (found.has(originalDay)) continue;
      const index = one.firstIndexOnOrAfter(originalDay);
      if (index < one.count && one.dateAt(index) === originalDay) {
        add(paymentAtIndex(one, index, changes, holidays));
      }
      // A tick on a date that isn't one of the series' payments is ignored.
    }
  }
  return all;
}

/** True when a tick is already inside the account's latest balance (brief 5.5, D33, D83). */
function insideBalance(
  tick: CheckedTick,
  accountId: string,
  start: Start,
  accountOfUpdate: ReadonlyMap<string, string>,
): boolean {
  if (tick.tickedAt <= start.at) return true;
  // Ticked inside the steps of one of this account's updates: before that
  // update, so before the latest one too.
  return tick.inBalanceUpdate !== null && accountOfUpdate.get(tick.inBalanceUpdate) === accountId;
}

interface WorkingRow {
  readonly planned: PlannedPayment;
  readonly day: Day;
  readonly flow: Flow;
  readonly change: Pence;
  readonly ticked: boolean;
  // For the same-day order (D12).
  readonly familyCreatedAt: Moment;
  readonly familyId: string;
  readonly seriesId: string;
  readonly name: string;
  readonly number: number;
}

function rowFor(planned: PlannedPayment, accountId: string): { flow: Flow; change: Pence } | null {
  const { payment } = planned;
  if (payment.accountId === accountId) {
    switch (payment.direction) {
      case 'in':
        return { flow: 'in', change: payment.amount };
      case 'out':
        return { flow: 'out', change: -payment.amount };
      case 'transfer':
        return { flow: 'transfer-out', change: -payment.amount };
    }
  }
  if (payment.direction === 'transfer' && payment.toAccountId === accountId) {
    return { flow: 'transfer-in', change: payment.amount };
  }
  return null;
}

/** The balance rule for one account (brief 5.5, ARCHITECTURE.md 2.4). */
function workOutAccount(
  account: Account,
  start: Start,
  payments: readonly PlannedPayment[],
  accountOfUpdate: ReadonlyMap<string, string>,
  today: Day,
  to: Day,
): AccountWork {
  const floor = -account.overdraftLimit;
  const working: WorkingRow[] = [];

  for (const planned of payments) {
    const effect = rowFor(planned, account.id);
    if (effect === null) continue;
    const { payment, tick } = planned;
    // A removed payment moves no money, unless it was ticked: a tick says the
    // money really went, and the plan stays true to the bank (D83).
    if (payment.skipped && tick === null) continue;
    let day: Day;
    if (tick !== null) {
      // 1. Ticked at or before the balance update, or inside its steps:
      //    already inside the balance, so ignored (brief 5.5, D1, D33).
      if (insideBalance(tick, account.id, start, accountOfUpdate)) continue;
      // Ticked after it: goes out on its paid date (D1, D71). Before the
      // balance date, that's at the start, with the overdue payments (D39).
      day = tick.paidOn;
    } else {
      day = payment.day;
    }
    if (day > to) continue;
    working.push({
      planned,
      day,
      flow: effect.flow,
      change: effect.change,
      ticked: tick !== null,
      familyCreatedAt: planned.familyCreatedAt,
      familyId: planned.prepared.series.familyId,
      seriesId: payment.seriesId,
      name: payment.name,
      number: payment.number,
    });
  }

  // 2 and 3. Everything dated before the balance date first, oldest first,
  // then from the balance date on, in date order and the same-day order (D12).
  working.sort(compareRows);

  const rows: PlanRow[] = [];
  const rowDays: Day[] = [];
  const days: DayBalance[] = [];
  let balance = start.update.balance;
  let last: PlanRow | null = null;
  let next = 0;

  // 4. The balance after every row.
  const apply = (row: WorkingRow, atStart: boolean) => {
    balance += row.change;
    if (!Number.isSafeInteger(balance)) {
      throw new EngineInputError('too-large', `Account ${account.id}: the balance is too large.`);
    }
    const planned = row.planned;
    planned.withDates ??= paymentWithDates(planned.payment);
    const planRow: PlanRow = {
      payment: planned.withDates,
      accountId: account.id,
      date: formatDate(row.day),
      flow: row.flow,
      change: row.change,
      leftAfter: balance,
      status: statusOf(balance, account.warningLevel, floor),
      ticked: row.ticked,
      atStart,
      notTickedYet: !row.ticked && row.day < today,
    };
    rows.push(planRow);
    rowDays.push(row.day);
    last = planRow;
  };

  while (next < working.length && (working[next] as WorkingRow).day < start.day) {
    apply(working[next] as WorkingRow, true);
    next += 1;
  }
  for (let day = start.day; day <= to; day += 1) {
    while (next < working.length && (working[next] as WorkingRow).day === day) {
      apply(working[next] as WorkingRow, false);
      next += 1;
    }
    // The day's figure is the balance after its last row.
    days.push({
      date: formatDate(day),
      balance,
      status: statusOf(balance, account.warningLevel, floor),
      after: last,
    });
  }

  return { account, floor, start, rows, rowDays, days };
}

/** The end-of-day balance of an account on a day it covers. */
export function dayBalanceOf(work: AccountWork, day: Day): DayBalance {
  const found = work.days[day - work.start.day];
  if (found === undefined) {
    throw new EngineInputError(
      'outside-plan',
      `Account ${work.account.id}: that day isn't in the plan.`,
    );
  }
  return found;
}

function mainPaydayList(main: MainPaydays | null, today: Day, to: Day): Day[] {
  if (main === null) return [];
  const from = main.lastOnOrBefore(today) ?? today;
  const until = main.firstAfter(to) ?? to;
  return main.between(from, until);
}

/**
 * Works out the plan (ARCHITECTURE.md 2.1 and 2.4): for each account, every
 * row with "Left after this", each day's closing balance, "Not ticked yet",
 * the lowest point ahead, the first day under the warning level, each
 * shortfall with the payments that could move, and what Update balance
 * expects. Also the next main payday and the main paydays for plan periods.
 *
 * Pure: the same input always gives the same plan, and nothing is read from
 * a clock. "today" and "to" are passed in.
 */
export function workOutPlan(input: PlanInput): Plan {
  const today = parseDate(input.today, 'today');
  const to = parseDate(input.to, 'to');
  if (to < today) {
    throw new EngineInputError('bad-window', '"to" must be on or after today.');
  }
  if (input.mainPayFamilyId !== null && !isNonEmptyText(input.mainPayFamilyId)) {
    throw new EngineInputError('bad-main-pay', 'The main pay must be a family id, or null.');
  }

  const { accounts, starts, accountOfUpdate, prepared, familyTimes, changes, ticks } = checkRecords(
    input,
    today,
  );
  const payments = collectPayments(prepared, familyTimes, changes, ticks, to, input.holidays);
  const main = mainPaydaysOf(input.mainPayFamilyId, prepared, changes, input.holidays);

  const works = new Map<string, AccountWork>();
  for (const account of accounts.values()) {
    const start = starts.get(account.id) as Start;
    works.set(account.id, workOutAccount(account, start, payments, accountOfUpdate, today, to));
  }

  const accountPlans: AccountPlan[] = [...works.values()].map((work) => {
    const { lowestPoint, firstUnderWarning } = lowestAndFirstUnder(work, today);
    return {
      account: work.account,
      floor: work.floor,
      start: work.start.update,
      rows: work.rows,
      days: work.days,
      notTickedYet: work.rows.filter((row) => row.notTickedYet),
      expected: dayBalanceOf(work, today).balance,
      lowestPoint,
      firstUnderWarning,
      shortfalls: findShortfalls(work, works, main, today, to),
    };
  });

  const nextMainPayday = main?.firstAfter(today) ?? null;
  return {
    today: formatDate(today),
    to: formatDate(to),
    mainPay: main === null ? 'none' : main.kind,
    nextMainPayday: nextMainPayday === null ? null : formatDate(nextMainPayday),
    mainPaydays: mainPaydayList(main, today, to).map(formatDate),
    accounts: accountPlans,
  };
}

/** An account's balance at the end of a day the plan covers, "YYYY-MM-DD". */
export function balanceAtEndOf(account: AccountPlan, date: string): Pence {
  const day = parseDate(date, 'date');
  const found = account.days[day - parseDate(account.start.checkedOn)];
  if (found === undefined) {
    throw new EngineInputError(
      'outside-plan',
      `Account ${account.account.id}: ${date} isn't in the plan.`,
    );
  }
  return found.balance;
}
