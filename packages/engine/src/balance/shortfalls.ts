import { addDays, type Day, formatDate } from '../dates/day.ts';
import type { Pence } from '../money/pence.ts';
import type { MainPaydays } from '../periods/main-pay.ts';
import type { AccountWork } from './plan.ts';
import type { BalanceStatus, DayBalance, PlanRow, Shortfall, ShortOnDay } from './types.ts';

/**
 * Short when strictly below the floor, otherwise Tight when strictly below
 * the warning level (brief 5.5, D10). Exactly £20.00 isn't under £20.
 */
export function statusOf(balance: Pence, warningLevel: Pence, floor: Pence): BalanceStatus {
  if (balance < floor) return 'short';
  if (balance < warningLevel) return 'tight';
  return 'ok';
}

/**
 * The lowest end-of-day balance from today on, the first such day on a tie
 * (brief 5.5, D85), and the first day from today on that ends strictly under
 * the warning level (D8, D10).
 */
export function lowestAndFirstUnder(
  work: AccountWork,
  today: Day,
): { lowestPoint: DayBalance; firstUnderWarning: DayBalance | null } {
  const first = today - work.start.day;
  let lowestPoint = work.days[first] as DayBalance;
  let firstUnderWarning: DayBalance | null = null;
  for (let i = first; i < work.days.length; i += 1) {
    const day = work.days[i] as DayBalance;
    if (day.balance < lowestPoint.balance) lowestPoint = day;
    if (firstUnderWarning === null && day.balance < work.account.warningLevel) {
      firstUnderWarning = day;
    }
  }
  return { lowestPoint, firstUnderWarning };
}

function shortOn(work: AccountWork, index: number): ShortOnDay {
  const day = work.days[index] as DayBalance;
  return { date: day.date, amount: work.floor - day.balance, after: day.after };
}

/**
 * True when taking `amount` off this account's days from `from` to `until`
 * leaves every day that wasn't short still not short (D69).
 */
function noNewShortDays(work: AccountWork, from: Day, until: Day, amount: Pence): boolean {
  const last = Math.min(until - work.start.day, work.days.length - 1);
  for (let i = Math.max(0, from - work.start.day); i <= last; i += 1) {
    const { balance } = work.days[i] as DayBalance;
    if (balance >= work.floor && balance - amount < work.floor) return false;
  }
  return true;
}

/**
 * "Payments that could move" for one shortfall (D69). Moving a payment going
 * out from day d to the later day t raises this account's balance by its
 * amount at the end of every day from d to the day before t, and changes no
 * other day here. So it fixes the shortfall on its own when every short day is
 * in that stretch and the amount covers the deepest one. A transfer also
 * arrives later in the other account, so that account mustn't go short on a
 * day that wasn't short before.
 */
function couldMove(
  work: AccountWork,
  works: ReadonlyMap<string, AccountWork>,
  firstShort: Day,
  lastShort: Day,
  deepest: Pence,
  moveTo: Day | null,
  today: Day,
): PlanRow[] {
  if (moveTo === null || moveTo <= lastShort) return [];
  const found: { row: PlanRow; amount: Pence; index: number }[] = [];
  work.rows.forEach((row, index) => {
    const day = work.rowDays[index] as Day;
    if (day < today || day >= firstShort || row.ticked || row.change >= 0) return;
    // Only a payment or a pay-later bill can be moved. A budget row, a spend
    // and a set-aside can't be moved on their own (D109, D113).
    if (row.kind !== 'payment' && row.kind !== 'bill') return;
    const amount = -row.change;
    if (amount < deepest) return;
    if (row.flow === 'transfer-out') {
      const other = works.get(row.payment.toAccountId as string) as AccountWork;
      if (!noNewShortDays(other, day, addDays(moveTo, -1), amount)) return;
    }
    found.push({ row, amount, index });
  });
  // Biggest first; on a tie, in plan order.
  found.sort((a, b) => b.amount - a.amount || a.index - b.index);
  return found.map(({ row }) => row);
}

/**
 * Each shortfall from today on: days in a row that end strictly below the
 * floor (brief 5.5, D10, D82), with the payments that could move (D69).
 */
export function findShortfalls(
  work: AccountWork,
  works: ReadonlyMap<string, AccountWork>,
  main: MainPaydays | null,
  today: Day,
  to: Day,
): Shortfall[] {
  const shortfalls: Shortfall[] = [];
  const firstIndex = today - work.start.day;
  const lastIndex = to - work.start.day;
  let i = firstIndex;
  while (i <= lastIndex) {
    if ((work.days[i] as DayBalance).balance >= work.floor) {
      i += 1;
      continue;
    }
    const startIndex = i;
    let deepestIndex = i;
    while (i <= lastIndex && (work.days[i] as DayBalance).balance < work.floor) {
      if ((work.days[i] as DayBalance).balance < (work.days[deepestIndex] as DayBalance).balance) {
        deepestIndex = i;
      }
      i += 1;
    }
    const endIndex = i - 1;
    const firstShort = work.start.day + startIndex;
    const lastShort = work.start.day + endIndex;
    const deepest = shortOn(work, deepestIndex);
    // The first main payday after the short day (D69).
    const moveTo = main?.firstAfter(firstShort) ?? null;
    shortfalls.push({
      ...shortOn(work, startIndex),
      lastDate: formatDate(lastShort),
      deepest,
      moveTo: moveTo === null ? null : formatDate(moveTo),
      couldMove: couldMove(work, works, firstShort, lastShort, deepest.amount, moveTo, today),
    });
  }
  return shortfalls;
}
