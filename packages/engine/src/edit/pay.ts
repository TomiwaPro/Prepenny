// "I did overtime", "I missed a shift" and removing either, as edits (brief
// 4.3, D5, D44, D123, D125). Each is one undo step, like every edit (D87).

import { addDays, type Day, formatDate, parseDate } from '../dates/day.ts';
import { parseDecimal } from '../money/decimal.ts';
import { shiftPaidFrom, workOutPayChange } from '../pay/shifts.ts';
import { taxYearsOf } from '../pay/tax-year.ts';
import type { PayAdjustment, PayLine } from '../pay/types.ts';
import { type PaymentOnDays, paymentsOfSeriesBetween } from '../schedule/payments.ts';
import type { PreparedSeries } from '../schedule/series.ts';
import { type Context, refuse } from './context.ts';
import { clean } from './records.ts';
import type { EditCommand, RecordWrite } from './types.ts';

type PayCommand = Extract<EditCommand, { kind: 'overtime' | 'missed-shift' }>;

/** How far ahead to look for the payday a shift is paid on: more than any pay interval. */
const PAYDAY_SEARCH_DAYS = 100;

function adjustmentWrite(id: string, value: PayAdjustment | null): RecordWrite {
  return { kind: 'pay-adjustment', id, value };
}

/** The first payday of a family on or after a day, after the weekend rule and any move (D81). */
function firstPaydayFrom(
  context: Context,
  familyId: string,
  from: Day,
): { prepared: PreparedSeries; payment: PaymentOnDays } | null {
  let best: { prepared: PreparedSeries; payment: PaymentOnDays } | null = null;
  for (const prepared of context.checked.prepared) {
    if (prepared.series.familyId !== familyId) continue;
    const payments = paymentsOfSeriesBetween(
      prepared,
      from,
      addDays(from, PAYDAY_SEARCH_DAYS),
      context.checked.changes,
      context.input.holidays,
      context.checked.pay.index,
    );
    for (const payment of payments) {
      // A removed payday isn't a payday (D81).
      if (payment.skipped) continue;
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
    : // A missed shift takes its hours off at its rate, as a line of its own (D9, D125).
      { name: 'Missed shift', kind: 'basic', hours: `-${adjustment.hours}`, rate: adjustment.rate };
}

/**
 * "I did overtime" or "I missed a shift" (D5, D44, D125): finds the payday
 * the shift is paid on from the pay profile's working week and how many
 * weeks behind pay is, works out take-home pay with and without the change
 * from that payday's pay week, and saves the difference as a pay adjustment.
 * Refused once the payday's real amount is in, because the real amount stands.
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
  if (profile.workWeekStarts === undefined || profile.weeksBehind === undefined) {
    refuse(
      'no-working-week',
      `Pay profile ${profileId} needs the day its working week starts and how many weeks behind the shifts pay is.`,
    );
  }
  const workedOn = parseDate(command.workedOn, 'The day of the shift');
  const hours = parseDecimal(command.hours, 'The hours');
  if (hours.units <= 0n || command.hours.startsWith('-')) {
    refuse('bad-command', 'The hours must be above zero.');
  }

  const from = shiftPaidFrom(workedOn, profile.workWeekStarts, profile.weeksBehind);
  const familyId = series.series.familyId;
  const payday =
    firstPaydayFrom(context, familyId, from) ??
    refuse(
      'no-payday',
      `There's no payday of series ${command.seriesId} from ${formatDate(from)}.`,
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

  const earlier = [...context.checked.pay.adjustments.values()]
    .filter((one) => one.familyId === familyId && one.number === payday.payment.number)
    .map(lineOf);
  const worked = workOutPayChange(
    {
      settings: profile,
      ...(profile.soFar === undefined ? {} : { soFar: profile.soFar }),
      payDate: formatDate(payday.payment.day),
      lines: week.lines,
      ...(week.fixed === undefined ? {} : { fixed: week.fixed }),
      earlier,
      change: lineOf({ kind: command.kind, hours: command.hours, rate }),
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
