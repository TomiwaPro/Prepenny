// Comparing three ways to pay a credit card (brief 4.6, D102): the minimum,
// a fixed amount and the full balance. Numbers only: how many payments and
// how much interest. It never says which is best (brief Part 3, principle 10).

import {
  type Day,
  dayOfMonthOrLast,
  formatDate,
  LAST_YEAR,
  monthFromNumber,
  monthNumberOfDay,
  parseDate,
} from '../dates/day.ts';
import { EngineInputError } from '../errors.ts';
import type { MinorUnits } from '../money/currency.ts';
import { checkPenceNotNegative } from '../money/pence.ts';
import { minimumFromRule, statementOf } from './card.ts';
import { type CheckedDebt, checkDebt } from './check.ts';
import type { CardComparison, CardComparisonInput, PayingOff } from './types.ts';

/** 100 years of monthly payments: past that, it counts as never cleared. */
const MOST_PAYMENTS = 1200;

/** 1p or less left is paid off (D34). */
const PAID_OFF_AT = 1;

type Way = 'minimum' | 'fixed' | 'full';

function payOff(
  card: CheckedDebt,
  left: MinorUnits,
  from: Day,
  paysOn: number,
  way: Way,
  fixed: MinorUnits,
): PayingOff {
  if (left <= PAID_OFF_AT) {
    return { paidOff: true, payments: 0, interest: 0, lastPaymentOn: null };
  }
  const rule = card.minimum?.kind === 'rule' ? card.minimum : null;
  const statementDay = card.statementDay as number;
  let balance = left;
  let interest = 0;
  let payments = 0;
  // Before the first statement, the minimum is the rule on what's left, with no interest (D102).
  let minimum = rule === null ? 0 : minimumFromRule(balance, 0, rule);
  for (let month = monthNumberOfDay(from); payments < MOST_PAYMENTS; month += 1) {
    const { year, month: m } = monthFromNumber(month);
    if (year > LAST_YEAR) break;
    const statement = dayOfMonthOrLast(year, m, statementDay);
    const payment = dayOfMonthOrLast(year, m, paysOn);
    // On the same day, the payment comes off before the statement, as in the debt's own rows (D101).
    const order: ['pay' | 'statement', Day][] = [
      ['pay', payment],
      ['statement', statement],
    ];
    order.sort((a, b) => a[1] - b[1]);
    for (const [what, day] of order) {
      if (day <= from) continue;
      if (what === 'statement') {
        const made = statementOf(card, balance, day);
        interest += made.interest;
        minimum = made.minimum ?? 0;
        balance = made.after;
        continue;
      }
      const due = way === 'minimum' ? minimum : way === 'fixed' ? fixed : balance;
      balance -= Math.min(due, Math.max(0, balance));
      payments += 1;
      if (balance <= PAID_OFF_AT) {
        return { paidOff: true, payments, interest, lastPaymentOn: formatDate(day) };
      }
    }
  }
  return { paidOff: false, payments: null, interest: null, lastPaymentOn: null };
}

/**
 * Compares paying a credit card's minimum, a fixed amount and the full
 * balance (brief 4.6, D102), starting from what's left on `from`. Each month
 * the statement adds interest and sets the minimum (D101), and the payment
 * goes out on the next `paysOn` day. All of it is an estimate.
 */
export function compareCardPayments(input: CardComparisonInput): CardComparison {
  if (input === null || typeof input !== 'object') {
    throw new EngineInputError('bad-input', 'The comparison needs the card.');
  }
  const from = parseDate(input.from, 'from');
  const card = checkDebt(input.card, from);
  if (card.debt.kind !== 'credit-card') {
    throw new EngineInputError('credit-card-only', `Debt ${card.debt.id} isn't a credit card.`);
  }
  if (card.statementDay === null) {
    throw new EngineInputError(
      'needs-statement-day',
      `Debt ${card.debt.id} needs a statement day (D13).`,
    );
  }
  const left = checkPenceNotNegative(input.left, 'What is left');
  const fixed = checkPenceNotNegative(input.fixed, 'The fixed amount');
  const paysOn = input.paysOn;
  if (typeof paysOn !== 'number' || !Number.isInteger(paysOn) || paysOn < 1 || paysOn > 31) {
    throw new EngineInputError('bad-day', 'The payment day must be a whole number from 1 to 31.');
  }
  return {
    minimum: card.minimum?.kind === 'rule' ? payOff(card, left, from, paysOn, 'minimum', 0) : null,
    fixed: payOff(card, left, from, paysOn, 'fixed', fixed),
    full: payOff(card, left, from, paysOn, 'full', 0),
  };
}
