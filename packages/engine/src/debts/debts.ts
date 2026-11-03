// workOutDebts: left now, paid off on, progress and owed now for every debt
// (brief 4.6 and 5.6, ARCHITECTURE.md 2.6, D27, D34, D42, D43, D62, D63,
// D98 to D101). Pure: "today" and the last day to look at are passed in.

import { compareRows } from '../balance/order.ts';
import { type CheckedTick, indexTicks, type TickIndex } from '../balance/ticks.ts';
import {
  addMonths,
  type Day,
  dayFromParts,
  dayOfMonthOrLast,
  formatDate,
  LAST_YEAR,
  monthFromNumber,
  monthNumberOfDay,
  parseDate,
  partsOfDay,
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
 * 2026 gives Wed 25 Oct 2028. Never past 31 Dec 2999, the engine's last day.
 */
export function debtsLookAhead(today: string): string {
  const day = parseDate(today, 'today');
  if (partsOfDay(day).year + DEBTS_MONTHS_AHEAD / 12 > LAST_YEAR) {
    return formatDate(dayFromParts(LAST_YEAR, 12, 31));
  }
  return formatDate(addMonths(day, DEBTS_MONTHS_AHEAD));
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
    if (year > LAST_YEAR) break;
    const day = dayOfMonthOrLast(year, m, statementDay);
    if (day > to) break;
    if (day > card.balanceOn) days.push(day);
  }
  return days;
}

/**
 * True when a tick is already inside the debt's balance (D62, D105, D138):
 * made in its steps, or made at or before it with a paid date on or before
 * its balance date. A payment ticked before a statement update but paid
 * after the statement's date isn't inside that statement's balance.
 */
function insideBalance(tick: CheckedTick, card: CheckedDebt): boolean {
  if (tick.inDebtUpdate === card.debt.id) return true;
  return tick.tickedAt <= card.balanceAt && tick.paidOn <= card.balanceOn;
}

interface Records {
  readonly changes: ChangeIndex;
  readonly ticks: TickIndex;
  readonly holidays: BankHolidayLookup;
  readonly today: Day;
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
  // Every linked payment ticked after the balance was typed in, for Left now (D99, D104).
  const tickedAfter: Event[] = [];
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
      const event: Event = {
        kind: 'payment',
        day: tick.paidOn,
        payment,
        amount: convert(payment.amount),
        ticked: true,
        ...family,
      };
      tickedAfter.push(event);
      if (tick.paidOn <= to) events.push(event);
    }
    // Planned payments from the balance date on (brief 5.6, D105): one due on
    // the balance date itself comes off too, unless it was ticked at or
    // before the update, which the ticks above already sort out. A removed
    // payment takes nothing off unless it's ticked (D4, D83).
    for (const payment of paymentsOfSeriesBetween(one, balanceOn, to, changes, holidays)) {
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
      const statement = statementOf(card, balance, event.day);
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
    // More than what's left (D63, D100): what's left counts as nothing once
    // it's 1p or less, and a penny or cent over is only rounding (D34).
    const over = event.amount - left(balance);
    if (paidOffOn === null && event.payment.isEstimate) isEstimate = true;
    balance = checkPence(balance - event.amount, `Debt ${debt.id}: what's left`);
    // A payment that comes off at the start pays it off on the balance date,
    // never before it (as D39).
    if (paidOffOn === null && balance <= PAID_OFF_AT) paidOffOn = Math.max(event.day, balanceOn);
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

  const now = leftNowOf(card, tickedAfter, records.today);
  const paidOffNow = now.exact <= PAID_OFF_AT;
  const leftNow = paidOffNow ? 0 : now.exact;
  const paidSoFar = Math.max(0, debt.startingBalance - leftNow);
  return {
    debt,
    leftNow,
    interestSinceUpdate: now.interest,
    leftNowIsEstimate: now.interest > 0,
    interestNotIncluded: debt.kind === 'credit-card' && card.interestRate === null,
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
 * Left now (D27, D62, D99, D104): from the balance on its date, take off
 * every linked payment ticked after it was typed in, on its paid date, and
 * for a credit card add the estimated interest on each statement day after
 * the balance date, up to and including today. On a statement day, that
 * day's payments come off before the interest, and no interest is added
 * once it's paid off (D101). Payments not ticked yet don't come off: the
 * card hasn't seen them.
 */
function leftNowOf(
  card: CheckedDebt,
  tickedAfter: readonly Event[],
  today: Day,
): { exact: MinorUnits; interest: MinorUnits } {
  const events: Event[] = [
    ...statementDays(card, today).map((day): Event => ({ kind: 'statement', day })),
    ...tickedAfter,
  ];
  events.sort(compareEvents);
  let balance = card.debt.balance;
  let interest = 0;
  let paidOff = balance <= PAID_OFF_AT;
  for (const event of events) {
    if (event.kind === 'statement') {
      if (paidOff) continue;
      const statement = statementOf(card, balance, event.day);
      interest += statement.interest;
      balance = statement.after;
      continue;
    }
    balance = checkPence(balance - event.amount, `Debt ${card.debt.id}: what's left`);
    if (balance <= PAID_OFF_AT) paidOff = true;
  }
  return { exact: balance, interest };
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
  if (input === null || typeof input !== 'object') {
    throw new EngineInputError('bad-input', 'Working out debts needs the plan.');
  }
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
    today,
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
  const open = plans.filter((one) => one.debt.closed !== true);
  return {
    today: formatDate(today),
    to: formatDate(to),
    owedNow: sumPence(open.map((one) => one.leftNowInPounds)),
    owedNowIsEstimate: open.some((one) => one.leftNowIsEstimate),
    debts: plans,
  };
}
