// Checking debts (D98). Messages name ids and fields only, never amounts,
// names or notes (CLAUDE.md: privacy).

import { type Day, parseDate } from '../dates/day.ts';
import { type Moment, parseTime } from '../dates/time.ts';
import { EngineInputError } from '../errors.ts';
import { type Decimal, parseDecimal } from '../money/decimal.ts';
import { checkPenceNotNegative } from '../money/pence.ts';
import type { Series } from '../schedule/types.ts';
import { DEBT_KINDS, type Debt, type MinimumRule } from './types.ts';

/** The currency of pounds. Every other currency needs a rate (brief 4.6). */
export const POUNDS = 'GBP';

/** A minimum rule, checked, with its percentage ready for exact maths. */
export type CheckedMinimum =
  | { readonly kind: 'typed'; readonly amount: number }
  | { readonly kind: 'rule'; readonly percent: Decimal; readonly atLeast: number };

/** A debt, checked, with its dates, time and rates ready to use. */
export interface CheckedDebt {
  readonly debt: Debt;
  readonly balanceOn: Day;
  readonly balanceAt: Moment;
  /** Null for pounds. */
  readonly rate: Decimal | null;
  /** Null when there's no interest rate. */
  readonly interestRate: Decimal | null;
  /** "0% until" this day (D106), or null. */
  readonly zeroInterestUntil: Day | null;
  readonly statementDay: number | null;
  readonly minimum: CheckedMinimum | null;
}

function fail(id: string, code: string, message: string): never {
  throw new EngineInputError(code, `Debt ${id}: ${message}`);
}

function notNegativeDecimal(id: string, text: unknown, what: string): Decimal {
  const value = parseDecimal(text as string, `Debt ${id}: ${what}`);
  if (value.units < 0n) fail(id, 'bad-debt', `${what} can't be below zero.`);
  return value;
}

function checkMinimum(id: string, rule: MinimumRule): CheckedMinimum {
  switch (rule?.kind) {
    case 'typed':
      return {
        kind: 'typed',
        amount: checkPenceNotNegative(rule.amount, `Debt ${id}: the minimum`),
      };
    case 'rule':
      return {
        kind: 'rule',
        percent: notNegativeDecimal(id, rule.percent, 'the minimum percentage'),
        atLeast: checkPenceNotNegative(rule.atLeast, `Debt ${id}: the lowest minimum`),
      };
    default:
      return fail(id, 'bad-debt', 'the minimum must be typed or a rule.');
  }
}

