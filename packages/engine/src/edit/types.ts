// Editing (brief 5.4, ARCHITECTURE.md 2.3): one command goes in with the
// stored records and today; the records to save and the undo come out. The
// engine never saves or changes anything itself.

import type { Account, AccountKind, BalanceUpdate, PlanSettings, Tick } from '../balance/types.ts';
import type { Budget, BudgetLeaves, Spend } from '../budgets/types.ts';
import type { Nation } from '../dates/bank-holiday-rules.ts';
import type { BankHolidayLookup } from '../dates/working-days.ts';
import type { Debt, DebtKind, MinimumRule } from '../debts/types.ts';
import type { Goal } from '../goals/types.ts';
import type { MinorUnits } from '../money/currency.ts';
import type { Pence } from '../money/pence.ts';
import type { StudentLoanPlan } from '../pay/tax-year.ts';
import type {
  CoveredTo,
  FixedPay,
  OtherDeduction,
  PayAdjustment,
  PayLine,
  PayProfile,
  PaySettings,
  PayWeek,
  Pension,
  YearSoFar,
} from '../pay/types.ts';
import type { PaymentChange, Schedule, Series } from '../schedule/types.ts';

/** Everything stored for a plan that an edit can read or change. */
export interface PlanRecords {
  readonly accounts: readonly Account[];
  readonly balanceUpdates: readonly BalanceUpdate[];
  readonly series: readonly Series[];
  readonly changes?: readonly PaymentChange[];
  readonly ticks?: readonly Tick[];
  /** The plan's debts (D98). When they're given, every series' link to a debt is checked too. */
  readonly debts?: readonly Debt[];
  /** Budgets (brief 4.5). A pay-later budget's bills can be ticked and changed like payments (D111). */
  readonly budgets?: readonly Budget[];
  /** "I spent" (brief 4.5, D115). */
  readonly spends?: readonly Spend[];
  /** Savings goals (brief 4.7). When they're given, every series' link to a goal is checked too. */
  readonly goals?: readonly Goal[];
  /** Pay profiles (brief 4.15). When they're given, every series' link to one is checked too. */
  readonly payProfiles?: readonly PayProfile[];
  /** Saved pay weeks (D5). */
  readonly payWeeks?: readonly PayWeek[];
  /** "I did overtime" and "I missed a shift" (D5, D44). */
  readonly payAdjustments?: readonly PayAdjustment[];
  /** The nation and the main pay (D155), once they've been chosen with a command. */
  readonly settings?: PlanSettings;
}

/** What an edit needs: the stored records, the plan's settings and today. */
export interface EditInput extends PlanRecords {
  /** The family of the main pay of the person editing (D14), for "Move to next payday". */
  readonly mainPayFamilyId: string | null;
  /** The plan's bank holidays, usually a BankHolidayCalendar for its nation. */
  readonly holidays: BankHolidayLookup;
  /** The person's own date today, "YYYY-MM-DD". A tick's paid date uses it (D71). */
  readonly today: string;
}

/** Which payment a command is about: its series and its original date (brief 5.2). */
export interface PaymentRef {
  readonly seriesId: string;
  /** The payment's date from its schedule, before any weekend, bank holiday or moved date. */
  readonly originalDate: string;
}

/**
 * "Just this one" (brief 5.4): only what the person changed. Each part that
 * comes out the same as the series would give anyway is cleared from the
 * payment's change instead of being saved (D93).
 */
export interface JustThisOneEdits {
  readonly amount?: Pence;
  /** Moves the payment to this date, "YYYY-MM-DD". Used as it is (D78). */
  readonly date?: string;
  readonly name?: string;
  /** An empty note means no note. */
  readonly note?: string;
  readonly isEstimate?: boolean;
}

/**
 * "This and all later ones" (brief 5.4): only what the person changed.
 * Each part given counts as changed, and one-off changes to that part on
 * this and later payments are dropped (D60).
 */
