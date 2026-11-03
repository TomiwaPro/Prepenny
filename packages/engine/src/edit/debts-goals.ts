// Adding, changing and closing debts and savings goals (brief 4.6, 4.7,
// D153). Each is one edit, so one undo (D87). A debt's balance changes with
// "Update from statement" (D103), not here.

import { parseDate } from '../dates/day.ts';
import { checkDebt } from '../debts/check.ts';
import type { Debt } from '../debts/types.ts';
import { checkGoal } from '../goals/goals.ts';
import type { Goal } from '../goals/types.ts';
import { checkPence } from '../money/pence.ts';
import {
  checkEdits,
  checkName,
  checkNewId,
  checkNow,
  checkObject,
  openAccount,
  recordNow,
} from './checks.ts';
import { type Context, refuse } from './context.ts';
import { clean, type Draftable } from './records.ts';
import type { DebtEdits, EditCommand, GoalEdits } from './types.ts';

/**
 * Currencies that aren't counted in hundredths (ISO 4217): none, a
 * thousandth or a ten-thousandth. Every amount in a debt is counted in
 * hundredths, so these wait for later (brief Part 10, D98, D153).
 */
const NOT_IN_HUNDREDTHS = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'UYI',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
  'BHD',
  'IQD',
  'JOD',
  'KWD',
  'LYD',
  'OMR',
  'TND',
  'CLF',
  'UYW',
]);

function checkCurrency(currency: unknown, what: string): void {
  if (typeof currency === 'string' && NOT_IN_HUNDREDTHS.has(currency)) {
    refuse(
      'currency-not-in-hundredths',
      `${what}: ${currency} isn't counted in hundredths, so it can't be used yet.`,
    );
  }
}

/** A new value for a field that can be cleared: left as it is, cleared with null, or set. */
function edited<T>(value: T | null | undefined, now: T | undefined): T | undefined {
  return value === undefined ? now : value === null ? undefined : value;
}

/** A new debt (brief 4.6, D98, D153), checked like a stored one. */
export function addDebt(
  context: Context,
  command: Extract<EditCommand, { kind: 'add-debt' }>,
): void {
  const raw = command.debt;
  checkObject(raw, 'the debt');
  const id = checkNewId(context, 'debt', raw.id, 'debt');
  const what = `Debt ${id}`;
  checkCurrency(raw.currency, what);
  const value = clean<Debt>({
    id,
    name: checkName(raw.name, what),
    kind: raw.kind,
    currency: raw.currency,
    rate: raw.rate,
    balance: raw.balance,
    balanceOn: raw.balanceOn,
    balanceAt: raw.balanceAt,
    startingBalance: raw.startingBalance,
    interestRate: raw.interestRate,
    zeroInterestUntil: raw.zeroInterestUntil,
    statementDay: raw.statementDay,
    minimumRule: raw.minimumRule === undefined ? undefined : { ...raw.minimumRule },
    belongsTo: raw.belongsTo,
  });
  checkDebt(value, context.today);
  context.draft.set({ kind: 'debt', id, value });
  checkNow(context);
}

/** The debt as it is now, refused when it isn't in the plan or is closed. */
function openDebt(context: Context, id: unknown): Debt {
  if (typeof id !== 'string' || id === '') refuse('bad-command', 'The command needs the debt.');
  const debt =
    recordNow(context, 'debt', id) ?? refuse('unknown-debt', `Debt ${id} isn't in the plan.`);
  if (debt.closed === true) refuse('debt-closed', `Debt ${id} is closed.`);
  return debt;
}

/**
 * Changes a debt (D153): anything but its balance. A credit card's interest
 * rate, "0% until" (D106), statement day and minimum (D101) go with the
 * kind, so changing it to another kind needs them cleared with null.
 */
