// The stored records as the engine wants them: the plan's settings turned
// into the main pay and the bank holidays (D155), and how far ahead to look.
// Used by Home, the Plan screen and every edit, so they all work the plan out
// the same way.

import {
  addMonths,
  type EditInput,
  formatDate,
  LAST_YEAR,
  type Plan,
  type PlanRecords,
  type PlanSettings,
  parseDate,
  partsOfDay,
  workOutPlan,
} from '@prepenny/engine';
import { holidaysFor } from './holidays.ts';

/** How far ahead Home looks: 12 months, so a yearly bill is never missed (D178). */
export const HOME_MONTHS_AHEAD = 12;

/** How many months the Plan screen shows at first (brief 4.8). */
export const PLAN_MONTHS_AHEAD = 3;

/** The most the Plan screen shows, with "Show another month" (brief 4.8). */
export const PLAN_MONTHS_MOST = 24;

/** The same date some months after today, or that month's last day when it's shorter (D167, D178). */
export function planLookAhead(today: string, months: number): string {
  const day = parseDate(today, 'today');
  if (partsOfDay(day).year + Math.ceil(months / 12) > LAST_YEAR) {
    return `${LAST_YEAR}-12-31`;
  }
  return formatDate(addMonths(day, months));
}

const NO_SETTINGS: PlanSettings = { nation: 'england-and-wales', mainPayFamilyId: null };

export function settingsOf(records: PlanRecords): PlanSettings {
  return records.settings ?? NO_SETTINGS;
}

/** The plan worked out from today to `to`. */
export function workOutPlanTo(records: PlanRecords, today: string, to: string): Plan {
  const settings = settingsOf(records);
  return workOutPlan({
    ...records,
    mainPayFamilyId: settings.mainPayFamilyId,
    holidays: holidaysFor(settings.nation),
    today,
    to,
  });
}

/** What an edit needs: the records, the main pay, the bank holidays and today (D87, D155). */
export function editInputOf(records: PlanRecords, today: string): EditInput {
  const settings = settingsOf(records);
  return {
    ...records,
    mainPayFamilyId: settings.mainPayFamilyId,
    holidays: holidaysFor(settings.nation),
    today,
  };
}
