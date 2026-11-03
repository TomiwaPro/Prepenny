// Debts (brief 4.6 and 5.6, ARCHITECTURE.md 2.6 and 3.3).

import type { Tick } from '../balance/types.ts';
import type { BankHolidayLookup } from '../dates/working-days.ts';
import type { MinorUnits } from '../money/currency.ts';
import type { Pence } from '../money/pence.ts';
import type { Payment, PaymentChange, Series } from '../schedule/types.ts';

/**
 * The kinds of debt (brief 4.6). The words people see are Pay-later plan,
 * Credit card, Loan, Overdraft and Owed to a person, in the app's strings file.
 */
export const DEBT_KINDS = [
  'pay-later',
  'credit-card',
  'loan',
  'overdraft',
  'owed-to-a-person',
] as const;

export type DebtKind = (typeof DEBT_KINDS)[number];

/** A credit card's minimum payment (brief 4.6). Amounts are in the card's own currency. */
export type MinimumRule =
  /** The minimum as typed from the statement. */
  | { readonly kind: 'typed'; readonly amount: MinorUnits }
  /**
   * A rule: the month's interest plus `percent` of the balance before that
   * interest is added, at least `atLeast`, and never more than the balance
   * (D101). "Interest plus 1% of the balance, at least £5" is
   * `{ kind: 'rule', percent: '1', atLeast: 500 }`.
   */
  | { readonly kind: 'rule'; readonly percent: string; readonly atLeast: MinorUnits };

/** A debt (brief 5.2, ARCHITECTURE.md 3.3). Payments are linked to it by their series' `debtId`. */
export interface Debt {
  readonly id: string;
  readonly name: string;
  readonly kind: DebtKind;
  /** "GBP", "EUR" and so on: three capital letters. Counted in hundredths (D98). */
  readonly currency: string;
  /**
   * Units of the debt's currency per £1, as the person typed it, "1.1612"
   * (brief 4.6). Needed for any currency but pounds, and not allowed for pounds.
   */
  readonly rate?: string;
  /** What's owed on `balanceOn`, in the debt's own currency: €1,400.57 is 140057. */
  readonly balance: MinorUnits;
  /** "YYYY-MM-DD", never after today. */
  readonly balanceOn: string;
  /** When the balance was typed in, or "Update from statement" was used: a UTC time (D62). */
  readonly balanceAt: string;
  /** For the progress bar: "Started at €2,396.93". */
  readonly startingBalance: MinorUnits;
  /** Credit cards only: the yearly interest rate as a percentage, "24.9". */
  readonly interestRate?: string;
  /**
   * Credit cards only: "0% until" this date, "YYYY-MM-DD" (D106). A statement
   * day on or before it adds no interest; later ones use the interest rate.
   */
  readonly zeroInterestUntil?: string;
  /**
   * Credit cards only: the day of the month the statement is made, 1 to 31,
   * or the month's last day when the month is shorter (D13). Needed with an
   * interest rate or a minimum rule.
   */
  readonly statementDay?: number;
  /** Credit cards only. */
  readonly minimumRule?: MinimumRule;
  /** The person it belongs to, or none when it's shared (brief 4.14, D65). */
  readonly belongsTo?: string;
  /** Closed debts don't count towards "Owed now". */
  readonly closed?: boolean;
}

/** Everything the Debts screen needs (ARCHITECTURE.md 2.1, "Debts"). */
export interface DebtsInput {
  readonly debts: readonly Debt[];
  readonly series: readonly Series[];
  readonly changes?: readonly PaymentChange[];
  readonly ticks?: readonly Tick[];
  /** The plan's bank holidays, for the dates of the linked payments. */
  readonly holidays: BankHolidayLookup;
  /** The person's own date today, "YYYY-MM-DD". The engine has no clock. */
  readonly today: string;
  /**
   * The last day to look at, "YYYY-MM-DD", included. The Debts screen looks
   * 24 months ahead (D43): use `debtsLookAhead(today)`.
   */
  readonly to: string;
}

/** A linked payment, as it comes off the debt. */
export interface DebtPaymentRow {
  readonly kind: 'payment';
  readonly payment: Payment;
  /** When it comes off: the payment's date, or for a tick made after the update, its paid date (D27). */
  readonly date: string;
  /** What comes off, in the debt's currency: the payment converted at the debt's rate, rounded once (D9). */
  readonly amount: MinorUnits;
  readonly ticked: boolean;
  /** Ticked after the update but paid before the balance date, so it comes off first (as D39). */
  readonly atStart: boolean;
  /** Exactly what's left after it. It can go below zero. */
  readonly balanceAfter: MinorUnits;
  /** What's left after it, never below zero: 0 once paid off (D34). */
  readonly leftAfter: MinorUnits;
  /** 1p, or 1 cent, or less is left after it (D34, D42). */
  readonly paidOff: boolean;
  /**
   * How much more it is than what was left before it, when that's more than
   * 1p or 1 cent: "£4.01 more than what's left" (D63). Otherwise null.
   */
  readonly moreThanLeft: MinorUnits | null;
}

