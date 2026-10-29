// ARCHITECTURE.md test 10: bank holidays from the built-in copy of GOV.UK's
// list, each nation with its own list (brief 5.7). Also D76 (which years the
// list covers) and working days.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bankHolidayCalendar,
  EngineInputError,
  formatDate,
  isWorkingDay,
  lastWorkingDayOfMonth,
  NATIONS,
  parseBankHolidayList,
  parseDate,
} from '../../src/index.ts';
import {
  englandAndWales,
  northernIreland,
  official,
  officialJson,
  officialSource,
  scotland,
} from '../fixtures/holidays.ts';

const d = (text: string) => parseDate(text);
const datesIn = (calendar: typeof scotland, year: number) =>
  calendar.holidaysIn(year).map((holiday) => formatDate(holiday.day));

describe('the built-in copy of the official list', () => {
  it('came unchanged from GOV.UK, with its source link and download date', () => {
    expect(officialSource.source).toBe('https://www.gov.uk/bank-holidays.json');
    expect(officialSource.downloaded_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const bytes = readFileSync(new URL('../../data/bank-holidays.json', import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(officialSource.sha256);
  });

  it('has all three nations and covers 2019 to 2028 in full (D76)', () => {
    for (const nation of NATIONS) {
      const covered = [...official.nations[nation].coveredYears].sort();
      expect(covered, nation).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028]);
    }
  });

  it('is refused when it is not in the GOV.UK shape', () => {
    expect(() => parseBankHolidayList(null)).toThrow(EngineInputError);
    expect(() => parseBankHolidayList([])).toThrow(EngineInputError);
    expect(() => parseBankHolidayList({ 'england-and-wales': { events: [] } })).toThrow(
      EngineInputError,
    );
    const badDate = structuredClone(officialJson) as {
      scotland: { events: { date: string }[] };
    };
    (badDate.scotland.events[0] as { date: string }).date = '2026-02-30';
    expect(() => parseBankHolidayList(badDate)).toThrow(EngineInputError);
  });
});

describe("each nation's own bank holidays", () => {
  it('gives England and Wales its 2026 list', () => {
    expect(datesIn(englandAndWales, 2026)).toEqual([
      '2026-01-01',
      '2026-04-03',
      '2026-04-06',
      '2026-05-04',
      '2026-05-25',
      '2026-08-31',
      '2026-12-25',
      '2026-12-28', // Boxing Day substitute (brief 8.5)
    ]);
  });

  it('gives Scotland its 2026 list, with 2 January, St Andrew’s Day and an early summer holiday', () => {
    expect(datesIn(scotland, 2026)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-04-03',
      '2026-05-04',
      '2026-05-25',
      '2026-06-15', // World Cup bank holiday, a one-off
      '2026-08-03',
      '2026-11-30',
      '2026-12-25',
      '2026-12-28',
    ]);
  });

  it('gives Northern Ireland its 2026 list, with St Patrick’s Day and the Boyne', () => {
    expect(datesIn(northernIreland, 2026)).toEqual([
      '2026-01-01',
      '2026-03-17',
      '2026-04-03',
      '2026-04-06',
      '2026-05-04',
      '2026-05-25',
      '2026-07-13', // Battle of the Boyne, substitute for Sun 12 Jul
      '2026-08-31',
      '2026-12-25',
      '2026-12-28',
    ]);
  });

  it('keeps the nations apart', () => {
    expect(scotland.isBankHoliday(d('2026-11-30'))).toBe(true);
    expect(englandAndWales.isBankHoliday(d('2026-11-30'))).toBe(false);
    expect(englandAndWales.isBankHoliday(d('2026-04-06'))).toBe(true); // Easter Monday
    expect(scotland.isBankHoliday(d('2026-04-06'))).toBe(false);
    expect(northernIreland.isBankHoliday(d('2026-03-17'))).toBe(true);
    expect(englandAndWales.isBankHoliday(d('2026-03-17'))).toBe(false);
  });

  it('uses the official list for the years it covers and the rules after that (D74)', () => {
    expect(englandAndWales.sourceFor(2026)).toBe('official');
    expect(englandAndWales.sourceFor(2028)).toBe('official');
    expect(englandAndWales.sourceFor(2029)).toBe('rules');
    expect(englandAndWales.sourceFor(2018)).toBe('rules');
    // 2029 from the rules: Easter Sunday is 1 Apr, Christmas Day is a Tuesday.
    expect(datesIn(englandAndWales, 2029)).toEqual([
      '2029-01-01',
      '2029-03-30',
      '2029-04-02',
      '2029-05-07',
      '2029-05-28',
      '2029-08-27',
      '2029-12-25',
      '2029-12-26',
    ]);
  });

  it('uses the rules for every year when there is no official list', () => {
    const rulesOnly = bankHolidayCalendar('scotland', null);
    expect(rulesOnly.sourceFor(2026)).toBe('rules');
    expect(rulesOnly.isBankHoliday(d('2026-06-15'))).toBe(false); // the one-off isn't in the rules
    expect(rulesOnly.isBankHoliday(d('2026-11-30'))).toBe(true);
  });

  it('counts a year as covered only when the list has its January and December (D76)', () => {
    const partial = {
      'england-and-wales': {
        events: [
          { title: 'Christmas Day', date: '2028-12-25' },
          { title: 'New Year’s Day', date: '2029-01-01' }, // 2029 has only January
        ],
      },
      scotland: { events: [{ title: 'New Year’s Day', date: '2029-01-01' }] },
      'northern-ireland': { events: [{ title: 'New Year’s Day', date: '2029-01-01' }] },
    };
    const list = parseBankHolidayList(partial);
    expect([...list.nations['england-and-wales'].coveredYears]).toEqual([]);
    // So 2029 uses the rules, which include Good Friday.
    const calendar = bankHolidayCalendar('england-and-wales', list);
    expect(calendar.sourceFor(2029)).toBe('rules');
    expect(calendar.isBankHoliday(d('2029-03-30'))).toBe(true);
  });

  it('refuses a nation it does not know', () => {
    expect(() => bankHolidayCalendar('wales' as never, official)).toThrow(EngineInputError);
  });
});

