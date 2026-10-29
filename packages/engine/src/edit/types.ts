// Editing (brief 5.4, ARCHITECTURE.md 2.3): one command goes in with the
// stored records and today; the records to save and the undo come out. The
// engine never saves or changes anything itself.

import type { Account, BalanceUpdate, Tick } from '../balance/types.ts';
import type { BankHolidayLookup } from '../dates/working-days.ts';
import type { Debt } from '../debts/types.ts';
import type { Pence } from '../money/pence.ts';
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
    })
  /** Unticks a payment: its tick is removed. */
  | (PaymentRef & { readonly kind: 'untick' })
  /**
   * A new balance update (brief 4.2, D33), with anything ticked in its steps,
   * so the whole Update balance is one undo step (D87).
   */
  | {
      readonly kind: 'update-balance';
      readonly update: BalanceUpdate;
      readonly ticks?: readonly TickInUpdate[];
    }
  /** Puts back the records from before an earlier edit, as a new edit (ARCHITECTURE.md 2.3). */
  | { readonly kind: 'undo'; readonly edit: Edit };

/**
 * One record as an edit leaves it: saved with `value`, or removed when
 * `value` is null. In an undo list, null means the record didn't exist.
 *
 * Series and balance updates are found by id. Changes and ticks are found by
 * series and original date, as everywhere in the engine (brief 5.2, D87).
 */
export type RecordWrite =
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
      readonly value: Tick | null;
    }
  | { readonly kind: 'balance-update'; readonly id: string; readonly value: BalanceUpdate | null };

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
