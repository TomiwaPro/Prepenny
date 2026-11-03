// Adding and changing pay profiles and saved pay weeks (brief 4.15, D5,
// D130, D131, D154). Each is one edit, so one undo (D87). A change works out
// every overtime and missed shift saved on them again (D140, D154).

import { parseDecimal } from '../money/decimal.ts';
import { checkPence, checkPenceNotNegative } from '../money/pence.ts';
import { checkSettings } from '../pay/take-home.ts';
import {
  type CoveredTo,
  type FixedPay,
  PAY_LINE_KINDS,
  type PayLine,
  type PayProfile,
  type PayWeek,
  type YearSoFar,
} from '../pay/types.ts';
import { checkEdits, checkName, checkNewId, checkNow, checkObject, recordNow } from './checks.ts';
import { type Context, refuse } from './context.ts';
import { refuseMovedShifts, reworkPayAdjustments } from './pay.ts';
import { clean, type Draftable, sameValue } from './records.ts';
import type { EditCommand, PayProfileEdits, PayWeekEdits } from './types.ts';

/** Checks a pay profile's own fields beyond its tax settings (D124, D131, D154). */
function checkProfile(profile: PayProfile, what: string): void {
  checkSettings(profile);
  if (profile.overtimeRate !== undefined) {
    const rate = parseDecimal(profile.overtimeRate, `${what}: the overtime rate`);
    if (rate.units < 0n)
      refuse('bad-pay-profile', `${what}: the overtime rate can't be below zero.`);
  }
  if (profile.soFar !== undefined) checkSoFar(profile.soFar, what);
  const coveredTo: CoveredTo | undefined = profile.coveredTo;
  if (coveredTo !== undefined) {
    // Monthly pay covers work up to a day of the month; any other pay, a
    // number of days before payday (D131).
    const monthly = profile.frequency === 'monthly';
    if (monthly === (coveredTo?.kind === 'days-before')) {
      refuse(
        'covered-to-not-for-frequency',
        monthly
          ? `${what}: monthly pay covers work up to a day of the month, not a number of days before.`
          : `${what}: pay that isn't monthly covers work up to a number of days before payday.`,
      );
    }
  }
}

/** "Gross for tax so far" and "Tax paid so far" from a payslip (brief 4.15, D124). */
function checkSoFar(soFar: YearSoFar, what: string): void {
  checkObject(soFar, 'the year so far');
  if (typeof soFar.taxYear !== 'string' || !/^\d{4}-\d{2}$/.test(soFar.taxYear)) {
    refuse('bad-pay-profile', `${what}: the tax year is written like "2026-27".`);
  }
  if (!Number.isInteger(soFar.period) || soFar.period < 1 || soFar.period > 56) {
    refuse('bad-pay-profile', `${what}: the tax week or month is a whole number from 1 to 56.`);
  }
  checkPenceNotNegative(soFar.grossForTax, `${what}: gross for tax so far`);
  // Tax paid so far can be below zero after a refund.
  checkPence(soFar.taxPaid, `${what}: tax paid so far`);
}

/** The fields of a pay profile, from a command, without anything else. */
function profileOf(raw: PayProfile, id: string, name: string | undefined): PayProfile {
  return clean<PayProfile>({
    id,
    name,
    frequency: raw.frequency,
    taxCode: raw.taxCode,
    basis: raw.basis,
    niCategory: raw.niCategory,
    pension: raw.pension === undefined ? undefined : { ...raw.pension },
    studentLoans: raw.studentLoans === undefined ? undefined : [...raw.studentLoans],
    otherDeductions:
      raw.otherDeductions === undefined
        ? undefined
        : raw.otherDeductions.map((one) => ({ ...one })),
    soFar: raw.soFar === undefined ? undefined : { ...raw.soFar },
    overtimeRate: raw.overtimeRate,
    coveredTo: raw.coveredTo === undefined ? undefined : { ...raw.coveredTo },
  });
}

/** A new pay profile: one job's tax settings (brief 4.15, D131, D154). */
export function addPayProfile(
  context: Context,
  command: Extract<EditCommand, { kind: 'add-pay-profile' }>,
): void {
  const raw = command.profile;
  checkObject(raw, 'the pay profile');
  const id = checkNewId(context, 'pay-profile', raw.id, 'pay profile');
  const what = `Pay profile ${id}`;
  const value = profileOf(raw, id, checkName(raw.name, what));
  checkProfile(value, what);
  context.draft.set({ kind: 'pay-profile', id, value });
  checkNow(context);
}

function edited<T>(value: T | null | undefined, now: T | undefined): T | undefined {
  return value === undefined ? now : value === null ? undefined : value;
}

/**
 * Changes a pay profile (D154), such as a new tax code or this week's
 * "year so far", and works out its overtime and missed shifts again.
 */
