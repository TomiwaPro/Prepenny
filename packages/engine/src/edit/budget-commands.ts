// Adding, changing and ending budgets (brief 4.5, D152). Each is one edit,
// so one undo (D87).

import { statementPeriods } from '../budgets/periods.ts';
import type { Budget, BudgetAmountBefore } from '../budgets/types.ts';
import { addDays, type Day, formatDate, parseDate } from '../dates/day.ts';
import { checkPence, type Pence } from '../money/pence.ts';
import {
  budgetCalendar,
  budgetLastDay,
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
import type { BudgetEdits, EditCommand } from './types.ts';

/** A budget's amount: above zero, because a budget of £0.00 plans nothing (D152). */
function checkAmount(amount: unknown, what: string): Pence {
  if (checkPence(amount as number, `${what}: the amount`) <= 0) {
    refuse('budget-zero', `${what}: the amount must be above zero.`);
  }
  return amount as Pence;
}

/**
 * A new budget (brief 4.5, D107, D152). Like a payment's next date (D86,
 * D150), it starts today or later. Roll-over counts from its first period.
 */
export function addBudget(
  context: Context,
  command: Extract<EditCommand, { kind: 'add-budget' }>,
): void {
  const raw = command.budget;
  checkObject(raw, 'the budget');
  const id = checkNewId(context, 'budget', raw.id, 'budget');
  const what = `Budget ${id}`;
  const name = checkName(raw.name, what);
  openAccount(context, raw.accountId, what);
  const amount = checkAmount(raw.amount, what);
  if (parseDate(raw.startsOn, `${what}: the start`) < context.today) {
    refuse('starts-before-today', `${what}: it starts before today.`);
  }
  const value = clean<Budget>({
    id,
    accountId: raw.accountId,
    name,
    amount,
    every: raw.every,
    leaves: raw.leaves,
    rollOver: raw.rollOver,
    startsOn: raw.startsOn,
    endsOn: raw.endsOn,
    billDay: raw.billDay,
    statementDay: raw.statementDay,
    createdAt: raw.createdAt,
  });
  context.draft.set({ kind: 'budget', id, value });
  checkNow(context);
}

/** The budget as it is now, refused when it isn't in the plan or has ended. */
function budgetNow(context: Context, id: unknown): Budget {
  if (typeof id !== 'string' || id === '') refuse('bad-command', 'The command needs the budget.');
  const budget =
    recordNow(context, 'budget', id) ?? refuse('unknown-budget', `Budget ${id} isn't in the plan.`);
  const checked = context.checked.budgets.get(id);
  const lastDay = checked === undefined ? null : budgetLastDay(context, checked);
  if (lastDay !== null && lastDay < context.today) {
    refuse('budget-ended', `Budget ${id} has ended.`);
  }
  return budget;
}

/**
 * True when a pay-later budget has anything stored against its bills: a
 * tick or a one-off change. A bill is found by its date (D111), so these
 * would lose their bill if the bill days moved (D152).
 */
function billsHaveHistory(context: Context, id: string, after: Day | null = null): boolean {
  const later = (days: Iterable<Day> | undefined) =>
    [...(days ?? [])].some((day) => after === null || day > after);
  return (
    later(context.checked.ticks.get(id)?.keys()) || later(context.checked.changes.get(id)?.keys())
  );
}

/** A pay-later budget's first bill (D111), or null for any other budget. */
function firstBill(budget: Draftable<Budget>): Day | null {
  if (budget.leaves !== 'pay-later' || typeof budget.billDay !== 'number') return null;
  const calendar = statementPeriods(budget.billDay, budget.statementDay ?? null);
  return calendar.periodOf(parseDate(budget.startsOn as string)).bill;
}

/**
 * Refuses a change that moves a budget's bills (D152): to or from a
 * pay-later bill, a new bill day, or a new statement day for the card. A
 * bill is found by its date (D111) and pays for the spends of its statement
 * period (D61), so the bills can only move while the first one is still to
 * come and nothing is stored against them: no tick or change on a bill, and,
 * to or from a pay-later bill or for a new bill day, no spends. A bill can
 * never be made for a day before today, as a payment can't (D150).
 */
function refuseMovedBills(
  context: Context,
  budget: Budget,
  next: Draftable<Budget>,
  what: string,
): void {
  const switches = (budget.leaves === 'pay-later') !== (next.leaves === 'pay-later');
  const billDayMoves = switches || next.billDay !== budget.billDay;
  if (!billDayMoves && next.statementDay === budget.statementDay) return;
  const spends = context.checked.spends.get(budget.id)?.length ?? 0;
  const before = firstBill(budget);
  if (
    billsHaveHistory(context, budget.id) ||
    (billDayMoves && spends > 0) ||
    (before !== null && before < context.today)
  ) {
    refuse(
      'budget-has-history',
      `${what} has spends or bills already, so its bills stay as they are. End it and add a new budget.`,
    );
  }
  const after = firstBill(next);
  if (after !== null && after < context.today) {
    refuse(
      'bill-before-today',
      `${what}: its first bill would be on ${formatDate(after)}, before today.`,
    );
  }
}

/**
 * The amounts a budget had before an amount change today (D152). The new
 * amount counts from the period with today in it: periods that have ended
 * keep what they had, for roll-over and pay-later bills. Nothing is added
 * when no period has ended, or when they're already kept.
 */
function amountsBefore(context: Context, budget: Budget): BudgetAmountBefore[] | undefined {
  const kept = budget.amountsBefore === undefined ? [] : [...budget.amountsBefore];
  const checked = context.checked.budgets.get(budget.id);
  if (checked === undefined) return budget.amountsBefore === undefined ? undefined : kept;
  const calendar = budgetCalendar(context, checked);
  if (calendar.periodOf(checked.startsOn).end >= context.today) {
    return budget.amountsBefore === undefined ? undefined : kept;
  }
  const lastEnded = addDays(calendar.periodOf(context.today).start, -1);
  const known = kept.at(-1);
  if (known === undefined || parseDate(known.until) < lastEnded) {
    kept.push({ until: formatDate(lastEnded), amount: budget.amount });
  }
  return kept;
}

/**
 * Changes a budget (D152): its name; its amount, from the period with today
 * in it; how it leaves the account; roll-over, switched on from today
 * (D110); and a pay-later budget's bill day and the card's statement day.
 *
 * Changing to or from a pay-later bill is refused once the budget has spends
 * or its bills have a tick or a change, because they'd count differently
 * (D61): end it and add a new budget instead. The same goes for a new bill
 * day once a bill has a tick or a change.
 */
export function changeBudget(context: Context, budgetId: string, raw: BudgetEdits): void {
  const budget = budgetNow(context, budgetId);
  const id = budget.id;
  const what = `Budget ${id}`;
  const edits = checkEdits(raw, what);
  const next: Draftable<Budget> = { ...budget };
  if (edits.name !== undefined) next.name = checkName(edits.name, what);
  if (edits.amount !== undefined && checkAmount(edits.amount, what) !== budget.amount) {
    next.amountsBefore = amountsBefore(context, budget);
    next.amount = edits.amount;
  }
  if (edits.leaves !== undefined && edits.leaves !== budget.leaves) {
    // Only a pay-later budget has bill days (D107).
    if (budget.leaves === 'pay-later' && edits.leaves !== 'pay-later') {
      next.billDay = undefined;
      next.statementDay = undefined;
    }
    next.leaves = edits.leaves;
  }
  if (edits.billDay !== undefined) next.billDay = edits.billDay;
  if (edits.statementDay !== undefined) {
    next.statementDay = edits.statementDay === null ? undefined : edits.statementDay;
  }
  refuseMovedBills(context, budget, next, what);
  if (edits.rollOver !== undefined && edits.rollOver !== budget.rollOver) {
    if (typeof edits.rollOver !== 'boolean') {
      refuse('bad-command', `${what}: roll-over is true or false.`);
    }
    // Switched on, only periods that end from today on roll over (D110).
    next.rollOver = edits.rollOver;
    next.rollOverFrom = edits.rollOver ? formatDate(context.today) : undefined;
  }
  context.draft.set({ kind: 'budget', id, value: clean<Budget>(next) });
  checkNow(context);
}

/**
 * Ends a budget (D107, D152): its last period is the one with `endsOn` in
 * it, today or later. Refused for a pay-later budget when a bill after its
 * new last bill has a tick or a change.
 */
export function endBudget(context: Context, budgetId: string, endsOn: string): void {
  const budget = budgetNow(context, budgetId);
  const what = `Budget ${budget.id}`;
  const day = parseDate(endsOn, `${what}: the end`);
  if (day < context.today) refuse('ends-before-today', `${what}: the end is before today.`);
  if (day < parseDate(budget.startsOn)) {
    refuse('ends-before-start', `${what}: the end is before its start.`);
  }
  if (budget.billDay !== undefined) {
    const lastBill = statementPeriods(budget.billDay, budget.statementDay ?? null).periodOf(day)
      .bill as Day;
    if (billsHaveHistory(context, budget.id, lastBill)) {
      refuse('budget-has-history', `${what} has a ticked or changed bill after its new end.`);
    }
  }
  context.draft.set({ kind: 'budget', id: budget.id, value: { ...budget, endsOn } });
  checkNow(context);
}
