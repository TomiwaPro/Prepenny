import type { Budget, BudgetPlan, Spend } from '../budgets/types.ts';
import type { BankHolidayLookup } from '../dates/working-days.ts';
import type { Goal } from '../goals/types.ts';
import type { Pence } from '../money/pence.ts';
import type { Payment, PaymentChange, Series } from '../schedule/types.ts';

/** The kinds of account (brief 4.2, 5.2). */
export const ACCOUNT_KINDS = ['current', 'savings', 'joint'] as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/** An account (brief 5.2, ARCHITECTURE.md 3.3). Its balance comes from its balance updates. */
export interface Account {
  readonly id: string;
  readonly kind: AccountKind;
  /** 0 if none. The floor is minus this: −£1,000.00 for Ali (brief 5.5, 8.5). */
  readonly overdraftLimit: Pence;
  /** Strictly under this is Tight (D10). Can be below zero, near an overdraft floor. */
  readonly warningLevel: Pence;
}

/** What the bank showed, typed in with Update balance (brief 4.2, D33). */
export interface BalanceUpdate {
  readonly id: string;
  readonly accountId: string;
  /** Whole pence. Below zero in an overdraft. */
  readonly balance: Pence;
  /** The balance date D, "YYYY-MM-DD" (brief 5.5). Never after today. */
  readonly checkedOn: string;
  /** When the update was made, a UTC time such as "2026-10-30T09:14:05Z" (D33). */
  readonly checkedAt: string;
}

/**
 * A paid tick, stored as its own record (D48). One tick per payment, found by
 * series and original date like a change. Unticking deletes it.
 */
export interface Tick {
  readonly seriesId: string;
  /** The payment's date from its schedule, before any weekend or bank holiday move. */
  readonly originalDate: string;
  /** When it was ticked, a UTC time (D33). */
  readonly tickedAt: string;
  /**
   * The id of the balance update whose steps it was ticked in, if it was. It
   * then counts as before that update, so it's already inside its balance (D33).
   */
  readonly inBalanceUpdate?: string;
  /**
   * The id of the debt whose "Update from statement" steps it was ticked in,
   * if it was. It then counts as before that update, so it's already inside
   * that debt's balance (D62). It changes nothing for the bank balance.
   */
  readonly inDebtUpdate?: string;
  /**
   * The day the money left or arrived, "YYYY-MM-DD", worked out with
   * `paidDate` when the tick is made (D1, D71).
   */
  readonly paidOn: string;
  /**
   * Set on the tick for the money set aside from this payment, not the
   * payment itself. Money set aside is ticked on its own, so it stays in
   * Not ticked yet until it has really been moved (D116).
   */
  readonly setAside?: true;
}

/** Everything the plan needs (ARCHITECTURE.md 2.1, "Work out the plan"). */
export interface PlanInput {
  readonly accounts: readonly Account[];
  /** Every balance update. The latest one for each account, by time, is where it starts. */
  readonly balanceUpdates: readonly BalanceUpdate[];
  readonly series: readonly Series[];
  readonly changes?: readonly PaymentChange[];
  readonly ticks?: readonly Tick[];
  /** Budgets (brief 4.5): the rows they put in the plan follow D2, D31 and D32. */
  readonly budgets?: readonly Budget[];
  /** "I spent" (brief 4.5). Each is for one of the budgets. */
  readonly spends?: readonly Spend[];
  /** Savings goals (brief 4.7). When they're given, every series' link to a goal is checked. */
  readonly goals?: readonly Goal[];
  /** The family of the main pay of the person viewing (D14), or null when there's none. */
  readonly mainPayFamilyId: string | null;
  /** The plan's bank holidays, usually a BankHolidayCalendar for its nation. */
  readonly holidays: BankHolidayLookup;
  /** The person's own date today, "YYYY-MM-DD". The engine has no clock. */
  readonly today: string;
  /** The last day the plan looks at, "YYYY-MM-DD", included. */
  readonly to: string;
}

/**
 * A balance against the account's warning level and floor, strictly below
 * for both (D10): Short under the floor, otherwise Tight under the warning
 * level, otherwise ok.
 */