/** Checks one debt and gets it ready. `today` is the person's own date (D85, D98). */
export function checkDebt(debt: Debt, today: Day): CheckedDebt {
  if (typeof debt?.id !== 'string' || debt.id === '') {
    throw new EngineInputError('bad-debt', 'A debt needs an id.');
  }
  const id = debt.id;
  if (typeof debt.name !== 'string') fail(id, 'bad-debt', 'its name must be text.');
  if (!(DEBT_KINDS as readonly unknown[]).includes(debt.kind)) {
    fail(id, 'bad-debt', `the kind must be one of ${DEBT_KINDS.join(', ')}.`);
  }
  if (typeof debt.currency !== 'string' || !/^[A-Z]{3}$/.test(debt.currency)) {
    fail(id, 'bad-debt', 'the currency must be three capital letters, such as GBP or EUR.');
  }
  let rate: Decimal | null = null;
  if (debt.currency === POUNDS) {
    if (debt.rate !== undefined) fail(id, 'bad-rate', 'a debt in pounds has no rate.');
  } else {
    if (debt.rate === undefined) {
      fail(id, 'bad-rate', 'a debt in another currency needs a rate per £1.');
    }
    rate = parseDecimal(debt.rate, `Debt ${id}: the rate`);
    if (rate.units <= 0n) fail(id, 'bad-rate', 'the rate must be above zero.');
  }
  checkPenceNotNegative(debt.balance, `Debt ${id}: the balance`);
  checkPenceNotNegative(debt.startingBalance, `Debt ${id}: the starting balance`);
  const balanceOn = parseDate(debt.balanceOn, `Debt ${id}: the balance date`);
  if (balanceOn > today) {
    fail(id, 'balance-after-today', 'the balance date is after today.');
  }
  const balanceAt = parseTime(debt.balanceAt, `Debt ${id}: when the balance was typed in`);
  if (
    debt.belongsTo !== undefined &&
    (typeof debt.belongsTo !== 'string' || debt.belongsTo === '')
  ) {
    fail(id, 'bad-debt', 'the person it belongs to must be an id.');
  }
  if (debt.closed !== undefined && typeof debt.closed !== 'boolean') {
    fail(id, 'bad-debt', 'closed must be true or false.');
  }

  const card = debt.kind === 'credit-card';
  for (const field of [
    'interestRate',
    'zeroInterestUntil',
    'statementDay',
    'minimumRule',
  ] as const) {
    if (debt[field] !== undefined && !card) {
      fail(id, 'credit-card-only', `only a credit card has ${field} (D98).`);
    }
  }
  const interestRate =
    debt.interestRate === undefined
      ? null
      : notNegativeDecimal(id, debt.interestRate, 'the interest rate');
  const zeroInterestUntil =
    debt.zeroInterestUntil === undefined
      ? null
      : parseDate(debt.zeroInterestUntil, `Debt ${id}: the date 0% ends`);
  const minimum = debt.minimumRule === undefined ? null : checkMinimum(id, debt.minimumRule);
  let statementDay: number | null = null;
  if (debt.statementDay !== undefined) {
    if (
      typeof debt.statementDay !== 'number' ||
      !Number.isInteger(debt.statementDay) ||
      debt.statementDay < 1 ||
      debt.statementDay > 31
    ) {
      fail(id, 'bad-debt', 'the statement day must be a whole number from 1 to 31.');
    }
    statementDay = debt.statementDay;
  }
  if (statementDay === null && (interestRate !== null || minimum?.kind === 'rule')) {
    fail(id, 'needs-statement-day', 'interest and a minimum rule need a statement day (D13).');
  }
  return {
    debt,
    balanceOn,
    balanceAt,
    rate,
    interestRate,
    zeroInterestUntil,
    statementDay,
    minimum,
  };
}

/** Checks every debt, and that no two share an id. */
export function checkDebts(debts: readonly Debt[], today: Day): Map<string, CheckedDebt> {
  if (!Array.isArray(debts)) {
    throw new EngineInputError('bad-debt', 'The debts must be a list.');
  }
  const byId = new Map<string, CheckedDebt>();
  for (const debt of debts) {
    const checked = checkDebt(debt, today);
    if (byId.has(debt.id)) {
      throw new EngineInputError('repeated-debt', `Debt ${debt.id} is listed twice.`);
    }
    byId.set(debt.id, checked);
  }
  return byId;
}

/**
 * Checks every series' link to a debt (D98): the debt is in the plan, and
 * the series isn't the private half of a private transfer. The series
 * themselves already refuse a link on money coming in, a transfer, or a
 * shared half.
 */
export function checkDebtLinks(
  series: readonly Series[],
  debts: ReadonlyMap<string, CheckedDebt>,
): void {
  const mirrored = new Set(
    series.flatMap((one) => (one.mirrorOf === undefined ? [] : [one.mirrorOf])),
  );
  for (const one of series) {
    if (one.debtId === undefined) continue;
    if (!debts.has(one.debtId)) {
      throw new EngineInputError(
        'unknown-debt',
        `Series ${one.id} is linked to a debt that isn't in the plan.`,
      );
    }
    if (mirrored.has(one.id)) {
      throw new EngineInputError(
        'bad-debt-link',
        `Series ${one.id} is half of a private transfer, so it can't be linked to a debt.`,
      );
    }
  }
}
