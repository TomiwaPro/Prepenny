// editPlan: one command in, the records to save and the undo out (brief 5.4,
// ARCHITECTURE.md 2.3). Pure: it reads no clock and saves nothing. The same
// function can run again on newer records when a sync clash needs it
// (ARCHITECTURE.md 3.5).

import { checkRecords } from '../balance/plan.ts';
import { paidDate } from '../balance/ticks.ts';
import type { BalanceUpdate, Tick } from '../balance/types.ts';
import { checkSpend } from '../budgets/check.ts';
import type { Spend } from '../budgets/types.ts';
import { type Day, formatDate, parseDate } from '../dates/day.ts';
import { parseTime } from '../dates/time.ts';
import type { Debt } from '../debts/types.ts';
import { EngineInputError } from '../errors.ts';
import { checkPence, checkPenceNotNegative } from '../money/pence.ts';
import { mainPaydaysOf } from '../periods/main-pay.ts';
import { type PreparedSeries, prepareSeries } from '../schedule/series.ts';
import { addAccount, changeAccount, closeAccount } from './accounts.ts';
import { addBudget, changeBudget, endBudget } from './budget-commands.ts';
import {
  type Context,
  changeOne,
  type Found,
  findPayment,
  indexOf,
  isSharedHalf,
  type OneOff,
  otherHalfPayment,
  refuse,
} from './context.ts';
import { addDebt, addGoal, changeDebt, changeGoal, closeDebt, closeGoal } from './debts-goals.ts';
import { removeThisAndLater, thisAndLater } from './later.ts';
import { addPayment, deletePayment, linkPay } from './new-payments.ts';
import { recordPayAdjustment, refuseUndoOfPay, removePayAdjustment } from './pay.ts';
import { addPayProfile, addPayWeek, changePayProfile, changePayWeek } from './pay-records.ts';
import {
  applyWrites,
  changeWrite,
  checkWrites,
  clean,
  Draft,
  keyOf,
  sameValue,
  tickWrite,
} from './records.ts';
import { chooseMainPay, setNation } from './settings.ts';
import type {
  Edit,
  EditCommand,
  EditInput,
  JustThisOneEdits,
  PaymentRef,
  RecordWrite,
  TickInUpdate,
} from './types.ts';

/** The payment and, for a private transfer, the same payment in the other half (D94). */
function bothHalves(context: Context, found: Found): Found[] {
  const other = otherHalfPayment(context, found);
  return other === null ? [found] : [found, other];
}

function checkOneOff(edits: JustThisOneEdits, what: string): OneOff {
  if (edits === null || typeof edits !== 'object') {
    refuse('bad-command', `${what}: the command needs its edits.`);
  }
  for (const field of ['name', 'note'] as const) {
    if (edits[field] !== undefined && typeof edits[field] !== 'string') {
      refuse('bad-command', `${what}: the ${field} must be text.`);
    }
  }
  if (edits.isEstimate !== undefined && typeof edits.isEstimate !== 'boolean') {
    refuse('bad-command', `${what}: isEstimate must be true or false.`);
  }
  return {
    amount:
      edits.amount === undefined
        ? undefined
        : checkPenceNotNegative(edits.amount, `${what}: the amount`),
    day: edits.date === undefined ? undefined : parseDate(edits.date, `${what}: the date`),
    name: edits.name,
    note: edits.note,
    isEstimate: edits.isEstimate,
  };
}

/**
 * Changes one payment, and the same payment in the other half of a private
 * transfer. The shared half has no name or note of its own (D16, D94).
 */
function justThisOne(context: Context, found: Found, edits: OneOff): void {
  if (
    isSharedHalf(found.prepared.series) &&
    (edits.name !== undefined || edits.note !== undefined)
  ) {
    refuse(
      'shared-half',
      `Series ${found.prepared.series.id} is the shared half of a private transfer, which has no name or note of its own.`,
    );
  }
  for (const one of bothHalves(context, found)) {
    changeOne(
      context,
      one,
      isSharedHalf(one.prepared.series) ? { ...edits, name: undefined, note: undefined } : edits,
    );
  }
}

