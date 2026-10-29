// Plans the engine can't work with are refused with an EngineInputError whose
// message names ids and dates only, never an amount, a payment name or a note
// (CLAUDE.md: privacy).

import { describe, expect, it } from 'vitest';
import { EngineInputError, type PlanInput, workOutPlan } from '../../src/index.ts';
import { account, balanceUpdate, planInput } from '../fixtures/plan.ts';
import { series } from '../fixtures/series.ts';

const secretName = 'Secret payment name';
const secretNote = 'Secret note';
const secretAmount = 98765;

const secret = series({
  id: 'secret',
  name: secretName,
  note: secretNote,
  amount: secretAmount,
  start: '2026-11-05',
  schedule: { kind: 'once' },
});

const good = planInput({
  today: '2026-11-02',
  to: '2026-11-30',
  accounts: [account('current'), account('savings', { kind: 'savings' })],
  balanceUpdates: [
    { ...balanceUpdate('current', '0.00', '2026-11-01'), balance: secretAmount },
    balanceUpdate('savings', '10.00', '2026-11-01'),
  ],
  series: [secret],
});

function refusal(input: PlanInput): EngineInputError {
  try {
    workOutPlan(input);
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

describe('the plan refuses what it cannot work with', () => {
  it('accepts a good plan', () => {
    expect(workOutPlan(good).accounts).toHaveLength(2);
  });

  it.each<[string, string, Partial<PlanInput>]>([
    ['the plan ends before today', 'bad-window', { to: '2026-11-01' }],
    ['no accounts', 'bad-account', { accounts: [] }],
    [
      'an account listed twice',
      'repeated-account',
      { accounts: [account('current'), account('current')] },
    ],
    [
      'an unknown kind of account',
      'bad-account',
      { accounts: [account('current', { kind: 'business' as 'current' }), account('savings')] },
    ],
    [
      'an overdraft limit below zero',
      'negative-pence',
      { accounts: [account('current', { overdraftLimit: -1 }), account('savings')] },
    ],
    [
      'a warning level that is not whole pence',
      'not-pence',
      { accounts: [account('current', { warningLevel: 20.5 }), account('savings')] },
    ],
    [
      'an account with no balance update',
      'no-balance',
      { balanceUpdates: [balanceUpdate('current', '1.00', '2026-11-01')] },
    ],
    [
      'a balance date after today',
      'balance-after-today',
      {
        balanceUpdates: [
          balanceUpdate('current', '1.00', '2026-11-03'),
          balanceUpdate('savings', '1.00', '2026-11-01'),
        ],
      },
    ],
    [
      'two balance updates for one account at the same time',
      'same-time-balances',
      {
        balanceUpdates: [
          balanceUpdate('current', '1.00', '2026-11-01', '2026-11-01T09:00:00Z', 'a'),
          balanceUpdate('current', '2.00', '2026-11-01', '2026-11-01T09:00:00Z', 'b'),
          balanceUpdate('savings', '1.00', '2026-11-01'),
        ],
      },
    ],
    [
      'a balance update for an account not in the plan',
      'unknown-account',
      { balanceUpdates: [...good.balanceUpdates, balanceUpdate('other', '1.00', '2026-11-01')] },
    ],
    [
      'a balance update without a time',
      'bad-time',
      {
        balanceUpdates: [
          { ...balanceUpdate('current', '1.00', '2026-11-01'), checkedAt: '2026-11-01' },
          balanceUpdate('savings', '1.00', '2026-11-01'),
        ],
      },
    ],
    [
      'a series for an account not in the plan',
      'unknown-account',
      { series: [{ ...secret, accountId: 'other' }] },
    ],
    [
      'a transfer to an account not in the plan',
      'unknown-account',
      {
        series: [{ ...secret, direction: 'transfer', toAccountId: 'other' }],
      },
    ],
    [
      'two series in one family with different creation times',
      'family-times-differ',
      {
        series: [
          { ...secret, familyId: 'f' },
          {
            ...secret,
            id: 'second',
            familyId: 'f',
            familyCreatedAt: '2026-02-01T00:00:00Z',
          },
        ],
      },
    ],
    [
      'a series with an unknown type',
      'bad-series',
      { series: [{ ...secret, type: 'treats' as 'other' }] },
    ],
    [
      'two ticks on one payment',
      'repeated-tick',
      {
        ticks: [
          {
            seriesId: 'secret',
            originalDate: '2026-11-05',
            tickedAt: '2026-11-02T09:00:00Z',
            paidOn: '2026-11-02',
          },
          {
            seriesId: 'secret',
            originalDate: '2026-11-05',
            tickedAt: '2026-11-02T10:00:00Z',
            paidOn: '2026-11-02',
          },
        ],
      },
    ],
    [
      'a tick without a paid date',
      'bad-date',
      {
        ticks: [
          {
            seriesId: 'secret',
            originalDate: '2026-11-05',
            tickedAt: '2026-11-02T09:00:00Z',
            paidOn: '',
          },
        ],
      },
    ],
    ['a main pay that is not an id', 'bad-main-pay', { mainPayFamilyId: '' }],
  ])('refuses %s', (_why, code, fields) => {
    expect(refusal({ ...good, ...fields }).code).toBe(code);
  });

  it('ignores a tick on a payment the series does not have', () => {
    const plan = workOutPlan({
      ...good,
      ticks: [
        {
          seriesId: 'secret',
          originalDate: '2026-11-06',
          tickedAt: '2026-11-02T09:00:00Z',
          paidOn: '2026-11-02',
        },
        {
          seriesId: 'removed-series',
          originalDate: '2026-11-05',
          tickedAt: '2026-11-02T09:00:00Z',
          paidOn: '2026-11-02',
        },
      ],
    });
    expect(plan).toEqual(workOutPlan(good));
  });

  it('treats a main pay with no series as no main pay', () => {
    const plan = workOutPlan({ ...good, mainPayFamilyId: 'removed-family' });
    expect(plan.mainPay).toBe('none');
    expect(plan.nextMainPayday).toBeNull();
  });
});
