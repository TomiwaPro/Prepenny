// Sam's plan from brief Part 8, payments only. Balances come in step 1b.

import { describe, expect, it } from 'vitest';
import {
  formatPounds,
  type Payment,
  parsePounds,
  sumPence,
  workOutPayments,
} from '../../src/index.ts';
import { englandAndWales } from '../fixtures/holidays.ts';
import { samChanges, samSeries, samToday, samViewEnd } from '../fixtures/sam.ts';

const view = (): Payment[] =>
  workOutPayments({
    series: samSeries,
    changes: samChanges,
    holidays: englandAndWales,
    from: samToday,
    to: samViewEnd,
  });

const rowsOf = (payments: Payment[], seriesId: string) =>
  payments.filter((p) => p.seriesId === seriesId).map((p) => [p.date, formatPounds(p.amount)]);

describe("Sam's pay", () => {
  it('gives 18 paydays from Fri 30 Oct 2026 to Fri 26 Feb 2027, totalling £9,748.96', () => {
    const pay = view().filter((p) => p.seriesId === 'pay');
    expect(pay.length).toBe(18);
    expect(pay[0]?.date).toBe('2026-10-30');
    expect(pay.at(-1)?.date).toBe('2027-02-26');
    expect(formatPounds(sumPence(pay.map((p) => p.amount)))).toBe('9748.96');
    expect(pay.every((p) => p.direction === 'in' && p.isEstimate)).toBe(true);
  });

  it('starts at £603.06, then follows the pattern £452.17, £618.46, £469.06, £592.17', () => {
    const amounts = view()
      .filter((p) => p.seriesId === 'pay')
      .map((p) => formatPounds(p.amount));
    expect(amounts[0]).toBe('603.06');
    const pattern = ['452.17', '618.46', '469.06', '592.17'];
    // Payment k is pattern[k mod 4]: Fri 6 Nov is payment 1, so £618.46.
    for (let k = 1; k < amounts.length; k += 1) {
      expect(amounts[k], `payment ${k}`).toBe(pattern[k % 4]);
    }
    expect(amounts.slice(0, 6)).toEqual([
      '603.06',
      '618.46',
      '469.06',
      '592.17',
      '452.17',
      '618.46',
    ]);
  });
});

