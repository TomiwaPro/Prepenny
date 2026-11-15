// Why the weekend and bank holiday rule moved a payment (step 4c, D538), and
// which payments a new bank holiday moves when a newer list arrives (D539,
// the owner's answer to PLAN.md question 4).

import type { Tick } from '../balance/types.ts';
import { addDays, formatDate, parseDate } from '../dates/day.ts';
import {
  type BankHolidayLookup,
  LONGEST_RUN_WITHOUT_A_WORKING_DAY,
  workingDayOnOrBefore,
} from '../dates/working-days.ts';
import { applyHolidayRule, workOutPayments } from './payments.ts';
import { prepareSeries } from './series.ts';
import type { PaymentChange, Series } from './types.ts';

/** No bank holidays: what the rule does with weekends alone. */
const WEEKENDS_ONLY: BankHolidayLookup = { isBankHoliday: () => false };

/** What moved a payment off its date: "weekend", "bank holiday", or both. */
export type RuleMoveReason = 'weekend' | 'bank-holiday' | 'weekend-and-bank-holiday';

/** A payment the weekend and bank holiday rule moved: where it was due, and why (D538). */
export interface RuleMove {
  /** "YYYY-MM-DD": the day it would be on without the move. */
  readonly from: string;
  readonly because: RuleMoveReason;
}

export interface RuleMoveRequest {
  readonly series: Series;
  /** The payment's date from its schedule, "YYYY-MM-DD" (D78). */
  readonly originalDate: string;
  readonly holidays: BankHolidayLookup;
}

/**
 * Why the weekend and bank holiday rule moved a payment, or null when it
 * didn't (D538). A payment due on a weekend is moved by the weekend; one due
 * on a weekday that's a bank holiday, by the bank holiday; one due on a
 * weekend that lands past a bank holiday too, by both. Pay on the last
 * working day is due on the month's last weekday, so only a bank holiday
 * there moves it (D145). A date moved by a one-off change is the person's
 * own, so this is about the rule alone.
 */
export function ruleMoveOf(request: RuleMoveRequest): RuleMove | null {
  const { series, holidays } = request;
  const prepared = prepareSeries(series, holidays);
  const original = parseDate(request.originalDate, 'The original date');
  if (prepared.lastWorkingDay) {
    const due = workingDayOnOrBefore(original, WEEKENDS_ONLY);
    const lands = workingDayOnOrBefore(original, holidays);
    return lands === due ? null : { from: formatDate(due), because: 'bank-holiday' };
  }
  const lands = applyHolidayRule(original, series.holidayRule, holidays);
  if (lands === original) return null;
  const weekendsAlone = applyHolidayRule(original, series.holidayRule, WEEKENDS_ONLY);
  const because: RuleMoveReason =
    weekendsAlone === lands
      ? 'weekend'
      : weekendsAlone === original
        ? 'bank-holiday'
        : 'weekend-and-bank-holiday';
  return { from: formatDate(original), because };
}

/** A payment a new bank holiday moved (D539). */
export interface HolidayMove {
  readonly seriesId: string;
  /** The payment's date from its schedule, "YYYY-MM-DD", which names it with its series (brief 5.2). */
  readonly originalDate: string;
  readonly name: string;
  readonly accountId: string;
  /** "YYYY-MM-DD": the new bank holiday, the day it was on before. */
  readonly holiday: string;
  /** "YYYY-MM-DD": the day it's on now. */
  readonly to: string;
}

export interface HolidayMovesRequest {
  readonly series: readonly Series[];
  readonly changes?: readonly PaymentChange[];
  readonly ticks?: readonly Tick[];
  /** The bank holidays the plan used until now. */
  readonly before: BankHolidayLookup;
  /** The newer list's bank holidays. */
  readonly after: BankHolidayLookup;
  /** "YYYY-MM-DD", included: usually today. */
  readonly from: string;
  /** "YYYY-MM-DD", included: as far as Home looks (D178). */
  readonly to: string;
}

/**
 * The payments a newer bank holiday list moves because it has a bank holiday
 * the old one hadn't, from `from` to `to` (D539): each payment that was on a
 * day the new list makes a bank holiday, and is now on another. A payment
 * already ticked, skipped or moved by the person is left out: its day
 * doesn't change. So is the shared half of a private transfer when its
 * private half is there, as it's the same money (D94). A payment that moves
 * only because a day is no longer a bank holiday isn't listed. In date
 * order, then by name.
 */
export function movedByNewBankHolidays(request: HolidayMovesRequest): HolidayMove[] {
  const from = parseDate(request.from, 'from');
  const to = parseDate(request.to, 'to');
  const ids = new Set(request.series.map((one) => one.id));
  const series = request.series.filter(
    (one) => one.mirrorOf === undefined || !ids.has(one.mirrorOf),
  );
  // A wider window, so a payment moved across either end is found in both.
  const margin = LONGEST_RUN_WITHOUT_A_WORKING_DAY;
  const window = {
    series,
    changes: request.changes ?? [],
    from: formatDate(addDays(from, -margin)),
    to: formatDate(addDays(to, margin)),
  };
  const key = (seriesId: string, number: number) => `${seriesId}|${number}`;
  const before = new Map(
    workOutPayments({ ...window, holidays: request.before }).map((payment) => [
      key(payment.seriesId, payment.number),
      payment,
    ]),
  );
  const ticked = new Set(
    (request.ticks ?? [])
      .filter((tick) => tick.setAside !== true)
      .map((tick) => `${tick.seriesId}|${tick.originalDate}`),
  );
  const moves: HolidayMove[] = [];
  for (const payment of workOutPayments({ ...window, holidays: request.after })) {
    const was = before.get(key(payment.seriesId, payment.number));
    if (was === undefined || was.date === payment.date) continue;
    if (payment.skipped || payment.moved) continue;
    if (ticked.has(`${payment.seriesId}|${payment.originalDate}`)) continue;
    const wasOn = parseDate(was.date, 'The old date');
    const nowOn = parseDate(payment.date, 'The new date');
    if ((wasOn < from || wasOn > to) && (nowOn < from || nowOn > to)) continue;
    // Moved by a new bank holiday: the day it was on is one now, and wasn't before.
    if (!request.after.isBankHoliday(wasOn) || request.before.isBankHoliday(wasOn)) continue;
    moves.push({
      seriesId: payment.seriesId,
      originalDate: payment.originalDate,
      name: payment.name,
      accountId: payment.accountId,
      holiday: was.date,
      to: payment.date,
    });
  }
  return moves.sort((a, b) =>
    a.to !== b.to ? (a.to < b.to ? -1 : 1) : a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
}
