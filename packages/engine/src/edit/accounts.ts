// Adding, changing and closing accounts (brief 4.2, D151). Each is one edit,
// so one undo (D87).

import { ACCOUNT_KINDS, type Account, type BalanceUpdate } from '../balance/types.ts';
import { checkPence, checkPenceNotNegative } from '../money/pence.ts';
import { paymentAtIndex } from '../schedule/payments.ts';
import type { PreparedSeries } from '../schedule/series.ts';
import {
  budgetLastDay,
  checkEdits,
  checkName,
  checkNewId,
  checkNow,
  checkObject,
  recordNow,
} from './checks.ts';
import { type Context, refuse } from './context.ts';
import { clean } from './records.ts';
import type { AccountEdits, EditCommand } from './types.ts';

function checkKind(kind: unknown, what: string): Account['kind'] {
  if (!(ACCOUNT_KINDS as readonly unknown[]).includes(kind)) {
    refuse('bad-account', `${what}: the kind must be one of ${ACCOUNT_KINDS.join(', ')}.`);
  }
  return kind as Account['kind'];
}

/**
 * A new account with the balance its bank shows (brief 4.1, 4.2, D151): the
 * account and its first balance update, in one edit. Every account needs a
 * balance to start from (D85), so they're never added apart.
 */
export function addAccount(
  context: Context,
  command: Extract<EditCommand, { kind: 'add-account' }>,
): void {
  const { account, balance } = command;
  checkObject(account, 'the account');
  checkObject(balance, 'the balance');
  const id = checkNewId(context, 'account', account.id, 'account');
  const what = `Account ${id}`;
  const value = clean<Account>({
    id,
    name: checkName(account.name, what),
    kind: checkKind(account.kind, what),
    overdraftLimit: checkPenceNotNegative(account.overdraftLimit, `${what}: the overdraft limit`),
    warningLevel: checkPence(account.warningLevel, `${what}: the warning level`),
  });
  context.draft.set({ kind: 'account', id, value });
  // The first balance update is checked like any other (brief 4.2, D33, D85).
  const update: BalanceUpdate = {
    id: balance.id,
    accountId: id,
    balance: balance.balance,
    checkedOn: balance.checkedOn,
    checkedAt: balance.checkedAt,
  };
  if (typeof update.id !== 'string' || update.id === '') {
    refuse('needs-id', `${what}: the command needs an id for its balance update.`);
  }
  if (context.draft.get({ kind: 'balance-update', id: update.id, value: null }) !== null) {
    refuse('id-taken', `${update.id} is already used, so it can't be the new balance update.`);
  }
  context.draft.set({ kind: 'balance-update', id: update.id, value: update });
  checkNow(context);
}

/** The account as it is now, refused when it isn't in the plan or is closed. */
function accountNow(context: Context, id: unknown): Account {
  if (typeof id !== 'string' || id === '') refuse('bad-command', 'The command needs the account.');
  const account =
    recordNow(context, 'account', id) ??
    refuse('unknown-account', `Account ${id} isn't in the plan.`);
  if (account.closed === true) refuse('account-closed', `Account ${id} is closed.`);
  return account;
}

/** Changes an account's name, kind, overdraft limit or warning level (D151). */
export function changeAccount(context: Context, accountId: string, raw: AccountEdits): void {
  const account = accountNow(context, accountId);
  const what = `Account ${account.id}`;
  const edits = checkEdits(raw, what);
  const value = clean<Account>({
    ...account,
    name: edits.name === undefined ? account.name : checkName(edits.name, what),
    kind: edits.kind === undefined ? account.kind : checkKind(edits.kind, what),
    overdraftLimit:
      edits.overdraftLimit === undefined
        ? account.overdraftLimit
        : checkPenceNotNegative(edits.overdraftLimit, `${what}: the overdraft limit`),
    warningLevel:
      edits.warningLevel === undefined
        ? account.warningLevel
        : checkPence(edits.warningLevel, `${what}: the warning level`),
  });
  context.draft.set({ kind: 'account', id: account.id, value });
  checkNow(context);
}

/**
 * True when a series still moves money in the plan: a payment from today on,
 * or one before today that isn't ticked yet (D11). A payment that's removed,
 * or ticked with its money set aside ticked too, is settled (D83, D116).
 */
function stillPlanned(context: Context, prepared: PreparedSeries): boolean {
  if (prepared.count === Number.POSITIVE_INFINITY) return true;
  const id = prepared.series.id;
  const ticks = context.checked.ticks.get(id);
  const setAsideTicks = context.checked.setAsideTicks.get(id);
  const setsAside = prepared.series.setAside !== undefined;
  for (let index = 0; index < prepared.count; index += 1) {
    const payment = paymentAtIndex(
      prepared,
      index,
      context.checked.changes,
      context.input.holidays,
    );
    const ticked =
      ticks?.has(payment.originalDay) === true &&
      (!setsAside || setAsideTicks?.has(payment.originalDay) === true);
    if (!ticked && !payment.skipped) return true;
  }
  return false;
}

/**
 * Closes an account (D151). Refused while anything is still planned in it:
 * a payment, money set aside or a budget's bill that's still to come or not
 * ticked yet, a budget that hasn't ended, or a savings goal kept in it. The
 * account keeps its balance updates for the history.
 */
export function closeAccount(context: Context, accountId: string): void {
  const account = accountNow(context, accountId);
  const id = account.id;
  const inUse = (why: string): never =>
    refuse('account-in-use', `Account ${id} can't be closed while ${why}.`);
  for (const prepared of context.checked.prepared) {
    const { series } = prepared;
    const touches =
      series.accountId === id || series.toAccountId === id || series.setAside?.accountId === id;
    if (touches && stillPlanned(context, prepared)) {
      inUse(`series ${series.id} still has payments in it`);
    }
  }
  for (const [budgetId, budget] of context.checked.budgets) {
    if (budget.budget.accountId !== id) continue;
    const lastDay = budgetLastDay(context, budget);
    if (lastDay === null || lastDay >= context.today) {
      inUse(`budget ${budgetId} hasn't ended`);
    }
  }
  for (const [goalId, { goal }] of context.checked.goals) {
    if (goal.accountId === id && goal.closed !== true) inUse(`goal ${goalId} is kept in it`);
  }
  context.draft.set({ kind: 'account', id, value: { ...account, closed: true } });
}
