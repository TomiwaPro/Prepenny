import type { AccountPlan, Plan, PlanRow } from '../balance/types.ts';
import {
  addDays,
  type Day,
  dayFromParts,
  formatDate,
  lastDayOfMonth,
  monthFromNumber,
  monthNumberOfDay,
  parseDate,
} from '../dates/day.ts';
import { EngineInputError } from '../errors.ts';
import type { Pence } from '../money/pence.ts';

/** How the plan is grouped (brief 4.8): by the main pay's pay periods, or by calendar month. */
export type PeriodGrouping = 'pay' | 'months';

/** One period of one account's plan (brief 4.8, ARCHITECTURE.md 2.1 "Group into periods"). */
export interface PlanPeriod {
  /** The period's first day, "YYYY-MM-DD". */
  readonly start: string;
  /** The period's last day. */
  readonly end: string;
  /**
   * The part of the period inside the plan, from today to the plan's last
   * day. The first and last periods can be cut short; the rest are whole.
   */
  readonly from: string;
  readonly to: string;
  /** "Came in": everything arriving in this account in the period, transfers in included (D84). */
  readonly cameIn: Pence;
  /** Its rows, in date order and the same-day order (D12). */
  readonly rows: readonly PlanRow[];
  /** "Left at the end": the balance at the end of `to`. */
  readonly leftAtEnd: Pence;
}

export interface AccountPeriods {
  readonly accountId: string;
  readonly periods: readonly PlanPeriod[];
}

export interface PlanPeriods {
  /** How the periods were grouped. Pay periods need a main pay; without one, it's months (D84). */
  readonly by: PeriodGrouping;
  readonly accounts: readonly AccountPeriods[];
}

interface Bounds {
  readonly start: Day;
  readonly end: Day;
}

/**
 * Pay periods: from one main payday to the day before the next (D14). The
 * first runs from the last main payday on or before today, or from today when
 * there's none. The last ends the day before the first main payday after the
 * plan's last day, or on the plan's last day when there's none.
 */
function payPeriods(paydays: readonly Day[], today: Day, to: Day): Bounds[] {
  const starts = [paydays.filter((day) => day <= today).at(-1) ?? today];
  for (const day of paydays) {
    if (day > today && day <= to) starts.push(day);
  }
  const after = paydays.find((day) => day > to);
  return starts.map((start, i) => {
    const next = starts[i + 1] ?? after;
    return { start, end: next === undefined ? to : addDays(next, -1) };
  });
}

/** Calendar months, from today's month to the month of the plan's last day. */
function months(today: Day, to: Day): Bounds[] {
  const bounds: Bounds[] = [];
  for (let value = monthNumberOfDay(today); value <= monthNumberOfDay(to); value += 1) {
    const { year, month } = monthFromNumber(value);
    bounds.push({ start: dayFromParts(year, month, 1), end: lastDayOfMonth(year, month) });
  }
  return bounds;
}

function periodsOf(account: AccountPlan, bounds: readonly Bounds[], today: Day, to: Day) {
  const startDay = parseDate(account.start.checkedOn);
  const rowDays = account.rows.map((row) => parseDate(row.date));
  let next = rowDays.findIndex((day) => day >= today);
  if (next < 0) next = rowDays.length;

  return bounds.map((period): PlanPeriod => {
    const from = Math.max(period.start, today);
    const until = Math.min(period.end, to);
    const rows: PlanRow[] = [];
    let cameIn = 0;
    while (next < rowDays.length && (rowDays[next] as Day) <= until) {
      const row = account.rows[next] as PlanRow;
      rows.push(row);
      if (row.change > 0) cameIn += row.change;
      next += 1;
    }
    const leftAtEnd = account.days[until - startDay];
    if (leftAtEnd === undefined) {
      throw new EngineInputError('outside-plan', 'A period ends outside the plan.');
    }
    return {
      start: formatDate(period.start),
      end: formatDate(period.end),
      from: formatDate(from),
      to: formatDate(until),
      cameIn,
      rows,
      leftAtEnd: leftAtEnd.balance,
    };
  });
}

/**
 * Groups each account's plan into periods (brief 4.8): pay periods from the
 * main pay (D14), or calendar months. Each period has "Came in", its rows in
 * date order and "Left at the end". Only rows from today on are in periods;
 * unticked rows before today are in "Not ticked yet" (D11).
 */
export function groupIntoPeriods(plan: Plan, by: PeriodGrouping): PlanPeriods {
  if (by !== 'pay' && by !== 'months') {
    throw new EngineInputError('bad-grouping', 'Group by "pay" or "months".');
  }
  const today = parseDate(plan.today, 'today');
  const to = parseDate(plan.to, 'to');
  const used: PeriodGrouping = by === 'pay' && plan.mainPay === 'none' ? 'months' : by;
  const bounds =
    used === 'pay'
      ? payPeriods(
          plan.mainPaydays.map((day) => parseDate(day)),
          today,
          to,
        )
      : months(today, to);
  return {
    by: used,
    accounts: plan.accounts.map((account) => ({
      accountId: account.account.id,
      periods: periodsOf(account, bounds, today, to),
    })),
  };
}
