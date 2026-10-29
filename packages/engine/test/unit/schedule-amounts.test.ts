// ARCHITECTURE.md test 7: a payment's amount is the one-off change, then the
// last amount, then the pattern with its offset, then the series amount
// (brief 5.3, D38). Plus first_number for split series.

import { describe, expect, it } from 'vitest';
import { type PaymentChange, paymentByNumber } from '../../src/index.ts';
import { noBankHolidays } from '../fixtures/holidays.ts';
import { paymentsOf, series } from '../fixtures/series.ts';

const window = { from: '2026-11-01', to: '2027-12-31' };
const amounts = (...args: Parameters<typeof paymentsOf>) =>
  paymentsOf(...args).map((payment) => payment.amount);

describe('test 7: the amount order', () => {
  const patterned = series({
    start: '2026-11-06',
    schedule: { kind: 'weekly', every: 1 },
    amount: 999,
    amountCycle: [100, 200, 300],
    cycleOffset: 1,
    end: { kind: 'after', payments: 5 },
    lastAmount: 50,
  });

  it('uses the pattern with its offset: cycle[(k + offset) mod length]', () => {
    // k = 0, 1, 2, 3 give cycle[1], cycle[2], cycle[0], cycle[1]; k = 4 is the last.
    expect(amounts(patterned, window)).toEqual([200, 300, 100, 200, 50]);
  });

  it('uses a one-off change first, even on the last payment (D38)', () => {
    const changes: PaymentChange[] = [
      { seriesId: 'test-series', originalDate: '2026-11-20', amount: 77 },
      { seriesId: 'test-series', originalDate: '2026-12-04', amount: 88 }, // the last payment
    ];
    expect(amounts(patterned, { ...window, changes })).toEqual([200, 300, 77, 200, 88]);
  });

  it('uses the series amount when there is no pattern', () => {
    const plain = series({
      start: '2026-11-06',
      schedule: { kind: 'weekly', every: 1 },
      amount: 999,
      end: { kind: 'after', payments: 3 },
      lastAmount: 50,
    });
    expect(amounts(plain, window)).toEqual([999, 999, 50]);
  });

  it('has no last payment, so no last amount, when the series never ends', () => {
    const neverEnds = series({
      start: '2026-11-06',
      schedule: { kind: 'weekly', every: 1 },
      amount: 999,
      lastAmount: 50,
    });
    const found = paymentsOf(neverEnds, { from: '2026-11-01', to: '2026-12-31' });
    expect(found.every((payment) => payment.amount === 999 && !payment.isLast)).toBe(true);
  });

  it('uses the last amount on the last payment of a series that ends on a date', () => {
    const endsOnDate = series({
      start: '2026-11-15',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 15 } },
      amount: 2500,
      lastAmount: 2099,
      end: { kind: 'on', date: '2027-02-20' },
    });
    expect(amounts(endsOnDate, window)).toEqual([2500, 2500, 2500, 2099]);
  });
});

describe('a split series carries on from its first number', () => {
  it('keeps the pattern position (brief 8.4 test 2, ARCHITECTURE.md 2.3)', () => {
    // Sam's pay pattern; the split starts at payment 5, Fri 4 Dec.
    const cycle = [45217, 61846, 46906, 59217];
    const original = series({
      start: '2026-10-30',
      schedule: { kind: 'weekly', every: 1 },
      amountCycle: cycle,
    });
    const split = series({
      id: 'split',
      start: '2026-12-04',
      schedule: { kind: 'weekly', every: 1 },
      amountCycle: cycle,
      firstNumber: 5,
    });
    const before = paymentsOf(original, { from: '2026-12-04', to: '2027-02-26' });
    const after = paymentsOf(split, { from: '2026-12-04', to: '2027-02-26' });
    expect(after.map((p) => p.amount)).toEqual(before.map((p) => p.amount));
    expect(after.map((p) => p.number)).toEqual(before.map((p) => p.number));
    expect(after[0]?.amount).toBe(61846); // cycle[5 mod 4] = cycle[1]
  });

  it('counts "after N payments" from the original series', () => {
    const rest = series({
      start: '2027-01-01',
      schedule: { kind: 'weekly', every: 2 },
      amount: 25000,
      lastAmount: 20615,
      end: { kind: 'after', payments: 4 },
      firstNumber: 3,
    });
    const found = paymentsOf(rest, window);
    expect(found.map((p) => [p.number, p.date, p.amount])).toEqual([[3, '2027-01-01', 20615]]);
    expect(paymentByNumber({ series: rest, holidays: noBankHolidays, number: 2 })).toBeNull();
    expect(paymentByNumber({ series: rest, holidays: noBankHolidays, number: 4 })).toBeNull();
  });
});

describe('the rest of a one-off change', () => {
  it('can change the name, note and estimate label of just that payment', () => {
    const pay = series({
      direction: 'in',
      name: 'Pay',
      start: '2026-10-30',
      schedule: { kind: 'weekly', every: 1 },
      isEstimate: true,
      end: { kind: 'after', payments: 3 },
    });
    const found = paymentsOf(pay, {
      ...window,
      from: '2026-10-01',
      changes: [
        {
          seriesId: 'test-series',
          originalDate: '2026-11-06',
          amount: 64000,
          isEstimate: false,
          note: 'Real amount',
        },
      ],
    });
    expect(found.map((p) => [p.date, p.amount, p.isEstimate, p.note, p.changed])).toEqual([
      ['2026-10-30', 1000, true, null, false],
      ['2026-11-06', 64000, false, 'Real amount', true],
      ['2026-11-13', 1000, true, null, false],
    ]);
  });
});
