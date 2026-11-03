// Savings goals (brief 4.7, ARCHITECTURE.md 2.1 and 3.3, D114).

import type { Tick } from '../balance/types.ts';
import type { BankHolidayLookup } from '../dates/working-days.ts';
import type { Pence } from '../money/pence.ts';
import type { Payment, PaymentChange, Series } from '../schedule/types.ts';

/** A savings goal (brief 4.7). Planned moves towards it are series with its `goalId`. */
export interface Goal {
  readonly id: string;
  readonly name: string;
  /** Whole pence, above zero. */
  readonly target: Pence;
  /** "By, if you have a date", "YYYY-MM-DD". */
  readonly targetDate?: string;
  /** Where the money is kept. Every series linked to the goal moves money into or out of it. */
  readonly accountId: string;
  /** Already saved when the goal was made. */
  readonly startingAmount: Pence;
  /** The person it belongs to, or none when it's shared (brief 4.14, D65). */
  readonly belongsTo?: string;
}

/** Everything the goals need. */
export interface GoalsInput {
  readonly goals: readonly Goal[];
  readonly series: readonly Series[];
  readonly changes?: readonly PaymentChange[];
  readonly ticks?: readonly Tick[];
  /** The plan's bank holidays, for the dates of the linked payments. */
  readonly holidays: BankHolidayLookup;
  /** The person's own date today, "YYYY-MM-DD". The engine has no clock. */
  readonly today: string;
  /** The last day to look at, included. Use `debtsLookAhead(today)` to look 24 months ahead (D114). */
  readonly to: string;
}

/** A linked payment, as it moves money into or out of the goal. */
export interface GoalRow {
  readonly payment: Payment;
  /**
   * When it counts: a ticked payment on its paid date, a payment still to
   * come on its date, and one dated before today that isn't ticked yet on
   * today (D114).
   */
  readonly date: string;
  /** Above zero into the goal's account, below zero out of it. */
  readonly amount: Pence;
  readonly ticked: boolean;
  /** What's saved after it. */
  readonly savedAfter: Pence;
}

/** One goal, worked out (brief 4.7). Nothing in it is stored. */
export interface GoalPlan {
  readonly goal: Goal;
  /** The starting amount plus every linked payment ticked as paid (D114). */
  readonly savedSoFar: Pence;
  /** The target minus what's saved so far, never below zero. */
  readonly leftToSave: Pence;
  /** Saved so far against the target, as a whole percentage: 100 only once it's reached (D114). */
  readonly percentSaved: number;
  /** What's saved so far has reached the target. */
  readonly reachedNow: boolean;
  /**
   * The date the plan reaches the target: the day of the payment that takes
   * it to the target or above and keeps it there to the last day looked at
   * (D139). Money taken out again, below the target, starts it over. Null
   * when the starting amount already did and it never drops below, or when
   * it isn't at the target on the last day looked at.
   */
  readonly reachedOn: string | null;
  /** Which payment that is: 24 for the 24th move. Null when `reachedOn` is. */
  readonly reachedWith: number | null;
  /** Reached by its target date, or null when it has no target date. */
  readonly byTargetDate: boolean | null;
  /** The date it's reached, or what's saved at the end, depends on a payment marked as an estimate. */
  readonly isEstimate: boolean;
  /** What's saved on the last day looked at. */
  readonly savedAtEnd: Pence;
  /** Every linked payment from the goal's first one to the last day looked at, in the order they count. */
  readonly rows: readonly GoalRow[];
}

export interface GoalsPlan {
  readonly today: string;
  readonly to: string;
  /** One for each goal, in the order given. */
  readonly goals: readonly GoalPlan[];
}
