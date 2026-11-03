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
import { NATIONS } from '../dates/bank-holiday-rules.ts';
import {
  addDays,
  type Day,
  formatDate,
  lastDayOfMonth,
  parseDate,
  partsOfDay,
} from '../dates/day.ts';
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
import { type CheckedPay, checkPay } from '../pay/records.ts';
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
import type { Payment, Series } from '../schedule/types.ts';
import { compareSameDay, type SameDayRow } from './order.ts';
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
  type PlanSettings,
  type RowKind,
} from './types.ts';

/**
 * What every row of one series, one set-aside or one budget row shares, kept
 * once instead of on each row, so the plan holds less while it works
 * (ARCHITECTURE.md 2.8).
 */
interface Source {
  readonly kind: RowKind;
  /**
   * How it moves money for the account it leaves or arrives in. A transfer
   * is `transfer-out` here; for the same-day order only the group counts.
   */
  readonly flow: Flow;
  readonly accountId: string;
  /** For a transfer or a set-aside: the account it arrives in. */
  readonly toAccountId: string | null;
  readonly familyCreatedAt: Moment;
  readonly familyId: string;
  readonly seriesId: string;
  /** On the same day, inside one budget: its spends first, then the budget row. */
  readonly within: number;
  /** A spend's time, compared with each account's balance update (D2, D33). */
  readonly recordedAt: Moment | null;
  readonly budgetId: string | null;
  readonly spendId: string | null;
}

/**
 * Something that moves money in the plan: a payment, a pay-later bill, a
 * set-aside, part of a budget leaving, or a spend (see `RowKind`).
 */
class Movement implements SameDayRow {
  readonly source: Source;
  /** The payment as the plan shows it, written out once and shared by both rows of a transfer. */
  readonly payment: Payment;
  /** When it's due, as a day number: the payment's `date`. */
  readonly day: Day;
  readonly amount: Pence;
  readonly skipped: boolean;
  /** A payment's, bill's or set-aside's tick, if it has one. */
  readonly tick: CheckedTick | null;
  readonly name: string;
  readonly number: number;

  constructor(
    source: Source,
    payment: Payment,
    day: Day,
    amount: Pence,
    skipped: boolean,
    tick: CheckedTick | null,
    name: string,
    number: number,
  ) {
    this.source = source;
    this.payment = payment;
    this.day = day;
    this.amount = amount;
    this.skipped = skipped;
    this.tick = tick;
    this.name = name;
    this.number = number;
  }

  get kind(): RowKind {
    return this.source.kind;
  }
  get flow(): Flow {
    return this.source.flow;
  }
  get familyCreatedAt(): Moment {
    return this.source.familyCreatedAt;
  }
  get familyId(): string {
    return this.source.familyId;
  }
  get seriesId(): string {
    return this.source.seriesId;
  }
  get within(): number {
    return this.source.within;
  }
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
    if (account.name !== undefined && typeof account.name !== 'string') {
      throw new EngineInputError('bad-account', `${what}: its name must be text.`);
    }
    if (account.closed !== undefined && typeof account.closed !== 'boolean') {
      throw new EngineInputError('bad-account', `${what}: closed must be true or false.`);
    }
    byId.set(account.id, account);
  });
  return byId;
}

/**
 * Checks the plan's settings (D155): a nation, and the main pay as a family
 * id or none. A main pay with no series left counts as none (D85).
 */
