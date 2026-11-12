// "Add a payment", deleting a payment that hasn't started yet, and linking
// pay to its pay profile and saved pay weeks (brief 4.3, 4.4, D5, D86, D150,
// D154, D156). Each is one edit, so one undo (D87). Changes to payments
// already in the plan use the edit commands from step 1c.

import { formatDate, parseDate } from '../dates/day.ts';
import { parseTime } from '../dates/time.ts';
import { paymentAtIndex } from '../schedule/payments.ts';
import { prepareSeries } from '../schedule/series.ts';
import type { Series } from '../schedule/types.ts';
import { checkName, checkNewId, checkNow, checkObject, openAccount, recordNow } from './checks.ts';
import { type Context, NO_CHANGES, otherHalf, paymentAt, refuse } from './context.ts';
import { removeSeries, removeThisAndLater } from './later.ts';
import { reworkPayAdjustments } from './pay.ts';
import { clean, seriesWrite } from './records.ts';
import type { EditCommand, NewOtherHalf, NewSeries } from './types.ts';

/**
 * "Add a payment" and setup (brief 4.3, 4.4, D86): a new series, its own
 * family, starting on the date of its next payment. A payment dated before
 * today is refused: if it has already gone, Update balance covers it (D150).
 */
export function addPayment(
  context: Context,
  command: Extract<EditCommand, { kind: 'add-payment' }>,
): void {
  const raw: NewSeries = command.series;
  checkObject(raw, 'the payment');
  const id = checkNewId(context, 'series', raw.id, 'payment');
  const what = `Series ${id}`;
  const name = checkName(raw.name, what);
  const madeAt = command.madeAt;
  parseTime(madeAt, `${what}: when it was added`);

  openAccount(context, raw.accountId, what);
  if (raw.toAccountId !== undefined) {
    if (raw.toAccountId === raw.accountId) {
      refuse('same-account', `${what}: a transfer must go to a different account.`);
    }
    openAccount(context, raw.toAccountId, `${what}: where it goes`);
  }
  if (raw.setAside !== undefined) {
    checkObject(raw.setAside, 'the money set aside');
    if (raw.setAside.accountId === raw.accountId) {
      refuse('same-account', `${what}: money set aside must move to a different account.`);
    }
    openAccount(context, raw.setAside.accountId, `${what}: where money is set aside`);
  }
  if (raw.debtId !== undefined) {
    const debt =
      recordNow(context, 'debt', raw.debtId) ??
      refuse('unknown-debt', `${what} is linked to debt ${raw.debtId}, which isn't in the plan.`);
    if (debt.closed === true) {
      refuse('debt-closed', `${what} is linked to debt ${raw.debtId}, which is closed.`);
    }
  }
  if (raw.goalId !== undefined) {
    const goal =
      recordNow(context, 'goal', raw.goalId) ??
      refuse('unknown-goal', `${what} is linked to goal ${raw.goalId}, which isn't in the plan.`);
    if (goal.closed === true) {
      refuse('goal-closed', `${what} is linked to goal ${raw.goalId}, which is closed.`);
    }
  }
  if (
    raw.payProfileId !== undefined &&
    recordNow(context, 'pay-profile', raw.payProfileId) === null
  ) {
    refuse('unknown-pay-profile', `${what} is linked to a pay profile that isn't in the plan.`);
  }

  const series = clean<Series>({
    id,
    accountId: raw.accountId,
    toAccountId: raw.toAccountId,
    name,
    direction: raw.direction,
    amount: raw.amount,
    amountCycle: raw.amountCycle === undefined ? undefined : [...raw.amountCycle],
    cycleOffset: raw.cycleOffset,
    start: raw.start,
    schedule: raw.schedule,
    end: raw.end,
    lastAmount: raw.lastAmount,
    holidayRule: raw.holidayRule,
    type: raw.type,
    debtId: raw.debtId,
    goalId: raw.goalId,
    setAside: raw.setAside === undefined ? undefined : { ...raw.setAside },
    payProfileId: raw.payProfileId,
    cyclePayWeeks: raw.cyclePayWeeks === undefined ? undefined : [...raw.cyclePayWeeks],
    isEstimate: raw.isEstimate,
    note: raw.note === '' ? undefined : raw.note,
    familyId: id,
    familyCreatedAt: madeAt,
  });

  // The date given is the next payment (D86), so it can't be before today (D150).
  if (parseDate(series.start, `${what}: the next payment`) < context.today) {
    refuse(
      'payment-before-today',
      `${what}: the next payment, ${series.start}, is before today. A payment that has already gone is covered by Update balance.`,
    );
  }
  const prepared = prepareSeries(series, context.input.holidays);
  if (prepared.count === 0) refuse('no-payments', `${what} has no payments.`);
  // The weekend and bank holiday rule can bring the next payment before today.
  const first = paymentAtIndex(prepared, 0, NO_CHANGES, context.input.holidays);
  if (first.day < context.today) {
    refuse(
      'payment-before-today',
      `${what}: its next payment lands on ${formatDate(first.day)}, before today. Choose the one after it.`,
    );
  }
  context.draft.set(seriesWrite(id, series));
  if (command.otherHalf !== undefined) addOtherHalf(context, series, command.otherHalf);
  checkNow(context);
}

