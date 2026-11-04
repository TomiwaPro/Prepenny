// What the Debts screens show (brief 4.6, ARCHITECTURE.md 4.6, D43, D99 to
// D106): Owed now across every open debt, each debt in the order it's paid
// off, and for one debt every linked payment with what's left after it, a
// credit card's statement days and what's needed to compare ways to pay.
// Worked out in the background worker from the engine's own figures, 24
// months ahead (D43). A payment bigger than what's left carries the one-tap
// fix as the engine's commands: "Make it £20.99 and stop after it" (D63).

import {
  addDays,
  type CardComparison,
  compareCardPayments,
  type Debt,
  type DebtKind,
  type DebtPlan,
  debtsLookAhead,
  type EditCommand,
  formatDate,
  fromOtherCurrency,
  type MinimumRule,
  type MinorUnits,
  type Pence,
  type PlanRecords,
  parseDate,
  type Series,
  workOutDebts,
  workOutPayments,
} from '@prepenny/engine';
import { holidaysFor } from './holidays.ts';
import { settingsOf } from './plan-input.ts';

/** A linked payment as it comes off the debt. */
export interface DebtPaymentView {
  readonly kind: 'payment';
  readonly key: string;
  readonly seriesId: string;
  readonly originalDate: string;
  /** When it comes off the debt. */
  readonly date: string;
  readonly name: string;
  /** What leaves the bank account, in pence. */
  readonly amount: Pence;
  /** What comes off the debt, in the debt's own currency. */
  readonly inDebt: MinorUnits;
  readonly ticked: boolean;
  readonly isEstimate: boolean;
  /** What's left after it, never below zero (D34). */
  readonly leftAfter: MinorUnits;
  readonly paidOff: boolean;
  /** "£4.01 more than what's left" (D63), in the debt's own currency, or null. */
  readonly moreThanLeft: MinorUnits | null;
  /** The one-tap fix, on the first payment that's more than what's left (D63). */
  readonly fix: DebtFix | null;
}

/** A credit card's statement day: the month's interest and minimum, both estimates (brief 5.6). */
export interface DebtStatementView {
  readonly kind: 'statement';
  readonly key: string;
  readonly date: string;
  readonly interest: MinorUnits;
  readonly minimum: MinorUnits | null;
  readonly leftAfter: MinorUnits;
}

export type DebtRowView = DebtPaymentView | DebtStatementView;

/** "Make it £20.99 and stop after it" (D63): the payment's new amount, and the commands that make it. */
export interface DebtFix {
  /** The payment's new amount in pounds: what was left before it, converted at the debt's rate. */
  readonly amount: Pence;
  /** That amount's own currency figure: what was left before it. */
  readonly inDebt: MinorUnits;
  /** The new amount for just this one, then every later payment to the debt removed. One change, one undo. */
  readonly commands: readonly EditCommand[];
}

/** What comparing ways to pay needs (D102): the card has a statement day. */
export interface CompareStart {
  /** What's left to clear: Left now. */
  readonly left: MinorUnits;
  /** The day of the month the card's payment goes out, from its linked payment, or null when there's none. */
  readonly paysOn: number | null;
  /** The linked payment's amount, to start the fixed amount with. */
  readonly fixed: Pence | null;
  /** Today's payment is ticked, so Left now already has it taken off (D146). */
  readonly paidOnFrom: boolean;
}

export interface CardView {
  readonly interestRate: string | null;
  readonly zeroInterestUntil: string | null;
  readonly statementDay: number | null;
  readonly minimumRule: MinimumRule | null;
  /** The next statement day from today, with its interest and minimum, both estimates. */
  readonly nextStatement: {
    readonly date: string;
    readonly interest: MinorUnits;
    readonly minimum: MinorUnits | null;
  } | null;
  /** Null when the card has no statement day, so there's nothing to compare from. */
  readonly compare: CompareStart | null;
}

/** A linked payment from today or earlier that isn't ticked yet, for Update from statement (D103). */
export interface DebtTick {
  readonly seriesId: string;
  readonly originalDate: string;
  readonly date: string;
  readonly name: string;
  readonly amount: Pence;
}

export interface DebtView {
  readonly id: string;
  /** The debt as it's stored, for its edit sheet. */
  readonly debt: Debt;
  readonly name: string;
  readonly kind: DebtKind;
  readonly currency: string;
  readonly rate: string | null;
  readonly closed: boolean;
  readonly leftNow: MinorUnits;
  readonly leftNowInPounds: Pence;
  readonly leftNowIsEstimate: boolean;
  /** A credit card's estimated interest inside Left now, since the last update (D104). */
  readonly interestSinceUpdate: MinorUnits;
  readonly interestNotIncluded: boolean;
  readonly paidOffNow: boolean;
  readonly startingBalance: MinorUnits;
  readonly paidSoFar: MinorUnits;
  readonly percentPaid: number;
  readonly paidOffOn: string | null;
  readonly leftAtEnd: MinorUnits | null;
  readonly isEstimate: boolean;
  readonly rows: readonly DebtRowView[];
  readonly card: CardView | null;
  readonly toTick: readonly DebtTick[];
  /** How many payments are linked to it, so the page can say when there are none. */
  readonly linkedSeries: number;
}

