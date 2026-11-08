// "I did overtime", "I missed a shift" and removing either, as edits (brief
// 4.3, D5, D44, D123, D130, D131). Each is one undo step, like every edit (D87).

import { addDays, type Day, formatDate, parseDate } from '../dates/day.ts';
import { EngineInputError } from '../errors.ts';
import { parseDecimal } from '../money/decimal.ts';
import { checkPenceNotNegative, type Pence } from '../money/pence.ts';
import { lastDayCovered, workOutPayChange } from '../pay/shifts.ts';
import { taxYearsOf } from '../pay/tax-year.ts';
import {
  type CoveredTo,
  type FixedPay,
  hasShiftDetails,
  type PayAdjustment,
  type PayAdjustmentWithDetails,
  type PayLine,
  type PayProfile,
  type PayWeek,
} from '../pay/types.ts';
import {
  type PaymentOnDays,
  paymentAtIndex,
  paymentsOfSeriesBetween,
  stepOf,
} from '../schedule/payments.ts';
import { type PreparedSeries, prepareSeries } from '../schedule/series.ts';
import type { Series } from '../schedule/types.ts';
import { type Context, refuse } from './context.ts';
import { clean, sameValue, seriesWrite } from './records.ts';
import type { EditCommand, RecordWrite } from './types.ts';

type PayCommand = Extract<EditCommand, { kind: 'overtime' | 'missed-shift' }>;

/**
 * Where to look for the payday a shift is paid on. A monthly payday can
 * cover work up to a day after it (pay on the 29th for work up to the 31st),
 * so the search starts a month and a fortnight before the shift. It ends
 * after the longest wait there can be: pay every 52 weeks, covering work up
 * to 62 days before payday, is 364 + 62 days after the shift.
 */
const SEARCH_BEFORE_SHIFT_DAYS = 45;
const SEARCH_AFTER_SHIFT_DAYS = 430;

function adjustmentWrite(id: string, value: PayAdjustment | null): RecordWrite {
  return { kind: 'pay-adjustment', id, value };
}

/** True when the last day covered suits the pay's schedule: a day of the month for monthly pay (D131). */
function suitsSchedule(coveredTo: CoveredTo, prepared: PreparedSeries): boolean {
  const monthly = prepared.series.schedule.kind === 'monthly';
  return monthly === (coveredTo.kind !== 'days-before');
}

/**
 * The payday a shift is paid on (D131, D140): of the family's paydays whose
 * last day covered is on or after the shift, the one that covers the
 * earliest work. Paydays usually land in that order too, but a payday moved
 * past another still covers the same work. A payday is the day the pay
 * lands, after the weekend and bank holiday rule and any move, and a removed
 * payday isn't one (D81).
 */
function paydayForShift(
  context: Context,
  familyId: string,
  coveredTo: CoveredTo,
  workedOn: Day,
): { prepared: PreparedSeries; payment: PaymentOnDays } | null {
  let best: { prepared: PreparedSeries; payment: PaymentOnDays; covered: Day } | null = null;
  for (const prepared of context.checked.prepared) {
    if (prepared.series.familyId !== familyId) continue;
    const payments = paymentsOfSeriesBetween(
      prepared,
      addDays(workedOn, -SEARCH_BEFORE_SHIFT_DAYS),
      addDays(workedOn, SEARCH_AFTER_SHIFT_DAYS),
      context.checked.changes,
      context.input.holidays,
      context.checked.pay.index,
    );
    for (const payment of payments) {
      if (payment.skipped) continue;
      if (!suitsSchedule(coveredTo, prepared)) {
        refuse(
          'covered-to-not-for-schedule',
          coveredTo.kind === 'days-before'
            ? `Series ${prepared.series.id} is monthly, so its payday covers work up to a day of the month, not a number of days before.`
            : `Series ${prepared.series.id} isn't monthly, so its payday covers work up to a number of days before it, not a day of the month.`,
        );
      }
      const covered = lastDayCovered(coveredTo, payment.originalDay);
      if (covered < workedOn) continue;
      if (
        best === null ||
        covered < best.covered ||
        (covered === best.covered &&
          (payment.day < best.payment.day ||
            (payment.day === best.payment.day && payment.number < best.payment.number)))
      ) {
        best = { prepared, payment, covered };
      }
    }
  }
  return best;
}

