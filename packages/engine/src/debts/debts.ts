// workOutDebts: left now, paid off on, progress and owed now for every debt
// (brief 4.6 and 5.6, ARCHITECTURE.md 2.6, D27, D34, D42, D43, D62, D63,
// D98 to D101). Pure: "today" and the last day to look at are passed in.

import { compareRows } from '../balance/order.ts';
import { type CheckedTick, indexTicks, type TickIndex } from '../balance/ticks.ts';
import {
  addDays,
  addMonths,
  type Day,
  dayOfMonthOrLast,
  formatDate,
  monthFromNumber,
  monthNumberOfDay,
  parseDate,
} from '../dates/day.ts';
import { type Moment, parseTime } from '../dates/time.ts';
import type { BankHolidayLookup } from '../dates/working-days.ts';
import { EngineInputError } from '../errors.ts';
import { fromOtherCurrency, type MinorUnits, toOtherCurrency } from '../money/currency.ts';
import { divideRounded } from '../money/decimal.ts';
import { checkPence, type Pence, sumPence } from '../money/pence.ts';
import {
  type ChangeIndex,
  indexChanges,
  type PaymentOnDays,
  paymentAtIndex,
  paymentsOfSeriesBetween,
  paymentWithDates,
} from '../schedule/payments.ts';
import { markFamilies, type PreparedSeries, prepareSeries } from '../schedule/series.ts';
import type { Series } from '../schedule/types.ts';
import { hasStatements, statementOf } from './card.ts';
import { type CheckedDebt, checkDebtLinks, checkDebts } from './check.ts';
import type { DebtPlan, DebtRow, DebtsInput, DebtsPlan } from './types.ts';

/** How many months ahead the Debts screen looks for "Paid off on" (D43). */
export const DEBTS_MONTHS_AHEAD = 24;

/**
 * The last day the Debts screen looks at (D43, D100): the same date 24
 * months after today, or that month's last day when it's shorter. Sun 25 Oct
 * 2026 gives Wed 25 Oct 2028.
 */
export function debtsLookAhead(today: string): string {
  return formatDate(addMonths(parseDate(today, 'today'), DEBTS_MONTHS_AHEAD));
}

/** 1p, or 1 cent, or less left counts as paid off, including a small minus from rounding (D34, D42). */
const PAID_OFF_AT = 1;

/** A linked payment that comes off the debt, or a statement day, in the order they happen. */
type Event =
  | {
      readonly kind: 'payment';
      readonly day: Day;
      readonly payment: PaymentOnDays;
      readonly amount: MinorUnits;
      readonly ticked: boolean;
      readonly familyCreatedAt: Moment;
      readonly familyId: string;
    }
  | { readonly kind: 'statement'; readonly day: Day };

function compareEvents(a: Event, b: Event): number {
  if (a.day !== b.day) return a.day - b.day;
  // On a statement day, that day's payments come off before the interest (D101).
  if (a.kind !== b.kind) return a.kind === 'payment' ? -1 : 1;
  if (a.kind === 'statement' || b.kind === 'statement') return 0;
  // The plan's same-day order (D12), so the same payment is always the one that pays it off.
  const ordered = (event: typeof a) => ({
    day: event.day,
    flow: 'out' as const,
    familyCreatedAt: event.familyCreatedAt,
    familyId: event.familyId,
    seriesId: event.payment.seriesId,
    name: event.payment.name,
    number: event.payment.number,
  });
  return compareRows(ordered(a), ordered(b));
}

/** The card's statement days after the balance date, up to `to` (D13, D101). */
function statementDays(card: CheckedDebt, to: Day): Day[] {
  const days: Day[] = [];
  if (!hasStatements(card)) return days;
  const statementDay = card.statementDay as number;
  for (let month = monthNumberOfDay(card.balanceOn); ; month += 1) {
    const { year, month: m } = monthFromNumber(month);
    const day = dayOfMonthOrLast(year, m, statementDay);
    if (day > to) break;
    if (day > card.balanceOn) days.push(day);
  }
  return days;
}

