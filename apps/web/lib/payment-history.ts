// A payment's History, in its edit sheet (step 3g, D469): every change to
// this one payment, newest first, who made it and when, and from what to
// what: "Tom changed it from £550.00 to £560.00, Tue 10 Nov, 2:05pm".
//
// From payment_history's answer: the changes that saved this payment's
// series family, or its own one-off change or tick, each with copies of what
// it saved, before and after. The server gives only copies this person could
// read when the change was made and can still read now, as Activity does.
//
// A change to the series counts only when it changed this payment: the
// engine works the payment out from the series as it was before and after
// (brief 5.3), so making a later payment different, or sharing the account,
// isn't in this one's History.
//
// Pure: no network, no storage, no clock.

import { strings } from '../strings/en-GB.ts';
import {
  type ActivityContext,
  type ActivityEdit,
  type ActivityRecord,
  paymentAmountOf,
  paymentFactsOf,
  whoStarts,
} from './activity-words.ts';
import { formatDay, formatTime } from './dates.ts';
import { formatMoney } from './money.ts';
import { localToday } from './today.ts';

const h = strings.together.history;

/** Kinds of change only the server makes, about who sees or does what (D467). */
const OWN_STEPS: readonly string[] = [
  'first-copy',
  'join-with-plan',
  'share-accounts',
  'claim-pay',
  'make-private',
  'share-record',
  'change-role',
  'leave',
];

type Copy = Readonly<Record<string, unknown>>;

/** The payment whose History it is. */
export interface HistoryPayment {
  readonly familyId: string;
  /** The date its schedule gives it, before any move (D78). */
  readonly originalDate: string;
  /** Its number in its family, counted from the family's first payment (brief 5.3). */
  readonly number: number;
  /** Money coming in is marked as arrived, not paid (D278). */
  readonly comesIn: boolean;
}

export interface HistoryLine {
  readonly id: string;
  readonly words: string;
  readonly undone: boolean;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const pence = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
const live = (copy: Copy | null): copy is Copy => copy !== null && copy.deleted !== true;

/** What a change did to this one payment, after who made it, or null when it didn't change it. */
export function whatItDidToIt(
  edit: ActivityEdit,
  payment: HistoryPayment,
  context: ActivityContext,
): string | null {
  if (edit.kind === 'undo') return h.undid;
  // The server's own steps about who sees what change nothing about the
  // payment itself, and the person may not see what it was before them.
  if (OWN_STEPS.includes(edit.kind)) return null;
  const mine = (record: ActivityRecord) => {
    const copy = record.after ?? record.before;
    return copy !== null && text(copy.original_date) === payment.originalDate;
  };

  // Its tick.
  const tick = edit.records.find(
    (one) => one.table === 'ticks' && mine(one) && (one.after ?? one.before)?.set_aside !== true,
  );
  if (tick !== undefined) {
    const ticked = live(tick.after);
    if (payment.comesIn) return ticked ? h.markedArrived : h.markedNotArrived;
    return ticked ? h.markedPaid : h.markedNotPaid;
  }

  // Its own one-off change.
  const change = edit.records.find((one) => one.table === 'payment_changes' && mine(one));
  if (change !== undefined) {
    const after = change.after;
    const before = change.before;
    if (!live(after)) return before?.skipped === true ? h.putBack : h.changed;
    if (after.skipped === true && before?.skipped !== true) return h.removed;
    if (after.skipped !== true && before?.skipped === true) return h.putBack;
    const moved = text(after.new_date);
    if (moved !== text(before?.new_date)) {
      return h.moved(formatDay(moved ?? payment.originalDate, context.today));
    }
    const amount = pence(after.amount);
    if (amount !== null && amount !== pence(before?.amount)) {
      const from = pence(before?.amount) ?? paymentAmountOf(change.context, payment.number);
      return from === null || from === amount
        ? h.changedTo(formatMoney(amount))
        : h.changedFromTo(formatMoney(from), formatMoney(amount));
    }
    const name = text(after.name);
    if (name !== null && name !== text(before?.name)) return h.renamed(name);
    if (text(after.note) !== text(before?.note)) return h.note;
    return h.changed;
  }

  // Its series: this payment, worked out from the family's series before
  // the change and after it.
  const series = edit.records.filter(
    (one) =>
      one.table === 'series' && text((one.after ?? one.before)?.family_id) === payment.familyId,
  );
  if (series.length === 0) return null;
  const factsIn = (copies: readonly (Copy | null)[]) => {
    for (const copy of copies) {
      const found = paymentFactsOf(copy, payment.number);
      if (found !== null) return found;
    }
    return null;
  };
  const was = factsIn(series.map((one) => one.before));
  // The series that holds it after the change: one made in it, or one
  // changed; one only ended earlier by it doesn't hold it any more.
  const now = factsIn(series.map((one) => one.after));
  if (was === null && now !== null) {
    const added = series.some(
      (one) => one.before === null && live(one.after) && one.id === payment.familyId,
    );
    return added ? h.added : h.laterChanged;
  }
  if (was !== null && now === null) {
    return edit.kind === 'delete-payment' ? h.removed : h.laterRemoved;
  }
  if (was === null || now === null) return null;
  if (was.amount !== now.amount) {
    return h.laterFromTo(formatMoney(was.amount), formatMoney(now.amount));
  }
  // The same amount: a new name or date for this one and later ones, or
  // nothing about it at all.
  if (was.name !== now.name || was.day !== now.day) return h.laterChanged;
  return null;
}

/** The History list: one line for each change to this payment, newest first. */
export function historyLines(
  edits: readonly ActivityEdit[],
  payment: HistoryPayment,
  context: ActivityContext,
): HistoryLine[] {
  return edits.flatMap((edit) => {
    const what = whatItDidToIt(edit, payment, context);
    if (what === null) return [];
    const day = formatDay(localToday(new Date(edit.madeAt)), context.today);
    return [
      {
        id: edit.id,
        words: h.line(whoStarts(edit.by, context), what, day, formatTime(edit.madeAt)),
        undone: edit.undone,
      },
    ];
  });
}
