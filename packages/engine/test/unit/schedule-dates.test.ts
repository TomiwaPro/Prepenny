// ARCHITECTURE.md tests 3, 4, 5, 6 and 13: payment dates worked out from the
// series start, never from the previous payment (brief 5.3, 5.8, 8.5). Also
// every schedule from brief 4.4: once, every 1 to 52 weeks, every 1 to 12
// months, chosen dates, months left out, and irregular weekly estimates.

import { describe, expect, it } from 'vitest';
import {
  addDays,
  EngineInputError,
  FRIDAY,
  formatDate,
  MONDAY,
  parseDate,
  paymentByNumber,
} from '../../src/index.ts';
import { englandAndWales } from '../fixtures/holidays.ts';
import { datesOf, series } from '../fixtures/series.ts';

describe('test 3: weekly payment k is start + 7 × every × k days', () => {
  const fortnightly = series({
    start: '2026-11-20',
    schedule: { kind: 'weekly', every: 2 },
  });

  it('counts each date from the start', () => {
    expect(datesOf(fortnightly, { from: '2026-11-01', to: '2027-01-31' })).toEqual([
      '2026-11-20',
      '2026-12-04',
      '2026-12-18',
      '2027-01-01',
      '2027-01-15',
      '2027-01-29',
    ]);
    for (const k of [0, 1, 7, 100, 1000]) {
      const payment = paymentByNumber({
        series: fortnightly,
        holidays: englandAndWales,
        number: k,
      });
      expect(payment?.date).toBe(formatDate(addDays(parseDate('2026-11-20'), 14 * k)));
    }
  });

  it('never works a date out from the previous payment', () => {
    // Moving payment 1, or the weekend rule moving a payment, doesn't move the next.
    const moved = datesOf(fortnightly, {
      from: '2026-11-01',
      to: '2026-12-31',
      changes: [{ seriesId: 'test-series', originalDate: '2026-12-04', newDate: '2026-12-08' }],
    });
    expect(moved).toEqual(['2026-11-20', '2026-12-08', '2026-12-18']);

    const saturdays = series({
      start: '2026-11-07',
      schedule: { kind: 'weekly', every: 1 },
      holidayRule: 'working-day-after',
    });
    expect(datesOf(saturdays, { from: '2026-11-01', to: '2026-11-30' })).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
  });

  it('works for every 1 to 52 weeks, on the start date’s weekday', () => {
    for (let every = 1; every <= 52; every += 1) {
      const dates = datesOf(series({ start: '2026-10-30', schedule: { kind: 'weekly', every } }), {
        from: '2026-10-30',
        to: '2028-12-31',
      });
      for (let k = 0; k < dates.length; k += 1) {
        expect(dates[k]).toBe(formatDate(addDays(parseDate('2026-10-30'), 7 * every * k)));
      }
      expect(dates.length).toBe(
        Math.floor((parseDate('2028-12-31') - parseDate('2026-10-30')) / (7 * every)) + 1,
      );
    }
    expect(() =>
      datesOf(series({ start: '2026-10-30', schedule: { kind: 'weekly', every: 53 } }), {
        from: '2026-10-30',
        to: '2026-12-31',
      }),
    ).toThrow(EngineInputError);
    expect(() =>
      datesOf(series({ start: '2026-10-30', schedule: { kind: 'weekly', every: 0 } }), {
        from: '2026-10-30',
        to: '2026-12-31',
      }),
    ).toThrow(EngineInputError);
  });
});

describe('test 4: monthly dates never drift', () => {
  it('turns 31 January into 28 February, then 31 March', () => {
    const monthly31 = series({
      start: '2027-01-31',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 31 } },
    });
    expect(datesOf(monthly31, { from: '2027-01-01', to: '2027-06-30' })).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
      '2027-05-31',
      '2027-06-30',
    ]);
  });
});

describe('test 5: 31st-of-the-month dates, including leap years', () => {
  it('gives 29 Feb in a leap year', () => {
    const monthly31 = series({
      start: '2027-12-31',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 31 } },
    });
    expect(datesOf(monthly31, { from: '2027-12-01', to: '2028-04-30' })).toEqual([
      '2027-12-31',
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
      '2028-04-30',
    ]);
  });

  it('gives the 29th and 30th the same treatment', () => {
    const monthly29 = series({
      start: '2028-01-29',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 29 } },
    });
    const dates = datesOf(monthly29, { from: '2028-01-01', to: '2029-03-31' });
    expect(dates).toContain('2028-02-29');
    expect(dates).toContain('2029-02-28');
    expect(dates).toContain('2029-03-29');
  });
});

describe('test 13: a payment set for the 31st', () => {
  it('lands on 30 Nov, 31 Dec, 28 Feb 2027 and 31 Mar 2027 (brief 8.5)', () => {
    const monthly31 = series({
      start: '2026-10-31',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 31 } },
    });
    expect(datesOf(monthly31, { from: '2026-11-01', to: '2027-03-31' })).toEqual([
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });

  it('keeps to the 31st even when the first payment is in a shorter month', () => {
    const fromNovember = series({
      start: '2026-11-30',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 31 } },
    });
    expect(datesOf(fromNovember, { from: '2026-11-01', to: '2027-03-31' })).toEqual([
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });
});

