import type { Weekday, WeekdayPosition } from '../dates/day.ts';
import type { Pence } from '../money/pence.ts';

/** Money coming in, going out, or moving between two accounts. */
export type Direction = 'in' | 'out' | 'transfer';

/**
 * What a payment is for (D79). A short, fixed list. The words people see are
 * Pay, Benefits, Rent or mortgage, Bills, Debt, Spending money, Savings and
 * Other, and they live in the app's strings file, not here. Payments of the
 * type Spending money count towards Left to spend (D28).
 */
export const PAYMENT_TYPES = [
  'pay',
  'benefits',
  'rent',
  'bills',
  'debt',
  'spending-money',
  'savings',
  'other',
] as const;

export type PaymentType = (typeof PAYMENT_TYPES)[number];

/** What happens on a weekend or bank holiday (brief 4.3). */
export type HolidayRule = 'keep' | 'working-day-before' | 'working-day-after';

/** Where in the month a monthly payment falls. */
export type MonthlyDay =
  /** A day of the month, 1 to 31. In a shorter month, the month's last day. */
  | { readonly kind: 'day'; readonly day: number }
  | { readonly kind: 'last-day' }
  | { readonly kind: 'last-working-day' }
  /** "First Monday" style: the first to fourth, or last, of a weekday. */
  | { readonly kind: 'weekday'; readonly weekday: Weekday; readonly position: WeekdayPosition };

/** How often a series happens (brief 4.4, ARCHITECTURE.md 3.3). */
export type Schedule =
  /** Once, on the start date. */
  | { readonly kind: 'once' }
  /** Every 1 to 52 weeks, on the start date's weekday. */
  | { readonly kind: 'weekly'; readonly every: number }
  /**
   * Every 1 to 12 months. `leaveOut` lists months (1 to 12) to pass over, such
   * as Dee's council tax in February and March. Left-out months don't count as
   * payments.
   */
  | {
      readonly kind: 'monthly';
      readonly every: number;
      readonly on: MonthlyDay;
      readonly leaveOut?: readonly number[];
    }
  /** On chosen dates, "YYYY-MM-DD" (Ali's student loan). */
  | { readonly kind: 'dates'; readonly dates: readonly string[] }
  /** Irregular money with a weekly estimate, on the start date's weekday (Kofi). */
  | { readonly kind: 'irregular' };

/** When a series stops (brief 4.4). */
export type EndRule =
  | { readonly kind: 'never' }
  /** After this many payments, counted from the original series (see `firstNumber`). */
  | { readonly kind: 'after'; readonly payments: number }
  /** The last payment is the last one whose original date is on or before this date. */
  | { readonly kind: 'on'; readonly date: string };

/** Anything that happens once or repeats (brief 5.2). */
export interface Series {
  readonly id: string;
  /** The account the money leaves or arrives in. For a transfer, the account it leaves. */
  readonly accountId: string;
  /** For a transfer only: the account it arrives in. */
  readonly toAccountId?: string;
  readonly name: string;
  readonly direction: Direction;
  /** Whole pence, zero or more. The direction says which way it goes. */
  readonly amount: Pence;
  /** "My pay changes in a pattern": up to 8 amounts in a repeating cycle (brief 4.1). */
  readonly amountCycle?: readonly Pence[];
  /** Where in the cycle payment 0 sits. */
  readonly cycleOffset?: number;
  /** "YYYY-MM-DD". The first payment is the first date the schedule gives on or after this. */
  readonly start: string;
  readonly schedule: Schedule;
  readonly end: EndRule;
  /** A different amount for the last payment (brief 4.4). */
  readonly lastAmount?: Pence;
  readonly holidayRule: HolidayRule;
  /** What it's for (D79). */
  readonly type: PaymentType;
  readonly isEstimate: boolean;
  readonly note?: string;
  /**
   * The family: the id of the first series in its chain of splits, which is
   * its own id if it was never split (D49). Main pay and the same-day order
   * use the family, so a split changes neither.
   */
  readonly familyId: string;
  /**
   * When the family was first created, as a UTC time such as
   * "2026-10-25T08:31:00Z". Every series in a family has the same one. On the
   * same day, earlier families go first (D12, D49).
   */
  readonly familyCreatedAt: string;
  /**
   * The payment number this series starts at, counted from the original series
   * it was split from, so the amount pattern and "after N payments" carry on
   * (ARCHITECTURE.md 2.3). 0 for a series that was never split.
   */
  readonly firstNumber?: number;
  /** The series this one was split from by "This and all later ones" (brief 5.4), if it was. */
  readonly splitFrom?: string;
  /**
   * Set on the shared half of a private transfer: the id of the private half
   * it mirrors (D16, ARCHITECTURE.md 3.6). The private half is money going
   * out of (or into) the person's own account, and the shared half is the
   * same money arriving in (or leaving) the shared account. Every edit
   * changes both halves together.
   */
  readonly mirrorOf?: string;
}

/** A change to one payment, found by its series and original date (brief 5.2). */
export interface PaymentChange {
  readonly seriesId: string;
  /** The payment's date from its schedule, before any weekend or bank holiday move. */
  readonly originalDate: string;
  /** Moved to this date. Used as it is: the weekend and bank holiday rule isn't applied again. */
  readonly newDate?: string;
  readonly amount?: Pence;
  readonly name?: string;
  readonly note?: string;
  readonly isEstimate?: boolean;
  /** Removed, just this one (D4). It still counts towards "after N payments". */
  readonly skipped?: boolean;
}

/** One payment, worked out from its series and any change. Never stored (brief 5.2). */
export interface Payment {
  readonly seriesId: string;
  /** Payment number k, counted from the original series (brief 5.3). */
  readonly number: number;
  /** The date from the schedule, before the weekend and bank holiday rule. */
  readonly originalDate: string;
  /** The date it happens: after the weekend and bank holiday rule, then any move. */
  readonly date: string;
  readonly accountId: string;
  readonly toAccountId: string | null;
  readonly direction: Direction;
  readonly amount: Pence;
  readonly name: string;
  readonly note: string | null;
  /** What it's for, from its series (D79). */
  readonly type: PaymentType;
  readonly isEstimate: boolean;
  /**
   * The last payment of a series that ends. After a split it's the family's
   * last payment: the old series' last one isn't last, because the new
   * series carries on from it (D49).
   */
  readonly isLast: boolean;
  /** The weekend and bank holiday rule moved it. */
  readonly movedByRule: boolean;
  /** A change moved it to another date. */
  readonly moved: boolean;
  /** Removed, just this one (D4). Listed so it can be shown and undone; it moves no money. */
  readonly skipped: boolean;
  /** It has a one-off change. */
  readonly changed: boolean;
}
