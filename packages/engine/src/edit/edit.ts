// editPlan: one command in, the records to save and the undo out (brief 5.4,
// ARCHITECTURE.md 2.3). Pure: it reads no clock and saves nothing. The same
// function can run again on newer records when a sync clash needs it
// (ARCHITECTURE.md 3.5).

import { checkRecords } from '../balance/plan.ts';
import { paidDate } from '../balance/ticks.ts';
import type { BalanceUpdate, Tick } from '../balance/types.ts';
import { type Day, formatDate, parseDate } from '../dates/day.ts';
import { parseTime } from '../dates/time.ts';
import { EngineInputError } from '../errors.ts';
import { checkPence, checkPenceNotNegative } from '../money/pence.ts';
import { mainPaydaysOf } from '../periods/main-pay.ts';
import {
  type Context,
  changeOne,
  type Found,
  findPayment,
  isSharedHalf,
  type OneOff,
  otherHalfPayment,
  refuse,
} from './context.ts';
import { removeThisAndLater, thisAndLater } from './later.ts';
import { applyWrites, checkWrites, clean, Draft, keyOf, sameValue, tickWrite } from './records.ts';
import type {
  Edit,
  EditCommand,
  EditInput,
  JustThisOneEdits,
  PaymentRef,
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

/**
 * Ticks a payment as paid, and the same payment in the other half of a
 * private transfer. The paid date is worked out once, now (D71, D83): the
 * day it's ticked if that's before the payment's date, otherwise the
 * payment's own date after any weekend, bank holiday or move.
 */
function tick(
  context: Context,
  ref: PaymentRef,
  tickedAt: string,
  inBalanceUpdate: string | undefined,
): void {
  const found = findPayment(context, ref);
  parseTime(tickedAt, `Series ${ref.seriesId}: when it was ticked`);
  if (context.draft.tick(found.prepared.series.id, found.originalDate) !== null) {
    refuse(
      'already-ticked',
      `Series ${ref.seriesId}: the payment first due on ${found.originalDate} is already ticked.`,
    );
  }
  const paidOn = paidDate(formatDate(found.payment.day), context.input.today);
  for (const one of bothHalves(context, found)) {
    const value = clean<Tick>({
      seriesId: one.prepared.series.id,
      originalDate: one.originalDate,
      tickedAt,
      paidOn,
      inBalanceUpdate,
    });
    context.draft.set(tickWrite(value.seriesId, value.originalDate, value));
  }
}

function untick(context: Context, ref: PaymentRef): void {
  const found = findPayment(context, ref);
  if (context.draft.tick(found.prepared.series.id, found.originalDate) === null) {
    refuse(
      'not-ticked',
      `Series ${ref.seriesId}: the payment first due on ${found.originalDate} isn't ticked.`,
    );
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
    tick(context, one, one?.tickedAt, update.id);
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
  // A series the undo takes away mustn't leave behind a change or tick made
  // on it since, or that later change would be lost without anyone knowing.
  for (const write of before) {
    if (write.kind !== 'series' || write.value !== null) continue;
    const days = [
      ...(context.checked.changes.get(write.id)?.keys() ?? []),
      ...(context.checked.ticks.get(write.id)?.keys() ?? []),
    ];
    for (const day of days) {
      const date = formatDate(day);
      if (
        context.draft.change(write.id, date) !== null ||
        context.draft.tick(write.id, date) !== null
      ) {
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
      thisAndLater(
        context,
        command,
        command.edits,
        command.newSeriesId,
        command.newOtherHalfSeriesId,
      );
      break;
    case 'remove-this-and-later':
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
      tick(context, command, command.tickedAt, command.inBalanceUpdate);
      break;
    case 'untick':
      untick(context, command);
      break;
    case 'update-balance':
      updateBalance(context, command.update, command.ticks ?? []);
      break;
    case 'undo':
      undo(context, command.edit);
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
  const checked = checkRecords(input, today);
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
    checkRecords(applyWrites(input, edit.writes), today);
  } catch (error) {
    if (error instanceof EngineInputError) {
      refuse('edit-breaks-plan', `The edit would leave the plan unusable. ${error.message}`);
    }
    throw error;
  }
  return edit;
}