/** A payday found by its family and payment number, as a pay adjustment finds it (D123). */
function paydayByNumber(
  context: Context,
  familyId: string,
  number: number,
): { prepared: PreparedSeries; payment: PaymentOnDays } | null {
  for (const prepared of context.checked.prepared) {
    if (prepared.series.familyId !== familyId) continue;
    const index = number - prepared.firstNumber;
    if (index < 0 || index >= prepared.count) continue;
    return {
      prepared,
      payment: paymentAtIndex(
        prepared,
        index,
        context.checked.changes,
        context.input.holidays,
        context.checked.pay.index,
      ),
    };
  }
  return null;
}

/** What a payday's take-home pay is worked out from: its pay profile and pay week (D5). */
interface PaydayBasis {
  readonly profile: PayProfile;
  readonly week: PayWeek;
}

/** The pay profile and pay week of a payday, or null when it has none. */
function basisOf(
  context: Context,
  payday: { prepared: PreparedSeries; payment: PaymentOnDays },
): PaydayBasis | null {
  const profileId = payday.prepared.series.payProfileId;
  const profile = profileId === undefined ? undefined : context.checked.pay.profiles.get(profileId);
  const linked = payday.prepared.series.cyclePayWeeks;
  const steps = payday.prepared.cycle?.length ?? 1;
  const weekId = linked?.[stepOf(payday.payment.number, payday.prepared.cycleOffset, steps)];
  const week = weekId === undefined ? undefined : context.checked.pay.weeks.get(weekId);
  return profile === undefined || week === undefined ? null : { profile, week };
}

/**
 * Works out the change of every overtime and missed shift on one payday, in
 * the order of their ids, each on top of the ones before it (D5, D124,
 * D140). Their changes then add up to exactly all of them together, and
 * removing one works the others out again. Ids are made in the order the
 * changes are saved (ARCHITECTURE.md 3.0), so a new one comes last and the
 * ones before it keep their changes.
 */
function workOutPayday(
  payday: { prepared: PreparedSeries; payment: PaymentOnDays },
  basis: PaydayBasis,
  adjustments: readonly PayAdjustmentWithDetails[],
): PayAdjustment[] {
  const { profile, week } = basis;
  const inOrder = [...adjustments].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const earlier: PayLine[] = [];
  const earlierExtras: FixedPay[] = [];
  return inOrder.map((one) => {
    const changeExtras = extrasOf(one);
    const worked = workOutPayChange(
      {
        settings: profile,
        ...(profile.soFar === undefined ? {} : { soFar: profile.soFar }),
        payDate: formatDate(payday.payment.day),
        lines: week.lines,
        ...(week.fixed === undefined ? {} : { fixed: week.fixed }),
        earlier: [...earlier],
        earlierExtras: [...earlierExtras],
        change: lineOf(one),
        ...(changeExtras === null ? {} : { changeExtras }),
      },
      taxYearsOf(),
    );
    earlier.push(lineOf(one));
    if (changeExtras !== null) earlierExtras.push(changeExtras);
    return { ...one, change: worked.change, taxYear: worked.with.taxYear };
  });
}

/** Refuses extras that would take a payday's fixed pay below nothing (D130). */
function refuseTooMuchExtras(
  payday: { payment: PaymentOnDays },
  week: PayWeek,
  adjustments: readonly PayAdjustmentWithDetails[],
): void {
  const total = [
    ...(week.fixed ?? []),
    ...adjustments.flatMap((one) => extrasOf(one) ?? []),
  ].reduce((sum, one) => sum + one.amount, 0);
  if (total < 0) {
    refuse(
      'too-much-extras',
      `The payday on ${formatDate(payday.payment.day)} doesn't have that much in extras to take off.`,
    );
  }
}

/** Saves each worked-out adjustment that's new or whose change has changed. */
function saveAll(context: Context, worked: readonly PayAdjustment[]): void {
  for (const one of worked) {
    const now = context.draft.get(adjustmentWrite(one.id, null));
    if (!sameValue(now, one)) context.draft.set(adjustmentWrite(one.id, clean<PayAdjustment>(one)));
  }
}

function lineOf(adjustment: Pick<PayAdjustmentWithDetails, 'kind' | 'hours' | 'rate'>): PayLine {
  return adjustment.kind === 'overtime'
    ? { name: 'Overtime', kind: 'overtime', hours: adjustment.hours, rate: adjustment.rate }
    : // A missed shift takes its hours off at its rate, as a line of its own (D9, D123).
      { name: 'Missed shift', kind: 'basic', hours: `-${adjustment.hours}`, rate: adjustment.rate };
}

