// What the Budgets, Savings goals and Accounts screens show (brief 4.2, 4.5,
// 4.7), from the engine's own figures, worked out in the background worker:
//
// - each budget's week or month with spent and left, what rolled over (D30)
//   and, for a pay-later card, what's left on the card and its bill (D61);
// - each savings goal's saved so far, progress and the date it's reached,
//   looking 24 months ahead (D114);
// - each account's balance, the day it was checked, and what closing it
//   needs: £0.00 at the end of today and nothing planned in it (D151, D158).

import {
  addDays,
  type Budget,
  type BudgetBill,
  type BudgetEvery,
  type BudgetLeaves,
  balanceAtEndOf,
  debtsLookAhead,
  EngineInputError,
  editPlan,
  formatDate,
  type Goal,
  type Nation,
  type Pence,
  type PlanRecords,
  parseDate,
  workOutGoals,
} from '@prepenny/engine';
import { holidaysFor } from './holidays.ts';
import { editInputOf, planLookAhead, settingsOf, workOutPlanTo } from './plan-input.ts';

export interface BudgetCard {
  readonly id: string;
  /** The budget as it's stored, for its edit sheet. */
  readonly budget: Budget;
  readonly name: string;
  readonly accountName: string;
  readonly every: BudgetEvery;
  readonly leaves: BudgetLeaves;
  readonly rollOver: boolean;
  /** This week or month: the one with today in it, or its first when it starts later (D107). */
  readonly current: {
    readonly start: string;
    readonly end: string;
    readonly base: Pence;
    readonly rolledOver: Pence;
    readonly amount: Pence;
    readonly spent: Pence;
    readonly left: Pence;
    /** Spread across the days: what leaves each day from today (D31). */
    readonly perDay: Pence | null;
    /** A pay-later card's bill for this statement period (D32, D111). */
    readonly bill: BudgetBill | null;
  };
  /** Its first week or month starts after today. */
  readonly startsLater: boolean;
  /** It has spends, so it can't switch to or from a pay-later bill (D161). */
  readonly hasSpends: boolean;
  /** Its weeks or months line up with the paydays of the pay it follows (D29, D508). */
  readonly followsPaydays: boolean;
}

export interface BudgetsView {
  readonly today: string;
  /** Budgets that haven't ended, in the order they were made. */
  readonly budgets: readonly BudgetCard[];
  /** Open accounts a budget can leave from. */
  readonly accounts: readonly { readonly id: string; readonly name: string }[];
}

const openAccounts = (records: PlanRecords) =>
  records.accounts
    .filter((one) => one.closed !== true)
    .map((one) => ({ id: one.id, name: one.name ?? '' }));

/**
 * The last day to work budgets out to: 3 months ahead, or further when a
 * budget starts later than that, so its first week or month is always
 * there to show (PLAN.md, left for later 3).
 */
function budgetsLookAhead(records: PlanRecords, today: string): string {
  let to = planLookAhead(today, 3);
  for (const budget of records.budgets ?? []) {
    const past = formatDate(addDays(parseDate(budget.startsOn), 62));
    if (past > to) to = past;
  }
  return to;
}

export function workOutBudgetsView(records: PlanRecords, today: string): BudgetsView {
  const accounts = openAccounts(records);
  const budgets = records.budgets ?? [];
  if (budgets.length === 0 || records.accounts.length === 0) {
    return { today, budgets: [], accounts };
  }
  const plan = workOutPlanTo(records, today, budgetsLookAhead(records, today));
  const names = new Map(records.accounts.map((one) => [one.id, one.name ?? '']));
  const spends = new Set((records.spends ?? []).map((one) => one.budgetId));
  return {
    today,
    accounts,
    budgets: plan.budgets.flatMap((one): BudgetCard[] => {
      const current = one.current;
      if (current === null) return [];
      const budget = one.budget;
      return [
        {
          id: budget.id,
          budget,
          name: budget.name,
          accountName: names.get(budget.accountId) ?? '',
          every: budget.every,
          leaves: budget.leaves,
          rollOver: budget.rollOver,
          current: {
            start: current.start,
            end: current.end,
            base: current.base,
            rolledOver: current.rolledOver,
            amount: current.amount,
            spent: current.spent,
            left: current.left,
            perDay: current.perDay,
            bill: current.bill,
          },
          startsLater: current.start > today,
          hasSpends: spends.has(budget.id),
          followsPaydays: one.followsPaydays,
        },
      ];
    }),
  };
}

export interface GoalCard {
  readonly id: string;
  /** The goal as it's stored, for its edit sheet. */
  readonly goal: Goal;
  readonly name: string;
  readonly target: Pence;
  readonly targetDate: string | null;
  readonly accountId: string;
  readonly accountName: string;
  readonly savedSoFar: Pence;
  readonly percentSaved: number;
  readonly reachedNow: boolean;
  readonly reachedOn: string | null;
  readonly byTargetDate: boolean | null;
  readonly isEstimate: boolean;
  /** What's saved on the last day looked at, when it isn't reached by then. */
  readonly savedAtEnd: Pence;
  /** Planned moves into or out of it. */
  readonly moves: number;
  readonly closed: boolean;
  /** Already saved when it was made (D114). */
  readonly startingAmount: Pence;
  /**
   * Saved so far, payment by payment (step 3g, D465): each linked series'
   * ticked payments added up, with the account it came from when it's money
   * moved from another account. Below zero for money taken out.
   */
  readonly savedFrom: readonly {
    readonly seriesId: string;
    readonly fromAccountId: string | null;
    readonly amount: Pence;
  }[];
}

