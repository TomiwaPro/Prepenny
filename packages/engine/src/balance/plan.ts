import {
  type BudgetRow,
  billSeriesOf,
  budgetPlanOf,
  type WorkedBudget,
  workOutBudget,
} from '../budgets/budgets.ts';
import {
  type CheckedBudget,
  type CheckedSpend,
  checkBudgets,
  checkSpends,
} from '../budgets/check.ts';
import { budgetPay } from '../budgets/periods.ts';
import type { BudgetBill } from '../budgets/types.ts';
import { addDays, type Day, formatDate, parseDate } from '../dates/day.ts';
import { type Moment, parseTime } from '../dates/time.ts';
import {
  type BankHolidayLookup,
  LONGEST_RUN_WITHOUT_A_WORKING_DAY,
} from '../dates/working-days.ts';
import { type CheckedDebt, checkDebtLinks, checkDebts } from '../debts/check.ts';
import type { Debt } from '../debts/types.ts';
import { EngineInputError } from '../errors.ts';
import { type CheckedGoal, checkGoalLinks, checkGoals } from '../goals/goals.ts';
import { type Decimal, divideRounded, parseDecimal, powerOfTen } from '../money/decimal.ts';
import { checkPence, checkPenceNotNegative, type Pence, penceFromBigInt } from '../money/pence.ts';
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
import type { Payment, Series, SetAside } from '../schedule/types.ts';
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
  type LeftToSpend,
  type PayLaterLeft,
  type Plan,
  type PlanInput,
  type PlanRow,
  type RowKind,
} from './types.ts';

/**
 * Something that moves money in the plan: a payment, a pay-later bill, a
 * set-aside, part of a budget leaving, or a spend (see `RowKind`).
 */
