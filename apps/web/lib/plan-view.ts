// Everything the Coming up page shows (brief 4.8, D208 to D211), worked out
// by the engine in the background worker. Each account's balance, its plan
// grouped by pay period or calendar month, each period with the pay that
// comes in, its lowest point, its rows with "Left after this" and "Left at
// the end"; the lowest point ahead; and "Not ticked yet" (D11, D14, D84).
//
// What's shown only hides rows on screen, so it's not here: every figure is
// worked out from the whole plan (D184).

import {
  type AccountPlan,
  addDays,
  addMonths,
  type BalanceStatus,
  formatDate,
  groupIntoPeriods,
  lastDayOfMonth,
  type Pence,
  type Plan,
  type PlanPeriod,
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
  settingsOf,
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
  /** The period's last day. The Coming up page always shows whole periods (D183). */
  readonly end: string;
  /** The period with today in it: its rows start today (D84). */
  readonly first: boolean;
  /**
   * A calendar month: grouped by month, or a month after the main pay has
   * stopped (D144). It's named "November" rather than by its first day.
   */
  readonly byMonth: boolean;
  /** "Came in": everything arriving in the account in it, from today on (D84). */
  readonly cameIn: Pence;
  /**
   * The main pay arriving in this account in the period, from today on: "Pay
   * £603.06 in" (D211). Null when none of it arrives in this account then.
   */
  readonly pay: Pence | null;
  /**
   * The lowest end-of-day balance in the period, from today on, with Tight or
   * Short (D85, D211): "Lowest £4.53". The first such day if there's a tie.
   */
  readonly lowest: {
    readonly balance: Pence;
    readonly status: BalanceStatus;
    readonly date: string;
  };
  /** "Left at the end". */
  readonly leftAtEnd: Pence;
  readonly rows: readonly RowView[];
}

export interface AccountView {
  readonly id: string;
  readonly name: string;
  /** The balance typed in, and the day it was checked: "£267.54, checked today" (D209). */
  readonly balance: Pence;
  readonly checkedOn: string;
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
  /** There's a main pay, so payments can be grouped by payday (D84). */
  readonly canGroupByPay: boolean;
  /**
   * For pay every week or every few weeks: a whole pay period's first and
   * last day, for "By payday, Fri to Thu" in the View sheet (D210). Null for
   * other pay, where the days change from month to month.
   */
  readonly payWeek: { readonly start: string; readonly end: string } | null;
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

/**
 * How many months to show so a date is in them: up to the month it's in,
 * counting today's, at most 24 (D190). It's enough for pay periods too:
 * they show whole periods up to the same day that many months ahead.
 */
export function monthsUpTo(today: string, date: string): number {
  const from = partsOfDay(parseDate(today, 'today'));
  const to = partsOfDay(parseDate(date));
  const months = (to.year - from.year) * 12 + (to.month - from.month) + 1;
  return Math.min(PLAN_MONTHS_MOST, Math.max(1, months));
}

/** Keeps a number of months between 1 and 24. */
export function monthsShown(months: number): number {
  if (!Number.isInteger(months)) return PLAN_MONTHS_AHEAD;
  return Math.min(PLAN_MONTHS_MOST, Math.max(1, months));
}

/**
 * The last day the Coming up page shows (D183). In calendar months: the end of
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

/** The lowest end-of-day balance from `from` to `to`, the first such day if there's a tie (D85). */
function lowestBetween(account: AccountPlan, from: string, to: string): PeriodView['lowest'] {
  let lowest: PeriodView['lowest'] | null = null;
  for (const day of account.days) {
    if (day.date < from || day.date > to) continue;
    if (lowest === null || day.balance < lowest.balance) {
      lowest = { balance: day.balance, status: day.status, date: day.date };
    }
  }
  // Every day in a period has an end-of-day balance; this is only a safe fallback.
  return lowest ?? { balance: account.lowestPoint.balance, status: 'ok', date: from };
}

/** True when a period is one whole calendar month. */
function wholeMonth(start: string, end: string): boolean {
  const first = partsOfDay(parseDate(start));
  return first.day === 1 && end === formatDate(lastDayOfMonth(first.year, first.month));
}

/** The main pay in a period's rows, or null when none of it is in this account then (D211). */
function payIn(period: PlanPeriod, mainPaySeries: ReadonlySet<string>): Pence | null {
  let pay: Pence | null = null;
  for (const row of period.rows) {
    if (row.kind === 'payment' && row.change > 0 && mainPaySeries.has(row.payment.seriesId)) {
      pay = (pay ?? 0) + row.change;
    }
  }
  return pay;
}

/**
 * A whole pay period's first and last day, when the main pay comes every
 * week or every few weeks (or is irregular, with Monday to Sunday weeks, D14).
 */
function payWeekOf(
  records: PlanRecords,
  plan: Plan,
  grouped: ReturnType<typeof groupIntoPeriods>,
): PlanView['payWeek'] {
  const family = settingsOf(records).mainPayFamilyId;
  if (family === null || plan.mainPay === 'none') return null;
  const weekly = records.series
    .filter((one) => one.familyId === family)
    .every((one) => one.schedule.kind === 'weekly' || one.schedule.kind === 'irregular');
  if (!weekly) return null;
  const byPay = grouped.by === 'pay' ? grouped : groupIntoPeriods(plan, 'pay');
  const periods = byPay.accounts[0]?.periods ?? [];
  // The second period is the first whole one: the first starts today.
  const whole = periods[1];
  return whole === undefined || whole.to !== whole.end
    ? null
    : { start: whole.start, end: whole.end };
}

/** Everything the Coming up page shows, from the stored records and today. */
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
  const mainPayFamily = settingsOf(records).mainPayFamilyId;
  const mainPaySeries = new Set(
    records.series.filter((one) => one.familyId === mainPayFamily).map((one) => one.id),
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
        balance: account.start.balance,
        checkedOn: account.start.checkedOn,
        warningLevel: account.account.warningLevel,
        lowest: lowestOf(account),
        notTickedYet: account.notTickedYet.map((row) => makeRow(row, lowestKey)),
        periods: periods.map((period, i) => {
          const pay = payIn(period, mainPaySeries);
          return {
            start: period.start,
            end: period.end,
            first: i === 0,
            byMonth:
              grouped.by === 'months' || (pay === null && wholeMonth(period.start, period.end)),
            cameIn: period.cameIn,
            pay,
            lowest: lowestBetween(account, period.from, period.to),
            leftAtEnd: period.leftAtEnd,
            rows: period.rows.map((row) => makeRow(row, lowestKey)),
          };
        }),
      },
    ];
  });

  return {
    today,
    grouping: grouped.by,
    canGroupByPay: plan.mainPay !== 'none',
    payWeek: payWeekOf(records, plan, grouped),
    months,
    to: shown.to,
    canShowMore: months < PLAN_MONTHS_MOST,
    mainPayEnded: plan.mainPayEnded,
    accounts,
    firstAccountId: homeAccountId(records),
  };
}