/** The first main payday after the payment's date (D14, D81). */
function nextPayday(context: Context, found: Found): Day {
  const main = mainPaydaysOf(
    context.input.mainPayFamilyId,
    context.checked.prepared,
    context.checked.changes,
    context.input.holidays,
  );
  if (main === null) {
    refuse('no-main-pay', 'There is no main pay, so there is no next payday to move to.');
  }
  return (
    main.firstAfter(found.payment.day) ??
    refuse('no-next-payday', `There is no main payday after ${formatDate(found.payment.day)}.`)
  );
}

/** True when a tick command is for the money set aside (D116). Anything else but true is refused. */
function setAsideOf(command: { readonly setAside?: true } | null | undefined): boolean {
  const value = command?.setAside;
  if (value !== undefined && value !== true) {
    refuse('bad-command', 'Set aside must be true, or left out.');
  }
  return value === true;
}

/** Refuses a set-aside tick for a series with no money set aside (D116). */
function refuseNoSetAside(found: Found, setAside: boolean): void {
  if (setAside && found.prepared.series.setAside === undefined) {
    refuse(
      'no-set-aside',
      `Series ${found.prepared.series.id} sets no money aside, so there's nothing to tick for it.`,
    );
  }
}

/**
 * Ticks a payment as paid, and the same payment in the other half of a
 * private transfer. The paid date is worked out once, now (D71, D83): the
 * day it's ticked if that's before the payment's date, otherwise the
 * payment's own date after any weekend, bank holiday or move.
 *
 * With `setAside`, it ticks the payment's money set aside instead, on its
 * own (D116). A series with money set aside is never half of a private
 * transfer (D113), so there's no other half to tick.
 */
function tick(
  context: Context,
  ref: PaymentRef,
  tickedAt: string,
  inside: { readonly inBalanceUpdate?: string; readonly inDebtUpdate?: string },
  setAside = false,
): void {
  const found = findPayment(context, ref);
  parseTime(tickedAt, `Series ${ref.seriesId}: when it was ticked`);
  if (
    inside.inDebtUpdate !== undefined &&
    (setAside || found.prepared.series.debtId !== inside.inDebtUpdate)
  ) {
    refuse(
      'not-linked',
      `Series ${ref.seriesId} isn't linked to debt ${inside.inDebtUpdate}, so it can't be ticked in its statement update.`,
    );
  }
  refuseNoSetAside(found, setAside);
  if (context.draft.tick(found.prepared.series.id, found.originalDate, setAside) !== null) {
    refuse(
      'already-ticked',
      setAside
        ? `Series ${ref.seriesId}: the money set aside on ${found.originalDate} is already ticked.`
        : `Series ${ref.seriesId}: the payment first due on ${found.originalDate} is already ticked.`,
    );
  }
  const paidOn = paidDate(formatDate(found.payment.day), context.input.today);
  if (setAside) {
    const value = clean<Tick>({
      seriesId: found.prepared.series.id,
      originalDate: found.originalDate,
      tickedAt,
      paidOn,
      inBalanceUpdate: inside.inBalanceUpdate,
      setAside: true,
    });
    context.draft.set(tickWrite(value.seriesId, value.originalDate, value, true));
    return;
  }
  for (const one of bothHalves(context, found)) {
    const value = clean<Tick>({
      seriesId: one.prepared.series.id,
      originalDate: one.originalDate,
      tickedAt,
      paidOn,
      inBalanceUpdate: inside.inBalanceUpdate,
      inDebtUpdate: inside.inDebtUpdate,
    });
    context.draft.set(tickWrite(value.seriesId, value.originalDate, value));
  }
}

function untick(context: Context, ref: PaymentRef, setAside = false): void {
  const found = findPayment(context, ref);
  refuseNoSetAside(found, setAside);
  if (context.draft.tick(found.prepared.series.id, found.originalDate, setAside) === null) {
    refuse(
      'not-ticked',
      setAside
        ? `Series ${ref.seriesId}: the money set aside on ${found.originalDate} isn't ticked.`
        : `Series ${ref.seriesId}: the payment first due on ${found.originalDate} isn't ticked.`,
    );
  }
  if (setAside) {
    context.draft.set(tickWrite(found.prepared.series.id, found.originalDate, null, true));
    return;
  }
  for (const one of bothHalves(context, found)) {
    context.draft.set(tickWrite(one.prepared.series.id, one.originalDate, null));
  }
}