describe('working days', () => {
  it('are not weekends or bank holidays', () => {
    expect(isWorkingDay(d('2026-12-24'), englandAndWales)).toBe(true); // Thursday
    expect(isWorkingDay(d('2026-12-25'), englandAndWales)).toBe(false); // Christmas Day
    expect(isWorkingDay(d('2026-12-26'), englandAndWales)).toBe(false); // Saturday
    expect(isWorkingDay(d('2026-12-27'), englandAndWales)).toBe(false); // Sunday
    expect(isWorkingDay(d('2026-12-28'), englandAndWales)).toBe(false); // Boxing Day substitute
    expect(isWorkingDay(d('2026-12-29'), englandAndWales)).toBe(true);
  });

  it('give each nation its own last working day of the month', () => {
    // Mon 31 Aug 2026 is the summer bank holiday in England and Wales and in
    // Northern Ireland, but not in Scotland, whose summer holiday is 3 Aug.
    expect(formatDate(lastWorkingDayOfMonth(2026, 8, englandAndWales))).toBe('2026-08-28');
    expect(formatDate(lastWorkingDayOfMonth(2026, 8, northernIreland))).toBe('2026-08-28');
    expect(formatDate(lastWorkingDayOfMonth(2026, 8, scotland))).toBe('2026-08-31');
    expect(formatDate(lastWorkingDayOfMonth(2026, 12, englandAndWales))).toBe('2026-12-31');
    expect(formatDate(lastWorkingDayOfMonth(2027, 1, englandAndWales))).toBe('2027-01-29');
  });
});
