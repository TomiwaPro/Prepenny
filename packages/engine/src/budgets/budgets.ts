// Working out budgets (brief 4.5 and 5.5 rule 7, ARCHITECTURE.md 2.5, D2,
// D30 to D32, D41, D61, D67, D107 to D111): each period's budget, spent and
// left, the rows the budget puts in the plan, and a pay-later card's bills.
// Pure: "today" and the plan's last day are passed in.

import { addDays, type Day, formatDate } from '../dates/day.ts';
import { checkPence, type Pence } from '../money/pence.ts';
import type { Series } from '../schedule/types.ts';
import type { CheckedBudget, CheckedSpend } from './check.ts';
import {
  type Bounds,
  type BudgetCalendar,
  type BudgetPay,
  calendarOf,
  statementPeriods,
} from './periods.ts';
import type { BudgetBill, BudgetPeriod, BudgetPlan } from './types.ts';

/** One period of a budget, worked out. */
export interface PeriodWork extends Bounds {
  readonly base: Pence;
  readonly rolledOver: Pence;
  readonly amount: Pence;
  readonly spent: Pence;
  readonly left: Pence;
  /** A spread budget's amount each day, from the first day it leaves (D31). */
  readonly perDay: Pence | null;
}

/** A row a budget puts in its account's plan: part of the budget leaving, or a spend (D2, D31). */
export interface BudgetRow {
  readonly kind: 'budget' | 'spend';
  readonly day: Day;
  readonly amount: Pence;
  /** The period it's in, counted from the budget's first period. −1 for a spend outside them all. */
  readonly period: number;
  /** On the same day, the budget's spends go first, in order, then the rest of the budget. */
  readonly within: number;
  readonly spend: CheckedSpend | null;
}

/** A budget, worked out for a plan. */
export interface WorkedBudget {
  readonly checked: CheckedBudget;
  /** Every period from the budget's first to the last one that starts by the plan's last day. */
  readonly periods: readonly PeriodWork[];
  /** The first period that hasn't ended by today. `periods.length` when every period has. */
  readonly currentIndex: number;
  /** The rows it puts in the plan. None for a pay-later budget: its spends are on the card (D32). */
  readonly rows: readonly BudgetRow[];
  /** A pay-later bill before the real one is typed in: the budget, or what was spent if more (D32). */
  billEstimate(billDay: Day): Pence;
}

function compareSpends(a: CheckedSpend, b: CheckedSpend): number {
  if (a.spentOn !== b.spentOn) return a.spentOn - b.spentOn;
  if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1;
  return a.spend.id < b.spend.id ? -1 : a.spend.id > b.spend.id ? 1 : 0;
}

/** The index of the period with `day` in it, or −1. Periods follow on with no gaps. */
function periodIndex(periods: readonly Bounds[], day: Day): number {
  let low = 0;
  let high = periods.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const period = periods[middle] as Bounds;
    if (day < period.start) high = middle - 1;
    else if (day > period.end) low = middle + 1;
    else return middle;
  }
  return -1;
}

/** Adds amounts of pence, checking the total still fits. */
function add(a: Pence, b: Pence, what: string): Pence {
  return checkPence(a + b, what);
}

/**
 * Works out one budget (D2, D30, D31, D32, D67):
 *
 * - Each period's budget is its own amount, plus what was left of the
 *   period before when roll-over is on and that period has ended (D30, D110).
 * - Spent is every spend dated in the period, whenever it was recorded, and
 *   left is the budget minus what's spent, never below zero.
 * - Periods that ended before today are settled: they put nothing more in
 *   the plan (D67). From the period with today in it on, what's left leaves
 *   on today, or on the period's first day for a later period (D2, D109):
 *   all at once, or spread across the days left (D31).
 * - Every spend is a row on its day. The plan leaves out those recorded at or
 *   before the account's latest balance update: they're already inside it
 *   (D2, D33).
 * - A pay-later budget puts no rows in: its bills are payments of their own (D32, D111).
 */