export type BalanceStatus = 'ok' | 'tight' | 'short';

/** How a row moves money for its account. A transfer is out of one account and into the other. */
export type Flow = 'in' | 'out' | 'transfer-in' | 'transfer-out';

/**
 * What a row is:
 *
 * - `payment`: a payment of a series.
 * - `bill`: a pay-later budget's bill (D32, D111). It's ticked, moved and
 *   given its real amount like a payment, found by the budget's id.
 * - `set-aside`: part of money coming in, moved to another account (D64, D113).
 *   It goes with its payment's date, removal and estimate label, but has a
 *   tick of its own (D116).
 * - `budget`: what's left of a budget period leaving the account (D2), all
 *   at once or one day of it spread across the days (D31).
 * - `spend`: "I spent", recorded after the account's latest balance update (D2, D33).
 */
export type RowKind = 'payment' | 'bill' | 'set-aside' | 'budget' | 'spend';

/** One row of an account's plan: a payment, and what's left after it. */
export interface PlanRow {
  readonly kind: RowKind;
  /**
   * The payment. For a bill, its `seriesId` is the budget's id. For a
   * set-aside, it's the payment it's set aside from, as a transfer of the
   * amount set aside. For a budget row or a spend, it describes the row:
   * the budget's id and name, the type Spending money (D79), and the spend's note.
   */
  readonly payment: Payment;
  /** The budget of a bill, a budget row or a spend. Otherwise null. */
  readonly budgetId: string | null;
  /** The spend, for a spend row. Otherwise null. */
  readonly spendId: string | null;
  /** The account this row is for. A transfer has a row in each of its two accounts. */
  readonly accountId: string;
  /**
   * When it moves money in the plan, "YYYY-MM-DD": the payment's date, or for
   * a payment ticked after the latest balance update, its paid date (D1, D71).
   */
  readonly date: string;
  readonly flow: Flow;
  /** What it does to this account's balance: above zero coming in, below zero going out. */
  readonly change: Pence;
  /** "Left after this": the balance once this row has gone out or come in. */
  readonly leftAfter: Pence;
  /** Status of `leftAfter`. */
  readonly status: BalanceStatus;
  readonly ticked: boolean;
  /**
   * Applied first, before the balance date's own rows, because it's dated
   * before the balance date: overdue (brief 5.5), or ticked after the update
   * with an earlier paid date (D39).
   */
  readonly atStart: boolean;
  /**
   * Not ticked, and dated before today (D11). Only payments, bills and
   * set-asides can be ticked: budget rows and spends never need a tick (D109).
   */
  readonly notTickedYet: boolean;
}

/** An account's balance at the end of one day. */
export interface DayBalance {
  readonly date: string;
  /** The day's figure: the balance after its last row (brief 5.5). */
  readonly balance: Pence;
  readonly status: BalanceStatus;
  /**
   * The row the balance is after: the day's last row, or when the day has
   * none, the last row before it. Null when no row has been applied yet.
   */
  readonly after: PlanRow | null;
}

/** How much short at the end of one day, and the row it's after. */
export interface ShortOnDay {
  readonly date: string;
  /** How far under the floor, as an amount above zero: −£95.47 with no overdraft is 9547. */
  readonly amount: Pence;
  readonly after: PlanRow | null;
}

/**
 * A shortfall: days in a row, from today on, that end strictly below the
 * floor (D10, D82). "£95.47 short on Sun 1 Nov" is its first day.
 */
export interface Shortfall extends ShortOnDay {
  /** The last of the days in a row, or the plan's last day if it's still short then. */
  readonly lastDate: string;
  /** The day it's most short, the first such day if there's a tie. */
  readonly deepest: ShortOnDay;
  /** Where "could move" payments would go: the first main payday after the first short day (D69). */
  readonly moveTo: string | null;
  /**
   * "Payments that could move" (D69): unticked payments dated from today to
   * the day before the first short day that, moved on their own to `moveTo`,
   * leave no day of this shortfall short and make no day short, in any
   * account, that wasn't short before. Biggest first.
   */
  readonly couldMove: readonly PlanRow[];
}