/** A change to the extras as fixed pay: added for overtime, taken off for a missed shift (D130). */
function extrasOf(adjustment: {
  readonly kind: PayAdjustmentWithDetails['kind'];
  readonly extras?: Pence | undefined;
}): FixedPay | null {
  if (adjustment.extras === undefined) return null;
  return adjustment.kind === 'overtime'
    ? { name: 'Extras with overtime', amount: adjustment.extras }
    : { name: 'Extras with a missed shift', amount: -adjustment.extras };
}

/**
 * "I did overtime" or "I missed a shift" (D5, D44, D130, D131): finds the
 * payday the shift is paid on from the last day of work each payday covers,
 * works out take-home pay with and without the change from that payday's
 * pay week, with any change to its extras, and saves the difference as a pay
 * adjustment. Refused once the payday's real amount is in, because the real
 * amount stands.
 */
export function recordPayAdjustment(context: Context, command: PayCommand): void {
  if (typeof command.id !== 'string' || command.id === '') {
    refuse('bad-command', 'The command needs an id for the pay adjustment.');
  }
  if (context.draft.get(adjustmentWrite(command.id, null)) !== null) {
    refuse('id-taken', `Pay adjustment ${command.id} already exists.`);
  }
  const series =
    context.byId.get(command.seriesId) ??
    refuse('unknown-series', `Series ${command.seriesId} isn't in the plan.`);
  const profileId =
    series.series.payProfileId ??
    refuse(
      'no-pay-profile',
      `Series ${command.seriesId} has no pay profile, so its tax isn't known.`,
    );
  const profile =
    context.checked.pay.profiles.get(profileId) ??
    refuse('unknown-pay-profile', `Pay profile ${profileId} isn't in the plan.`);
  const coveredTo =
    profile.coveredTo ??
    refuse(
      'no-covered-to',
      `Pay profile ${profileId} needs the last day of work each payday pays for.`,
    );
  const workedOn = parseDate(command.workedOn, 'The day of the shift');
  const hours = parseDecimal(command.hours, 'The hours');
  if (hours.units <= 0n || command.hours.startsWith('-')) {
    refuse('bad-command', 'The hours must be above zero.');
  }
  const extras: Pence | undefined =
    command.extras === undefined || command.extras === 0
      ? undefined
      : checkPenceNotNegative(command.extras, 'The change to the extras');

  const familyId = series.series.familyId;
  const payday =
    paydayForShift(context, familyId, coveredTo, workedOn) ??
    refuse(
      'no-payday',
      `There's no payday of series ${command.seriesId} that pays for work on ${command.workedOn}.`,
    );
  // Only while the payday is an estimate: once the real amount is in, it stands (D44).
  if (!payday.payment.isEstimate) {
    refuse(
      'payday-not-estimate',
      `The payday on ${formatDate(payday.payment.day)} already has its real amount, so it stays as it is.`,
    );
  }
  const linked = payday.prepared.series.cyclePayWeeks;
  const steps = payday.prepared.cycle?.length ?? 1;
  const weekId =
    linked?.[stepOf(payday.payment.number, payday.prepared.cycleOffset, steps)] ??
    refuse(
      'no-pay-week',
      `The payday on ${formatDate(payday.payment.day)} has no saved pay week to work it out from.`,
    );
  const week =
    context.checked.pay.weeks.get(weekId) ??
    refuse('unknown-pay-week', `Pay week ${weekId} isn't in the plan.`);

  const rate =
    command.rate ??
    (command.kind === 'overtime'
      ? profile.overtimeRate
      : week.lines.find((line) => line.kind === 'basic')?.rate) ??
    refuse('no-rate', 'The command needs the rate for those hours.');
  const rateValue = parseDecimal(rate, 'The rate');
  if (rateValue.units < 0n) refuse('bad-command', "The rate can't be below zero.");

  const others = ownShifts(
    [...context.checked.pay.adjustments.values()].filter(
      (one) => one.familyId === familyId && one.number === payday.payment.number,
    ),
  );
  if (others === null) {
    // Someone else's shift is on this payday: it's their pay (D303).
    refuse('not-your-pay', `The payday on ${formatDate(payday.payment.day)} isn't your pay.`);
  }
  const fresh = clean<PayAdjustmentWithDetails>({
    id: command.id,
    familyId,
    number: payday.payment.number,
    kind: command.kind,
    workedOn: command.workedOn,
    hours: command.hours,
    rate,
    extras,
    change: 0,
    taxYear: '',
  });
  if (extras !== undefined) {
    // Pay with no extras is never asked about them (D130), and a missed shift
    // can't take off more extras than the payday has.
    if ((week.fixed ?? []).length === 0) {
      refuse(
        'no-extras',
        `The payday on ${formatDate(payday.payment.day)} has no extras, such as a shift premium, to change.`,
      );
    }
    refuseTooMuchExtras(payday, week, [...others, fresh]);
  }
  saveAll(context, workOutPayday(payday, { profile, week }, [...others, fresh]));
}