export interface ThisAndLaterEdits {
  /** "Every payday from now": one amount for this and every later payment, in place of any pattern (D90). */
  readonly amount?: Pence;
  /**
   * "Only this week of the pattern" (D97): a new amount for this payment's
   * step of the amount pattern, so every payment on that step from here on
   * gets it and the other steps keep theirs. Only for a series with a
   * pattern, and never together with `amount`.
   */
  readonly stepAmount?: Pence;
  readonly name?: string;
  /** An empty note means no note. */
  readonly note?: string;
  readonly isEstimate?: boolean;
  /**
   * The new date of this payment from its schedule, "YYYY-MM-DD", before the
   * weekend and bank holiday rule. Later payments follow `schedule` from
   * there (D91).
   */
  readonly date?: string;
  /**
   * The schedule from this payment on. Without it the series keeps its
   * schedule, and `date` must be a date that schedule gives (D91).
   */
  readonly schedule?: Schedule;
}

/** A payment ticked inside the Update balance steps (D33). */
export interface TickInUpdate extends PaymentRef {
  /** When it was ticked, a UTC time such as "2026-10-30T09:15:00Z". */
  readonly tickedAt: string;
  /** Ticks the payment's money set aside instead of the payment (D116). */
  readonly setAside?: true;
}

/**
 * A new payment for "Add a payment" and setup (brief 4.3, 4.4, D86): every
 * field of a series a person can choose. Its `start` is the date of the
 * next payment, never before today (D150). The engine makes it its own
 * family (D49).
 */
export type NewSeries = Omit<
  Series,
  'familyId' | 'familyCreatedAt' | 'firstNumber' | 'splitFrom' | 'mirrorOf'
>;

/** The shared half of a private transfer, for "Add a payment" (D16, D94). */
export interface NewOtherHalf {
  readonly id: string;
  /** The shared account it arrives in, or leaves. */
  readonly accountId: string;
  /** "From Jess" or "To Jess": all the shared plan sees of it, with the date and amount. */
  readonly name: string;
  /**
   * A shared savings goal kept in the shared account, which the money goes
   * into or comes out of (step 3g, D464): so the goal counts it, as the
   * person's own money.
   */
  readonly goalId?: string;
}

/** What can change about an account (D151). */
export interface AccountEdits {
  readonly name?: string;
  readonly kind?: AccountKind;
  readonly overdraftLimit?: Pence;
  readonly warningLevel?: Pence;
}

/** What can change about a debt (D153). Its balance changes with "Update from statement". Null clears a field. */
export interface DebtEdits {
  readonly name?: string;
  readonly kind?: DebtKind;
  readonly currency?: string;
  readonly rate?: string | null;
  readonly startingBalance?: MinorUnits;
  readonly interestRate?: string | null;
  readonly zeroInterestUntil?: string | null;
  readonly statementDay?: number | null;
  readonly minimumRule?: MinimumRule | null;
  readonly belongsTo?: string | null;
}

/** A new budget (brief 4.5, D152). Roll-over's day and earlier amounts are the engine's to set. */
export type NewBudget = Omit<Budget, 'rollOverFrom' | 'amountsBefore'>;

/** What can change about a budget (D152). Null clears the card's own statement day. */
export interface BudgetEdits {
  readonly name?: string;
  /** From the period with today in it (D152). */
  readonly amount?: Pence;
  readonly leaves?: BudgetLeaves;
  /** Switched on from today (D110, D152). */
  readonly rollOver?: boolean;
  readonly billDay?: number;
  readonly statementDay?: number | null;
}

/** A new savings goal (brief 4.7, D153). */
export type NewGoal = Omit<Goal, 'closed'>;

/** What can change about a savings goal (D153). Null clears a field. */
export interface GoalEdits {
  readonly name?: string;
  readonly target?: Pence;
  readonly targetDate?: string | null;
  readonly accountId?: string;
  readonly startingAmount?: Pence;
  readonly belongsTo?: string | null;
}

