// ARCHITECTURE.md test 2: dates as YYYY-MM-DD, "today" passed in, no clock
// (brief 5.1). Plus the date helpers the schedule is built on.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  addMonths,
  dayFromParts,
  daysInMonth,
  EngineInputError,
  FRIDAY,
  formatDate,
  isLeapYear,
  lastDayOfMonth,
  MONDAY,
  parseDate,
  partsOfDay,
  SUNDAY,
  THURSDAY,
  weekday,
  weekdayOfMonth,
  workOutPayments,
} from '../../src/index.ts';
import { englandAndWales } from '../fixtures/holidays.ts';
import { series } from '../fixtures/series.ts';

const d = (text: string) => parseDate(text);

describe('dates are YYYY-MM-DD at the edges and day numbers inside', () => {
  it('reads and writes YYYY-MM-DD', () => {
    expect(parseDate('1970-01-01')).toBe(0);
    expect(parseDate('1970-01-02')).toBe(1);
    expect(formatDate(parseDate('2026-10-25'))).toBe('2026-10-25');
    expect(formatDate(parseDate('2028-02-29'))).toBe('2028-02-29');
    expect(partsOfDay(parseDate('2027-01-31'))).toEqual({ year: 2027, month: 1, day: 31 });
  });

  it('gives the same answer for every date from 1900 to 2999, both ways', () => {
    const first = dayFromParts(1900, 1, 1);
    const last = dayFromParts(2999, 12, 31);
    let expected = { year: 1900, month: 1, day: 1 };
    const wrong: number[] = [];
    for (let day = first; day <= last; day += 1) {
      const parts = partsOfDay(day);
      const same =
        parts.year === expected.year &&
        parts.month === expected.month &&
        parts.day === expected.day;
      if (!same || dayFromParts(parts.year, parts.month, parts.day) !== day) {
        wrong.push(day);
      }
      expected =
        parts.day < daysInMonth(parts.year, parts.month)
          ? { ...parts, day: parts.day + 1 }
          : parts.month < 12
            ? { year: parts.year, month: parts.month + 1, day: 1 }
            : { year: parts.year + 1, month: 1, day: 1 };
    }
    expect(wrong).toEqual([]);
    expect(last - first + 1).toBe(401_767); // 1,100 years of days
  });

  it('refuses anything that is not a real YYYY-MM-DD date', () => {
    for (const bad of [
      '2026-2-1',
      '26-10-2026',
      '2026/10/25',
      '2027-02-29',
      '2026-13-01',
      '2026-04-31',
      '2026-10-25T00:00:00Z',
      '',
      'today',
    ]) {
      expect(() => parseDate(bad), bad).toThrow(EngineInputError);
    }
    expect(() => dayFromParts(1899, 12, 31)).toThrow(EngineInputError);
    expect(() => dayFromParts(3000, 1, 1)).toThrow(EngineInputError);
  });

  it('knows the day of the week', () => {
    expect(weekday(d('1970-01-01'))).toBe(THURSDAY);
    expect(weekday(d('2026-10-25'))).toBe(SUNDAY); // Sam's "today", brief Part 8
    expect(weekday(d('2026-10-30'))).toBe(FRIDAY); // Sam's first payday
    expect(weekday(d('2028-03-15'))).toBe(3); // Wed 15 Mar 2028 (D70)
    expect(weekday(d('1969-12-31'))).toBe(3); // before day 0 too
  });

  it('knows leap years and month lengths', () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2027)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 11)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('adds days and months, keeping the day of the month where it can', () => {
    expect(formatDate(addDays(d('2026-10-30'), 7))).toBe('2026-11-06');
    expect(formatDate(addDays(d('2026-12-31'), 1))).toBe('2027-01-01');
    expect(formatDate(addMonths(d('2027-01-31'), 1))).toBe('2027-02-28');
    expect(formatDate(addMonths(d('2028-01-31'), 1))).toBe('2028-02-29');
    expect(formatDate(addMonths(d('2027-01-31'), 2))).toBe('2027-03-31');
    expect(formatDate(addMonths(d('2026-11-15'), 12))).toBe('2027-11-15');
    expect(formatDate(addMonths(d('2026-03-31'), -1))).toBe('2026-02-28');
  });

  it('finds the last day and "first Monday" style dates of a month', () => {
    expect(formatDate(lastDayOfMonth(2026, 11))).toBe('2026-11-30');
    expect(formatDate(lastDayOfMonth(2028, 2))).toBe('2028-02-29');
    expect(formatDate(weekdayOfMonth(2026, 11, MONDAY, 1))).toBe('2026-11-02');
    expect(formatDate(weekdayOfMonth(2026, 12, MONDAY, 1))).toBe('2026-12-07');
    expect(formatDate(weekdayOfMonth(2026, 11, FRIDAY, 'last'))).toBe('2026-11-27');
    expect(formatDate(weekdayOfMonth(2026, 11, MONDAY, 4))).toBe('2026-11-23');
    expect(formatDate(weekdayOfMonth(2026, 10, SUNDAY, 'last'))).toBe('2026-10-25');
  });
});

describe('the engine has no clock: today is passed in', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives the same payments whatever the computer's clock and time zone say", () => {
    const rent = series({
      start: '2026-11-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
      holidayRule: 'working-day-before',
    });
    const work = () =>
      workOutPayments({
        series: [rent],
        holidays: englandAndWales,
        from: '2026-10-25',
        to: '2027-02-28',
      });
    const normal = work();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('1999-12-31T23:59:59Z'));
    expect(work()).toEqual(normal);
    vi.setSystemTime(new Date('2040-06-15T12:00:00Z'));
    expect(work()).toEqual(normal);
    expect(normal.map((p) => p.date)).toEqual([
      '2026-10-30', // Sun 1 Nov moves to Fri 30 Oct
      '2026-12-01',
      '2026-12-31', // Fri 1 Jan 2027 is New Year's Day
      '2027-02-01',
    ]);
  });
});