/**
 * A new balance update (brief 4.2, D33), with anything ticked inside its
 * steps. Those ticks count as before the update (D33), and the whole Update
 * balance is one undo step (D87).
 */
function updateBalance(
  context: Context,
  update: EditInput['balanceUpdates'][number],
  ticks: readonly TickInUpdate[],
): void {
  if (update === null || typeof update !== 'object') {
    refuse('bad-command', 'The command needs the balance update.');
  }
  if (typeof update.id !== 'string' || update.id === '') {
    refuse('bad-balance', 'The balance update needs an id.');
  }
  const what = `Balance update ${update.id}`;
  if (context.checked.accountOfUpdate.has(update.id)) {
    refuse('id-taken', `${what} already exists.`);
  }
  if (!context.checked.accounts.has(update.accountId)) {
    refuse('unknown-account', `${what} is for an account not in the plan.`);
  }
  checkPence(update.balance, `${what}: the balance`);
  if (parseDate(update.checkedOn, `${what}: the balance date`) > context.today) {
    refuse('balance-after-today', `${what}: the balance date is after today.`);
  }
  const at = parseTime(update.checkedAt, `${what}: when it was made`);
  for (const other of context.input.balanceUpdates) {
    if (other.accountId === update.accountId && parseTime(other.checkedAt) === at) {
      refuse(
        'same-time-balances',
        `${what}: account ${update.accountId} already has a balance update at that time.`,
      );
    }
  }
  const value = clean<BalanceUpdate>({
    id: update.id,
    accountId: update.accountId,
    balance: update.balance,
    checkedOn: update.checkedOn,
    checkedAt: update.checkedAt,
  });
  context.draft.set({ kind: 'balance-update', id: value.id, value });
  if (!Array.isArray(ticks)) {
    refuse('bad-command', `${what}: the ticks must be a list.`);
  }
  for (const one of ticks) {
    tick(context, one, one?.tickedAt, { inBalanceUpdate: update.id }, setAsideOf(one));
  }
}

/**
 * "Update from statement" (brief 4.6, D62, D103): the debt's balance, its
 * date and the time of the update, with anything ticked in its steps. Those
 * ticks count as before the update, so they're already inside the new
 * balance (D62), and the whole update is one undo step (D87).
 */
function updateFromStatement(
  context: Context,
  command: Extract<EditCommand, { kind: 'update-from-statement' }>,
): void {
  const id = command.debtId;
  const checked =
    context.checked.debts.get(id) ?? refuse('unknown-debt', `Debt ${id} isn't in the plan.`);
  const what = `Debt ${id}`;
  const balance = checkPenceNotNegative(command.balance, `${what}: the balance`);
  if (parseDate(command.balanceOn, `${what}: the balance date`) > context.today) {
    refuse('balance-after-today', `${what}: the balance date is after today.`);
  }
  if (parseTime(command.balanceAt, `${what}: when it was updated`) <= checked.balanceAt) {
    refuse(
      'statement-not-newer',
      `${what}: the update must be later than its last one, so it's clear which ticks are inside it.`,
    );
  }
  const value = clean<Debt>({
    ...checked.debt,
    balance,
    balanceOn: command.balanceOn,
    balanceAt: command.balanceAt,
  });
  context.draft.set({ kind: 'debt', id, value });
  const ticks = command.ticks ?? [];
  if (!Array.isArray(ticks)) {
    refuse('bad-command', `${what}: the ticks must be a list.`);
  }
  for (const one of ticks) {
    tick(context, one, one?.tickedAt, { inDebtUpdate: id }, setAsideOf(one));
  }
}

/** "I spent" (brief 4.5, D115): a new spend, checked like the stored ones. */
function recordSpend(context: Context, spend: Spend): void {
  if (spend === null || typeof spend !== 'object') {
    refuse('bad-command', 'The command needs the spend.');
  }
  const checked = checkSpend(spend, context.checked.budgets);
  refuseLaterSpend(context, spend.id, checked.spentOn);
  const write: RecordWrite = { kind: 'spend', id: spend.id, value: null };
  if (context.draft.get(write) !== null) {
    refuse('id-taken', `Spend ${spend.id} already exists.`);
  }
  context.draft.set({
    ...write,
    value: clean<Spend>({
      id: spend.id,
      budgetId: spend.budgetId,
      amount: checked.spend.amount,
      spentOn: spend.spentOn,
      recordedAt: spend.recordedAt,
      note: spend.note === '' ? undefined : spend.note,
    }),
  });
}