describe("Sam's whole plan, payment by payment (brief 8.2)", () => {
  const payments = view();

  it('has every one-off and short series where the brief puts it', () => {
    expect(rowsOf(payments, 'spending-until-payday')).toEqual([['2026-10-25', '30.00']]);
    expect(rowsOf(payments, 'family-loan-first')).toEqual([
      ['2026-10-26', '125.00'],
      ['2026-11-06', '125.00'],
    ]);
    expect(rowsOf(payments, 'driving-lessons')).toEqual([
      ['2026-10-26', '100.00'],
      ['2026-11-17', '100.00'],
      ['2026-11-23', '100.00'],
      ['2026-12-15', '100.00'],
      ['2027-01-12', '100.00'],
    ]);
    expect(rowsOf(payments, 'from-savings')).toEqual([['2026-10-28', '500.00']]);
    expect(rowsOf(payments, 'pay-later-card-in-full')).toEqual([['2026-10-29', '466.07']]);
    expect(rowsOf(payments, 'to-savings')).toEqual([['2026-11-13', '150.00']]);
    expect(rowsOf(payments, 'back-from-savings')).toEqual([['2026-11-30', '150.00']]);
    expect(rowsOf(payments, 'christmas-bonus')).toEqual([['2026-12-18', '0.00']]);
    expect(rowsOf(payments, 'driving-test')).toEqual([['2027-01-26', '0.00']]);
  });

  it('has the monthly payments, with the first rent at £600 and food on 28 Feb', () => {
    expect(rowsOf(payments, 'rent')).toEqual([
      ['2026-11-01', '600.00'],
      ['2026-12-01', '550.00'],
      ['2027-01-01', '550.00'],
      ['2027-02-01', '550.00'],
    ]);
    expect(rowsOf(payments, 'credit-card')).toEqual([
      ['2026-11-15', '25.00'],
      ['2026-12-15', '25.00'],
      ['2027-01-15', '25.00'],
      ['2027-02-15', '25.00'],
    ]);
    expect(rowsOf(payments, 'pay-later-card-food')).toEqual([
      ['2026-11-29', '200.00'],
      ['2026-12-29', '200.00'],
      ['2027-01-29', '200.00'],
      ['2027-02-28', '200.00'],
    ]);
  });

  it('has the debt payments with their different last amounts', () => {
    expect(rowsOf(payments, 'pay-in-3-165')).toEqual([
      ['2026-11-07', '41.30'],
      ['2026-11-21', '41.30'],
      ['2026-12-05', '41.30'],
    ]);
    expect(rowsOf(payments, 'pay-in-3-79')).toEqual([
      ['2026-11-08', '20.00'],
      ['2026-11-22', '20.00'],
      ['2026-12-06', '19.99'],
    ]);
    expect(rowsOf(payments, 'laptop-loan-first')).toEqual([['2026-11-10', '150.00']]);
    expect(rowsOf(payments, 'laptop-loan')).toEqual([
      ['2026-12-20', '150.00'],
      ['2027-01-20', '150.00'],
      ['2027-02-20', '34.00'],
    ]);
    expect(rowsOf(payments, 'sofa-finance-first')).toEqual([['2026-11-10', '77.00']]);
    expect(rowsOf(payments, 'sofa-finance')).toEqual([
      ['2026-11-23', '37.88'],
      ['2026-12-23', '37.88'],
      ['2027-01-23', '37.88'],
      ['2027-02-23', '37.88'],
    ]);
    expect(rowsOf(payments, 'family-loan')).toEqual([
      ['2026-11-20', '250.00'],
      ['2026-12-04', '250.00'],
      ['2026-12-18', '250.00'],
      ['2027-01-01', '206.15'],
    ]);
  });

  it('has spending money every Friday, £45 first and then £54', () => {
    const spending = rowsOf(payments, 'spending-money');
    expect(spending.length).toBe(18);
    expect(spending[0]).toEqual(['2026-10-30', '45.00']);
    expect(spending.slice(1).every(([, amount]) => amount === '54.00')).toBe(true);
  });

  it('adds up to what each debt owes, for the debts paid off in the view (brief 8.1, 8.3)', () => {
    const total = (...ids: string[]) =>
      formatPounds(sumPence(payments.filter((p) => ids.includes(p.seriesId)).map((p) => p.amount)));
    expect(total('pay-later-card-in-full')).toBe('466.07'); // Pay-later card
    expect(total('pay-in-3-165', 'pay-in-3-79')).toBe('183.89'); // Pay in 3
    expect(total('laptop-loan-first', 'laptop-loan')).toBe('484.00'); // Laptop loan
  });

  it("moves the current account by £3,037.33 by the end of February, as brief 8.3's balances need", () => {
    // From £267.54 on 25 Oct to £3,304.87 at the end of Feb 2027 (brief 8.3).
    // A cross-check on this fixture only: the balance rule itself is step 1b.
    let change = 0;
    for (const p of payments) {
      if (p.direction === 'in' && p.accountId === 'current') change += p.amount;
      if (p.direction === 'out' && p.accountId === 'current') change -= p.amount;
      if (p.direction === 'transfer' && p.toAccountId === 'current') change += p.amount;
      if (p.direction === 'transfer' && p.accountId === 'current') change -= p.amount;
    }
    expect(change).toBe(parsePounds('3304.87') - parsePounds('267.54'));
  });

  it('keeps every date, with no weekend or bank holiday moves (D15)', () => {
    expect(payments.length).toBe(81);
    expect(payments.every((p) => p.date === p.originalDate && !p.movedByRule)).toBe(true);
  });
});