/** True when a tick is already inside the debt's balance: made at or before it, or in its steps (D62). */
function insideBalance(tick: CheckedTick, card: CheckedDebt): boolean {
  return tick.tickedAt <= card.balanceAt || tick.inDebtUpdate === card.debt.id;
}

interface Records {
  readonly changes: ChangeIndex;
  readonly ticks: TickIndex;
  readonly holidays: BankHolidayLookup;
  readonly to: Day;
}

/** One debt, worked out (brief 5.6, ARCHITECTURE.md 2.6). */
function workOutDebt(
  card: CheckedDebt,
  linked: readonly PreparedSeries[],
  records: Records,
): DebtPlan {
  const { debt, balanceOn } = card;
  const { changes, ticks, holidays, to } = records;
  // Each payment converted at the debt's rate, rounded once (D9).
  const convert = (pence: Pence): MinorUnits =>
    card.rate === null ? pence : toOtherCurrency(pence, card.rate);

  const events: Event[] = statementDays(card, to).map((day) => ({ kind: 'statement', day }));
  const tickedAfter: MinorUnits[] = [];
  for (const one of linked) {
    const ticksOfSeries = ticks.get(one.series.id);
    const family = {
      familyCreatedAt: parseTime(one.series.familyCreatedAt),
      familyId: one.series.familyId,
    };
    // Ticked after the balance was typed in: it comes off, on its paid date,
    // wherever its own date is (D27, D62).
    for (const [originalDay, tick] of ticksOfSeries ?? []) {
      const index = one.firstIndexOnOrAfter(originalDay);
      // A tick for a payment that no longer exists is ignored (D83).
      if (index >= one.count || one.dateAt(index) !== originalDay) continue;
      if (insideBalance(tick, card)) continue;
      const payment = paymentAtIndex(one, index, changes, holidays);
      const amount = convert(payment.amount);
      tickedAfter.push(amount);
      if (tick.paidOn <= to) {
        events.push({
          kind: 'payment',
          day: tick.paidOn,
          payment,
          amount,
          ticked: true,
          ...family,
        });
      }
    }
    // Planned payments after the balance date (brief 5.6). A removed payment
    // takes nothing off unless it's ticked (D4, D83).
    const from = addDays(balanceOn, 1);
    if (from > to) continue;
    for (const payment of paymentsOfSeriesBetween(one, from, to, changes, holidays)) {
      if (payment.skipped || ticksOfSeries?.has(payment.originalDay) === true) continue;
      events.push({
        kind: 'payment',
        day: payment.day,
        payment,
        amount: convert(payment.amount),
        ticked: false,
        ...family,
      });
    }
  }
  events.sort(compareEvents);

  // Paid off on: the first date 1p or less is left (brief 5.6, D34, D42).
  let balance = debt.balance;
  let paidOffOn: Day | null = balance <= PAID_OFF_AT ? balanceOn : null;
  let isEstimate = false;
  const rows: DebtRow[] = [];
  const left = (exact: MinorUnits) => (exact <= PAID_OFF_AT ? 0 : exact);
  for (const event of events) {
    if (event.kind === 'statement') {
      // No interest once it's paid off.
      if (paidOffOn !== null) continue;
      const statement = statementOf(card, balance);
      balance = statement.after;
      if (statement.interest > 0) isEstimate = true;
      rows.push({
        kind: 'statement',
        date: formatDate(event.day),
        interest: statement.interest,
        minimum: statement.minimum,
        balanceAfter: balance,
        leftAfter: left(balance),
      });
      continue;
    }
    // More than what's left (D63): what's left is never below zero, and a
    // penny or cent over is only rounding (D34).
    const over = event.amount - Math.max(0, balance);
    if (paidOffOn === null && event.payment.isEstimate) isEstimate = true;
    balance = checkPence(balance - event.amount, `Debt ${debt.id}: what's left`);
    if (paidOffOn === null && balance <= PAID_OFF_AT) paidOffOn = event.day;
    rows.push({
      kind: 'payment',
      payment: paymentWithDates(event.payment),
      date: formatDate(event.day),
      amount: event.amount,
      ticked: event.ticked,
      atStart: event.day < balanceOn,
      balanceAfter: balance,
      leftAfter: left(balance),
      paidOff: balance <= PAID_OFF_AT,
      moreThanLeft: over > PAID_OFF_AT ? over : null,
    });
  }

  // Left now (D27, D62): every linked payment ticked after the balance was typed in.
  const exactLeftNow = debt.balance - sumPence(tickedAfter);
  const paidOffNow = exactLeftNow <= PAID_OFF_AT;
  const leftNow = paidOffNow ? 0 : exactLeftNow;
  const paidSoFar = Math.max(0, debt.startingBalance - leftNow);
  return {
    debt,
    leftNow,
    leftNowInPounds: card.rate === null ? leftNow : fromOtherCurrency(leftNow, card.rate),
    paidOffNow,
    paidSoFar,
    percentPaid: percentPaid(paidSoFar, debt.startingBalance, paidOffNow),
    paidOffOn: paidOffOn === null ? null : formatDate(paidOffOn),
    leftAtEnd: paidOffOn === null ? left(balance) : null,
    isEstimate,
    rows,
  };
}