export function changePayProfile(context: Context, profileId: string, raw: PayProfileEdits): void {
  if (typeof profileId !== 'string' || profileId === '') {
    refuse('bad-command', 'The command needs the pay profile.');
  }
  const profile =
    recordNow(context, 'pay-profile', profileId) ??
    refuse('unknown-pay-profile', `Pay profile ${profileId} isn't in the plan.`);
  const what = `Pay profile ${profileId}`;
  const edits = checkEdits(raw, what);
  const next: Draftable<PayProfile> = {
    ...profile,
    name: edits.name === undefined ? profile.name : checkName(edits.name, what),
    frequency: edits.frequency ?? profile.frequency,
    taxCode: edits.taxCode ?? profile.taxCode,
    basis: edits.basis ?? profile.basis,
    niCategory: edited(edits.niCategory, profile.niCategory),
    pension: edited(edits.pension, profile.pension),
    studentLoans: edited(edits.studentLoans, profile.studentLoans),
    otherDeductions: edited(edits.otherDeductions, profile.otherDeductions),
    soFar: edited(edits.soFar, profile.soFar),
    overtimeRate: edited(edits.overtimeRate, profile.overtimeRate),
    coveredTo: edited(edits.coveredTo, profile.coveredTo),
  };
  const value = profileOf(clean<PayProfile>(next), profileId, next.name);
  checkProfile(value, what);
  context.draft.set({ kind: 'pay-profile', id: profileId, value });
  checkNow(context);
  if (!sameValue(value.coveredTo, profile.coveredTo)) {
    refuseMovedShifts(context, profileId, value.coveredTo);
  }
  reworkPayAdjustments(context);
}

/** A saved pay week's lines and extras (D5, D130): hours and rates, and extras, zero or more. */
function checkWeek(lines: readonly PayLine[], fixed: readonly FixedPay[], what: string): void {
  if (!Array.isArray(lines) || !Array.isArray(fixed)) {
    refuse('bad-pay-week', `${what}: the lines and extras must be lists.`);
  }
  if (lines.length === 0 && fixed.length === 0) {
    refuse('empty-pay-week', `${what} needs a line of hours or an extra.`);
  }
  lines.forEach((line, i) => {
    checkObject(line, `line ${i + 1}`);
    if (typeof line.name !== 'string')
      refuse('bad-pay-week', `${what}: line ${i + 1} needs a name.`);
    if (!(PAY_LINE_KINDS as readonly string[]).includes(line.kind)) {
      refuse('bad-pay-week', `${what}: line ${i + 1} has no kind.`);
    }
    for (const field of ['hours', 'rate'] as const) {
      if (parseDecimal(line[field], `${what}: line ${i + 1} ${field}`).units < 0n) {
        refuse('bad-pay-week', `${what}: line ${i + 1} ${field} can't be below zero.`);
      }
    }
  });
  fixed.forEach((one, i) => {
    checkObject(one, `extra ${i + 1}`);
    if (typeof one.name !== 'string')
      refuse('bad-pay-week', `${what}: extra ${i + 1} needs a name.`);
    checkPenceNotNegative(one.amount, `${what}: extra ${i + 1}`);
  });
}

function weekOf(
  id: string,
  name: string,
  payProfileId: string,
  lines: readonly PayLine[],
  fixed: readonly FixedPay[] | undefined,
): PayWeek {
  return clean<PayWeek>({
    id,
    name,
    payProfileId,
    lines: lines.map((line) => ({
      name: line.name,
      kind: line.kind,
      hours: line.hours,
      rate: line.rate,
    })),
    fixed:
      fixed === undefined
        ? undefined
        : fixed.map((one) => ({ name: one.name, amount: one.amount })),
  });
}

/** A new saved pay week (D5, D130, D154): "3-shift week". */
export function addPayWeek(
  context: Context,
  command: Extract<EditCommand, { kind: 'add-pay-week' }>,
): void {
  const raw = command.week;
  checkObject(raw, 'the pay week');
  const id = checkNewId(context, 'pay-week', raw.id, 'pay week');
  const what = `Pay week ${id}`;
  const name = checkName(raw.name, what);
  if (
    typeof raw.payProfileId !== 'string' ||
    recordNow(context, 'pay-profile', raw.payProfileId) === null
  ) {
    refuse('unknown-pay-profile', `${what} is for a pay profile that isn't in the plan.`);
  }
  checkWeek(raw.lines, raw.fixed ?? [], what);
  const value = weekOf(id, name, raw.payProfileId, raw.lines, raw.fixed);
  context.draft.set({ kind: 'pay-week', id, value });
  checkNow(context);
}

/**
 * Changes a saved pay week's name, lines or extras (D130, D154), and works
 * out the overtime and missed shifts on paydays that use it again.
 */
export function changePayWeek(context: Context, weekId: string, raw: PayWeekEdits): void {
  if (typeof weekId !== 'string' || weekId === '') {
    refuse('bad-command', 'The command needs the pay week.');
  }
  const week =
    recordNow(context, 'pay-week', weekId) ??
    refuse('unknown-pay-week', `Pay week ${weekId} isn't in the plan.`);
  const what = `Pay week ${weekId}`;
  const edits = checkEdits(raw, what);
  const name = edits.name === undefined ? (week.name ?? '') : checkName(edits.name, what);
  const lines = edits.lines ?? week.lines;
  const fixed = edited(edits.fixed, week.fixed);
  checkWeek(lines, fixed ?? [], what);
  const value = weekOf(weekId, name, week.payProfileId, lines, fixed);
  context.draft.set({
    kind: 'pay-week',
    id: weekId,
    value:
      week.name === undefined && edits.name === undefined
        ? clean<PayWeek>({ ...value, name: undefined })
        : value,
  });
  checkNow(context);
  reworkPayAdjustments(context);
}
