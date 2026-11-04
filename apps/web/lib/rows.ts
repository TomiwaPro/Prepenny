// One row of the plan as the screens show it: the payment, what's left after
// it, and what the edit sheet needs to change it (brief 4.4, 5.4). Worked out
// in the background worker from the engine's own rows, so every figure comes
// from the engine. It holds names and notes the person typed, never words of
// the app's own: those come from the strings file.

import type {
  BalanceStatus,
  Direction,
  Flow,
  PaymentType,
  Pence,
  Plan,
  PlanRecords,
  PlanRow,
  RowKind,
  Schedule,
} from '@prepenny/engine';
import type { MonthlyOn } from './new-payment.ts';

/**
 * What the edit sheet can do with a row:
 *
 * - `payment`: everything (brief 5.4).
 * - `bill`: a pay-later card's bill, changed one at a time; later bills
 *   change with the budget (D111).
 * - `set-aside`: money set aside from pay, ticked on its own (D116).
 * - `none`: part of a budget or a spend, changed on the budget (D109).
 */
export type RowEditing = 'payment' | 'bill' | 'set-aside' | 'none';

export interface RowView {
  /** Unique in its account's plan, and the same after the row moves. */
  readonly key: string;
  readonly kind: RowKind;
  readonly editing: RowEditing;
  /** The series, or the budget for a bill (D111): with the original date, it names the payment (brief 5.2). */
  readonly seriesId: string;
  readonly originalDate: string;
  /** When it moves money in the plan. A payment ticked early goes on its paid date (D1). */
  readonly date: string;
  /** The payment's own date, after any weekend rule or move. */
  readonly paymentDate: string;
  readonly name: string;
  readonly note: string | null;
  /** What it does to this account: above zero coming in, below zero going out. */
  readonly change: Pence;
  /** The payment's amount, as the edit sheet shows it: zero or more. */
  readonly amount: Pence;
  /** "Left after this". */
  readonly leftAfter: Pence;
  readonly status: BalanceStatus;
  readonly isEstimate: boolean;
  readonly ticked: boolean;
  /** Dated before today and not ticked (D11). */
  readonly notTickedYet: boolean;
  readonly direction: Direction;
  readonly flow: Flow;
  readonly type: PaymentType;
  /** Linked to a debt (brief 4.6). */
  readonly linkedToDebt: boolean;
  readonly accountId: string;
  readonly accountName: string;
  /** For a transfer: the account it leaves and the one it arrives in. */
  readonly transfer: { readonly from: string; readonly to: string } | null;
  /** The pay follows a pattern, so a new amount for later ones asks which paydays (D97). */
  readonly hasPattern: boolean;
  /** The shared half of a private transfer has no name or note of its own (D94). */
  readonly sharedHalf: boolean;
  /**
   * Where "Move to next payday" takes it: the first main payday after its
   * date (D14, D81). Null when there's none, or for money coming in.
   */
  readonly nextPayday: string | null;
  /** The row the lowest point ahead is after (brief 5.5). */
  readonly isLowest: boolean;
  /**
   * How often its series repeats, for "Change how often it repeats" (D96,
   * step 2f): every so many weeks or months. Null when it doesn't repeat
   * that way: once, on chosen dates, a weekly estimate, or not a payment.
   */
  readonly repeats: RepeatsView | null;
}

export interface RepeatsView {
  /** The schedule as it's stored, to tell whether a new one differs. */
  readonly schedule: Schedule;
  readonly howOften: 'weekly' | 'monthly';
  readonly every: number;
  readonly monthlyOn: MonthlyOn;
  readonly leftOut: readonly number[];
}

function repeatsOf(schedule: Schedule): RepeatsView | null {
  if (schedule.kind === 'weekly') {
    return { schedule, howOften: 'weekly', every: schedule.every, monthlyOn: 'day', leftOut: [] };
  }
  if (schedule.kind !== 'monthly') return null;
  const on = schedule.on;
  const monthlyOn: MonthlyOn =
    on.kind === 'weekday' ? (on.position === 'last' ? 'last-weekday' : 'weekday') : on.kind;
  return {
    schedule,
    howOften: 'monthly',
    every: schedule.every,
    monthlyOn,
    leftOut: schedule.leaveOut ?? [],
  };
}

function editingOf(kind: RowKind): RowEditing {
  if (kind === 'payment' || kind === 'bill' || kind === 'set-aside') return kind;
  return 'none';
}

/** A key that stays the same when the row moves to another day. */
export function keyOfRow(row: PlanRow): string {
  const base = `${row.kind} ${row.payment.seriesId} ${row.payment.originalDate} ${row.spendId ?? ''} ${row.flow}`;
  // A budget spread across the days has a row on each day (D31).
  return row.kind === 'budget' ? `${base} ${row.date}` : base;
}

/** Turns the engine's rows into the screens' rows, for one worked-out plan. */
export function rowMaker(plan: Plan, records: PlanRecords) {
  const series = new Map(records.series.map((one) => [one.id, one]));
  const accountNames = new Map(records.accounts.map((one) => [one.id, one.name ?? '']));
  const paydays = plan.mainPaydays;

  /**
   * The first main payday after a date. The plan's list starts at the last
   * payday on or before today, so for a date before that one, an earlier
   * payday could be missing: then it's left to the engine, and the quick
   * action isn't offered. When every payday is after today, the list is whole.
   */
  const nextPaydayAfter = (date: string): string | null => {
    const first = paydays[0];
    if (first === undefined || (date < first && first <= plan.today)) return null;
    return paydays.find((day) => day > date) ?? null;
  };

  return (row: PlanRow, lowestKey: string | null): RowView => {
    const payment = row.payment;
    const own = row.kind === 'payment' ? series.get(payment.seriesId) : undefined;
    const editing = editingOf(row.kind);
    const key = keyOfRow(row);
    const transfer =
      payment.direction === 'transfer' && payment.toAccountId !== null
        ? {
            from: accountNames.get(payment.accountId) ?? '',
            to: accountNames.get(payment.toAccountId) ?? '',
          }
        : null;
    return {
      key,
      kind: row.kind,
      editing,
      seriesId: payment.seriesId,
      originalDate: payment.originalDate,
      date: row.date,
      paymentDate: payment.date,
      name: payment.name,
      note: payment.note,
      change: row.change,
      amount: payment.amount,
      leftAfter: row.leftAfter,
      status: row.status,
      isEstimate: payment.isEstimate,
      ticked: row.ticked,
      notTickedYet: row.notTickedYet,
      direction: payment.direction,
      flow: row.flow,
      type: payment.type,
      linkedToDebt: own?.debtId !== undefined,
      accountId: row.accountId,
      accountName: accountNames.get(row.accountId) ?? '',
      transfer,
      hasPattern: (own?.amountCycle?.length ?? 0) > 1,
      sharedHalf: own?.mirrorOf !== undefined,
      nextPayday:
        (editing === 'payment' || editing === 'bill') && payment.direction !== 'in'
          ? nextPaydayAfter(payment.date)
          : null,
      isLowest: key === lowestKey,
      repeats: own === undefined || editing !== 'payment' ? null : repeatsOf(own.schedule),
    };
  };
}