interface Movement {
  readonly kind: RowKind;
  readonly payment: PaymentOnDays;
  readonly familyCreatedAt: Moment;
  readonly familyId: string;
  /** On the same day, inside one budget: its spends first, then the budget row. */
  readonly within: number;
  /** A payment's, bill's or set-aside's tick, if it has one. */
  readonly tick: CheckedTick | null;
  /** A spend's time, compared with each account's balance update (D2, D33). */
  readonly recordedAt: Moment | null;
  readonly budgetId: string | null;
  readonly spendId: string | null;
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
  bills: readonly Series[],
): { prepared: PreparedSeries[]; familyTimes: Map<string, Moment> } {
  if (!Array.isArray(input.series)) {
    throw new EngineInputError('bad-series', 'The series must be a list.');
  }
  const prepared: PreparedSeries[] = [];
  const seen = new Set<string>();
  const familyTimes = new Map<string, Moment>();
  for (const series of [...input.series, ...bills]) {
    const one = prepareSeries(series, input.holidays);
    if (seen.has(series.id)) {
      throw new EngineInputError(
        'repeated-series',
        `Series ${series.id} is listed twice, or a budget has the same id as a series.`,
      );
    }
    if (series.setAside !== undefined && !accounts.has(series.setAside.accountId)) {
      throw new EngineInputError(
        'unknown-account',
        `Series ${series.id} sets money aside to an account not in the plan.`,
      );
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
  | 'accounts'
  | 'balanceUpdates'
  | 'series'
  | 'changes'
  | 'ticks'
  | 'budgets'
  | 'spends'
  | 'goals'
  | 'holidays'
> & {
  /** The plan's debts. When they're given, every series' link to a debt is checked too (D98). */
  readonly debts?: readonly Debt[];
};

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
  /** The debts, by id. Empty when none were given. */
  readonly debts: ReadonlyMap<string, CheckedDebt>;
  /**
   * The budgets, by id. A pay-later budget's bills are a series in
   * `prepared` with the budget's id (D111). Empty when none were given.
   */
  readonly budgets: ReadonlyMap<string, CheckedBudget>;
  /** Each budget's spends. */
  readonly spends: ReadonlyMap<string, readonly CheckedSpend[]>;
  /** The goals, by id. Empty when none were given. */
  readonly goals: ReadonlyMap<string, CheckedGoal>;
}

/**
 * Checks every record of a plan the way the plan needs them: accounts, a
 * balance update for each, series, changes and ticks. Refuses anything the
 * engine can't work with (D85), with a message that holds no money data.
 */
export function checkRecords(input: RecordsToCheck, today: Day): CheckedRecords {
  const accounts = checkAccounts(input.accounts);
  const { starts, accountOfUpdate } = latestBalances(input.balanceUpdates, accounts, today);
  const budgets = checkBudgets(input.budgets ?? [], new Set(accounts.keys()));
  const spends = checkSpends(input.spends ?? [], budgets);
  const bills = [...budgets.values()].flatMap((budget) => billSeriesOf(budget) ?? []);
  const { prepared, familyTimes } = prepareAll(input, accounts, bills);
  const changes = indexChanges(input.changes ?? []);
  const ticks = indexTicks(input.ticks ?? []);
  const debts = checkDebts(input.debts ?? [], today);
  if (input.debts !== undefined) checkDebtLinks(input.series, debts);
  const goals = checkGoals(input.goals ?? []);
  if (input.goals !== undefined) {
    for (const { goal } of goals.values()) {
      if (!accounts.has(goal.accountId)) {
        throw new EngineInputError(
          'unknown-account',
          `Goal ${goal.id} is kept in an account not in the plan.`,
        );
      }
    }
    checkGoalLinks(input.series, goals);
  }
  return {
    accounts,
    starts,
    accountOfUpdate,
    prepared,
    familyTimes,
    changes,
    ticks,
    debts,
    budgets,
    spends,
    goals,
  };
}

/** The amount set aside from a payment (D64): its percentage, rounded to the nearest penny (D9). */
function setAsideAmount(amount: Pence, percent: Decimal): Pence {
  return penceFromBigInt(
    divideRounded(BigInt(amount) * percent.units, 100n * powerOfTen(percent.scale)),
    'the amount set aside',
  );
}

/**
 * The set-aside that goes with a payment of money coming in (D64, D113): a
 * transfer of the amount set aside, from the payment's account to the one
 * it's set aside in, on the same day, with the payment's tick.
 */
function setAsideOf(movement: Movement, setAside: SetAside, percent: Decimal): Movement {
  return {
    ...movement,
    kind: 'set-aside',
    payment: {
      ...movement.payment,
      direction: 'transfer',
      toAccountId: setAside.accountId,
      amount: setAsideAmount(movement.payment.amount, percent),
      type: 'savings',
    },
    withDates: null,
  };
}

/**
 * Every payment the plan could need: all of each series' payments from its
 * start to the plan's last day (unticked ones before a balance date are
 * overdue, brief 5.5), plus every ticked payment, wherever its date, because
 * a payment paid early goes on the day it was paid (D1). A pay-later bill
 * without its real amount yet is the budget's estimate (D32), and money
 * coming in brings its set-aside with it (D64).
 */
function collectPayments(
  checked: CheckedRecords,
  worked: ReadonlyMap<string, WorkedBudget>,
  to: Day,
  holidays: BankHolidayLookup,
): Movement[] {
  const { prepared, familyTimes, changes, ticks } = checked;
  const all: Movement[] = [];
  for (const one of prepared) {
    const id = one.series.id;
    let from = addDays(one.start, -LONGEST_RUN_WITHOUT_A_WORKING_DAY);
    for (const { newDay } of changes.get(id)?.values() ?? []) {
      if (newDay !== null && newDay < from) from = newDay;
    }
    const ticksOfSeries = ticks.get(id);
    const familyCreatedAt = familyTimes.get(one.series.familyId) as Moment;
    const bill = worked.get(id) ?? null;
    const setAside = one.series.setAside;
    const percent =
      setAside === undefined ? null : parseDecimal(setAside.percent, `Series ${id}: set aside`);
    const found = new Set<Day>();
    const add = (payment: PaymentOnDays) => {
      found.add(payment.originalDay);
      // A bill without its real amount yet is the budget's estimate (D32).
      const estimate =
        bill !== null && changes.get(id)?.get(payment.originalDay)?.change.amount === undefined;
      const movement: Movement = {
        kind: bill === null ? 'payment' : 'bill',
        payment: estimate
          ? { ...payment, amount: bill.billEstimate(payment.originalDay) }
          : payment,
        familyCreatedAt,
        familyId: one.series.familyId,
        within: 0,
        tick: ticksOfSeries?.get(payment.originalDay) ?? null,
        recordedAt: null,
        budgetId: bill === null ? null : id,
        spendId: null,
        withDates: null,
      };
      all.push(movement);
      if (setAside !== undefined && percent !== null) {
        all.push(setAsideOf(movement, setAside, percent));
      }
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

/** The rows a budget puts in the plan (D2, D31): parts of it leaving, and its spends. */
function budgetMovements(worked: WorkedBudget): Movement[] {
  const { budget, createdAt } = worked.checked;
  return worked.rows.map((row: BudgetRow) => ({
    kind: row.kind,
    payment: {
      seriesId: budget.id,
      number: row.period,
      originalDay: row.day,
      day: row.day,
      accountId: budget.accountId,
      toAccountId: null,
      direction: 'out',
      amount: row.amount,
      name: budget.name,
      note: (row.spend?.spend.note ?? '') || null,
      // A budget's rows count as Spending money (D28, D79).
      type: 'spending-money',
      isEstimate: false,
      isLast: false,
      movedByRule: false,
      moved: false,
      skipped: false,
      changed: false,
    },
    familyCreatedAt: createdAt,
    familyId: budget.id,
    within: row.within,
    tick: null,
    recordedAt: row.spend?.recordedAt ?? null,
    budgetId: budget.id,
    spendId: row.spend?.spend.id ?? null,
    withDates: null,
  }));
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
  readonly planned: Movement;
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
  readonly within: number;
}

/** Only payments, bills and their set-asides can be ticked (D109). */
function tickable(kind: RowKind): boolean {
  return kind === 'payment' || kind === 'bill' || kind === 'set-aside';
}

function rowFor(planned: Movement, accountId: string): { flow: Flow; change: Pence } | null {
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
  payments: readonly Movement[],
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
    let day: Day;
    if (planned.kind === 'spend') {
      // Recorded at or before the balance update: already inside the
      // balance, so ignored. Recorded after it: a row on its day, or at the
      // start when that's before the balance date (D2, D33, D109).
      if ((planned.recordedAt as Moment) <= start.at) continue;
      day = payment.day;
    } else if (planned.kind === 'budget') {
      // Worked out from today, so never inside the balance (D2, D67).
      day = payment.day;
    } else if (payment.skipped && tick === null) {
      // A removed payment moves no money, unless it was ticked: a tick says the
      // money really went, and the plan stays true to the bank (D83).
      continue;
    } else if (tick !== null) {
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
      familyId: planned.familyId,
      seriesId: payment.seriesId,
      name: payment.name,
      number: payment.number,
      within: planned.within,
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
      kind: planned.kind,
      payment: planned.withDates,
      budgetId: planned.budgetId,
      spendId: planned.spendId,
      accountId: account.id,
      date: formatDate(row.day),
      flow: row.flow,
      change: row.change,
      leftAfter: balance,
      status: statusOf(balance, account.warningLevel, floor),
      ticked: row.ticked,
      atStart,
      notTickedYet: tickable(planned.kind) && !row.ticked && row.day < today,
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
 * Left to spend until the next main payday (D3, D28, D112, D117, D118): spending
 * money still due to leave from today to the day before it, the lowest
 * end-of-day balance in that time, and the line under it.
 *
 * "Spend no more than £X" counts, for each day, only the spending money due
 * by that day: X is the smallest, over each day from today to the day before
 * the next main payday, of that day's end balance + the Left to spend due by
 * that day − the warning level, and never below 0 (D118). When that's below
 * 0 on some day, even spending nothing takes the balance under the warning
 * level, and the line says so with the first such day instead (D117).
 */
function leftToSpendOf(
  work: AccountWork,
  nextPayday: Day | null,
  today: Day,
  to: Day,
  payLater: readonly PayLaterLeft[],
): LeftToSpend | null {
  if (nextPayday === null) return null;
  const last = Math.min(addDays(nextPayday, -1), to);
  let amount = 0;
  const dueOn = new Map<Day, Pence>();
  work.rows.forEach((row, i) => {
    const day = work.rowDays[i] as Day;
    if (day < today || day > last || row.change >= 0) return;
    // Budget rows, and Spending money not ticked yet: spends already made
    // and pay-later bills aren't spending still to do (D28, D61).
    const spending =
      row.kind === 'budget' ||
      (row.kind === 'payment' && row.payment.type === 'spending-money' && !row.ticked);
    if (spending) {
      amount = checkPence(amount - row.change, 'Left to spend');
      dueOn.set(day, (dueOn.get(day) ?? 0) - row.change);
    }
  });
  const warning = work.account.warningLevel;
  let lowest = dayBalanceOf(work, today);
  // The smallest room over the days, and the first day with no room at all.
  let room: Pence | null = null;
  let underOn: Day | null = null;
  let dueSoFar = 0;
  for (let day = today; day <= last; day += 1) {
    const balance = dayBalanceOf(work, day);
    if (balance.balance < lowest.balance) lowest = balance;
    dueSoFar += dueOn.get(day) ?? 0;
    const roomThatDay = balance.balance + dueSoFar - warning;
    if (room === null || roomThatDay < room) room = roomThatDay;
    // Strictly under the warning level even spending nothing (D10).
    if (roomThatDay < 0 && underOn === null) underOn = day;
  }
  // A line only when spending it all goes under the warning level (D3, D10).
  const needsLine = lowest.balance < warning;
  return {
    until: formatDate(nextPayday),
    amount,
    lowest,
    spendNoMoreThan: needsLine && underOn === null ? Math.max(0, room ?? 0) : null,
    underEvenSpendingNothing: needsLine && underOn !== null ? formatDate(underOn) : null,
    payLater,
  };
}

/**
 * Works out the plan (ARCHITECTURE.md 2.1 and 2.4): for each account, every
 * row with "Left after this", each day's closing balance, "Not ticked yet",
 * the lowest point ahead, the first day under the warning level, each
 * shortfall with the payments that could move, what Update balance expects,
 * and Left to spend. Also each budget's spent and left, the next main
 * payday and the main paydays for plan periods.
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

  const checked = checkRecords(input, today);
  const { accounts, starts, accountOfUpdate, prepared, changes, ticks } = checked;
  const main = mainPaydaysOf(input.mainPayFamilyId, prepared, changes, input.holidays);

  // Budgets (D2, D29 to D32): their periods follow the main pay.
  const pay = budgetPay(main, input.mainPayFamilyId, prepared, today);
  const worked = new Map<string, WorkedBudget>();
  for (const [id, budget] of checked.budgets) {
    worked.set(id, workOutBudget(budget, checked.spends.get(id) ?? [], pay, today, to));
  }
  const bills = new Map([...worked].filter(([, one]) => one.checked.billDay !== null));
  const movements = [
    ...collectPayments(checked, bills, to, input.holidays),
    ...[...worked.values()].flatMap(budgetMovements),
  ];

  const works = new Map<string, AccountWork>();
  for (const account of accounts.values()) {
    const start = starts.get(account.id) as Start;
    works.set(account.id, workOutAccount(account, start, movements, accountOfUpdate, today, to));
  }

  // A pay-later bill as the budget shows it (D32, D111).
  const preparedById = new Map(prepared.map((one) => [one.series.id, one]));
  const billOf =
    (worked: WorkedBudget) =>
    (billDay: Day): BudgetBill | null => {
      const id = worked.checked.budget.id;
      const one = preparedById.get(id) as PreparedSeries;
      const index = one.firstIndexOnOrAfter(billDay);
      if (index >= one.count || one.dateAt(index) !== billDay) return null;
      const payment = paymentAtIndex(one, index, changes, input.holidays);
      const real = changes.get(id)?.get(billDay)?.change.amount !== undefined;
      return {
        originalDate: formatDate(billDay),
        date: formatDate(payment.day),
        amount: real ? payment.amount : worked.billEstimate(billDay),
        isEstimate: payment.isEstimate,
        ticked: ticks.get(id)?.has(billDay) === true,
        skipped: payment.skipped,
      };
    };
  const budgetPlans = [...worked.values()].map((one) => budgetPlanOf(one, billOf(one)));

  const nextMainPayday = main?.firstAfter(today) ?? null;
  const accountPlans: AccountPlan[] = [...works.values()].map((work) => {
    const { lowestPoint, firstUnderWarning } = lowestAndFirstUnder(work, today);
    const payLater: PayLaterLeft[] = budgetPlans.flatMap(({ budget, current }) =>
      budget.leaves === 'pay-later' && budget.accountId === work.account.id && current !== null
        ? [{ budgetId: budget.id, left: current.left, until: current.end }]
        : [],
    );
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
      leftToSpend: leftToSpendOf(work, nextMainPayday, today, to, payLater),
    };
  });

  return {
    today: formatDate(today),
    to: formatDate(to),
    mainPay: main === null ? 'none' : main.kind,
    nextMainPayday: nextMainPayday === null ? null : formatDate(nextMainPayday),
    mainPaydays: mainPaydayList(main, today, to).map(formatDate),
    accounts: accountPlans,
    budgets: budgetPlans,
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