function spendNow(context: Context, spendId: string): Spend {
  if (typeof spendId !== 'string' || spendId === '') {
    refuse('bad-command', 'The command needs the spend.');
  }
  return (
    (context.draft.get({ kind: 'spend', id: spendId, value: null }) as Spend | null) ??
    refuse('unknown-spend', `Spend ${spendId} isn't in the plan.`)
  );
}

/**
 * Changes a spend's amount, day or note (D115). When it was recorded stays
 * the same, so it's still inside the same balance update, or not (D2, D33).
 */
function changeSpend(
  context: Context,
  command: Extract<EditCommand, { kind: 'change-spend' }>,
): void {
  const spend = spendNow(context, command.spendId);
  const edits = command.edits;
  if (edits === null || typeof edits !== 'object') {
    refuse('bad-command', `Spend ${spend.id}: the command needs its edits.`);
  }
  const value = clean<Spend>({
    ...spend,
    amount: edits.amount ?? spend.amount,
    spentOn: edits.spentOn ?? spend.spentOn,
    note: edits.note === undefined ? spend.note : edits.note === '' ? undefined : edits.note,
  });
  const checked = checkSpend(value, context.checked.budgets);
  // Only a new day is checked: a spend stored with a later day, from a
  // partner whose today is already tomorrow (D85), can still have its
  // amount or note changed.
  if (edits.spentOn !== undefined) refuseLaterSpend(context, spend.id, checked.spentOn);
  context.draft.set({ kind: 'spend', id: spend.id, value });
}

/**
 * "I spent" takes today or an earlier day only (D119): a spend dated later
 * would count as inside the next balance update before the money has gone.
 * The plan itself still takes stored spends dated after today, because in a
 * shared plan a partner's today can be a day ahead (D85).
 */
function refuseLaterSpend(context: Context, id: string, spentOn: Day): void {
  if (spentOn > context.today) {
    refuse(
      'spend-after-today',
      `Spend ${id}: the day it was spent, ${formatDate(spentOn)}, is after today.`,
    );
  }
}

/** Removes a spend (D115). */
function removeSpend(context: Context, spendId: string): void {
  const spend = spendNow(context, spendId);
  context.draft.set({ kind: 'spend', id: spend.id, value: null });
}

/**
 * A pay-later budget's bills come from the budget (D111): one bill can be
 * changed, moved, removed or ticked, but changing this and all later ones
 * is a change to the budget itself.
 */
function refuseForBills(context: Context, ref: PaymentRef): void {
  if (context.checked.budgets.has(ref?.seriesId)) {
    refuse(
      'budget-bills',
      `Series ${ref.seriesId} is a pay-later budget's bills: to change this and later ones, change the budget.`,
    );
  }
}

/**
 * Undo (ARCHITECTURE.md 2.3): saves the "before" copies of an earlier edit
 * as a new edit. Refused when anything that edit saved has been changed
 * again since, so nobody's later change is lost without them knowing.
 */