/** Removes a saved "I did overtime" or "I missed a shift". */
export function removePayAdjustment(context: Context, id: string): void {
  if (typeof id !== 'string' || id === '') {
    refuse('bad-command', 'The command needs the pay adjustment.');
  }
  const removed =
    (context.draft.get(adjustmentWrite(id, null)) as PayAdjustment | null) ??
    refuse('unknown-pay-adjustment', `Pay adjustment ${id} isn't in the plan.`);
  context.draft.set(adjustmentWrite(id, null));
  // The others on the same payday were worked out on top of it, so they're
  // worked out again without it (D140). When the payday has no pay profile
  // or pay week any more, they can't be, and stay as they are.
  const others = ownShifts(
    [...context.checked.pay.adjustments.values()].filter(
      (one) => one.id !== id && one.familyId === removed.familyId && one.number === removed.number,
    ),
  );
  // Those of someone else's pay are never worked out here (D303).
  if (others === null || others.length === 0) return;
  const payday = paydayByNumber(context, removed.familyId, removed.number);
  const basis = payday === null ? null : basisOf(context, payday);
  if (payday === null || basis === null) return;
  refuseTooMuchExtras(payday, basis.week, others);
  saveAll(context, workOutPayday(payday, basis, others));
}

/**
 * For undo (D87, D140): refuses an undo that would leave an overtime or
 * missed shift saved since, and not part of the edit, with a change worked
 * out on top of one the undo takes away or changes, or with no payday at all.
 */
export function refuseUndoOfPay(
  context: Context,
  writes: readonly RecordWrite[],
  before: readonly RecordWrite[],
): void {
  const touched = new Map<string, PayAdjustment>();
  for (const write of [...writes, ...before]) {
    if (write.kind === 'pay-adjustment' && write.value !== null) touched.set(write.id, write.value);
  }
  const undone = new Set(
    [...writes, ...before].flatMap((w) => (w.kind === 'pay-adjustment' ? [w.id] : [])),
  );
  const remaining = [...context.checked.pay.adjustments.values()].filter(
    (one) => !undone.has(one.id),
  );
  if (remaining.length === 0) return;
  for (const one of remaining) {
    for (const other of touched.values()) {
      if (other.familyId === one.familyId && other.number === one.number && other.id < one.id) {
        refuse(
          'changed-since',
          'An overtime or missed shift saved since on the same payday depends on this edit, so it can no longer be undone.',
        );
      }
    }
  }
  // Every one left must still have its payday once the series are put back.
  const series = new Map(context.input.series.map((one) => [one.id, one]));
  for (const write of before) {
    if (write.kind !== 'series') continue;
    if (write.value === null) series.delete(write.id);
    else series.set(write.id, write.value);
  }
  const prepared = [...series.values()].map((one) => prepareSeries(one, context.input.holidays));
  for (const one of remaining) {
    const covered = prepared.some(
      (p) =>
        p.series.familyId === one.familyId &&
        one.number >= p.firstNumber &&
        one.number < p.firstNumber + p.count,
    );
    if (!covered) {
      refuse(
        'changed-since',
        'An overtime or missed shift saved since is on a payday this undo would take away, so it can no longer be undone.',
      );
    }
  }
}

/**
 * The pay profile and pay week of a payday as they are now in this edit,
 * after a change to them or to the pay's links (D154), or null when it has none.
 */
