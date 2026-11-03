// Checks the stored pay records (ARCHITECTURE.md 3.4): pay profiles, saved
// pay weeks and pay adjustments, and the links to them from pay series.

import { parseDate } from '../dates/day.ts';
import { EngineInputError } from '../errors.ts';
import { parseDecimal } from '../money/decimal.ts';
import { checkPence, type Pence } from '../money/pence.ts';
import type { AdjustmentIndex } from '../schedule/payments.ts';
import type { Series } from '../schedule/types.ts';
import { checkSettings } from './take-home.ts';
import {
  type CoveredTo,
  PAY_LINE_KINDS,
  type PayAdjustment,
  type PayProfile,
  type PayWeek,
} from './types.ts';

export interface CheckedPay {
  readonly profiles: ReadonlyMap<string, PayProfile>;
  readonly weeks: ReadonlyMap<string, PayWeek>;
  readonly adjustments: ReadonlyMap<string, PayAdjustment>;
  readonly index: AdjustmentIndex;
}

export interface PayRecords {
  readonly payProfiles?: readonly PayProfile[];
  readonly payWeeks?: readonly PayWeek[];
  readonly payAdjustments?: readonly PayAdjustment[];
}

function bad(code: string, message: string): never {
  throw new EngineInputError(code, message);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function list<T>(value: readonly T[] | undefined, what: string): readonly T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) bad('bad-pay', `${what} must be a list.`);
  return value;
}

/** The most days before payday a payday's work can end: 8 weeks and 6 days, as before D131. */
export const MOST_DAYS_COVERED_BEFORE = 62;

/** Checks the last day of work each payday pays for (D131). */
function checkCoveredTo(coveredTo: CoveredTo, what: string): void {
  const whole = (value: unknown, low: number, high: number) =>
    typeof value === 'number' && Number.isInteger(value) && value >= low && value <= high;
  switch (coveredTo?.kind) {
    case 'days-before':
      if (!whole(coveredTo.days, 0, MOST_DAYS_COVERED_BEFORE)) {
        bad(
          'bad-pay-profile',
          `${what}: a payday covers work up to 0 to ${MOST_DAYS_COVERED_BEFORE} days before it.`,
        );
      }
      return;
    case 'day-of-month':
      if (!whole(coveredTo.day, 1, 31)) {
        bad('bad-pay-profile', `${what}: the last day covered is a day of the month, 1 to 31.`);
      }
      return;
    case 'last-day':
      return;
    default:
      bad(
        'bad-pay-profile',
        `${what}: the last day covered is a day of the month, the last day, or days before payday.`,
      );
  }
}

/** Checks one pay adjustment's own fields (D5, D123, D130). */
export function checkPayAdjustment(one: PayAdjustment, what: string): void {
  if (!isId(one?.id)) bad('bad-pay-adjustment', `${what} needs an id.`);
  if (!isId(one.familyId)) bad('bad-pay-adjustment', `${what} needs the pay's family.`);
  if (!Number.isSafeInteger(one.number) || one.number < 0) {
    bad('bad-pay-adjustment', `${what}: the payment number must be a whole number, 0 or more.`);
  }
  if (one.kind !== 'overtime' && one.kind !== 'missed-shift') {
    bad('bad-pay-adjustment', `${what}: it's overtime or a missed shift.`);
  }
  parseDate(one.workedOn, `${what}: the day of the shift`);
  const hours = parseDecimal(one.hours, `${what}: the hours`);
  if (hours.units <= 0n) bad('bad-pay-adjustment', `${what}: the hours must be above zero.`);
  const rate = parseDecimal(one.rate, `${what}: the rate`);
  if (rate.units < 0n) bad('bad-pay-adjustment', `${what}: the rate can't be below zero.`);
  if (one.extras !== undefined) {
    checkPence(one.extras, `${what}: the change to the extras`);
    if (one.extras <= 0) {
      bad('bad-pay-adjustment', `${what}: a change to the extras is above zero, or left out.`);
    }
  }
  checkPence(one.change, `${what}: the change`);
  if (typeof one.taxYear !== 'string' || !/^\d{4}-\d{2}$/.test(one.taxYear)) {
    bad('bad-pay-adjustment', `${what}: the tax year is written like "2026-27".`);
  }
}

/**
 * Checks the pay records and the pay series' links to them. Profiles and
 * weeks are checked when they're given; a series' links are checked against
 * them only when profiles are given, as debts are (D98).
 */
export function checkPay(records: PayRecords, series: readonly Series[]): CheckedPay {
  const profiles = new Map<string, PayProfile>();
  for (const profile of list(records.payProfiles, 'The pay profiles')) {
    if (!isId(profile?.id)) bad('bad-pay-profile', 'A pay profile needs an id.');
    const what = `Pay profile ${profile.id}`;
    if (profiles.has(profile.id)) bad('repeated-pay-profile', `${what} is listed twice.`);
    checkSettings(profile);
    if (profile.overtimeRate !== undefined)
      parseDecimal(profile.overtimeRate, `${what}: overtime rate`);
    if (profile.coveredTo !== undefined) checkCoveredTo(profile.coveredTo, what);
    profiles.set(profile.id, profile);
  }
  const weeks = new Map<string, PayWeek>();
  for (const week of list(records.payWeeks, 'The pay weeks')) {
    if (!isId(week?.id)) bad('bad-pay-week', 'A pay week needs an id.');
    const what = `Pay week ${week.id}`;
    if (weeks.has(week.id)) bad('repeated-pay-week', `${what} is listed twice.`);
    if (records.payProfiles !== undefined && !profiles.has(week.payProfileId)) {
      bad('unknown-pay-profile', `${what} is for a pay profile not in the plan.`);
    }
    for (const [i, line] of list(week.lines, `${what}: the lines`).entries()) {
      if (!(PAY_LINE_KINDS as readonly string[]).includes(line?.kind)) {
        bad('bad-pay-week', `${what}: line ${i + 1} has no kind.`);
      }
      parseDecimal(line.hours, `${what}: line ${i + 1} hours`);
      parseDecimal(line.rate, `${what}: line ${i + 1} rate`);
    }
    for (const one of list(week.fixed, `${what}: the fixed pay`))
      checkPence(one?.amount, `${what}: fixed pay`);
    weeks.set(week.id, week);
  }
  if (records.payProfiles !== undefined) {
    for (const one of series) {
      if (one.payProfileId !== undefined && !profiles.has(one.payProfileId)) {
        bad('unknown-pay-profile', `Series ${one.id} is linked to a pay profile not in the plan.`);
      }
      for (const weekId of one.cyclePayWeeks ?? []) {
        const week = weeks.get(weekId);
        if (week === undefined || week.payProfileId !== one.payProfileId) {
          bad(
            'unknown-pay-week',
            `Series ${one.id} is linked to a pay week that isn't its pay profile's.`,
          );
        }
      }
    }
  }
  const adjustments = new Map<string, PayAdjustment>();
  const index = new Map<string, Map<number, Pence>>();
  for (const one of list(records.payAdjustments, 'The pay adjustments')) {
    checkPayAdjustment(one, `Pay adjustment ${String(one?.id)}`);
    if (adjustments.has(one.id))
      bad('repeated-pay-adjustment', `Pay adjustment ${one.id} is listed twice.`);
    adjustments.set(one.id, one);
    const family = index.get(one.familyId) ?? new Map<number, Pence>();
    family.set(
      one.number,
      checkPence((family.get(one.number) ?? 0) + one.change, 'A payday’s changes'),
    );
    index.set(one.familyId, family);
  }
  return { profiles, weeks, adjustments, index };
}