function undo(context: Context, edit: Edit): void {
  if (edit === null || typeof edit !== 'object') {
    refuse('bad-edit', 'The command needs the edit to undo.');
  }
  const writes = checkWrites(edit.writes, 'The edit to undo');
  const before = checkWrites(edit.undo, "The edit's undo list");
  const keys = new Set(writes.map(keyOf));
  if (
    keys.size !== writes.length ||
    before.length !== writes.length ||
    before.some((write) => !keys.has(keyOf(write)))
  ) {
    refuse('bad-edit', "The edit to undo doesn't match its own undo list.");
  }
  for (const write of writes) {
    if (!sameValue(context.draft.get(write), write.value)) {
      refuse(
        'changed-since',
        'Something this edit changed has been changed again since, so it can no longer be undone.',
      );
    }
  }
  for (const write of before) {
    context.draft.set(write);
  }
  // Every change or tick made since, and not part of this edit, must still
  // belong to the same payment once the undo puts the series back, or that
  // later change would be lost without anyone knowing (D87).
  const undone = new Set(before.map(keyOf));
  const numberIn = (prepared: PreparedSeries | null, day: Day): number | null => {
    const index = prepared === null ? -1 : indexOf(prepared, day);
    return prepared === null || index < 0 ? null : prepared.firstNumber + index;
  };
  // A change or tick it puts back must still have its payment, unless the
  // undo puts back its series too. A payment removed since can't take it back.
  const seriesPutBack = new Set(before.flatMap((w) => (w.kind === 'series' ? [w.id] : [])));
  for (const write of before) {
    if (write.kind !== 'change' && write.kind !== 'tick') continue;
    if (write.value === null || seriesPutBack.has(write.seriesId)) continue;
    const series = context.byId.get(write.seriesId) ?? null;
    if (numberIn(series, parseDate(write.originalDate)) === null) {
      refuse(
        'changed-since',
        'The payment this edit changed has been removed or moved since, so it can no longer be undone.',
      );
    }
  }
  refuseUndoOfPay(context, writes, before);
  // Something saved since may use what this edit added, such as a payment in
  // a new account, or a goal's new account (D149). The records before the
  // edit made a plan, so if putting them back doesn't, something has changed since.
  try {
    checkRecords(applyWrites(context.input, context.draft.result().writes), context.today, true);
  } catch (error) {
    if (error instanceof EngineInputError) {
      refuse(
        'changed-since',
        'Something saved since depends on what this edit changed, so it can no longer be undone.',
      );
    }
    throw error;
  }
  for (const write of before) {
    if (write.kind !== 'series') continue;
    const now = context.byId.get(write.id) ?? null;
    const restored =
      write.value === null ? null : prepareSeries(write.value, context.input.holidays);
    const attached: [RecordWrite, Day][] = [];
    for (const day of context.checked.changes.get(write.id)?.keys() ?? []) {
      attached.push([changeWrite(write.id, formatDate(day), null), day]);
    }
    for (const day of context.checked.ticks.get(write.id)?.keys() ?? []) {
      attached.push([tickWrite(write.id, formatDate(day), null), day]);
    }
    for (const day of context.checked.setAsideTicks.get(write.id)?.keys() ?? []) {
      attached.push([tickWrite(write.id, formatDate(day), null, true), day]);
    }
    for (const [record, day] of attached) {
      if (undone.has(keyOf(record))) continue;
      const number = numberIn(now, day);
      if (number !== null && number !== numberIn(restored, day)) {
        refuse(
          'changed-since',
          'Something this edit made has been changed since, so it can no longer be undone.',
        );
      }
    }
  }
}