/**
 * Paid so far against the starting balance, to the nearest whole percent,
 * halves up (D99). Never 100% while more than 1p is left, so the bar is full
 * only when it says "Paid off".
 */
function percentPaid(paidSoFar: MinorUnits, start: MinorUnits, paidOffNow: boolean): number {
  if (paidOffNow) return 100;
  if (start <= 0) return 0;
  const percent = Number(divideRounded(BigInt(paidSoFar) * 100n, BigInt(start)));
  return Math.min(percent, 99);
}

function prepareAll(series: readonly Series[], holidays: BankHolidayLookup): PreparedSeries[] {
  if (!Array.isArray(series)) {
    throw new EngineInputError('bad-series', 'The series must be a list.');
  }
  const seen = new Set<string>();
  const prepared = series.map((one) => {
    const ready = prepareSeries(one, holidays);
    if (seen.has(one.id)) {
      throw new EngineInputError('repeated-series', `Series ${one.id} is listed twice.`);
    }
    seen.add(one.id);
    return ready;
  });
  return markFamilies(prepared);
}

/**
 * Works out every debt (ARCHITECTURE.md 2.1, "Debts"): left now, paid off on
 * or what's still left at the end, progress, every linked payment with
 * what's left after it, and for credit cards each statement day's interest
 * and minimum, both estimates. Also "Owed now" across all debts, in pounds.
 *
 * Nothing changes on its own (D63): a payment bigger than what's left only
 * says how much more it is.
 */
export function workOutDebts(input: DebtsInput): DebtsPlan {
  const today = parseDate(input.today, 'today');
  const to = parseDate(input.to, 'to');
  if (to < today) {
    throw new EngineInputError('bad-window', '"to" must be on or after today.');
  }
  const debts = checkDebts(input.debts, today);
  const prepared = prepareAll(input.series, input.holidays);
  checkDebtLinks(input.series, debts);
  const records: Records = {
    changes: indexChanges(input.changes ?? []),
    ticks: indexTicks(input.ticks ?? []),
    holidays: input.holidays,
    to,
  };
  const linked = new Map<string, PreparedSeries[]>();
  for (const one of prepared) {
    const id = one.series.debtId;
    if (id === undefined) continue;
    linked.set(id, [...(linked.get(id) ?? []), one]);
  }
  const plans = [...debts.values()].map((card) =>
    workOutDebt(card, linked.get(card.debt.id) ?? [], records),
  );
  return {
    today: formatDate(today),
    to: formatDate(to),
    owedNow: sumPence(
      plans.filter((one) => one.debt.closed !== true).map((one) => one.leftNowInPounds),
    ),
    debts: plans,
  };
}