export interface DebtsView {
  readonly today: string;
  /** The last day looked at: 24 months ahead (D43). */
  readonly to: string;
  readonly owedNow: Pence;
  readonly owedNowIsEstimate: boolean;
  /** Open debts in another currency, for "Family loan counted at €1.1612 per £1." */
  readonly rates: readonly {
    readonly name: string;
    readonly currency: string;
    readonly rate: string;
  }[];
  /** Open debts, in the order they're paid off; those still owed at the end come last. */
  readonly debts: readonly DebtView[];
  readonly closed: readonly DebtView[];
}

/** 1p, or 1 cent, or less left counts as paid off (D34, D42). */
const PAID_OFF_AT = 1;

/** The day of the month a monthly payment goes out, for the comparison (D102): 31 for the last day. */
function paysOnOf(series: Series): number | null {
  if (series.schedule.kind !== 'monthly' || series.schedule.every !== 1) return null;
  const on = series.schedule.on;
  if (on.kind === 'day') return on.day;
  if (on.kind === 'last-day') return 31;
  return null;
}

/**
 * The commands for "Make it £20.99 and stop after it" (D63): this payment
 * becomes what's left, and every later payment to the debt is removed,
 * from the first one of each linked series after it.
 */
function fixCommands(
  records: PlanRecords,
  debt: Debt,
  row: { readonly seriesId: string; readonly originalDate: string; readonly date: string },
  number: number,
  amount: Pence,
  today: string,
): EditCommand[] {
  const holidays = holidaysFor(settingsOf(records).nation);
  const own = records.series.find((one) => one.id === row.seriesId);
  const commands: EditCommand[] = [
    {
      kind: 'just-this-one',
      seriesId: row.seriesId,
      originalDate: row.originalDate,
      edits: { amount },
    },
  ];
  const from = formatDate(addDays(parseDate(row.date), 1));
  // Far enough ahead to find the next payment of any linked series.
  const to = formatDate(addDays(parseDate(debtsLookAhead(today)), 400));
  const families = new Map<string, Series[]>();
  for (const series of records.series) {
    if (series.debtId !== debt.id) continue;
    families.set(series.familyId, [...(families.get(series.familyId) ?? []), series]);
  }
  for (const [familyId, list] of families) {
    const later = workOutPayments({
      series: list,
      changes: records.changes ?? [],
      holidays,
      from: familyId === own?.familyId ? row.date : from,
      to,
    }).find((payment) =>
      familyId === own?.familyId ? payment.number > number : payment.date > row.date,
    );
    if (later === undefined) continue;
    commands.push({
      kind: 'remove-this-and-later',
      seriesId: later.seriesId,
      originalDate: later.originalDate,
    });
  }
  return commands;
}

function rowsOf(
  records: PlanRecords,
  plan: DebtPlan,
  today: string,
): { rows: DebtRowView[]; toTick: DebtTick[] } {
  const debt = plan.debt;
  const rows: DebtRowView[] = [];
  const toTick: DebtTick[] = [];
  let fixed = false;
  for (const row of plan.rows) {
    if (row.kind === 'statement') {
      if (row.interest === 0 && row.minimum === null) continue;
      rows.push({
        kind: 'statement',
        key: `statement ${row.date}`,
        date: row.date,
        interest: row.interest,
        minimum: row.minimum,
        leftAfter: row.leftAfter,
      });
      continue;
    }
    const payment = row.payment;
    let fix: DebtFix | null = null;
    if (!fixed && row.moreThanLeft !== null && !row.ticked) {
      const leftBefore = row.amount - row.moreThanLeft;
      if (leftBefore > PAID_OFF_AT) {
        fixed = true;
        const amount =
          debt.rate === undefined ? leftBefore : fromOtherCurrency(leftBefore, debt.rate);
        fix = {
          amount,
          inDebt: leftBefore,
          commands: fixCommands(records, debt, payment, payment.number, amount, today),
        };
      }
    }
    if (!row.ticked && payment.date <= today) {
      toTick.push({
        seriesId: payment.seriesId,
        originalDate: payment.originalDate,
        date: payment.date,
        name: payment.name,
        amount: payment.amount,
      });
    }
    rows.push({
      kind: 'payment',
      key: `payment ${payment.seriesId} ${payment.originalDate}`,
      seriesId: payment.seriesId,
      originalDate: payment.originalDate,
      date: row.date,
      name: payment.name,
      amount: payment.amount,
      inDebt: row.amount,
      ticked: row.ticked,
      isEstimate: payment.isEstimate,
      leftAfter: row.leftAfter,
      paidOff: row.paidOff,
      moreThanLeft: row.moreThanLeft,
      fix,
    });
  }
  return { rows, toTick };
}