function run(context: Context, command: EditCommand): void {
  if (command === null || typeof command !== 'object') {
    refuse('bad-command', 'The edit needs a command.');
  }
  switch (command.kind) {
    case 'just-this-one': {
      const edits = checkOneOff(command.edits, `Series ${command.seriesId}`);
      justThisOne(context, findPayment(context, command), edits);
      break;
    }
    case 'move': {
      const day = parseDate(command.date, `Series ${command.seriesId}: the date to move it to`);
      justThisOne(context, findPayment(context, command), { day });
      break;
    }
    case 'move-to-next-payday': {
      const found = findPayment(context, command);
      justThisOne(context, found, { day: nextPayday(context, found) });
      break;
    }
    case 'remove-this-one': {
      const found = findPayment(context, command);
      if (found.payment.skipped) {
        refuse(
          'already-removed',
          `Series ${command.seriesId}: the payment first due on ${found.originalDate} is already removed.`,
        );
      }
      justThisOne(context, found, { skipped: true });
      break;
    }
    case 'this-and-later':
      refuseForBills(context, command);
      thisAndLater(
        context,
        command,
        command.edits,
        command.newSeriesId,
        command.newOtherHalfSeriesId,
      );
      break;
    case 'remove-this-and-later':
      refuseForBills(context, command);
      removeThisAndLater(context, command);
      break;
    case 'tick':
      if (
        command.inBalanceUpdate !== undefined &&
        !context.checked.accountOfUpdate.has(command.inBalanceUpdate)
      ) {
        refuse(
          'unknown-balance-update',
          `Balance update ${command.inBalanceUpdate} isn't in the plan.`,
        );
      }
      tick(
        context,
        command,
        command.tickedAt,
        command.inBalanceUpdate === undefined ? {} : { inBalanceUpdate: command.inBalanceUpdate },
        setAsideOf(command),
      );
      break;
    case 'untick':
      untick(context, command, setAsideOf(command));
      break;
    case 'update-balance':
      updateBalance(context, command.update, command.ticks ?? []);
      break;
    case 'update-from-statement':
      updateFromStatement(context, command);
      break;
    case 'spend':
      recordSpend(context, command.spend);
      break;
    case 'change-spend':
      changeSpend(context, command);
      break;
    case 'remove-spend':
      removeSpend(context, command.spendId);
      break;
    case 'overtime':
    case 'missed-shift':
      recordPayAdjustment(context, command);
      break;
    case 'remove-pay-adjustment':
      removePayAdjustment(context, command.id);
      break;
    case 'undo':
      undo(context, command.edit);
      break;
    case 'add-account':
      addAccount(context, command);
      break;
    case 'change-account':
      changeAccount(context, command.accountId, command.edits);
      break;
    case 'close-account':
      closeAccount(context, command.accountId);
      break;
    case 'add-payment':
      addPayment(context, command);
      break;
    case 'delete-payment':
      deletePayment(context, command.seriesId);
      break;
    case 'link-pay':
      linkPay(context, command);
      break;
    case 'add-debt':
      addDebt(context, command);
      break;
    case 'change-debt':
      changeDebt(context, command.debtId, command.edits);
      break;
    case 'close-debt':
      closeDebt(context, command.debtId);
      break;
    case 'add-budget':
      addBudget(context, command);
      break;
    case 'change-budget':
      changeBudget(context, command.budgetId, command.edits);
      break;
    case 'end-budget':
      endBudget(context, command.budgetId, command.endsOn);
      break;
    case 'add-goal':
      addGoal(context, command);
      break;
    case 'change-goal':
      changeGoal(context, command.goalId, command.edits);
      break;
    case 'close-goal':
      closeGoal(context, command.goalId);
      break;
    case 'add-pay-profile':
      addPayProfile(context, command);
      break;
    case 'change-pay-profile':
      changePayProfile(context, command.payProfileId, command.edits);
      break;
    case 'add-pay-week':
      addPayWeek(context, command);
      break;
    case 'change-pay-week':
      changePayWeek(context, command.payWeekId, command.edits);
      break;
    case 'choose-main-pay':
      chooseMainPay(context, command.familyId);
      break;
    case 'set-nation':
      setNation(context, command.nation);
      break;
    default:
      refuse('bad-command', 'The command is missing or unknown.');
  }
}

/**
 * Makes one edit (brief 5.4, ARCHITECTURE.md 2.3): takes the stored records,
 * one command and today, and gives back the records to save and the undo.
 * The engine never changes anything itself, and every id a new record needs
 * comes in with the command.
 *
 * One edit is always one undo step, however many records it touched. To
 * undo it, pass it back in an `undo` command, which saves its "before"
 * copies as a new edit.
 */
export function editPlan(input: EditInput, command: EditCommand): Edit {
  if (input === null || typeof input !== 'object') {
    refuse('bad-input', 'The edit needs the plan.');
  }
  const today = parseDate(input.today, 'today');
  if (
    input.mainPayFamilyId !== null &&
    (typeof input.mainPayFamilyId !== 'string' || input.mainPayFamilyId === '')
  ) {
    refuse('bad-main-pay', 'The main pay must be a family id, or null.');
  }
  const checked = checkRecords(input, today, true);
  const context: Context = {
    input,
    today,
    checked,
    byId: new Map(checked.prepared.map((one) => [one.series.id, one])),
    draft: new Draft(input),
  };
  run(context, command);
  const edit = context.draft.result();
  // A safety net: the records after the edit must still make a plan.
  try {
    checkRecords(applyWrites(input, edit.writes), today, true);
  } catch (error) {
    if (error instanceof EngineInputError) {
      refuse('edit-breaks-plan', `The edit would leave the plan unusable. ${error.message}`);
    }
    throw error;
  }
  return edit;
}
