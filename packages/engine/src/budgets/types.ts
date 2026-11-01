// Budgets and spends (brief 4.5, ARCHITECTURE.md 2.5 and 3.3, D2, D28 to
// D32, D41, D61, D67).

import type { Pence } from '../money/pence.ts';

/** How often a budget comes round (brief 4.5). Its periods follow D29. */
export const BUDGET_EVERY = ['week', 'month'] as const;

export type BudgetEvery = (typeof BUDGET_EVERY)[number];

/**
 * How a budget leaves the account (brief 4.5): all at the start of its
 * period (the default, D2), spread across the days (D31), or as one monthly
 * pay-later bill (D32, D61).
 */
export const BUDGET_LEAVES = ['at-start', 'spread', 'pay-later'] as const;

export type BudgetLeaves = (typeof BUDGET_LEAVES)[number];

/** A budget (brief 4.5, ARCHITECTURE.md 3.3): food £200 a month, travel £25 a week. */
export interface Budget {
  readonly id: string;
  /** The account it leaves. For a pay-later budget, the account the bill is paid from. */
  readonly accountId: string;
  /** Food, Travel. Its rows count as Spending money (D79), and a pay-later bill as Bills. */
  readonly name: string;
  /** The budget for each period, in whole pence. */
  readonly amount: Pence;
  readonly every: BudgetEvery;
  readonly leaves: BudgetLeaves;
  /** Roll-over (D30): off unless it's switched on for this budget. */
  readonly rollOver: boolean;
  /**
   * When roll-over was switched on, "YYYY-MM-DD". Only periods that ended on
   * or after it roll over (D110). Without it, every period of the budget can.
   */
  readonly rollOverFrom?: string;
  /** The budget's first period is the one with this date in it, at its full amount (D107). */
  readonly startsOn: string;
  /** The budget's last period is the one with this date in it. None when it never ends. */
  readonly endsOn?: string;
  /** Pay-later only: the day of the month the bill is paid, 1 to 31, or the month's last day when it's shorter. */
  readonly billDay?: number;
  /**
   * Pay-later only: the card's own statement day, 1 to 31. Without it, each
   * bill covers spends up to the day before the bill (D61, D111).
   */
  readonly statementDay?: number;
  /** When the budget was made, a UTC time. On the same day, earlier ones go first (D12). */
  readonly createdAt: string;
}

/** "I spent" (brief 4.5): money spent from a budget. */
export interface Spend {
  readonly id: string;
  readonly budgetId: string;
  /** Whole pence, above zero. */
  readonly amount: Pence;
  /** The day it was spent, "YYYY-MM-DD". It counts in the budget period with this day in it. */
  readonly spentOn: string;
  /**
   * When it was recorded, a UTC time. Recorded at or before the account's
   * latest balance update, it's already inside that balance (D2, D33).
   */
  readonly recordedAt: string;
  readonly note?: string;
}

/** A pay-later budget's bill for one period (D32, D61). */
export interface BudgetBill {
  /** The bill date from the bill day, "YYYY-MM-DD". Its tick and real amount are found by this. */
  readonly originalDate: string;
  /** The day it's paid: the bill date, or where it was moved to. */
  readonly date: string;
  /** The budget for the period, or what was spent if that's more, until the real bill is typed in (D32). */
  readonly amount: Pence;
  readonly isEstimate: boolean;
  readonly ticked: boolean;
  /** Removed, just this one (D4). */
  readonly skipped: boolean;
}

/** One period of a budget: spent and left (brief 4.5). */
export interface BudgetPeriod {
  /** The first day, "YYYY-MM-DD". For a pay-later budget, the first day of the card's statement period. */
  readonly start: string;
  /** The last day. For a pay-later budget, the statement period's last day: "until Sat 28 Nov". */
  readonly end: string;
  /** The budget's own amount. */
  readonly base: Pence;
  /** What rolled over from the period before (D30): "£25 + £7 from last week". 0 when nothing did. */
  readonly rolledOver: Pence;
  /** The budget for this period: its own amount plus what rolled over. */
  readonly amount: Pence;
  /** Every spend dated in the period, whenever it was recorded. */
  readonly spent: Pence;
  /** What's left: the amount minus what's spent, never below zero. */
  readonly left: Pence;
  /**
   * A spread budget only (D31, D41): the amount that leaves each day from
   * today, or from the period's first day, rounded down to the penny. The
   * last day also takes the pennies left over. Null for the other kinds.
   */
  readonly perDay: Pence | null;
  /** A pay-later budget only: the period's bill. Null for the other kinds. */
  readonly bill: BudgetBill | null;
}

/** One budget, worked out (ARCHITECTURE.md 2.1, "Budgets"). Nothing in it is stored. */
export interface BudgetPlan {
  readonly budget: Budget;
  /**
   * This period: the one with today in it, or the budget's first period
   * when it starts after today. Null once the budget has ended.
   */
  readonly current: BudgetPeriod | null;
  /** Every period from the current one to the one with the plan's last day in it. */
  readonly periods: readonly BudgetPeriod[];
}