export function changeDebt(context: Context, debtId: string, raw: DebtEdits): void {
  const debt = openDebt(context, debtId);
  const what = `Debt ${debt.id}`;
  const edits = checkEdits(raw, what);
  if (edits.currency !== undefined) checkCurrency(edits.currency, what);
  const next: Draftable<Debt> = {
    ...debt,
    name: edits.name === undefined ? debt.name : checkName(edits.name, what),
    kind: edits.kind ?? debt.kind,
    currency: edits.currency ?? debt.currency,
    rate: edited(edits.rate, debt.rate),
    startingBalance: edits.startingBalance ?? debt.startingBalance,
    interestRate: edited(edits.interestRate, debt.interestRate),
    zeroInterestUntil: edited(edits.zeroInterestUntil, debt.zeroInterestUntil),
    statementDay: edited(edits.statementDay, debt.statementDay),
    minimumRule: edited(edits.minimumRule, debt.minimumRule),
    belongsTo: edited(edits.belongsTo, debt.belongsTo),
  };
  const value = clean<Debt>(next);
  checkDebt(value, context.today);
  context.draft.set({ kind: 'debt', id: debt.id, value });
  checkNow(context);
}

/** Closes a debt: it's still worked out, but left out of Owed now (D99, D153). */
export function closeDebt(context: Context, debtId: string): void {
  const debt = openDebt(context, debtId);
  context.draft.set({ kind: 'debt', id: debt.id, value: { ...debt, closed: true } });
}

/** A target above zero (brief 4.7, D114). */
function checkTarget(target: unknown, what: string): number {
  if (checkPence(target as number, `${what}: the target`) <= 0) {
    refuse('target-zero', `${what}: the target must be above zero.`);
  }
  return target as number;
}

/** A target date, "By, if you have a date": a new one can't be before today (D153). */
function checkTargetDate(context: Context, date: string | undefined, what: string): void {
  if (date !== undefined && parseDate(date, `${what}: the target date`) < context.today) {
    refuse('target-date-before-today', `${what}: the target date is before today.`);
  }
}

/** A new savings goal (brief 4.7, D114, D153), kept in an open account. */
export function addGoal(
  context: Context,
  command: Extract<EditCommand, { kind: 'add-goal' }>,
): void {
  const raw = command.goal;
  checkObject(raw, 'the goal');
  const id = checkNewId(context, 'goal', raw.id, 'goal');
  const what = `Goal ${id}`;
  const name = checkName(raw.name, what);
  openAccount(context, raw.accountId, what);
  checkTarget(raw.target, what);
  checkTargetDate(context, raw.targetDate, what);
  const value = clean<Goal>({
    id,
    name,
    target: raw.target,
    targetDate: raw.targetDate,
    accountId: raw.accountId,
    startingAmount: raw.startingAmount,
    belongsTo: raw.belongsTo,
  });
  checkGoal(value);
  context.draft.set({ kind: 'goal', id, value });
  checkNow(context);
}

/** The goal as it is now, refused when it isn't in the plan or is closed. */
function openGoal(context: Context, id: unknown): Goal {
  if (typeof id !== 'string' || id === '') refuse('bad-command', 'The command needs the goal.');
  const goal =
    recordNow(context, 'goal', id) ?? refuse('unknown-goal', `Goal ${id} isn't in the plan.`);
  if (goal.closed === true) refuse('goal-closed', `Goal ${id} is closed.`);
  return goal;
}

/**
 * Changes a savings goal (D153). Moving it to another account is refused
 * while a payment linked to it doesn't move money into or out of that
 * account (D114).
 */
export function changeGoal(context: Context, goalId: string, raw: GoalEdits): void {
  const goal = openGoal(context, goalId);
  const what = `Goal ${goal.id}`;
  const edits = checkEdits(raw, what);
  if (edits.accountId !== undefined) openAccount(context, edits.accountId, what);
  if (edits.target !== undefined) checkTarget(edits.target, what);
  if (edits.targetDate !== undefined && edits.targetDate !== null) {
    checkTargetDate(context, edits.targetDate, what);
  }
  const value = clean<Goal>({
    ...goal,
    name: edits.name === undefined ? goal.name : checkName(edits.name, what),
    target: edits.target ?? goal.target,
    targetDate: edited(edits.targetDate, goal.targetDate),
    accountId: edits.accountId ?? goal.accountId,
    startingAmount: edits.startingAmount ?? goal.startingAmount,
    belongsTo: edited(edits.belongsTo, goal.belongsTo),
  });
  checkGoal(value);
  context.draft.set({ kind: 'goal', id: goal.id, value });
  checkNow(context);
}

/** Closes a savings goal (D153). Payments linked to it keep their link. */
export function closeGoal(context: Context, goalId: string): void {
  const goal = openGoal(context, goalId);
  context.draft.set({ kind: 'goal', id: goal.id, value: { ...goal, closed: true } });
}