function basisNow(
  context: Context,
  payday: { prepared: PreparedSeries; payment: PaymentOnDays },
): PaydayBasis | null {
  const id = payday.prepared.series.id;
  const series =
    (context.draft.get(seriesWrite(id, null)) as Series | null) ?? payday.prepared.series;
  const profile =
    series.payProfileId === undefined
      ? null
      : (context.draft.get({
          kind: 'pay-profile',
          id: series.payProfileId,
          value: null,
        }) as PayProfile | null);
  const steps = payday.prepared.cycle?.length ?? 1;
  const weekId =
    series.cyclePayWeeks?.[stepOf(payday.payment.number, payday.prepared.cycleOffset, steps)];
  const week =
    weekId === undefined
      ? null
      : (context.draft.get({ kind: 'pay-week', id: weekId, value: null }) as PayWeek | null);
  return profile === null || week === null ? null : { profile, week };
}

/**
 * True for a payday still to come that's an estimate, so its overtime and
 * missed shifts still change it (D44, D154).
 */
function stillToCome(context: Context, payday: { payment: PaymentOnDays }): boolean {
  return payday.payment.day >= context.today && payday.payment.isEstimate;
}

/**
 * The shifts with their details, or null when any of them has its change
 * alone: someone else's pay, on a partner's phone (D303).
 */
function ownShifts(list: readonly PayAdjustment[]): PayAdjustmentWithDetails[] | null {
  const own = list.filter(hasShiftDetails);
  return own.length === list.length ? own : null;
}

/** Every saved overtime and missed shift as it is now in this edit, grouped by payday. */
function savedByPayday(context: Context): PayAdjustment[][] {
  const groups = new Map<string, PayAdjustment[]>();
  for (const { id } of context.checked.pay.adjustments.values()) {
    const now = context.draft.get(adjustmentWrite(id, null)) as PayAdjustment | null;
    if (now === null) continue;
    const key = JSON.stringify([now.familyId, now.number]);
    groups.set(key, [...(groups.get(key) ?? []), now]);
  }
  return [...groups.values()];
}

/**
 * Works out every saved overtime and missed shift on a payday still to come
 * again, from the pay profiles, pay weeks and pay links as they are now in
 * this edit (D140, D154), so they always match what they're worked out
 * from. Those on paydays that have gone, or have their real amount, stay as
 * they were saved, and so does one on a payday a newer payslip's year so far
 * already covers. One whose payday has no pay profile or pay week any more
 * stays as it is too, as when another on its payday is removed. Refused when
 * a missed shift would then take off more extras than the payday has (D130).
 */
export function reworkPayAdjustments(context: Context): void {
  for (const group of savedByPayday(context)) {
    const { familyId, number } = group[0] as PayAdjustment;
    const payday = paydayByNumber(context, familyId, number);
    if (payday === null || !stillToCome(context, payday)) continue;
    const basis = basisNow(context, payday);
    // Someone else's pay, with its change alone, is never worked out here (D303).
    const own = ownShifts(group);
    if (basis === null || own === null) continue;
    refuseTooMuchExtras(payday, basis.week, own);
    let worked: PayAdjustment[];
    try {
      worked = workOutPayday(payday, basis, own);
    } catch (error) {
      // The year so far is from this payday's payslip or later, or from
      // another tax year: the payday is settled, so its shifts stay as saved.
      if (error instanceof EngineInputError && error.code === 'bad-year-so-far') continue;
      throw error;
    }
    saveAll(context, worked);
  }
}

/**
 * Refuses a new last day covered for a pay profile while a shift saved on a
 * payday still to come would go on another payday with it (D131, D154). The
 * person removes the shift and adds it again, so its payday and its change
 * are both worked out afresh.
 */
export function refuseMovedShifts(
  context: Context,
  profileId: string,
  coveredTo: CoveredTo | undefined,
): void {
  if (coveredTo === undefined) return;
  for (const group of savedByPayday(context)) {
    const { familyId, number } = group[0] as PayAdjustment;
    const payday = paydayByNumber(context, familyId, number);
    if (payday === null || !stillToCome(context, payday)) continue;
    const id = payday.prepared.series.id;
    const series =
      (context.draft.get(seriesWrite(id, null)) as Series | null) ?? payday.prepared.series;
    if (series.payProfileId !== profileId) continue;
    for (const one of group) {
      if (!hasShiftDetails(one)) continue;
      const now = paydayForShift(context, familyId, coveredTo, parseDate(one.workedOn));
      if (now === null || now.payment.number !== number) {
        refuse(
          'shifts-saved',
          `Pay profile ${profileId}: a shift saved for the payday on ${formatDate(payday.payment.day)} would go on another payday. Remove it first, then add it again.`,
        );
      }
    }
  }
}
