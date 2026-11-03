import type { Day } from '../dates/day.ts';
import type { Moment } from '../dates/time.ts';
import type { Flow } from './types.ts';

/** What the same-day order needs to know about a row on its day. */
export interface SameDayRow {
  /** Only its group counts: money in, a transfer either way, or money out. */
  readonly flow: Flow;
  readonly familyCreatedAt: Moment;
  readonly familyId: string;
  readonly seriesId: string;
  readonly name: string;
  readonly number: number;
  /** Inside one budget on the same day: its spends first, then the budget row. 0 for anything else. */
  readonly within?: number;
}

/** What the order needs to know about a row: its day, and the same-day order's keys. */
export interface OrderedRow extends SameDayRow {
  readonly day: Day;
}

/** Money in first, then transfers either way, then money out (brief 5.5, D12). */
function group(flow: Flow): number {
  switch (flow) {
    case 'in':
      return 0;
    case 'transfer-in':
    case 'transfer-out':
      return 1;
    case 'out':
      return 2;
  }
}

function compareText(a: string, b: string): number {
  // Character by character, the same on every device: no language rules (D80).
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareMoments(a: Moment, b: Moment): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * The order rows are applied in: by date, then the same-day order. Money in,
 * then transfers, then money out (brief 5.5). Within each, the family made
 * first goes first, then by name (D12, D49). Then by family id, payment
 * number and series id, so the order is the same on every run and every
 * device (D80). Payment numbers carry on across a split, so comparing them
 * before the series id means a split never changes the order (D89).
 */
export function compareRows(a: OrderedRow, b: OrderedRow): number {
  return a.day - b.day || compareSameDay(a, b);
}

/** The same-day order on its own, for rows already known to be on the same day (D12, D80, D89). */
export function compareSameDay(a: SameDayRow, b: SameDayRow): number {
  return (
    group(a.flow) - group(b.flow) ||
    compareMoments(a.familyCreatedAt, b.familyCreatedAt) ||
    compareText(a.name, b.name) ||
    compareText(a.familyId, b.familyId) ||
    a.number - b.number ||
    compareText(a.seriesId, b.seriesId) ||
    (a.within ?? 0) - (b.within ?? 0)
  );
}
