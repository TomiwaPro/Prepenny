// What "Your job" shows (step 2h, brief 4.15, D154): each saved job's tax
// settings, the last payslip's figures, the overtime rate and the last day
// of work its next payday covers (D131), with its saved pay weeks and the
// steps of the pay pattern each is for (D5). And what a change to them would
// do: the paydays still to come whose pay changes, because overtime and
// missed shifts saved for them are worked out again (D154, D162). Worked out
// in the background worker, on a copy that's never saved.

import {
  type EditCommand,
  EngineInputError,
  formatDate,
  lastDayCovered,
  type PayFrequency,
  type PayProfile,
  type Pence,
  type PlanRecords,
  parseDate,
  type Series,
} from '@prepenny/engine';
import { runEdit } from './edit.ts';
import { HOME_MONTHS_AHEAD, planLookAhead, workOutPlanTo } from './plan-input.ts';

export interface JobWeek {
  readonly id: string;
  readonly name: string;
  /** The steps of the pay pattern it's linked to, counting from 1; empty when it's only kept to start from. */
  readonly steps: readonly number[];
}

export interface JobCard {
  readonly id: string;
  readonly name: string;
  readonly profile: PayProfile;
  readonly frequency: PayFrequency;
  /** The names of the pay it's for, such as "Pay". */
  readonly pays: readonly string[];
  /** Its next payday after today: the day it lands, and its date from the schedule (D131). */
  readonly next: { readonly date: string; readonly originalDate: string } | null;
  /** The last day of work that payday covers (D131), or null when it isn't set. */
  readonly coveredUpTo: string | null;
  /** How many steps the pay pattern has: 1 with one amount. */
  readonly steps: number;
  readonly weeks: readonly JobWeek[];
  /** Overtime and missed shifts saved for paydays still to come that are estimates (D44, D154). */
  readonly shiftsAhead: number;
}

export interface JobView {
  readonly today: string;
  readonly jobs: readonly JobCard[];
}

const mod = (value: number, length: number) => ((value % length) + length) % length;

/** The series of a job that pays from now on: the one with the latest start. */
function latestOf(series: readonly Series[]): Series | undefined {
  return [...series].sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0))[0];
}

/** A pay row of a job's series, after today. */
interface PayRow {
  readonly seriesId: string;
  readonly familyId: string;
  readonly number: number;
  readonly originalDate: string;
  readonly date: string;
  readonly amount: Pence;
  readonly isEstimate: boolean;
}

function payRowsAfterToday(
  records: PlanRecords,
  today: string,
  seriesIds: ReadonlySet<string>,
): PayRow[] {
  if (records.accounts.length === 0 || seriesIds.size === 0) return [];
  const family = new Map(records.series.map((one) => [one.id, one.familyId]));
  const plan = workOutPlanTo(records, today, planLookAhead(today, HOME_MONTHS_AHEAD));
  const rows: PayRow[] = [];
  for (const account of plan.accounts) {
    for (const row of account.rows) {
      if (row.kind !== 'payment' || !seriesIds.has(row.payment.seriesId)) continue;
      if (row.payment.date <= today) continue;
      rows.push({
        seriesId: row.payment.seriesId,
        familyId: family.get(row.payment.seriesId) ?? row.payment.seriesId,
        number: row.payment.number,
        originalDate: row.payment.originalDate,
        date: row.payment.date,
        amount: row.payment.amount,
        isEstimate: row.payment.isEstimate,
      });
    }
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}

export function workOutJobView(records: PlanRecords, today: string): JobView {
  const jobs: JobCard[] = [];
  for (const profile of records.payProfiles ?? []) {
    const linked = records.series.filter(
      (one) => one.payProfileId === profile.id && one.direction === 'in',
    );
    const ids = new Set(linked.map((one) => one.id));
    const rows = payRowsAfterToday(records, today, ids);
    const next = rows[0] ?? null;
    const latest = latestOf(linked);
    const steps = latest?.amountCycle?.length ?? 1;
    const linkedWeeks = latest?.cyclePayWeeks ?? [];
    const weeks = (records.payWeeks ?? [])
      .filter((one) => one.payProfileId === profile.id)
      .map(
        (week): JobWeek => ({
          id: week.id,
          name: week.name ?? '',
          steps: linkedWeeks.flatMap((id, index) => (id === week.id ? [index + 1] : [])),
        }),
      );
    const families = new Set(linked.map((one) => one.familyId));
    const ahead = new Set(
      rows.filter((row) => row.isEstimate).map((row) => `${row.familyId}|${row.number}`),
    );
    const shiftsAhead = (records.payAdjustments ?? []).filter(
      (one) => families.has(one.familyId) && ahead.has(`${one.familyId}|${one.number}`),
    ).length;
    jobs.push({
      id: profile.id,
      name: profile.name ?? '',
      profile,
      frequency: profile.frequency,
      pays: [...new Set(linked.map((one) => one.name))],
      next: next === null ? null : { date: next.date, originalDate: next.originalDate },
      coveredUpTo:
        next === null || profile.coveredTo === undefined
          ? null
          : formatDate(lastDayCovered(profile.coveredTo, parseDate(next.originalDate))),
      steps,
      weeks,
      shiftsAhead,
    });
  }
  return { today, jobs };
}

/** The step of the pattern a payday is on, counting from 1, as the engine picks its pay week (D5). */
export function stepOf(series: Series, number: number): number {
  const steps = series.amountCycle?.length ?? 1;
  return mod(mod(number, steps) + mod(series.cycleOffset ?? 0, steps), steps) + 1;
}

export interface PaydayChange {
  readonly date: string;
  readonly before: Pence;
  readonly after: Pence;
}

export type JobPreview =
  | { readonly ok: true; readonly changes: readonly PaydayChange[] }
  | { readonly ok: false; readonly code: string };

/**
 * What a change to a job's details, or to which pay weeks its paydays use,
 * would do (D154): every payday of its pay still to come whose amount
 * changes, because the overtime and missed shifts saved for it are worked
 * out again. The change is made on a copy that's never saved.
 */
export function previewJobChange(
  records: PlanRecords,
  today: string,
  profileId: string,
  commands: readonly EditCommand[],
): JobPreview {
  const ids = new Set(
    records.series.filter((one) => one.payProfileId === profileId).map((one) => one.id),
  );
  let after = records;
  try {
    for (const command of commands) after = runEdit(after, today, command).records;
  } catch (error) {
    if (error instanceof EngineInputError) return { ok: false, code: error.code };
    throw error;
  }
  const key = (row: PayRow) => `${row.familyId}|${row.number}`;
  const before = new Map(payRowsAfterToday(records, today, ids).map((row) => [key(row), row]));
  const afterIds = new Set(
    after.series.filter((one) => one.payProfileId === profileId).map((one) => one.id),
  );
  const changes: PaydayChange[] = [];
  for (const row of payRowsAfterToday(after, today, afterIds)) {
    const was = before.get(key(row));
    if (was !== undefined && was.amount !== row.amount) {
      changes.push({ date: row.date, before: was.amount, after: row.amount });
    }
  }
  return { ok: true, changes };
}