function cardOf(records: PlanRecords, plan: DebtPlan, today: string): CardView | null {
  const debt = plan.debt;
  if (debt.kind !== 'credit-card') return null;
  const linked = records.series.filter((one) => one.debtId === debt.id);
  // The linked payment the card is paid by from now on: the one with the latest start.
  const paying = [...linked]
    .filter((one) => paysOnOf(one) !== null)
    .sort((a, b) => (a.start < b.start ? 1 : -1))[0];
  const next = plan.rows.find(
    (row): row is Extract<DebtPlan['rows'][number], { kind: 'statement' }> =>
      row.kind === 'statement' && row.date > today,
  );
  const paidOnFrom = plan.rows.some(
    (row) => row.kind === 'payment' && row.ticked && row.payment.date === today,
  );
  return {
    interestRate: debt.interestRate ?? null,
    zeroInterestUntil: debt.zeroInterestUntil ?? null,
    statementDay: debt.statementDay ?? null,
    minimumRule: debt.minimumRule ?? null,
    nextStatement:
      next === undefined
        ? null
        : { date: next.date, interest: next.interest, minimum: next.minimum },
    compare:
      debt.statementDay === undefined
        ? null
        : {
            left: plan.leftNow,
            paysOn: paying === undefined ? null : paysOnOf(paying),
            fixed: paying?.amount ?? null,
            paidOnFrom,
          },
  };
}

function viewOf(records: PlanRecords, plan: DebtPlan, today: string): DebtView {
  const debt = plan.debt;
  const { rows, toTick } = rowsOf(records, plan, today);
  return {
    id: debt.id,
    debt,
    name: debt.name,
    kind: debt.kind,
    currency: debt.currency,
    rate: debt.rate ?? null,
    closed: debt.closed === true,
    leftNow: plan.leftNow,
    leftNowInPounds: plan.leftNowInPounds,
    leftNowIsEstimate: plan.leftNowIsEstimate,
    interestSinceUpdate: plan.interestSinceUpdate,
    interestNotIncluded: plan.interestNotIncluded,
    paidOffNow: plan.paidOffNow,
    startingBalance: debt.startingBalance,
    paidSoFar: plan.paidSoFar,
    percentPaid: plan.percentPaid,
    paidOffOn: plan.paidOffOn,
    leftAtEnd: plan.leftAtEnd,
    isEstimate: plan.isEstimate,
    rows,
    card: cardOf(records, plan, today),
    toTick,
    linkedSeries: records.series.filter((one) => one.debtId === debt.id).length,
  };
}

/** Paid off first, first; those still owed at the end last, in the order they were added. */
function byPaidOff(a: DebtView, b: DebtView): number {
  if (a.paidOffOn === null || b.paidOffOn === null) {
    return (a.paidOffOn === null ? 1 : 0) - (b.paidOffOn === null ? 1 : 0);
  }
  return a.paidOffOn < b.paidOffOn ? -1 : a.paidOffOn > b.paidOffOn ? 1 : 0;
}

/** Everything the Debts screens show, looking 24 months ahead (D43). */
export function workOutDebtsView(records: PlanRecords, today: string): DebtsView {
  const to = debtsLookAhead(today);
  const debts = records.debts ?? [];
  if (debts.length === 0) {
    return { today, to, owedNow: 0, owedNowIsEstimate: false, rates: [], debts: [], closed: [] };
  }
  const plan = workOutDebts({
    ...records,
    debts,
    holidays: holidaysFor(settingsOf(records).nation),
    today,
    to,
  });
  const views = plan.debts.map((one) => viewOf(records, one, today));
  const open = views.filter((one) => !one.closed);
  return {
    today,
    to,
    owedNow: plan.owedNow,
    owedNowIsEstimate: plan.owedNowIsEstimate,
    rates: open.flatMap((one) =>
      one.rate === null ? [] : [{ name: one.name, currency: one.currency, rate: one.rate }],
    ),
    // A stable sort keeps the order they were added among debts paid off the same day.
    debts: [...open].sort(byPaidOff),
    closed: views.filter((one) => one.closed),
  };
}

/** What the comparison asks for (D102). */
export interface CompareAsk {
  readonly debtId: string;
  /** The fixed amount each month, in the card's own currency. */
  readonly fixed: MinorUnits;
  /** The day of the month payments go out. */
  readonly paysOn: number;
}

/** Paying the minimum, a fixed amount and the full balance, side by side (brief 4.6, D102). Numbers only. */
export function compareWaysToPay(
  records: PlanRecords,
  today: string,
  ask: CompareAsk,
): CardComparison {
  const view = workOutDebtsView(records, today);
  const debt = [...view.debts, ...view.closed].find((one) => one.id === ask.debtId);
  const start = debt?.card?.compare ?? null;
  if (debt === undefined || start === null) {
    throw new Error('There is no card to compare.');
  }
  return compareCardPayments({
    card: debt.debt,
    left: start.left,
    from: today,
    paysOn: ask.paysOn,
    fixed: ask.fixed,
    paidOnFrom: start.paidOnFrom,
  });
}
