// Everything the Plan screen shows (brief 4.8, the Plan sketch in
// ARCHITECTURE.md 4.6), worked out by the engine in the background worker.
// Each account's plan grouped by pay period or calendar month, each period
// with "Came in", its rows with "Left after this" and "Left at the end"; the
// lowest point ahead; and "Not ticked yet" (D11, D14, D84).
//
// Filters only hide rows on screen, so they're not here: every figure is
// worked out from the whole plan (D184).

import {
  addDays,
  addMonths,
  formatDate,
  groupIntoPeriods,
  lastDayOfMonth,
  type Pence,
  type Plan,
  type PlanRecords,
  parseDate,
  partsOfDay,
} from '@prepenny/engine';
import { homeAccountId, type LowestView, lowestOf } from './home.ts';
import {
  HOME_MONTHS_AHEAD,
  PLAN_MONTHS_AHEAD,
  PLAN_MONTHS_MOST,
  planLookAhead,
  workOutPlanTo,
} from './plan-input.ts';
import { keyOfRow, type RowView, rowMaker } from './rows.ts';

/** Pay periods (the default) or calendar months (brief 4.8). */
export type Grouping = 'pay' | 'months';

export interface PlanViewOptions {
  readonly grouping: Grouping;
  /** How many months to show: 3 at first, up to 24 (brief 4.8). */
  readonly months: number;
}

export const DEFAULT_PLAN_OPTIONS: PlanViewOptions = {
  grouping: 'pay',
  months: PLAN_MONTHS_AHEAD,
};

export interface PeriodView {
  /** The period's first day: unique in the list. */
  readonly start: string;
  /** The period's last day. The Plan screen always shows whole periods (D183). */
  readonly end: string;
  /** The period with today in it: its rows start today (D84). */
  readonly first: boolean;
  /** "Came in": everything arriving in the account in it, from today on (D84). */
  readonly cameIn: Pence;
  /** "Left at the end". */
  readonly leftAtEnd: Pence;
  readonly rows: readonly RowView[];
}

export interface AccountView {
  readonly id: string;
  readonly name: string;
  readonly warningLevel: Pence;
  /** Looks as far as Home does, or as far as the plan is shown when that's further (D183). */
  readonly lowest: LowestView;
  /** Rows dated before today that aren't ticked (D11). */
  readonly notTickedYet: readonly RowView[];
  readonly periods: readonly PeriodView[];
}

export interface PlanView {
  readonly today: string;
  /** How the periods are grouped: pay periods need a main pay, otherwise it's months (D84). */
  readonly grouping: Grouping;
  readonly months: number;
  /** The last day shown: the end of the last whole period (D183). */
  readonly to: string;
  /** "Show another month" is there until 24 months are shown (brief 4.8). */
  readonly canShowMore: boolean;
  /** The main pay has no more paydays planned (D144). */
  readonly mainPayEnded: boolean;
  /** Open accounts, in the order they were made. */
  readonly accounts: readonly AccountView[];
  /** The account shown first: Home's (D168). */
  readonly firstAccountId: string;
}

const later = (a: string, b: string) => (a > b ? a : b);
const earlier = (a: string, b: string) => (a < b ? a : b);

/** The last day of the month some months after today's: Oct, Nov and Dec for 3 months from Sun 25 Oct. */
function endOfMonthsShown(today: string, months: number): string {
  const { year, month } = partsOfDay(addMonths(parseDate(today, 'today'), months - 1));
  return formatDate(lastDayOfMonth(year, month));
}

/** Keeps a number of months between 1 and 24. */
export function monthsShown(months: number): number {
  if (!Number.isInteger(months)) return PLAN_MONTHS_AHEAD;
  return Math.min(PLAN_MONTHS_MOST, Math.max(1, months));
}

/**
 * The last day the Plan screen shows (D183). In calendar months: the end of
 * the month some months after today's, counting today's. In pay periods: the
 * end of the pay period with the date that many months ahead in it, and at
 * least one more period for each month added, so "Show another month"
 * always shows more, even when pay comes monthly a few days apart.
 */
function lastDayShown(records: PlanRecords, today: string, options: PlanViewOptions) {
  const months = monthsShown(options.months);
  const byMonths = { grouping: 'months' as const, to: endOfMonthsShown(today, months), plan: null };
  if (options.grouping === 'months') return byMonths;
  // Far enough to find the end of the pay period around the last month shown.
  const far = later(
    planLookAhead(today, HOME_MONTHS_AHEAD),
    planLookAhead(today, Math.min(months + 6, PLAN_MONTHS_MOST + 6)),
  );
  const plan = workOutPlanTo(records, today, far);
  if (plan.mainPay === 'none') return { ...byMonths, plan };
  /** The last day of the pay period with `date` in it, inside the plan. */
  const endOfPeriodWith = (date: string) => {
    const periods = groupIntoPeriods({ ...plan, to: date }, 'pay').accounts[0]?.periods ?? [];
    const last = periods.at(-1);
    return last === undefined ? date : earlier(last.end, plan.to);
  };
  let to = endOfPeriodWith(planLookAhead(today, 1));
  for (let month = 2; month <= months; month += 1) {
    let next = endOfPeriodWith(planLookAhead(today, month));
    if (next <= to && to < plan.to) {
      next = endOfPeriodWith(formatDate(addDays(parseDate(to), 1)));
    }
    to = next;
  }
  return { grouping: 'pay' as const, to, plan };
}

/** Everything the Plan screen shows, from the stored records and today. */
export function workOutPlanView(
  records: PlanRecords,
  today: string,
  options: PlanViewOptions = DEFAULT_PLAN_OPTIONS,
): PlanView {
  const months = monthsShown(options.months);
  const shown = lastDayShown(records, today, { ...options, months });
  // The lowest point looks as far as Home does, or further when more is shown (D183).
  const lowestTo = later(planLookAhead(today, HOME_MONTHS_AHEAD), shown.to);
  const plan: Plan =
    shown.plan !== null && shown.plan.to === lowestTo
      ? shown.plan
      : workOutPlanTo(records, today, lowestTo);
  const grouped = groupIntoPeriods({ ...plan, to: shown.to }, shown.grouping);
  const makeRow = rowMaker(plan, records);
  const closed = new Set(
    records.accounts.filter((one) => one.closed === true).map((one) => one.id),
  );

  const accounts = plan.accounts.flatMap((account, index): AccountView[] => {
    if (closed.has(account.account.id) && closed.size < records.accounts.length) return [];
    const after = account.lowestPoint.after;
    const lowestKey = after === null ? null : keyOfRow(after);
    const periods = grouped.accounts[index]?.periods ?? [];
    return [
      {
        id: account.account.id,
        name: account.account.name ?? '',
        warningLevel: account.account.warningLevel,
        lowest: lowestOf(account),
        notTickedYet: account.notTickedYet.map((row) => makeRow(row, lowestKey)),
        periods: periods.map((period, i) => ({
          start: period.start,
          end: period.end,
          first: i === 0,
          cameIn: period.cameIn,
          leftAtEnd: period.leftAtEnd,
          rows: period.rows.map((row) => makeRow(row, lowestKey)),
        })),
      },
    ];
  });

  return {
    today,
    grouping: grouped.by,
    months,
    to: shown.to,
    canShowMore: months < PLAN_MONTHS_MOST,
    mainPayEnded: plan.mainPayEnded,
    accounts,
    firstAccountId: homeAccountId(records),
  };
}
