// "I did overtime", "I missed a shift" and removing either, as edits (brief
// 4.3, D5, D44, D123, D130, D131). Each is one undo step, like every edit (D87).

import { addDays, type Day, formatDate, parseDate } from '../dates/day.ts';
import { parseDecimal } from '../money/decimal.ts';
import { checkPenceNotNegative, type Pence } from '../money/pence.ts';
import { lastDayCovered, workOutPayChange } from '../pay/shifts.ts';
import { taxYearsOf } from '../pay/tax-year.ts';
import type { CoveredTo, FixedPay, PayAdjustment, PayLine } from '../pay/types.ts';
import { type PaymentOnDays, paymentsOfSeriesBetween } from '../schedule/payments.ts';
import type { PreparedSeries } from '../schedule/series.ts';
import { type Context, refuse } from './context.ts';
import { clean } from './records.ts';
import type { EditCommand, RecordWrite } from './types.ts';

type PayCommand = Extract<EditCommand, { kind: 'overtime' | 'missed-shift' }>;

/**
 * Where to look for the payday a shift is paid on. A monthly payday can
 * cover work up to a day after it (pay on the 29th for work up to the 31st),
 * so the search starts a month and a fortnight before the shift, and it ends
 * more than a year after, the longest a pay schedule waits between paydays.
 */
const SEARCH_BEFORE_SHIFT_DAYS = 45;
const SEARCH_AFTER_SHIFT_DAYS = 400;

function adjustmentWrite(id: string, value: PayAdjustment | null): RecordWrite {
  return { kind: 'pay-adjustment', id, value };
}

/** True when the last day covered suits the pay's schedule: a day of the month for monthly pay (D131). */
function suitsSchedule(coveredTo: CoveredTo, prepared: PreparedSeries): boolean {
  const monthly = prepared.series.schedule.kind === 'monthly';
  return monthly === (coveredTo.kind !== 'days-before');
}

/**
 * The payday a shift is paid on (D131): the first payday of the family whose
 * last day covered is on or after the shift, in date order. A payday is the
 * day the pay lands, after the weekend and bank holiday rule and any move,
 * and a removed payday isn't one (D81).
 */
function paydayForShift(
  context: Context,
  familyId: string,
  coveredTo: CoveredTo,
  workedOn: Day,
): { prepared: PreparedSeries; payment: PaymentOnDays } | null {
  let best: { prepared: PreparedSeries; payment: PaymentOnDays } | null = null;
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
      if (lastDayCovered(coveredTo, payment.originalDay) < workedOn) continue;
      if (
        best === null ||
        payment.day < best.payment.day ||
        (payment.day === best.payment.day && payment.number < best.payment.number)
      ) {
        best = { prepared, payment };
      }
    }
  }
  return best;
}

function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

function lineOf(adjustment: Pick<PayAdjustment, 'kind' | 'hours' | 'rate'>): PayLine {
  return adjustment.kind === 'overtime'
    ? { name: 'Overtime', kind: 'overtime', hours: adjustment.hours, rate: adjustment.rate }
    : // A missed shift takes its hours off at its rate, as a line of its own (D9, D123).
      { name: 'Missed shift', kind: 'basic', hours: `-${adjustment.hours}`, rate: adjustment.rate };
}

/** A change to the extras as fixed pay: added for overtime, taken off for a missed shift (D130). */
function extrasOf(adjustment: {
  readonly kind: PayAdjustment['kind'];
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
    linked?.[mod(payday.payment.number + payday.prepared.cycleOffset, steps)] ??
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

  const earlierOnes = [...context.checked.pay.adjustments.values()].filter(
    (one) => one.familyId === familyId && one.number === payday.payment.number,
  );
  const earlierExtras = earlierOnes.flatMap((one) => extrasOf(one) ?? []);
  const changeExtras = extrasOf({ kind: command.kind, extras });
  if (changeExtras !== null) {
    // Pay with no extras is never asked about them (D130), and a missed shift
    // can't take off more extras than the payday has.
    const fixed = week.fixed ?? [];
    if (fixed.length === 0) {
      refuse(
        'no-extras',
        `The payday on ${formatDate(payday.payment.day)} has no extras, such as a shift premium, to change.`,
      );
    }
    const total = [...fixed, ...earlierExtras, changeExtras].reduce(
      (sum, one) => sum + one.amount,
      0,
    );
    if (total < 0) {
      refuse(
        'too-much-extras',
        `The payday on ${formatDate(payday.payment.day)} doesn't have that much in extras to take off.`,
      );
    }
  }
  const worked = workOutPayChange(
    {
      settings: profile,
      ...(profile.soFar === undefined ? {} : { soFar: profile.soFar }),
      payDate: formatDate(payday.payment.day),
      lines: week.lines,
      ...(week.fixed === undefined ? {} : { fixed: week.fixed }),
      earlier: earlierOnes.map(lineOf),
      earlierExtras,
      change: lineOf({ kind: command.kind, hours: command.hours, rate }),
      ...(changeExtras === null ? {} : { changeExtras }),
    },
    taxYearsOf(),
  );
  context.draft.set(
    adjustmentWrite(
      command.id,
      clean<PayAdjustment>({
        id: command.id,
        familyId,
        number: payday.payment.number,
        kind: command.kind,
        workedOn: command.workedOn,
        hours: command.hours,
        rate,
        extras,
        change: worked.change,
        taxYear: worked.with.taxYear,
      }),
    ),
  );
}

/** Removes a saved "I did overtime" or "I missed a shift". */
export function removePayAdjustment(context: Context, id: string): void {
  if (typeof id !== 'string' || id === '') {
    refuse('bad-command', 'The command needs the pay adjustment.');
  }
  if (context.draft.get(adjustmentWrite(id, null)) === null) {
    refuse('unknown-pay-adjustment', `Pay adjustment ${id} isn't in the plan.`);
  }
  context.draft.set(adjustmentWrite(id, null));
}