export interface GoalsView {
  readonly today: string;
  /** The last day looked at: 24 months ahead (D114). */
  readonly to: string;
  readonly goals: readonly GoalCard[];
  readonly closed: readonly GoalCard[];
  readonly accounts: readonly { readonly id: string; readonly name: string }[];
}

/** Each linked series' ticked payments added up, with where the money came from (D465). */
function savedFrom(
  rows: readonly {
    readonly payment: { readonly seriesId: string };
    readonly amount: Pence;
    readonly ticked: boolean;
  }[],
  records: PlanRecords,
  goalAccount: string,
): GoalCard['savedFrom'] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    if (!row.ticked) continue;
    sums.set(row.payment.seriesId, (sums.get(row.payment.seriesId) ?? 0) + row.amount);
  }
  return [...sums].map(([seriesId, amount]) => {
    const series = records.series.find((one) => one.id === seriesId);
    const fromAccountId =
      series?.direction === 'transfer' && series.toAccountId === goalAccount
        ? series.accountId
        : null;
    return { seriesId, fromAccountId, amount };
  });
}

export function workOutGoalsView(records: PlanRecords, today: string): GoalsView {
  const to = debtsLookAhead(today);
  const accounts = openAccounts(records);
  const goals = records.goals ?? [];
  if (goals.length === 0) return { today, to, goals: [], closed: [], accounts };
  const names = new Map(records.accounts.map((one) => [one.id, one.name ?? '']));
  const plan = workOutGoals({
    ...records,
    goals,
    holidays: holidaysFor(settingsOf(records).nation),
    today,
    to,
  });
  const cards = plan.goals.map(
    (one): GoalCard => ({
      id: one.goal.id,
      goal: one.goal,
      name: one.goal.name,
      target: one.goal.target,
      targetDate: one.goal.targetDate ?? null,
      accountId: one.goal.accountId,
      accountName: names.get(one.goal.accountId) ?? '',
      savedSoFar: one.savedSoFar,
      percentSaved: one.percentSaved,
      reachedNow: one.reachedNow,
      reachedOn: one.reachedOn,
      byTargetDate: one.byTargetDate,
      isEstimate: one.isEstimate,
      savedAtEnd: one.savedAtEnd,
      moves: records.series.filter((series) => series.goalId === one.goal.id).length,
      closed: one.goal.closed === true,
      startingAmount: one.goal.startingAmount,
      savedFrom: savedFrom(one.rows, records, one.goal.accountId),
    }),
  );
  return {
    today,
    to,
    goals: cards.filter((one) => !one.closed),
    closed: cards.filter((one) => one.closed),
    accounts,
  };
}

/** Why an account can't be closed yet, or `ready` when it can (D151, D158, D181). */
export type Closing = 'ready' | 'money-left' | 'overdrawn' | 'in-use';

export interface AccountCard {
  readonly id: string;
  readonly name: string;
  readonly kind: 'current' | 'savings' | 'joint';
  /** What the bank showed at the latest balance update. */
  readonly balance: Pence;
  readonly checkedOn: string;
  readonly overdraftLimit: Pence;
  readonly warningLevel: Pence;
  /** The plan's balance at the end of today (D158). */
  readonly endOfToday: Pence;
  readonly closing: Closing;
  readonly closed: boolean;
}

export interface AccountsView {
  readonly today: string;
  readonly nation: Nation;
  readonly accounts: readonly AccountCard[];
  readonly closed: readonly AccountCard[];
}

/** What closing the account would say, asked of the engine on a copy, so the screen agrees with it. */
function closingOf(records: PlanRecords, today: string, accountId: string): Closing {
  try {
    editPlan(editInputOf(records, today), { kind: 'close-account', accountId });
    return 'ready';
  } catch (error) {
    if (error instanceof EngineInputError && error.code === 'account-in-use') return 'in-use';
    if (error instanceof EngineInputError && error.code === 'account-has-money') {
      return 'money-left';
    }
    throw error;
  }
}

export function workOutAccountsView(records: PlanRecords, today: string): AccountsView {
  const nation = settingsOf(records).nation;
  if (records.accounts.length === 0) return { today, nation, accounts: [], closed: [] };
  const plan = workOutPlanTo(records, today, today);
  const cards = plan.accounts.map((one): AccountCard => {
    const account = one.account;
    const closed = account.closed === true;
    const endOfToday = balanceAtEndOf(one, today);
    let closing: Closing = 'ready';
    if (!closed) {
      closing = closingOf(records, today, account.id);
      if (closing === 'money-left' && endOfToday < 0) closing = 'overdrawn';
    }
    return {
      id: account.id,
      name: account.name ?? '',
      kind: account.kind,
      balance: one.start.balance,
      checkedOn: one.start.checkedOn,
      overdraftLimit: account.overdraftLimit,
      warningLevel: account.warningLevel,
      endOfToday,
      closing,
      closed,
    };
  });
  return {
    today,
    nation,
    accounts: cards.filter((one) => !one.closed),
    closed: cards.filter((one) => one.closed),
  };
}
