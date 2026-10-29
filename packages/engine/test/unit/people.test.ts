// ARCHITECTURE.md tests 11 and 12: Priya and Dee from brief 8.5.

import { describe, expect, it } from 'vitest';
import { parsePounds } from '../../src/index.ts';
import { englandAndWales } from '../fixtures/holidays.ts';
import { datesOf, paymentsOf, series } from '../fixtures/series.ts';

const holidays = englandAndWales;

describe('test 11: Priya', () => {
  it('gets her £2,100 salary on the last working day: Thu 31 Dec 2026, then Fri 29 Jan 2027', () => {
    const salary = series({
      id: 'priya-salary',
      name: 'Salary',
      direction: 'in',
      amount: parsePounds('2100.00'),
      start: '2026-12-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
      holidayRule: 'working-day-before',
    });
    const found = paymentsOf(salary, { from: '2026-12-01', to: '2027-01-31', holidays });
    expect(found.map((p) => [p.date, p.amount])).toEqual([
      ['2026-12-31', 210000],
      ['2027-01-29', 210000], // Sun 31 Jan
    ]);
  });

  it('gets the same dates from "last day of the month, moved to the working day before"', () => {
    const salary = series({
      start: '2026-12-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'last-day' } },
      holidayRule: 'working-day-before',
    });
    expect(datesOf(salary, { from: '2026-12-01', to: '2027-01-31', holidays })).toEqual([
      '2026-12-31',
      '2027-01-29',
    ]);
  });

  it('pays her yearly car insurance once a year', () => {
    const insurance = series({
      start: '2027-03-15',
      schedule: { kind: 'monthly', every: 12, on: { kind: 'day', day: 15 } },
    });
    const dates = datesOf(insurance, { from: '2026-10-01', to: '2029-09-30', holidays });
    expect(dates).toEqual(['2027-03-15', '2028-03-15', '2029-03-15']);
  });

  it('pays her quarterly water bill every 3 months', () => {
    const water = series({
      start: '2026-11-01',
      schedule: { kind: 'monthly', every: 3, on: { kind: 'day', day: 1 } },
    });
    expect(datesOf(water, { from: '2026-10-01', to: '2027-12-31', holidays })).toEqual([
      '2026-11-01',
      '2027-02-01',
      '2027-05-01',
      '2027-08-01',
      '2027-11-01',
    ]);
  });
});

describe('test 12: Dee', () => {
  it('gets Universal Credit due on the 28th on Thu 24 Dec 2026, moved to the working day before', () => {
    const universalCredit = series({
      id: 'dee-uc',
      name: 'Universal Credit',
      direction: 'in',
      start: '2026-10-28',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } },
      holidayRule: 'working-day-before',
      isEstimate: true,
    });
    // Mon 28 Dec is the Boxing Day substitute and Fri 25 Dec is Christmas Day,
    // with a weekend between them (brief 8.5).
    expect(datesOf(universalCredit, { from: '2026-10-01', to: '2027-02-28', holidays })).toEqual([
      '2026-10-28',
      '2026-11-27', // Sat 28 Nov
      '2026-12-24',
      '2027-01-28',
      '2027-02-26', // Sun 28 Feb
    ]);
  });

  it('pays council tax in 10 payments, April to January, with nothing in February or March', () => {
    const councilTax = series({
      start: '2027-04-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 }, leaveOut: [2, 3] },
    });
    const dates = datesOf(councilTax, { from: '2027-04-01', to: '2029-03-31', holidays });
    expect(dates.filter((date) => /-0[23]-/.test(date))).toEqual([]);
    expect(dates.filter((date) => date >= '2027-04-01' && date < '2028-04-01')).toEqual([
      '2027-04-01',
      '2027-05-01',
      '2027-06-01',
      '2027-07-01',
      '2027-08-01',
      '2027-09-01',
      '2027-10-01',
      '2027-11-01',
      '2027-12-01',
      '2028-01-01',
    ]);
    expect(dates.length).toBe(20); // 10 a year, 2 years

    // The same with an end: 10 payments, April to January.
    const oneYear = { ...councilTax, end: { kind: 'after', payments: 10 } } as const;
    expect(datesOf(oneYear, { from: '2027-01-01', to: '2029-12-31', holidays })).toEqual(
      dates.slice(0, 10),
    );
  });
});
