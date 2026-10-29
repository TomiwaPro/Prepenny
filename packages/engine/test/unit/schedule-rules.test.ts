// ARCHITECTURE.md tests 8 and 9: the weekend and bank holiday rule, then a
// changed date, then skips (brief 5.3, D4); every end rule; a bank holiday
// on payday. Plus the Christmas and New Year paydays from step 1a.

import { describe, expect, it } from 'vitest';
import { type HolidayRule, workOutPayments } from '../../src/index.ts';
import { englandAndWales } from '../fixtures/holidays.ts';
import { samChanges, samSeries } from '../fixtures/sam.ts';
import { datesOf, paymentsOf, series } from '../fixtures/series.ts';

const holidays = englandAndWales;

describe('test 8: the weekend and bank holiday rule, then a changed date', () => {
  const saturday = (holidayRule: HolidayRule) =>
    series({ start: '2026-11-07', schedule: { kind: 'once' }, holidayRule });

  it('moves a weekend date to the working day before or after, or keeps it', () => {
    const window = { from: '2026-11-01', to: '2026-11-30', holidays };
    expect(datesOf(saturday('keep'), window)).toEqual(['2026-11-07']);
    expect(datesOf(saturday('working-day-before'), window)).toEqual(['2026-11-06']);
    expect(datesOf(saturday('working-day-after'), window)).toEqual(['2026-11-09']);
  });

  it('then uses a changed date as it is, found by the original date', () => {
    const [payment] = paymentsOf(saturday('working-day-after'), {
      from: '2026-11-01',
      to: '2026-11-30',
      holidays,
      changes: [{ seriesId: 'test-series', originalDate: '2026-11-07', newDate: '2026-11-15' }],
    });
    // Sun 15 Nov is a weekend, but a moved date isn't moved again.
    expect(payment).toMatchObject({
      originalDate: '2026-11-07',
      date: '2026-11-15',
      movedByRule: true,
      moved: true,
    });
  });

  it('brings in a payment moved from far away, and drops one moved out', () => {
    const monthly = series({
      start: '2026-11-15',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 15 } },
    });
    const changes = [
      { seriesId: 'test-series', originalDate: '2027-06-15', newDate: '2026-12-20' },
      { seriesId: 'test-series', originalDate: '2026-12-15', newDate: '2027-03-01' },
    ];
    expect(datesOf(monthly, { from: '2026-12-01', to: '2026-12-31', changes })).toEqual([
      '2026-12-20',
    ]);
    const [moved] = paymentsOf(monthly, { from: '2026-12-01', to: '2026-12-31', changes });
    expect(moved?.number).toBe(7);
  });

  it('marks a skipped payment, which still counts towards "after N payments" (D4)', () => {
    const threeTimes = series({
      start: '2026-11-07',
      schedule: { kind: 'weekly', every: 2 },
      end: { kind: 'after', payments: 3 },
    });
    const found = paymentsOf(threeTimes, {
      from: '2026-11-01',
      to: '2027-03-31',
      changes: [{ seriesId: 'test-series', originalDate: '2026-11-21', skipped: true }],
    });
    // Nothing is added at the end.
    expect(found.map((p) => [p.date, p.skipped])).toEqual([
      ['2026-11-07', false],
      ['2026-11-21', true],
      ['2026-12-05', false],
    ]);
  });
});

describe('test 8: every end rule', () => {
  const weekly = (end: Parameters<typeof series>[0]['end']) =>
    series({
      start: '2026-11-06',
      schedule: { kind: 'weekly', every: 1 },
      ...(end ? { end } : {}),
    });
  const window = { from: '2026-11-01', to: '2027-02-28' };

  it('never ends, until the end of the view', () => {
    const dates = datesOf(weekly({ kind: 'never' }), window);
    expect(dates.length).toBe(17);
    expect(dates.at(-1)).toBe('2027-02-26');
  });

  it('ends after a number of payments', () => {
    const found = paymentsOf(weekly({ kind: 'after', payments: 4 }), window);
    expect(found.map((p) => p.date)).toEqual([
      '2026-11-06',
      '2026-11-13',
      '2026-11-20',
      '2026-11-27',
    ]);
    expect(found.map((p) => p.isLast)).toEqual([false, false, false, true]);
  });

  it('ends on a date, counting by the original date (D78)', () => {
    expect(datesOf(weekly({ kind: 'on', date: '2026-11-27' }), window)).toEqual([
      '2026-11-06',
      '2026-11-13',
      '2026-11-20',
      '2026-11-27',
    ]);
    // A Saturday payment on the end date, moved to the Monday after, is still in.
    const saturdays = series({
      start: '2026-11-07',
      schedule: { kind: 'weekly', every: 1 },
      holidayRule: 'working-day-after',
      end: { kind: 'on', date: '2026-11-21' },
    });
    expect(datesOf(saturdays, window)).toEqual(['2026-11-09', '2026-11-16', '2026-11-23']);
  });
});

describe('test 9: a bank holiday on payday', () => {
  const onAugust31 = (holidayRule: HolidayRule) =>
    series({ start: '2026-08-31', schedule: { kind: 'once' }, holidayRule });
  const window = { from: '2026-08-01', to: '2026-09-30', holidays };

  it('moves pay off the summer bank holiday', () => {
    expect(datesOf(onAugust31('working-day-before'), window)).toEqual(['2026-08-28']);
    expect(datesOf(onAugust31('working-day-after'), window)).toEqual(['2026-09-01']);
    expect(datesOf(onAugust31('keep'), window)).toEqual(['2026-08-31']);
  });

  it('moves a Friday pay off Christmas Day and New Year’s Day', () => {
    const pay = samSeries.find((s) => s.id === 'pay');
    if (pay === undefined) throw new Error('Sam has a pay series');
    const paydays = (holidayRule: HolidayRule) =>
      workOutPayments({
        series: [{ ...pay, holidayRule }],
        changes: samChanges,
        holidays,
        from: '2026-12-18',
        to: '2027-01-08',
      }).map((p) => p.date);

    // With "working day before", Fri 25 Dec 2026 becomes Thu 24 Dec, and
    // Fri 1 Jan 2027 becomes Thu 31 Dec 2026.
    expect(paydays('working-day-before')).toEqual([
      '2026-12-18',
      '2026-12-24',
      '2026-12-31',
      '2027-01-08',
    ]);
    // Sam's example keeps the date (D15), so it stays on the Fridays.
    expect(paydays('keep')).toEqual(['2026-12-18', '2026-12-25', '2027-01-01', '2027-01-08']);
  });
});