function checkPlanSettings(settings: PlanSettings): void {
  if (settings === null || typeof settings !== 'object') {
    throw new EngineInputError('bad-settings', 'The plan settings must be a record.');
  }
  if (!(NATIONS as readonly unknown[]).includes(settings.nation)) {
    throw new EngineInputError(
      'bad-nation',
      'The nation must be england-and-wales, scotland or northern-ireland.',
    );
  }
  if (settings.mainPayFamilyId !== null && !isNonEmptyText(settings.mainPayFamilyId)) {
    throw new EngineInputError('bad-main-pay', 'The main pay must be a family id, or null.');
  }
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
  // Every moment each account has an update at: two at the same moment are
  // refused, whatever order they come in (D85).
  const moments = new Map<string, Set<Moment>>();
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
    const seen = moments.get(update.accountId) ?? new Set<Moment>();
    if (seen.has(at)) {
      throw new EngineInputError(
        'same-time-balances',
        `${what}: account ${update.accountId} has two balance updates at the same time.`,
      );
    }
    seen.add(at);
    moments.set(update.accountId, seen);
    const latest = starts.get(update.accountId);
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
  | 'payProfiles'
  | 'payWeeks'
  | 'payAdjustments'
  | 'holidays'
> & {
  /** The plan's debts. When they're given, every series' link to a debt is checked too (D98). */
  readonly debts?: readonly Debt[];
  /** The plan's nation and main pay (D155), when they've been chosen. */
  readonly settings?: PlanSettings;
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
  /** The payments' own ticks. */
  readonly ticks: TickIndex;
  /** The ticks for money set aside, kept apart from the payments' own (D116). */
  readonly setAsideTicks: TickIndex;
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
  /** Pay profiles, pay weeks and pay adjustments, with each payday's adjustments added up (D123). */
  readonly pay: CheckedPay;
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
  const setAsideTicks = indexTicks(input.ticks ?? [], 'set-aside');
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
  const pay = checkPay(input, input.series);
  if (input.settings !== undefined) checkPlanSettings(input.settings);
  return {
    accounts,
    starts,
    accountOfUpdate,
    prepared,
    familyTimes,
    changes,
    ticks,
    setAsideTicks,
    debts,
    budgets,
    spends,
    goals,
    pay,
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
 * it's set aside in, on the same day. It has a tick of its own (D116).
 */
function setAsideOf(
  movement: Movement,
  source: Source,
  percent: Decimal,
  tick: CheckedTick | null,
): Movement {
  const amount = setAsideAmount(movement.amount, percent);
  return new Movement(
    source,
    {
      ...movement.payment,
      direction: 'transfer',
      toAccountId: source.toAccountId,
      amount,
      type: 'savings',
    },
    movement.day,
    amount,
    movement.skipped,
    tick,
    movement.name,
    movement.number,
  );
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
  const { prepared, familyTimes, changes, ticks, setAsideTicks } = checked;
  const adjustments = checked.pay.index;
  const all: Movement[] = [];
  // In the same-day order of the series, so each day's rows mostly arrive in
  // order already and putting them in order is quick (D12, ARCHITECTURE.md
  // 2.8). The order they're collected in never changes the plan.
  const inOrder = prepared
    .map((one) => ({
      one,
      flow: flowOf(one.series.direction),
      familyCreatedAt: familyTimes.get(one.series.familyId) as Moment,
      familyId: one.series.familyId,
      seriesId: one.series.id,
      name: one.series.name,
      number: one.firstNumber,
    }))
    .sort(compareSameDay);
  for (const { one } of inOrder) {
    const id = one.series.id;
    let from = addDays(one.start, -LONGEST_RUN_WITHOUT_A_WORKING_DAY);
    for (const { newDay } of changes.get(id)?.values() ?? []) {
      if (newDay !== null && newDay < from) from = newDay;
    }
    const ticksOfSeries = ticks.get(id);
    const bill = worked.get(id) ?? null;
    const setAside = one.series.setAside;
    const source: Source = {
      kind: bill === null ? 'payment' : 'bill',
      flow: flowOf(one.series.direction),
      accountId: one.series.accountId,
      toAccountId: one.series.toAccountId ?? null,
      familyCreatedAt: familyTimes.get(one.series.familyId) as Moment,
      familyId: one.series.familyId,
      seriesId: id,
      within: 0,
      recordedAt: null,
      budgetId: bill === null ? null : id,
      spendId: null,
    };
    // Money set aside moves to its own account on the same day (D64, D113).
    const setAsideSource: Source | null =
      setAside === undefined
        ? null
        : { ...source, kind: 'set-aside', flow: 'transfer-out', toAccountId: setAside.accountId };
    // A set-aside tick on a series with no money set aside is ignored (D83, D116).
    const setAsideTicksOfSeries = setAside === undefined ? undefined : setAsideTicks.get(id);
    const percent =
      setAside === undefined ? null : parseDecimal(setAside.percent, `Series ${id}: set aside`);
    // The payments already added, only needed when some of them are ticked.
    const found =
      ticksOfSeries === undefined && setAsideTicksOfSeries === undefined ? null : new Set<Day>();
    const add = (payment: PaymentOnDays) => {
      found?.add(payment.originalDay);
      // A bill without its real amount yet is the budget's estimate (D32).
      const estimate =
        bill !== null && changes.get(id)?.get(payment.originalDay)?.change.amount === undefined;
      const shown = paymentWithDates(
        estimate ? { ...payment, amount: bill.billEstimate(payment.originalDay) } : payment,
      );
      const movement = new Movement(
        source,
        shown,
        payment.day,
        shown.amount,
        shown.skipped,
        ticksOfSeries?.get(payment.originalDay) ?? null,
        shown.name,
        shown.number,
      );
      all.push(movement);
      if (setAsideSource !== null && percent !== null) {
        const tick = setAsideTicksOfSeries?.get(payment.originalDay) ?? null;
        all.push(setAsideOf(movement, setAsideSource, percent, tick));
      }
    };
    if (from <= to) {
      for (const payment of paymentsOfSeriesBetween(
        one,
        from,
        to,
        changes,
        holidays,
        adjustments,
      )) {
        add(payment);
      }
    }
    // Ticked payments, and ticked money set aside, dated after the plan's last day.
    for (const originalDay of [
      ...(ticksOfSeries?.keys() ?? []),
      ...(setAsideTicksOfSeries?.keys() ?? []),
    ]) {
      if (found?.has(originalDay)) continue;
      const index = one.firstIndexOnOrAfter(originalDay);
      if (index < one.count && one.dateAt(index) === originalDay) {
        add(paymentAtIndex(one, index, changes, holidays, adjustments));
      }
      // A tick on a date that isn't one of the series' payments is ignored.
    }
  }
  return all;
}

/** The rows a budget puts in the plan (D2, D31): parts of it leaving, and its spends. */
function budgetMovements(worked: WorkedBudget): Movement[] {
  const { budget, createdAt } = worked.checked;
  return worked.rows.map(
    (row: BudgetRow) =>
      new Movement(
        {
          kind: row.kind,
          flow: 'out',
          accountId: budget.accountId,
          toAccountId: null,
          familyCreatedAt: createdAt,
          familyId: budget.id,
          seriesId: budget.id,
          within: row.within,
          recordedAt: row.spend?.recordedAt ?? null,
          budgetId: budget.id,
          spendId: row.spend?.spend.id ?? null,
        },
        {
          seriesId: budget.id,
          number: row.period,
          originalDate: formatDate(row.day),
          date: formatDate(row.day),
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
        row.day,
        row.amount,
        false,
        null,
        budget.name,
        row.period,
      ),
  );
}

/**
 * True when a tick is already inside the account's latest balance (brief
 * 5.5, D1, D33, D83, D138): ticked inside the steps of one of this account's
 * updates, or ticked at or before the latest one with a paid date on or
 * before its balance date. A payment ticked before the update but paid after
 * the balance date isn't inside a balance from before it was paid.
 */
function insideBalance(
  tick: CheckedTick,
  accountId: string,
  start: Start,
  accountOfUpdate: ReadonlyMap<string, string>,
): boolean {
  // Ticked inside the steps of one of this account's updates: before that
  // update, so before the latest one too.
  if (tick.inBalanceUpdate !== null && accountOfUpdate.get(tick.inBalanceUpdate) === accountId) {
    return true;
  }
  return tick.tickedAt <= start.at && tick.paidOn <= start.day;
}

/** A row dated before the balance date, which goes at the start (brief 5.5, D39). */
interface AtStart {
  readonly planned: Movement;
  readonly day: Day;
}

/** Only payments, bills and their set-asides can be ticked (D109, D116). */
function tickable(kind: RowKind): boolean {
  return kind === 'payment' || kind === 'bill' || kind === 'set-aside';
}

/** How a payment moves money for the account it leaves or arrives in. */
function flowOf(direction: Payment['direction']): Flow {
  switch (direction) {
    case 'in':
      return 'in';
    case 'out':
      return 'out';
    case 'transfer':
      return 'transfer-out';
  }
}

/** How a movement moves money for this account, or null when it doesn't touch it. */
function flowIn(planned: Movement, accountId: string): Flow | null {
  const { source } = planned;
  if (source.accountId === accountId) return source.flow;
  if (source.flow === 'transfer-out' && source.toAccountId === accountId) return 'transfer-in';
  return null;
}

/**
 * True when a day's rows are already in the same-day order. They usually are,
 * because payments are collected in that order, and checking is much quicker
 * than sorting (ARCHITECTURE.md 2.8).
 */
function inSameDayOrder(rows: readonly Movement[]): boolean {
  for (let i = 1; i < rows.length; i += 1) {
    if (compareSameDay(rows[i - 1] as Movement, rows[i] as Movement) > 0) return false;
  }
  return true;
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
  // Rows dated before the balance date, then one bucket for each day from the
  // balance date to the plan's last day, so there's no big sort: each day is
  // put in the same-day order on its own (D12, ARCHITECTURE.md 2.8). Sorting
  // by day first gives exactly the order of one sort of every row.
  const before: AtStart[] = [];
  const buckets: (Movement[] | undefined)[] = new Array(Math.max(0, to - start.day + 1));

  for (const planned of payments) {
    if (flowIn(planned, account.id) === null) continue;
    const { tick, source } = planned;
    let day: Day;
    if (source.kind === 'spend') {
      // Recorded at or before the balance update: already inside the
      // balance, so ignored. Recorded after it: a row on its day, or at the
      // start when that's before the balance date (D2, D33, D109).
      if ((source.recordedAt as Moment) <= start.at) continue;
      day = planned.day;
    } else if (source.kind === 'budget') {
      // Worked out from today, so never inside the balance (D2, D67).
      day = planned.day;
    } else if (planned.skipped && tick === null) {
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
      day = planned.day;
    }
    if (day > to) continue;
    if (day < start.day) {
      before.push({ planned, day });
    } else {
      const bucket = buckets[day - start.day];
      if (bucket === undefined) buckets[day - start.day] = [planned];
      else bucket.push(planned);
    }
  }

  // 2 and 3. Everything dated before the balance date first, oldest first,
  // then from the balance date on, in date order and the same-day order (D12).
  before.sort((a, b) => a.day - b.day || compareSameDay(a.planned, b.planned));

  const rows: PlanRow[] = [];
  const rowDays: Day[] = [];
  const days: DayBalance[] = [];
  let balance = start.update.balance;
  let last: PlanRow | null = null;

  // 4. The balance after every row.
  const apply = (planned: Movement, day: Day, atStart: boolean) => {
    const flow = flowIn(planned, account.id) as Flow;
    const amount = planned.amount;
    const change = flow === 'in' || flow === 'transfer-in' ? amount : -amount;
    balance += change;
    if (!Number.isSafeInteger(balance)) {
      throw new EngineInputError('too-large', `Account ${account.id}: the balance is too large.`);
    }
    const { source } = planned;
    const ticked = planned.tick !== null;
    const planRow: PlanRow = {
      kind: source.kind,
      payment: planned.payment,
      budgetId: source.budgetId,
      spendId: source.spendId,
      accountId: account.id,
      date: formatDate(day),
      flow,
      change,
      leftAfter: balance,
      status: statusOf(balance, account.warningLevel, floor),
      ticked,
      atStart,
      notTickedYet: tickable(source.kind) && !ticked && day < today,
    };
    rows.push(planRow);
    rowDays.push(day);
    last = planRow;
  };

  for (const { planned, day } of before) apply(planned, day, true);
  for (let day = start.day; day <= to; day += 1) {
    const bucket = buckets[day - start.day];
    if (bucket !== undefined) {
      if (!inSameDayOrder(bucket)) bucket.sort(compareSameDay);
      for (const planned of bucket) apply(planned, day, false);
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

/** Where Left to spend stops (D28, D143, D144). */
interface LeftToSpendWindow {
  /** The next main payday, or the 1st of next month when the main pay has stopped. */
  readonly until: Day;
  readonly runsTo: LeftToSpend['runsTo'];
  /** The day before `until`: the last day it counts. */
  readonly last: Day;
}

/**
 * Where Left to spend stops (D28, D143, D144): the day before the next main
 * payday, or the end of this month when the main pay has no payday after
 * today. Null when there's no main pay.
 */
function leftToSpendWindow(
  main: MainPaydays | null,
  nextPayday: Day | null,
  today: Day,
): LeftToSpendWindow | null {
  if (main === null) return null;
  if (nextPayday !== null) {
    return { until: nextPayday, runsTo: 'payday', last: addDays(nextPayday, -1) };
  }
  const { year, month } = partsOfDay(today);
  const last = lastDayOfMonth(year, month);
  return { until: addDays(last, 1), runsTo: 'month-end', last };
}

/**
 * Left to spend until the next main payday (D3, D28, D112, D117, D118): spending
 * money still due to leave from today to the day before it, the lowest
 * end-of-day balance in that time, and the line under it. The account's
 * days must reach the window's last day, whatever the plan's last day (D143).
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
  window: LeftToSpendWindow | null,
  today: Day,
  payLater: readonly PayLaterLeft[],
): LeftToSpend | null {
  if (window === null) return null;
  const { last } = window;
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
    until: formatDate(window.until),
    runsTo: window.runsTo,
    lastDay: formatDate(last),
    amount,
    lowest,
    spendNoMoreThan: needsLine && underOn === null ? Math.max(0, room ?? 0) : null,
    underEvenSpendingNothing: needsLine && underOn !== null ? formatDate(underOn) : null,
    payLater,
  };
}

/**
 * Each budget worked out, and each account's rows and days, from the
 * balance date to `to` (brief 5.5, D2, D29 to D32).
 */
function workOutAccounts(
  checked: CheckedRecords,
  pay: ReturnType<typeof budgetPay>,
  holidays: BankHolidayLookup,
  today: Day,
  to: Day,
): { worked: Map<string, WorkedBudget>; works: Map<string, AccountWork> } {
  // Budgets (D2, D29 to D32): their periods follow the main pay.
  const worked = new Map<string, WorkedBudget>();
  for (const [id, budget] of checked.budgets) {
    worked.set(id, workOutBudget(budget, checked.spends.get(id) ?? [], pay, today, to));
  }
  const bills = new Map([...worked].filter(([, one]) => one.checked.billDay !== null));
  const movements = [
    ...collectPayments(checked, bills, to, holidays),
    ...[...worked.values()].flatMap(budgetMovements),
  ];
  const works = new Map<string, AccountWork>();
  for (const account of checked.accounts.values()) {
    const start = checked.starts.get(account.id) as Start;
    works.set(
      account.id,
      workOutAccount(account, start, movements, checked.accountOfUpdate, today, to),
    );
  }
  return { worked, works };
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
  const { prepared, changes, ticks } = checked;
  const main = mainPaydaysOf(input.mainPayFamilyId, prepared, changes, input.holidays);
  const pay = budgetPay(main, input.mainPayFamilyId, prepared, today);
  const { worked, works } = workOutAccounts(checked, pay, input.holidays, today, to);

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
  // Left to spend always looks as far as the day before the next main
  // payday, however far the plan looks (D143). When that's further, the
  // accounts are worked out again to that day for it alone.
  const window = leftToSpendWindow(main, nextMainPayday, today);
  const forLeftToSpend =
    window !== null && window.last > to
      ? workOutAccounts(checked, pay, input.holidays, today, window.last).works
      : works;
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
      leftToSpend: leftToSpendOf(
        forLeftToSpend.get(work.account.id) as AccountWork,
        window,
        today,
        payLater,
      ),
    };
  });

  return {
    today: formatDate(today),
    to: formatDate(to),
    mainPay: main === null ? 'none' : main.kind,
    nextMainPayday: nextMainPayday === null ? null : formatDate(nextMainPayday),
    mainPayEnded: main !== null && nextMainPayday === null,
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