describe('test 6: last day, last working day and "first Monday", worked out per month', () => {
  const window = { from: '2026-08-01', to: '2027-03-31', holidays: englandAndWales };

  it('finds the last day of each month', () => {
    const lastDay = series({
      start: '2026-11-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'last-day' } },
    });
    expect(datesOf(lastDay, window)).toEqual([
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });

  it('finds the last working day of each month, skipping weekends and bank holidays', () => {
    const lastWorkingDay = series({
      start: '2026-08-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
    });
    expect(datesOf(lastWorkingDay, window)).toEqual([
      '2026-08-28', // Mon 31 Aug is the summer bank holiday
      '2026-09-30',
      '2026-10-30', // Sat 31 Oct
      '2026-11-30',
      '2026-12-31',
      '2027-01-29', // Sun 31 Jan
      '2027-02-26', // Sun 28 Feb
      '2027-03-31',
    ]);
  });

  it('finds "first Monday" and "last Friday" style dates', () => {
    const firstMonday = series({
      start: '2026-11-01',
      schedule: {
        kind: 'monthly',
        every: 1,
        on: { kind: 'weekday', weekday: MONDAY, position: 1 },
      },
    });
    expect(datesOf(firstMonday, window)).toEqual([
      '2026-11-02',
      '2026-12-07',
      '2027-01-04',
      '2027-02-01',
      '2027-03-01',
    ]);
    const lastFriday = series({
      start: '2026-11-01',
      schedule: {
        kind: 'monthly',
        every: 1,
        on: { kind: 'weekday', weekday: FRIDAY, position: 'last' },
      },
    });
    expect(datesOf(lastFriday, window)).toEqual([
      '2026-11-27',
      '2026-12-25',
      '2027-01-29',
      '2027-02-26',
      '2027-03-26',
    ]);
  });
});

describe('every 1 to 12 months', () => {
  it('repeats every few months on the same day', () => {
    const everyN = (every: number) =>
      datesOf(
        series({
          start: '2026-11-15',
          schedule: { kind: 'monthly', every, on: { kind: 'day', day: 15 } },
        }),
        { from: '2026-11-01', to: '2027-11-30' },
      );
    expect(everyN(2)).toEqual([
      '2026-11-15',
      '2027-01-15',
      '2027-03-15',
      '2027-05-15',
      '2027-07-15',
      '2027-09-15',
      '2027-11-15',
    ]);
    expect(everyN(3)).toEqual([
      '2026-11-15',
      '2027-02-15',
      '2027-05-15',
      '2027-08-15',
      '2027-11-15',
    ]);
    expect(everyN(12)).toEqual(['2026-11-15', '2027-11-15']);
    expect(() => everyN(13)).toThrow(EngineInputError);
    expect(() => everyN(0)).toThrow(EngineInputError);
  });

  it('starts with the first date on or after the start', () => {
    // Monthly on the 1st, from Sun 25 Oct: the first payment is Sun 1 Nov.
    const rent = series({
      start: '2026-10-25',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
    });
    expect(datesOf(rent, { from: '2026-10-01', to: '2026-12-31' })).toEqual([
      '2026-11-01',
      '2026-12-01',
    ]);
  });

  it('passes over months left out, which do not count as payments', () => {
    const notInSummer = series({
      start: '2026-05-10',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 10 }, leaveOut: [7, 8] },
      end: { kind: 'after', payments: 4 },
    });
    expect(datesOf(notInSummer, { from: '2026-05-01', to: '2026-12-31' })).toEqual([
      '2026-05-10',
      '2026-06-10',
      '2026-09-10',
      '2026-10-10',
    ]);
  });

  it('refuses a schedule that leaves out every month it falls in', () => {
    const never = series({
      start: '2026-03-01',
      schedule: { kind: 'monthly', every: 12, on: { kind: 'day', day: 1 }, leaveOut: [3] },
    });
    expect(() => datesOf(never, { from: '2026-01-01', to: '2027-12-31' })).toThrow(
      EngineInputError,
    );
  });
});

describe('once, chosen dates and irregular', () => {
  it('happens once on the start date', () => {
    const once = series({ start: '2026-12-18', schedule: { kind: 'once' } });
    expect(datesOf(once, { from: '2026-10-01', to: '2027-12-31' })).toEqual(['2026-12-18']);
  });

  it('uses chosen dates in date order, from the start', () => {
    // Ali's student loan: three termly payments (brief Part 2).
    const studentLoan = series({
      direction: 'in',
      start: '2026-09-01',
      schedule: { kind: 'dates', dates: ['2027-01-25', '2026-09-21', '2027-04-26'] },
    });
    expect(datesOf(studentLoan, { from: '2026-09-01', to: '2027-08-31' })).toEqual([
      '2026-09-21',
      '2027-01-25',
      '2027-04-26',
    ]);
    // Dates before the start are not part of the series.
    const fromJanuary = { ...studentLoan, start: '2027-01-01' };
    expect(datesOf(fromJanuary, { from: '2026-09-01', to: '2027-08-31' })).toEqual([
      '2027-01-25',
      '2027-04-26',
    ]);
  });

  it('refuses the same chosen date twice', () => {
    const twice = series({
      start: '2026-09-01',
      schedule: { kind: 'dates', dates: ['2026-09-21', '2026-09-21'] },
    });
    expect(() => datesOf(twice, { from: '2026-09-01', to: '2026-12-31' })).toThrow(
      EngineInputError,
    );
  });

  it('repeats an irregular weekly estimate on the start date’s weekday', () => {
    // Kofi: irregular pay with a weekly estimate (brief Part 2).
    const kofi = series({
      direction: 'in',
      start: '2026-11-02',
      schedule: { kind: 'irregular' },
      isEstimate: true,
    });
    expect(datesOf(kofi, { from: '2026-11-01', to: '2026-11-30' })).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
  });
});