/** What can change about a pay profile (D154). Null clears a field. */
export interface PayProfileEdits {
  readonly name?: string;
  readonly frequency?: PaySettings['frequency'];
  readonly taxCode?: string;
  readonly basis?: PaySettings['basis'];
  readonly niCategory?: string | null;
  readonly pension?: Pension | null;
  readonly studentLoans?: readonly StudentLoanPlan[] | null;
  readonly otherDeductions?: readonly OtherDeduction[] | null;
  readonly soFar?: YearSoFar | null;
  readonly overtimeRate?: string | null;
  readonly coveredTo?: CoveredTo | null;
}

/** What can change about a saved pay week (D154). Its extras are its fixed pay (D130). */
export interface PayWeekEdits {
  readonly name?: string;
  readonly lines?: readonly PayLine[];
  readonly fixed?: readonly FixedPay[] | null;
}

/** One edit the person makes. */
export type EditCommand =
  /** Changes one payment only (brief 5.4). */
  | (PaymentRef & { readonly kind: 'just-this-one'; readonly edits: JustThisOneEdits })
  /**
   * Changes this payment and every later one (brief 5.4, D88): splits the
   * series here, or on a series' first payment changes the whole series.
   */
  | (PaymentRef & {
      readonly kind: 'this-and-later';
      readonly edits: ThisAndLaterEdits;
      /** The id for the new series a split makes. The engine can't make ids. */
      readonly newSeriesId: string;
      /** For a private transfer, the id for the new series of the other half (D94). */
      readonly newOtherHalfSeriesId?: string;
    })
  /** Removes just this payment: it's skipped (D4). */
  | (PaymentRef & { readonly kind: 'remove-this-one' })
  /** Removes this payment and every later one: the series ends before it (brief 5.4, D92). */
  | (PaymentRef & { readonly kind: 'remove-this-and-later' })
  /** Moves just this payment to a date, "YYYY-MM-DD". */
  | (PaymentRef & { readonly kind: 'move'; readonly date: string })
  /** Moves just this payment to the first main payday after its date (D14, D81). */
  | (PaymentRef & { readonly kind: 'move-to-next-payday' })
  /** Ticks a payment as paid. Its paid date is worked out as D71 says. */
  | (PaymentRef & {
      readonly kind: 'tick';
      /** When it was ticked, a UTC time such as "2026-10-30T09:15:00Z" (D33). */
      readonly tickedAt: string;
      /** The id of the balance update whose steps it's ticked in, if it is (D33). */
      readonly inBalanceUpdate?: string;
      /** Ticks the payment's money set aside instead of the payment (D116). */
      readonly setAside?: true;
    })
  /** Unticks a payment, or with `setAside` its money set aside: the tick is removed. */
  | (PaymentRef & { readonly kind: 'untick'; readonly setAside?: true })
  /**
   * A new balance update (brief 4.2, D33), with anything ticked in its steps,
   * so the whole Update balance is one undo step (D87).
   */
  | {
      readonly kind: 'update-balance';
      readonly update: BalanceUpdate;
      readonly ticks?: readonly TickInUpdate[];
    }
  /**
   * "Update from statement" (brief 4.6, D62, D103): the debt's balance from
   * a statement, with anything ticked in its steps, as one undo step. Those
   * ticks count as before the update for that debt.
   */
  | {
      readonly kind: 'update-from-statement';
      readonly debtId: string;
      /** What the statement shows, in the debt's own currency. */
      readonly balance: MinorUnits;
      /** "YYYY-MM-DD", never after today: usually today (brief 4.6). */
      readonly balanceOn: string;
      /** When the update was made, a UTC time, later than the debt's last one (D103). */
      readonly balanceAt: string;
      /** Payments linked to this debt, ticked in the update's steps. */
      readonly ticks?: readonly TickInUpdate[];
    }
  /** "I spent" (brief 4.5, D115): a new spend, with its id, budget, amount, day and the time it was recorded. */
  | { readonly kind: 'spend'; readonly spend: Spend }
  /** Changes a spend's amount, day or note (D115). An empty note means no note. */
  | {
      readonly kind: 'change-spend';
      readonly spendId: string;
      readonly edits: {
        readonly amount?: Pence;
        readonly spentOn?: string;
        readonly note?: string;
      };
    }
  /** Removes a spend (D115). */
  | { readonly kind: 'remove-spend'; readonly spendId: string }
  /**
   * "I did overtime" or "I missed a shift" (brief 4.3, D5, D44): finds the
   * payday the shift is paid on, works out take-home pay with and without it
   * from that payday's pay week, and saves the difference as a pay
   * adjustment. Refused once that payday's real amount is in.
   */
  | {
      readonly kind: 'overtime' | 'missed-shift';
      /** The id for the new pay adjustment. The engine can't make ids. */
      readonly id: string;
      /** A series of the pay, usually the main pay. */
      readonly seriesId: string;
      /** The day of the shift, "YYYY-MM-DD". */
      readonly workedOn: string;
      /** Hours as text, above zero, such as "11.5". */
      readonly hours: string;
      /**
       * Pounds an hour as text. Overtime uses the pay profile's overtime rate
       * when it's left out; a missed shift uses the rate of the pay week's
       * first basic line.
       */
      readonly rate?: string;
      /**
       * An optional change to the payday's extras, such as its shift premium,
       * bonus or allowance (D130): how much more for overtime, or how much
       * less for a missed shift, as an amount above zero. Left out, or £0.00,
       * the extras stay as they are. Refused when the pay has no extras.
       */
      readonly extras?: Pence;
    }
  /** Removes a saved "I did overtime" or "I missed a shift". */
  | { readonly kind: 'remove-pay-adjustment'; readonly id: string }
  /** Puts back the records from before an earlier edit, as a new edit (ARCHITECTURE.md 2.3). */
  | { readonly kind: 'undo'; readonly edit: Edit }
  /**
   * A new account with the balance its bank shows (brief 4.2, D151): the
   * account and its first balance update, as one edit.
   */
  | {
      readonly kind: 'add-account';
      readonly account: Omit<Account, 'closed'>;
      readonly balance: Omit<BalanceUpdate, 'accountId'>;
    }
  /** Changes an account's name, kind, overdraft limit or warning level (D151). */
  | { readonly kind: 'change-account'; readonly accountId: string; readonly edits: AccountEdits }
  /** Closes an account once nothing is planned in it any more (D151). */
  | { readonly kind: 'close-account'; readonly accountId: string }
  /** "Add a payment" (brief 4.3, 4.4, D86, D150). */
  | {
      readonly kind: 'add-payment';
      readonly series: NewSeries;
      /** When it was added, a UTC time. It sets its place in the same-day order (D12). */
      readonly madeAt: string;
      /**
       * Money between the person's private account and a shared one (D16,
       * D52, D94, step 3f): `series` is the private half, money going out of
       * (or into) their own account, and this is the shared half, the same
       * money arriving in (or leaving) the shared account, named "From Jess"
       * (or "To Jess") and carrying nothing else. Both are one edit and one
       * undo. The engine doesn't know which accounts are private: the app
       * says so by asking for the other half.
       */
      readonly otherHalf?: NewOtherHalf;
    }
  /** Deletes a payment that hasn't started yet: its whole family (D156). */
  | { readonly kind: 'delete-payment'; readonly seriesId: string }
  /**
   * Links pay to its pay profile and saved pay weeks (D5, D154), for every
   * series of its family. Null unlinks.
   */
  | {
      readonly kind: 'link-pay';
      readonly seriesId: string;
      readonly payProfileId: string | null;
      /** One for each step of the amount pattern, or one with no pattern. Left out keeps them when they still fit. */
      readonly cyclePayWeeks?: readonly string[] | null;
    }
  /** A new debt (brief 4.6, D153). */
  | { readonly kind: 'add-debt'; readonly debt: Omit<Debt, 'closed'> }
  /** Changes a debt (D153). */
  | { readonly kind: 'change-debt'; readonly debtId: string; readonly edits: DebtEdits }
  /** Closes a debt: it's left out of Owed now (D99, D153). */
  | { readonly kind: 'close-debt'; readonly debtId: string }
  /** A new budget (brief 4.5, D152). */
  | { readonly kind: 'add-budget'; readonly budget: NewBudget }
  /** Changes a budget's name, amount, how it leaves, roll-over or pay-later days (D152). */
  | { readonly kind: 'change-budget'; readonly budgetId: string; readonly edits: BudgetEdits }
  /** Ends a budget: its last period is the one with `endsOn` in it (D107, D152). */
  | { readonly kind: 'end-budget'; readonly budgetId: string; readonly endsOn: string }
  /** A new savings goal (brief 4.7, D153). */
  | { readonly kind: 'add-goal'; readonly goal: NewGoal }
  /** Changes a savings goal (D153). */
  | { readonly kind: 'change-goal'; readonly goalId: string; readonly edits: GoalEdits }
  /** Closes a savings goal (D153). */
  | { readonly kind: 'close-goal'; readonly goalId: string }
  /** A new pay profile: one job's tax settings (brief 4.15, D131, D154). */
  | { readonly kind: 'add-pay-profile'; readonly profile: PayProfile }
  /** Changes a pay profile, and works out its overtime and missed shifts again (D154). */
  | {
      readonly kind: 'change-pay-profile';
      readonly payProfileId: string;
      readonly edits: PayProfileEdits;
    }
  /** A new saved pay week (D5, D130, D154). */
  | { readonly kind: 'add-pay-week'; readonly week: PayWeek }
  /** Changes a saved pay week, and works out its overtime and missed shifts again (D154). */
  | { readonly kind: 'change-pay-week'; readonly payWeekId: string; readonly edits: PayWeekEdits }
  /** Chooses the main pay, or none (D14, D155). */
  | { readonly kind: 'choose-main-pay'; readonly familyId: string | null }
  /** Sets the nation whose bank holidays apply (brief 4.3, 5.7, D155). */
  | { readonly kind: 'set-nation'; readonly nation: Nation };

