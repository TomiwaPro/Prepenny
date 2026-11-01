// Checks the stored pay records (ARCHITECTURE.md 3.4): pay profiles, saved
// pay weeks and pay adjustments, and the links to them from pay series.

import { parseDate } from '../dates/day.ts';
import { EngineInputError } from '../errors.ts';
import { parseDecimal } from '../money/decimal.ts';
import { checkPence, type Pence } from '../money/pence.ts';
import type { AdjustmentIndex } from '../schedule/payments.ts';
import type { Series } from '../schedule/types.ts';
import { checkSettings } from './take-home.ts';
import { PAY_LINE_KINDS, type PayAdjustment, type PayProfile, type PayWeek } from './types.ts';

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

/** Checks one pay adjustment's own fields (D5, D123). */
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
    if (
      profile.workWeekStarts !== undefined &&
      !(
        Number.isInteger(profile.workWeekStarts) &&
        profile.workWeekStarts >= 1 &&
        profile.workWeekStarts <= 7
      )
    ) {
      bad(
        'bad-pay-profile',
        `${what}: the working week starts on a weekday, 1 (Monday) to 7 (Sunday).`,
      );
    }
    if (
      profile.weeksBehind !== undefined &&
      !(
        Number.isInteger(profile.weeksBehind) &&
        profile.weeksBehind >= 0 &&
        profile.weeksBehind <= 8
      )
    ) {
      bad('bad-pay-profile', `${what}: pay can be 0 to 8 weeks behind the shifts.`);
    }
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