/** What's left on a pay-later budget this period: spent on the card, not from the account (D61). */
export interface PayLaterLeft {
  readonly budgetId: string;
  /** "On the pay-later card: £80.00 left until Sat 28 Nov". */
  readonly left: Pence;
  /** The last day of the card's statement period, "YYYY-MM-DD". */
  readonly until: string;
}

/** Left to spend (D3, D28, D112, D117, D118). */
export interface LeftToSpend {
  /** The next main payday, "YYYY-MM-DD": "Left to spend until Fri 30 Oct" (D28). */
  readonly until: string;
  /**
   * L: spending money still due to leave the account from today to the day
   * before the next main payday. Budget rows, and payments of the type
   * Spending money not ticked yet. Spends already made and pay-later bills
   * aren't in it (D28, D61).
   */
  readonly amount: Pence;
  /** M: the lowest end-of-day balance from today to the day before the next main payday. */
  readonly lowest: DayBalance;
  /**
   * X in "Spend no more than £X to keep at least £20 until Fri 30 Oct": the
   * smallest, over each day from today to the day before the next main
   * payday, of that day's end balance + the Left to spend due by that day −
   * the warning level, never below 0 (D118). Only when spending all of L
   * takes the balance under the warning level (M < W), and spending nothing
   * wouldn't. Otherwise null.
   */
  readonly spendNoMoreThan: Pence | null;
  /**
   * The first day, "YYYY-MM-DD", that the balance goes under the warning
   * level even if none of L is spent, for "You'll go under £20 on Mon 26 Oct,
   * even if you spend nothing." It replaces the "Spend no more than" line
   * (D117). Otherwise null.
   */
  readonly underEvenSpendingNothing: string | null;
  /** Each pay-later budget on this account, shown on its own line under Left to spend (D61). */
  readonly payLater: readonly PayLaterLeft[];
}

/** One account's plan (ARCHITECTURE.md 2.4). */
export interface AccountPlan {
  readonly account: Account;
  /** Zero, or minus the overdraft limit (brief 5.5). */
  readonly floor: Pence;
  /** The latest balance update: where the plan starts. */
  readonly start: BalanceUpdate;
  /** Every row, in the order applied: the rows at the start, then date order and the same-day order (D12). */
  readonly rows: readonly PlanRow[];
  /** The balance at the end of each day, from the balance date to the plan's last day. */
  readonly days: readonly DayBalance[];
  /** "Not ticked yet": unticked rows dated before today, oldest first (D11). */
  readonly notTickedYet: readonly PlanRow[];
  /** What Update balance expects: the balance at the end of today, before anything is ticked (D46). */
  readonly expected: Pence;
  /** The lowest end-of-day balance from today on, the first such day if there's a tie (brief 5.5). */
  readonly lowestPoint: DayBalance;
  /** The first day from today on that ends strictly under the warning level (D8, D10). */
  readonly firstUnderWarning: DayBalance | null;
  readonly shortfalls: readonly Shortfall[];
  /** Left to spend until the next main payday (D28), or null when there's no main pay. */
  readonly leftToSpend: LeftToSpend | null;
}

/** What kind of main pay the person viewing has (D14). */
export type MainPayKind = 'none' | 'regular' | 'irregular';

/** The worked-out plan (ARCHITECTURE.md 2.1). Nothing in it is stored. */
export interface Plan {
  readonly today: string;
  readonly to: string;
  readonly mainPay: MainPayKind;
  /** The first main payday after today (D14), or the next Monday for irregular pay (D66). */
  readonly nextMainPayday: string | null;
  /**
   * Main paydays from the last one on or before today to the first one after
   * the plan's last day, in order. Plan periods are worked out from these.
   */
  readonly mainPaydays: readonly string[];
  /** One for each account, in the order given. */
  readonly accounts: readonly AccountPlan[];
  /** One for each budget, in the order given: this period's spent and left, and the periods ahead. */
  readonly budgets: readonly BudgetPlan[];
}