/**
 * One record as an edit leaves it: saved with `value`, or removed when
 * `value` is null. In an undo list, null means the record didn't exist.
 *
 * Most records are found by id. Changes and ticks are found by series and
 * original date, as everywhere in the engine (brief 5.2, D87), and a tick
 * also by whether it's for the money set aside (D116). The plan's settings
 * are one record with no id (D155).
 */
export type RecordWrite =
  | { readonly kind: 'account'; readonly id: string; readonly value: Account | null }
  | { readonly kind: 'series'; readonly id: string; readonly value: Series | null }
  | {
      readonly kind: 'change';
      readonly seriesId: string;
      readonly originalDate: string;
      readonly value: PaymentChange | null;
    }
  | {
      readonly kind: 'tick';
      readonly seriesId: string;
      readonly originalDate: string;
      /** Set for the tick of the payment's money set aside (D116). */
      readonly setAside?: true;
      readonly value: Tick | null;
    }
  | { readonly kind: 'balance-update'; readonly id: string; readonly value: BalanceUpdate | null }
  | { readonly kind: 'debt'; readonly id: string; readonly value: Debt | null }
  | { readonly kind: 'spend'; readonly id: string; readonly value: Spend | null }
  | { readonly kind: 'pay-adjustment'; readonly id: string; readonly value: PayAdjustment | null }
  | { readonly kind: 'budget'; readonly id: string; readonly value: Budget | null }
  | { readonly kind: 'goal'; readonly id: string; readonly value: Goal | null }
  | { readonly kind: 'pay-profile'; readonly id: string; readonly value: PayProfile | null }
  | { readonly kind: 'pay-week'; readonly id: string; readonly value: PayWeek | null }
  | { readonly kind: 'settings'; readonly value: PlanSettings | null };

/**
 * One edit: one undo step, however many records it touched (brief 5.4).
 * `writes` and `undo` name the same records, in the same order.
 */
export interface Edit {
  /** The records to save. */
  readonly writes: readonly RecordWrite[];
  /** How those records looked before: the "before" copies, or null where one didn't exist. */
  readonly undo: readonly RecordWrite[];
}
