import { type Day, formatDate, parseDate } from '../dates/day.ts';
import { type Moment, parseTime } from '../dates/time.ts';
import { EngineInputError } from '../errors.ts';
import type { Tick } from './types.ts';

/** A tick, checked, with its dates and time ready to compare. */
export interface CheckedTick {
  readonly tick: Tick;
  readonly tickedAt: Moment;
  readonly paidOn: Day;
  readonly inBalanceUpdate: string | null;
  readonly inDebtUpdate: string | null;
}

/** Ticks, found by series and original date, like changes (brief 5.2, D48). */
export type TickIndex = ReadonlyMap<string, ReadonlyMap<Day, CheckedTick>>;

/** Checks the ticks and indexes them by series and original date. One tick per payment (D83). */
export function indexTicks(ticks: readonly Tick[]): TickIndex {
  if (!Array.isArray(ticks)) {
    throw new EngineInputError('bad-tick', 'The ticks must be a list.');
  }
  const index = new Map<string, Map<Day, CheckedTick>>();
  ticks.forEach((tick, i) => {
    const what = `Tick ${i + 1}`;
    if (typeof tick?.seriesId !== 'string' || tick.seriesId === '') {
      throw new EngineInputError('bad-tick', `${what} needs a series.`);
    }
    const originalDay = parseDate(tick.originalDate, `${what}: the original date`);
    const tickedAt = parseTime(tick.tickedAt, `${what}: when it was ticked`);
    const paidOn = parseDate(tick.paidOn, `${what}: the paid date`);
    if (
      tick.inBalanceUpdate !== undefined &&
      (typeof tick.inBalanceUpdate !== 'string' || tick.inBalanceUpdate === '')
    ) {
      throw new EngineInputError('bad-tick', `${what}: the balance update must be an id.`);
    }
    if (
      tick.inDebtUpdate !== undefined &&
      (typeof tick.inDebtUpdate !== 'string' || tick.inDebtUpdate === '')
    ) {
      throw new EngineInputError('bad-tick', `${what}: the debt must be an id.`);
    }
    const forSeries = index.get(tick.seriesId) ?? new Map<Day, CheckedTick>();
    if (forSeries.has(originalDay)) {
      throw new EngineInputError(
        'repeated-tick',
        `${what}: series ${tick.seriesId} already has a tick for ${tick.originalDate}.`,
      );
    }
    forSeries.set(originalDay, {
      tick,
      tickedAt,
      paidOn,
      inBalanceUpdate: tick.inBalanceUpdate ?? null,
      inDebtUpdate: tick.inDebtUpdate ?? null,
    });
    index.set(tick.seriesId, forSeries);
  });
  return index;
}

/**
 * A tick's paid date (D71): the day it was ticked, if that's earlier than the
 * payment's date (paying early, D1). Otherwise the payment's date, after any
 * weekend, bank holiday or moved-date change.
 *
 * `paymentDate` is the payment's `date`. `tickedOn` is the person's own date
 * when they ticked it. Both "YYYY-MM-DD". The app works this out once, when
 * the tick is made, and stores it on the tick as `paidOn` (D83).
 */
export function paidDate(paymentDate: string, tickedOn: string): string {
  const due = parseDate(paymentDate, 'the payment date');
  const ticked = parseDate(tickedOn, 'the day it was ticked');
  return formatDate(Math.min(due, ticked));
}
