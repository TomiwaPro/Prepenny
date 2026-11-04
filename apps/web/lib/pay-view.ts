// What the pay calculator needs from the plan, in the app (brief 4.15, step
// 2g): the main pay's paydays from tomorrow on (D81), each with its amount,
// whether it's still an estimate (D44) and its saved pay week (D5); the main
// pay's tax settings; and the saved pay weeks, to start from. Worked out in
// the background worker from the engine's own plan, 12 months ahead (D178).

import type { PayFrequency, PayProfile, Pence, PlanRecords, Schedule } from '@prepenny/engine';
import type { MainPayLinks, SavedWeek } from './pay-calculator.ts';
import { HOME_MONTHS_AHEAD, planLookAhead, settingsOf, workOutPlanTo } from './plan-input.ts';

export interface PaydayChoice {
  readonly seriesId: string;
  readonly originalDate: string;
  /** The day it lands, after any weekend rule or move. */
  readonly date: string;
  /** With any overtime added while it's an estimate. */
  readonly amount: Pence;
  readonly isEstimate: boolean;
  /** What "I did overtime" and "I missed a shift" add to it (D123). */
  readonly adjustment: Pence;
  /** The saved pay week of its step of the pattern (D5), or null. */
  readonly weekId: string | null;
  /** Its step of the pay pattern, counting from 1: always 1 with one amount (D5). */
  readonly step: number;
}

export interface PayView {
  readonly today: string;
  /** The main pay's paydays after today, the next first (D81). */
  readonly paydays: readonly PaydayChoice[];
  readonly main: MainPayLinks | null;
  /** The main pay's tax settings, or null when none are saved. */
  readonly profile: PayProfile | null;
  /** Every saved pay week, the main pay's first. */
  readonly weeks: readonly SavedWeek[];
  /**
   * How often the main pay comes, as the calculator's pay periods, to start
   * from when no tax settings are saved; null when it doesn't fit one.
   */
  readonly frequency: PayFrequency | null;
}

/** The calculator's pay period for a schedule: every 1, 2 or 4 weeks, or every month. */
function frequencyOf(schedule: Schedule | undefined): PayFrequency | null {
  if (schedule?.kind === 'weekly') {
    if (schedule.every === 1) return 'weekly';
    if (schedule.every === 2) return 'two-weekly';
    if (schedule.every === 4) return 'four-weekly';
    return null;
  }
  if (schedule?.kind === 'monthly' && schedule.every === 1) return 'monthly';
  return null;
}

const mod = (value: number, length: number) => ((value % length) + length) % length;

export function workOutPayView(records: PlanRecords, today: string): PayView {
  const mainPay = settingsOf(records).mainPayFamilyId;
  const family = records.series.filter((one) => one.familyId === mainPay && one.direction === 'in');
  const series = new Map(family.map((one) => [one.id, one]));
  const paydays: PaydayChoice[] = [];
  if (family.length > 0 && records.accounts.length > 0) {
    const plan = workOutPlanTo(records, today, planLookAhead(today, HOME_MONTHS_AHEAD));
    for (const account of plan.accounts) {
      for (const row of account.rows) {
        const own = series.get(row.payment.seriesId);
        if (row.kind !== 'payment' || own === undefined || row.payment.date <= today) continue;
        const weeks = own.cyclePayWeeks;
        const steps = own.amountCycle?.length ?? 1;
        paydays.push({
          seriesId: row.payment.seriesId,
          originalDate: row.payment.originalDate,
          date: row.payment.date,
          amount: row.payment.amount,
          isEstimate: row.payment.isEstimate,
          adjustment: row.payment.payAdjustment ?? 0,
          weekId:
            weeks === undefined || weeks.length === 0
              ? null
              : (weeks[
                  mod(
                    mod(row.payment.number, weeks.length) + mod(own.cycleOffset ?? 0, weeks.length),
                    weeks.length,
                  )
                ] ?? null),
          step: mod(mod(row.payment.number, steps) + mod(own.cycleOffset ?? 0, steps), steps) + 1,
        });
      }
    }
    paydays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  // The series that pays from now on: the one with the latest start.
  const latest = [...family].sort((a, b) => (a.start < b.start ? 1 : -1))[0];
  const profileId = latest?.payProfileId ?? null;
  const profile = (records.payProfiles ?? []).find((one) => one.id === profileId) ?? null;
  const all = (records.payWeeks ?? []).map(
    (week): SavedWeek => ({
      id: week.id,
      name: week.name ?? '',
      lines: week.lines,
      fixed: week.fixed ?? [],
    }),
  );
  const ownWeeks = new Set(
    (records.payWeeks ?? []).filter((one) => one.payProfileId === profileId).map((one) => one.id),
  );
  return {
    today,
    paydays,
    main:
      latest === undefined
        ? null
        : {
            seriesId: latest.id,
            name: latest.name,
            payProfileId: profileId,
            steps: latest.amountCycle?.length ?? 1,
            hasPayWeeks: family.some((one) => (one.cyclePayWeeks?.length ?? 0) > 0),
            weeks: latest.cyclePayWeeks ?? null,
          },
    profile,
    weeks: [
      ...all.filter((one) => ownWeeks.has(one.id)),
      ...all.filter((one) => !ownWeeks.has(one.id)),
    ],
    frequency: frequencyOf(latest?.schedule),
  };
}