export function workOutBudget(
  checked: CheckedBudget,
  spends: readonly CheckedSpend[],
  pay: BudgetPay,
  today: Day,
  to: Day,
): WorkedBudget {
  const { budget } = checked;
  const calendar: BudgetCalendar = calendarOf(checked, pay);
  const what = `Budget ${budget.id}`;

  const first = calendar.periodOf(checked.startsOn);
  const lastStart = checked.endsOn === null ? null : calendar.periodOf(checked.endsOn).start;
  const bounds: Bounds[] = [];
  for (
    let period = first;
    period.start <= to && (lastStart === null || period.start <= lastStart);
    period = calendar.periodOf(addDays(period.end, 1))
  ) {
    bounds.push(period);
  }

  const sorted = [...spends].sort(compareSpends);
  const spentIn: Pence[] = bounds.map(() => 0);
  for (const spend of sorted) {
    const index = periodIndex(bounds, spend.spentOn);
    if (index >= 0) spentIn[index] = add(spentIn[index] as Pence, spend.spend.amount, what);
  }

  const periods: PeriodWork[] = [];
  bounds.forEach((period, i) => {
    const before = periods[i - 1];
    const rolls =
      before !== undefined &&
      budget.rollOver &&
      before.end < today &&
      (checked.rollOverFrom === null || before.end >= checked.rollOverFrom);
    const rolledOver = rolls ? before.left : 0;
    const amount = add(budget.amount, rolledOver, what);
    const spent = spentIn[i] as Pence;
    const left = Math.max(0, amount - spent);
    const firstDay = Math.max(today, period.start);
    const perDay =
      budget.leaves === 'spread' && period.end >= today
        ? Math.floor(left / (period.end - firstDay + 1))
        : null;
    periods.push({ ...period, base: budget.amount, rolledOver, amount, spent, left, perDay });
  });

  let currentIndex = periods.findIndex((period) => period.end >= today);
  if (currentIndex < 0) currentIndex = periods.length;

  const rows: BudgetRow[] = [];
  if (budget.leaves !== 'pay-later') {
    sorted.forEach((spend, i) => {
      rows.push({
        kind: 'spend',
        day: spend.spentOn,
        amount: spend.spend.amount,
        period: periodIndex(bounds, spend.spentOn),
        within: i,
        spend,
      });
    });
    const within = sorted.length;
    for (let i = currentIndex; i < periods.length; i += 1) {
      const period = periods[i] as PeriodWork;
      const firstDay = Math.max(today, period.start);
      if (budget.leaves === 'at-start') {
        if (period.left > 0 && firstDay <= to) {
          rows.push({
            kind: 'budget',
            day: firstDay,
            amount: period.left,
            period: i,
            within,
            spend: null,
          });
        }
        continue;
      }
      // Spread across the days (D31): equal amounts rounded down, and the
      // pennies left over on the last day.
      const days = period.end - firstDay + 1;
      const perDay = period.perDay as Pence;
      const extra = period.left - perDay * days;
      for (let day = firstDay; day <= Math.min(period.end, to); day += 1) {
        const amount = day === period.end ? perDay + extra : perDay;
        if (amount > 0) rows.push({ kind: 'budget', day, amount, period: i, within, spend: null });
      }
    }
  }

  const billIndex = new Map<Day, number>();
  periods.forEach((period, i) => {
    if (period.bill !== null) billIndex.set(period.bill, i);
  });
  const billEstimate = (billDay: Day): Pence => {
    const known = billIndex.get(billDay);
    if (known !== undefined) {
      const period = periods[known] as PeriodWork;
      return Math.max(period.amount, period.spent);
    }
    // A bill after the plan's last day: its period hasn't started by today,
    // so nothing has rolled over into it.
    let period = calendar.periodOf(addDays(billDay, -1));
    while (period.bill !== null && period.bill > billDay) {
      period = calendar.periodOf(addDays(period.start, -1));
    }
    let spent = 0;
    for (const spend of sorted) {
      if (spend.spentOn >= period.start && spend.spentOn <= period.end) {
        spent = add(spent, spend.spend.amount, what);
      }
    }
    return Math.max(budget.amount, spent);
  };

  return { checked, periods, currentIndex, rows, billEstimate };
}

/**
 * A pay-later budget's bills, as a series of its own (D32, D111): monthly on
 * the bill day from the bill for the budget's first period, to the bill for
 * its last. Its id is the budget's id, so a bill's tick and real amount are
 * found like any payment's, by that id and the bill's date. Null for the
 * other kinds of budget.
 */
export function billSeriesOf(checked: CheckedBudget): Series | null {
  const { budget, billDay } = checked;
  if (billDay === null) return null;
  const calendar = statementPeriods(billDay, checked.statementDay);
  const firstBill = calendar.periodOf(checked.startsOn).bill as Day;
  const lastBill = checked.endsOn === null ? null : (calendar.periodOf(checked.endsOn).bill as Day);
  return {
    id: budget.id,
    accountId: budget.accountId,
    name: budget.name,
    direction: 'out',
    amount: budget.amount,
    start: formatDate(firstBill),
    schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: billDay } },
    end: lastBill === null ? { kind: 'never' } : { kind: 'on', date: formatDate(lastBill) },
    // The bill keeps its date (D111).
    holidayRule: 'keep',
    // It pays for spending already done (D61, D79).
    type: 'bills',
    isEstimate: true,
    familyId: budget.id,
    familyCreatedAt: budget.createdAt,
  };
}

/** One budget as the plan gives it back (ARCHITECTURE.md 2.1, "Budgets"). */
export function budgetPlanOf(
  worked: WorkedBudget,
  billOf: (billDay: Day) => BudgetBill | null,
): BudgetPlan {
  const periods = worked.periods.slice(worked.currentIndex).map(
    (period): BudgetPeriod => ({
      start: formatDate(period.start),
      end: formatDate(period.end),
      base: period.base,
      rolledOver: period.rolledOver,
      amount: period.amount,
      spent: period.spent,
      left: period.left,
      perDay: period.perDay,
      bill: period.bill === null ? null : billOf(period.bill),
    }),
  );
  return { budget: worked.checked.budget, current: periods[0] ?? null, periods };
}
