// Series and changes the engine can't work with are refused with an
// EngineInputError. Its message never holds an amount, a payment name or a
// note (CLAUDE.md: privacy), so it's safe to put in an error report.

import { describe, expect, it } from 'vitest';
import {
  EngineInputError,
  type PaymentChange,
  type Series,
  workOutPayments,
} from '../../src/index.ts';
import { noBankHolidays } from '../fixtures/holidays.ts';
import { series } from '../fixtures/series.ts';

const secretName = 'Secret payment name';
const secretNote = 'Secret note';
const secretAmount = 98765;

function refusal(one: Series, changes: readonly PaymentChange[] = []): EngineInputError {
  try {
    workOutPayments({
      series: [one],
      changes,
      holidays: noBankHolidays,
      from: '2026-10-25',
      to: '2027-02-28',
    });
  } catch (error) {
    expect(error).toBeInstanceOf(EngineInputError);
    const message = (error as Error).message;
    expect(message).not.toContain(secretName);
    expect(message).not.toContain(secretNote);
    expect(message).not.toContain(String(secretAmount));
    expect(message).not.toContain('987.65');
    return error as EngineInputError;
  }
  throw new Error('Expected the engine to refuse this.');
}

const good = series({
  name: secretName,
  note: secretNote,
  amount: secretAmount,
  start: '2026-11-01',
  schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
});

describe('the engine refuses what it cannot work with', () => {
  it('accepts a good series', () => {
    expect(
      workOutPayments({
        series: [good],
        holidays: noBankHolidays,
        from: '2026-11-01',
        to: '2026-11-30',
      }),
    ).toHaveLength(1);
  });

  it.each<[string, Partial<Series>]>([
    ['an amount in pounds instead of pence', { amount: 987.65 }],
    ['a negative amount', { amount: -secretAmount }],
    ['a last amount below zero', { lastAmount: -1 }],
    ['an amount pattern of 9', { amountCycle: [1, 2, 3, 4, 5, 6, 7, 8, 9] }],
    ['an empty amount pattern', { amountCycle: [] }],
    ['a start that is not a date', { start: '01/11/2026' }],
    [
      'day 32 of the month',
      { schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 32 } } },
    ],
    ['every 0 months', { schedule: { kind: 'monthly', every: 0, on: { kind: 'day', day: 1 } } }],
    [
      'a fifth Monday',
      {
        schedule: {
          kind: 'monthly',
          every: 1,
          on: { kind: 'weekday', weekday: 1, position: 5 as never },
        },
      },
    ],
    [
      'month 13 left out',
      { schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 }, leaveOut: [13] } },
    ],
    ['an unknown schedule', { schedule: { kind: 'fortnightly' } as never }],
    ['an end after 0 payments', { end: { kind: 'after', payments: 0 } }],
    ['an end date that is not a date', { end: { kind: 'on', date: '2027-02-30' } }],
    ['an unknown end rule', { end: { kind: 'sometimes' } as never }],
    ['an unknown weekend rule', { holidayRule: 'next-monday' as never }],
    ['an unknown direction', { direction: 'sideways' as never }],
    ['a transfer with nowhere to go', { direction: 'transfer' }],
    ['a transfer to the same account', { direction: 'transfer', toAccountId: 'current' }],
    ['money out with a second account', { toAccountId: 'savings' }],
    ['a first number below zero', { firstNumber: -1 }],
    ['a split from no series', { splitFrom: '' }],
    ['a shared half that mirrors itself', { mirrorOf: 'test-series' }],
    ['a shared half that mirrors something that is not an id', { mirrorOf: 7 as never }],
    ['a missing account', { accountId: '' }],
  ])('refuses %s', (_what, fields) => {
    refusal({ ...good, ...fields } as Series);
  });

  it('refuses two changes for the same payment', () => {
    refusal(good, [
      { seriesId: good.id, originalDate: '2026-12-01', amount: 1 },
      { seriesId: good.id, originalDate: '2026-12-01', note: secretNote },
    ]);
  });

  it('refuses a change with a bad date or amount', () => {
    refusal(good, [{ seriesId: good.id, originalDate: '2026-12-32' }]);
    refusal(good, [{ seriesId: good.id, originalDate: '2026-12-01', newDate: 'tomorrow' }]);
    refusal(good, [{ seriesId: good.id, originalDate: '2026-12-01', amount: -secretAmount }]);
  });

  it('refuses the same series twice, and a window that ends before it starts', () => {
    expect(() =>
      workOutPayments({
        series: [good, good],
        holidays: noBankHolidays,
        from: '2026-11-01',
        to: '2026-11-30',
      }),
    ).toThrow(EngineInputError);
    expect(() =>
      workOutPayments({
        series: [good],
        holidays: noBankHolidays,
        from: '2026-11-30',
        to: '2026-11-01',
      }),
    ).toThrow(EngineInputError);
  });

  it('ignores a change whose payment does not exist, such as one left from an old schedule', () => {
    const payments = workOutPayments({
      series: [good],
      changes: [
        { seriesId: good.id, originalDate: '2026-12-15', amount: 1, newDate: '2026-11-20' },
      ],
      holidays: noBankHolidays,
      from: '2026-11-01',
      to: '2026-12-31',
    });
    expect(payments.map((p) => [p.date, p.amount])).toEqual([
      ['2026-11-01', secretAmount],
      ['2026-12-01', secretAmount],
    ]);
  });
});
