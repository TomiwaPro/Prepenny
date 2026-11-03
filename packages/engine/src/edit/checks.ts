// What every command for adding and changing records checks (D149): new
// ids, names, the accounts they use, and that the records afterwards still
// make a plan. Messages name ids and fields only, never amounts, names or
// notes (CLAUDE.md: privacy).

import { checkRecords } from '../balance/plan.ts';
import type { Account } from '../balance/types.ts';
import type { CheckedBudget } from '../budgets/check.ts';
import { type BudgetCalendar, budgetPay, calendarOf } from '../budgets/periods.ts';
import type { Budget } from '../budgets/types.ts';
import type { Day } from '../dates/day.ts';
import type { Debt } from '../debts/types.ts';
import type { Goal } from '../goals/types.ts';
import type { PayProfile, PayWeek } from '../pay/types.ts';
import { mainPaydaysOf } from '../periods/main-pay.ts';
import type { Series } from '../schedule/types.ts';
import { type Context, refuse } from './context.ts';
import { applyWrites } from './records.ts';
import type { RecordWrite } from './types.ts';

/** The records a command can add, found by their own id, by kind. */
interface AddedRecords {
  readonly account: Account;
  readonly series: Series;
  readonly debt: Debt;
  readonly budget: Budget;
  readonly goal: Goal;
  readonly 'pay-profile': PayProfile;
  readonly 'pay-week': PayWeek;
}

export type AddedKind = keyof AddedRecords;

/** The record of a kind with an id as it is now in this edit, or null. */
export function recordNow<K extends AddedKind>(
  context: Context,
  kind: K,
  id: string,
): AddedRecords[K] | null {
  return context.draft.get({ kind, id, value: null } as RecordWrite) as AddedRecords[K] | null;
}

/** Refuses a command's record that isn't an object. */
export function checkObject(value: unknown, what: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    refuse('bad-command', `The command needs ${what}.`);
  }
}

/**
 * The id for a new record (D87): text, and not already used. A budget's
 * bills are a series with the budget's id (D111), so series and budgets
 * share their ids.
 */
export function checkNewId(context: Context, kind: AddedKind, id: unknown, what: string): string {
  if (typeof id !== 'string' || id === '') {
    refuse('needs-id', `The command needs an id for the new ${what}.`);
  }
  const shared: readonly AddedKind[] =
    kind === 'series' || kind === 'budget' ? ['series', 'budget'] : [kind];
  if (shared.some((one) => recordNow(context, one, id) !== null)) {
    refuse('id-taken', `${id} is already used, so it can't be the new ${what}.`);
  }
  return id;
}

/** A name a person typed: text with something in it (D149). */
export function checkName(name: unknown, what: string): string {
  if (typeof name !== 'string') refuse('bad-command', `${what}: the name must be text.`);
  if (name.trim() === '') refuse('needs-name', `${what} needs a name.`);
  return name;
}

/** An account in the plan that isn't closed, for something new to use (D151). */
export function openAccount(context: Context, id: unknown, what: string): Account {
  if (typeof id !== 'string' || id === '') {
    refuse('needs-account', `${what} needs an account.`);
  }
  const account =
    recordNow(context, 'account', id) ??
    refuse('unknown-account', `${what} is for account ${id}, which isn't in the plan.`);
  if (account.closed === true) {
    refuse('account-closed', `${what} is for account ${id}, which is closed.`);
  }
  return account;
}

/** Refuses edits that aren't an object, and gives back the fields that were given. */
export function checkEdits<E extends object>(edits: E, what: string): E {
  checkObject(edits, `${what}'s edits`);
  return edits;
}

/**
 * Checks that the records, with what this edit has saved so far, still make
 * a plan (D149). A command checks what it can itself first, with its own
 * codes; anything else is refused here with the code of the check that
 * found it, such as `bad-goal-link` or `unknown-pay-week`.
 */
export function checkNow(context: Context): void {
  checkRecords(applyWrites(context.input, context.draft.result().writes), context.today, true);
}

/** The periods a budget follows, from the main pay as it is (D29, D108). */
export function budgetCalendar(context: Context, budget: CheckedBudget): BudgetCalendar {
  const { prepared, changes } = context.checked;
  const familyId = context.input.mainPayFamilyId;
  const main = mainPaydaysOf(familyId, prepared, changes, context.input.holidays);
  return calendarOf(budget, budgetPay(main, familyId, prepared, context.today));
}

/** The last day of a budget's last period, or null when it never ends (D107). */
export function budgetLastDay(context: Context, budget: CheckedBudget): Day | null {
  return budget.endsOn === null
    ? null
    : budgetCalendar(context, budget).periodOf(budget.endsOn).end;
}