/**
 * The shared half of a private transfer (D16, D94): the same money and
 * timing as the private half, the other way, in the shared account, named
 * "From Jess" or "To Jess", with no note, debt, job or money set aside, and
 * no goal but one kept in that shared account (D464).
 * The private half is money going out of or coming into the person's own
 * account, never a transfer, so each account counts it once (ARCHITECTURE.md 3.6).
 */
/** The other half's goal, when it names one: open, and kept in the half's own account (D114, D464). */
function halfGoal(context: Context, raw: NewOtherHalf, what: string): string | undefined {
  if (raw.goalId === undefined) return undefined;
  const goal =
    recordNow(context, 'goal', raw.goalId) ??
    refuse('unknown-goal', `${what} is linked to goal ${raw.goalId}, which isn't in the plan.`);
  if (goal.closed === true) {
    refuse('goal-closed', `${what} is linked to goal ${raw.goalId}, which is closed.`);
  }
  if (goal.accountId !== raw.accountId) {
    refuse(
      'bad-goal-link',
      `${what} doesn't move money into or out of goal ${raw.goalId}'s account.`,
    );
  }
  return raw.goalId;
}

function addOtherHalf(context: Context, mine: Series, raw: NewOtherHalf): void {
  checkObject(raw, 'the other half');
  const what = `Series ${mine.id}: its other half`;
  const id = checkNewId(context, 'series', raw.id, 'other half');
  if (id === mine.id) refuse('bad-command', `${what} needs an id of its own.`);
  const name = checkName(raw.name, what);
  if (mine.direction === 'transfer' || mine.toAccountId !== undefined) {
    refuse(
      'bad-other-half',
      `${what}: the private half moves money in or out, not to another account.`,
    );
  }
  if (raw.accountId === mine.accountId) {
    refuse('same-account', `${what} must be in a different account.`);
  }
  openAccount(context, raw.accountId, what);
  if (
    mine.debtId !== undefined ||
    mine.setAside !== undefined ||
    mine.payProfileId !== undefined ||
    mine.cyclePayWeeks !== undefined
  ) {
    refuse(
      'bad-other-half',
      `${what}: money between two accounts has no debt, job or money set aside.`,
    );
  }
  const half = clean<Series>({
    id,
    accountId: raw.accountId,
    name,
    direction: mine.direction === 'out' ? 'in' : 'out',
    amount: mine.amount,
    amountCycle: mine.amountCycle === undefined ? undefined : [...mine.amountCycle],
    cycleOffset: mine.cycleOffset,
    start: mine.start,
    schedule: mine.schedule,
    end: mine.end,
    lastAmount: mine.lastAmount,
    holidayRule: mine.holidayRule,
    type: mine.type,
    isEstimate: mine.isEstimate,
    familyId: id,
    familyCreatedAt: mine.familyCreatedAt,
    mirrorOf: mine.id,
    goalId: halfGoal(context, raw, what),
  });
  context.draft.set(seriesWrite(id, half));
}

/**
 * Deletes a payment that hasn't started yet (D156): its whole family, with
 * its one-off changes and any overtime or missed shifts saved for it. Once
 * its first payment is due, "Remove this and later" is used instead, so
 * nothing that may already have gone disappears from the plan.
 */
