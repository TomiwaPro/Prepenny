import { describe, expect, it } from 'vitest';
import { dateTile, formatDay } from '../../lib/dates.ts';
import { EXAMPLE_TODAY, localToday, todayFor } from '../../lib/today.ts';

const today = '2026-10-25';

describe('formatDay (brief Part 6, VOICE.md)', () => {
  it('writes a date as "Fri 30 Oct"', () => {
    expect(formatDay('2026-10-30', today)).toBe('Fri 30 Oct');
    expect(formatDay('2026-10-25', today)).toBe('Sun 25 Oct');
    expect(formatDay('2026-11-01', today)).toBe('Sun 1 Nov');
    expect(formatDay('2026-10-26', today)).toBe('Mon 26 Oct');
    expect(formatDay('2026-10-29', today)).toBe('Thu 29 Oct');
  });

  it('adds the year only when it isn’t this year', () => {
    expect(formatDay('2027-01-01', today)).toBe('Fri 1 Jan 2027');
    expect(formatDay('2027-08-23', today)).toBe('Mon 23 Aug 2027');
    expect(formatDay('2025-12-31', today)).toBe('Wed 31 Dec 2025');
    expect(formatDay('2027-01-01', '2027-03-04')).toBe('Fri 1 Jan');
  });

  it('gets every weekday right, leap days included', () => {
    expect(formatDay('2028-02-29', today)).toBe('Tue 29 Feb 2028');
    expect(formatDay('2026-12-28', today)).toBe('Mon 28 Dec');
    expect(formatDay('2026-12-24', today)).toBe('Thu 24 Dec');
    expect(formatDay('2026-11-07', today)).toBe('Sat 7 Nov');
    expect(formatDay('2026-11-17', today)).toBe('Tue 17 Nov');
    expect(formatDay('2026-11-18', today)).toBe('Wed 18 Nov');
  });

  it('refuses a date that isn’t a real calendar date', () => {
    expect(() => formatDay('2026-02-30', today)).toThrow();
    expect(() => formatDay('30/10/2026', today)).toThrow();
  });
});

describe('dateTile (DESIGN.md: day number over month)', () => {
  it('gives the day and the month', () => {
    expect(dateTile('2026-10-25')).toEqual({ day: '25', month: 'Oct' });
    expect(dateTile('2027-01-01')).toEqual({ day: '1', month: 'Jan' });
  });
});

describe('today', () => {
  it('is always Sun 25 Oct 2026 for the example plan (D133)', () => {
    expect(EXAMPLE_TODAY).toBe('2026-10-25');
    expect(todayFor({ isExample: true }, new Date(2030, 5, 1))).toBe('2026-10-25');
  });

  it('is this phone’s own date otherwise', () => {
    expect(localToday(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03');
    expect(localToday(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01');
    expect(todayFor({ isExample: false }, new Date(2026, 10, 3, 9))).toBe('2026-11-03');
  });
});
