// paymentNumberOf (step 3c, PLAN.md item 4): the payment number of a series'
// payment from its original date, the reverse of paymentByNumber, so each
// tick and change on the server keeps the number of the payment it's on.

import { describe, expect, it } from 'vitest';
import { paymentByNumber, paymentNumberOf } from '../../src/index.ts';
import { noBankHolidays } from '../fixtures/holidays.ts';
import { series } from '../fixtures/series.ts';

const holidays = noBankHolidays;

describe('paymentNumberOf', () => {
  const pay = series({ start: '2026-10-30', schedule: { kind: 'weekly', every: 1 } });

  it('counts weekly payments from the series start', () => {
    expect(paymentNumberOf({ series: pay, holidays, originalDate: '2026-10-30' })).toBe(0);
    expect(paymentNumberOf({ series: pay, holidays, originalDate: '2026-11-06' })).toBe(1);
    expect(paymentNumberOf({ series: pay, holidays, originalDate: '2026-12-04' })).toBe(5);
  });

  it('carries on from the payment number a split series starts at', () => {
    const later = series({
      start: '2026-12-04',
      schedule: { kind: 'weekly', every: 1 },
      firstNumber: 5,
    });
    expect(paymentNumberOf({ series: later, holidays, originalDate: '2026-12-04' })).toBe(5);
    expect(paymentNumberOf({ series: later, holidays, originalDate: '2026-12-11' })).toBe(6);
  });

  it('gives null for a date the schedule has no payment on, or after it ends', () => {
    expect(paymentNumberOf({ series: pay, holidays, originalDate: '2026-11-07' })).toBeNull();
    expect(paymentNumberOf({ series: pay, holidays, originalDate: '2026-10-23' })).toBeNull();
    const three = series({
      start: '2026-11-07',
      schedule: { kind: 'weekly', every: 2 },
      end: { kind: 'after', payments: 3 },
    });
    expect(paymentNumberOf({ series: three, holidays, originalDate: '2026-12-05' })).toBe(2);
    expect(paymentNumberOf({ series: three, holidays, originalDate: '2026-12-19' })).toBeNull();
  });

  it('is the reverse of paymentByNumber, for monthly month ends and chosen dates', () => {
    const monthEnd = series({
      start: '2027-01-31',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 31 } },
    });
    const chosen = series({
      start: '2026-09-21',
      schedule: { kind: 'dates', dates: ['2026-09-21', '2027-01-11', '2027-04-19'] },
    });
    for (const one of [monthEnd, chosen]) {
      for (let number = 0; number < 3; number += 1) {
        const payment = paymentByNumber({ series: one, holidays, number });
        expect(payment).not.toBeNull();
        expect(
          paymentNumberOf({ series: one, holidays, originalDate: payment?.originalDate ?? '' }),
        ).toBe(number);
      }
    }
  });
});