export function deletePayment(context: Context, seriesId: string): void {
  if (typeof seriesId !== 'string' || seriesId === '') {
    refuse('bad-command', 'The command needs the payment.');
  }
  const prepared =
    context.byId.get(seriesId) ?? refuse('unknown-series', `Series ${seriesId} isn't in the plan.`);
  if (context.checked.budgets.has(seriesId)) {
    refuse('budget-bills', `Series ${seriesId} is a pay-later budget's bills: change the budget.`);
  }
  const familyId = prepared.series.familyId;
  const family = context.checked.prepared
    .filter((one) => one.series.familyId === familyId)
    .sort((a, b) => a.firstNumber - b.firstNumber);
  const first = family[0] ?? prepared;
  if (first.count === 0) {
    for (const one of family) removeSeries(context, one);
    // A private transfer's other half goes with it (D94).
    const other = otherHalf(context, first.series);
    if (other !== null) {
      for (const one of context.checked.prepared) {
        if (one.series.familyId === other.series.familyId) removeSeries(context, one);
      }
    }
  } else {
    const payment = paymentAt(context, first, 0);
    if (payment.payment.day <= context.today) {
      refuse(
        'started',
        `Series ${seriesId} has started: its first payment is on ${formatDate(payment.payment.day)}. Remove it from a payment instead.`,
      );
    }
    removeThisAndLater(context, { seriesId: first.series.id, originalDate: payment.originalDate });
  }
  for (const one of context.checked.pay.adjustments.values()) {
    if (one.familyId === familyId) {
      context.draft.set({ kind: 'pay-adjustment', id: one.id, value: null });
    }
  }
}

/**
 * Links pay to its pay profile and saved pay weeks (D5, D154), for every
 * series of its family. The pay weeks go on each series whose amount pattern
 * has that many steps, or one step with no pattern. A series with a pattern
 * of another length keeps its own pay weeks when they belong to the pay
 * profile, and loses them otherwise. Every overtime and missed shift saved
 * for the family is worked out again (D140, D154).
 */
export function linkPay(
  context: Context,
  command: Extract<EditCommand, { kind: 'link-pay' }>,
): void {
  const prepared =
    context.byId.get(command.seriesId) ??
    refuse('unknown-series', `Series ${command.seriesId} isn't in the plan.`);
  const what = `Series ${command.seriesId}`;
  const profileId = command.payProfileId;
  if (profileId !== null) {
    if (typeof profileId !== 'string' || profileId === '') {
      refuse('bad-command', `${what}: the pay profile must be an id, or null.`);
    }
    if (recordNow(context, 'pay-profile', profileId) === null) {
      refuse('unknown-pay-profile', `Pay profile ${profileId} isn't in the plan.`);
    }
  }
  const weeks = command.cyclePayWeeks;
  if (weeks !== undefined && weeks !== null) {
    if (!Array.isArray(weeks) || weeks.length === 0) {
      refuse('bad-command', `${what}: the pay weeks must be a list.`);
    }
    if (profileId === null) refuse('bad-command', `${what}: pay weeks need a pay profile.`);
    for (const weekId of weeks) {
      const week = typeof weekId === 'string' ? recordNow(context, 'pay-week', weekId) : null;
      if (week === null || week.payProfileId !== profileId) {
        refuse('unknown-pay-week', `${what}: a pay week isn't one of pay profile ${profileId}'s.`);
      }
    }
  }
  const belongs = (ids: readonly string[] | undefined): boolean =>
    ids?.every((weekId) => recordNow(context, 'pay-week', weekId)?.payProfileId === profileId) ===
    true;
  let fitted = 0;
  for (const one of context.checked.prepared) {
    if (one.series.familyId !== prepared.series.familyId) continue;
    const steps = one.cycle?.length ?? 1;
    let next: readonly string[] | undefined;
    if (profileId === null || weeks === null) {
      next = undefined;
    } else if (weeks !== undefined && weeks.length === steps) {
      next = [...weeks];
      fitted += 1;
    } else {
      next = belongs(one.series.cyclePayWeeks) ? one.series.cyclePayWeeks : undefined;
    }
    context.draft.set(
      seriesWrite(
        one.series.id,
        clean<Series>({
          ...one.series,
          payProfileId: profileId ?? undefined,
          cyclePayWeeks: next,
        }),
      ),
    );
  }
  if (weeks !== undefined && weeks !== null && fitted === 0) {
    refuse(
      'patterns-differ',
      `${what}: there's one pay week for each step of the amount pattern, and these don't fit it.`,
    );
  }
  checkNow(context);
  reworkPayAdjustments(context);
}