/** A credit card's statement day: the month's interest and minimum, both estimates (brief 5.6). */
export interface DebtStatementRow {
  readonly kind: 'statement';
  readonly date: string;
  /** Balance × yearly rate ÷ 12, rounded once (D9), added to the balance. */
  readonly interest: MinorUnits;
  /** The minimum from the card's rule (D101), or null when the minimum is typed or there's no rule. */
  readonly minimum: MinorUnits | null;
  readonly balanceAfter: MinorUnits;
  readonly leftAfter: MinorUnits;
}

export type DebtRow = DebtPaymentRow | DebtStatementRow;

/** One debt, worked out (brief 4.6, 5.6). */
export interface DebtPlan {
  readonly debt: Debt;
  /**
   * Left now (D27, D62, D104): the balance minus every linked payment ticked
   * after the balance was typed in, plus a credit card's estimated interest
   * on each statement day since then, up to today. Never below zero (D34).
   */
  readonly leftNow: MinorUnits;
  /** The estimated interest inside Left now (D104): 0 for anything but a credit card with a rate. */
  readonly interestSinceUpdate: MinorUnits;
  /** Left now includes estimated interest, so it's labelled as an estimate (D104). */
  readonly leftNowIsEstimate: boolean;
  /** A credit card with no interest rate: the screen says "Interest not included" (D104). */
  readonly interestNotIncluded: boolean;
  /** Left now in pounds, converted at the debt's rate and rounded once (D9). */
  readonly leftNowInPounds: Pence;
  /** 1p, or 1 cent, or less is left now (D34, D42). */
  readonly paidOffNow: boolean;
  /** The starting balance minus what's left now, never below zero. */
  readonly paidSoFar: MinorUnits;
  /** Paid so far against the starting balance, as a whole percentage (D99). */
  readonly percentPaid: number;
  /** "Paid off on": the first date 1p, or 1 cent, or less is left, or null when that's after `to`. */
  readonly paidOffOn: string | null;
  /** When it isn't paid off by `to`, what's still left at the end. Otherwise null. */
  readonly leftAtEnd: MinorUnits | null;
  /**
   * The paid-off date, or what's left at the end, depends on estimates:
   * credit card interest, or a payment marked as an estimate (D100).
   */
  readonly isEstimate: boolean;
  /** Every linked payment and statement day from the balance date to `to`, in the order they come off. */
  readonly rows: readonly DebtRow[];
}

/** Every debt, worked out. Nothing in it is stored. */
export interface DebtsPlan {
  readonly today: string;
  readonly to: string;
  /** Owed now across every debt that isn't closed, in pounds: each converted at its own rate (D99). */
  readonly owedNow: Pence;
  /** Owed now includes a credit card's estimated interest, so it's an estimate too (D104). */
  readonly owedNowIsEstimate: boolean;
  /** One for each debt, in the order given. */
  readonly debts: readonly DebtPlan[];
}

/** What to compare for a credit card (brief 4.6, D102). Amounts are in the card's own currency. */
export interface CardComparisonInput {
  /** A credit card with a statement day. */
  readonly card: Debt;
  /** What's left to clear, usually the card's left now. */
  readonly left: MinorUnits;
  /** The day to start from, usually today, "YYYY-MM-DD". */
  readonly from: string;
  /** The day of the month payments go out, 1 to 31, or the month's last day when it's shorter. */
  readonly paysOn: number;
  /** The fixed amount to compare, paid every month. */
  readonly fixed: MinorUnits;
  /**
   * The card's payment due on `from` is ticked, so `left` already has it
   * taken off. Left out or false, a payment due on `from` counts as the
   * first payment, as the bank balance counts it until it's ticked (D146).
   */
  readonly paidOnFrom?: boolean;
}

/** How one way of paying works out. Numbers only (brief Part 3, principle 10). */
export interface PayingOff {
  /** False when it isn't cleared within 100 years: the payment never gets ahead of the interest. */
  readonly paidOff: boolean;
  /** How many monthly payments it takes, or null when it isn't cleared. */
  readonly payments: number | null;
  /** The interest paid on the way, or null when it isn't cleared. */
  readonly interest: MinorUnits | null;
  /** The date of the last payment, or null when there's no payment or it isn't cleared. */
  readonly lastPaymentOn: string | null;
}

/** Paying the minimum, a fixed amount and the full balance, side by side (brief 4.6). All estimates. */
export interface CardComparison {
  /** Null when the minimum is typed rather than a rule, because later minimums aren't known (D102). */
  readonly minimum: PayingOff | null;
  readonly fixed: PayingOff;
  readonly full: PayingOff;
}
