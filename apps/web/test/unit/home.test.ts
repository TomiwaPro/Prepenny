// Every figure Home shows for Sam's example plan on Sun 25 Oct 2026 (brief
// 4.9, the Home sketch in ARCHITECTURE.md 4.6, brief 8.3, D3, D8).

import { describe, expect, it } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import { homeAccountId, planLookAhead, workOutHome } from '../../lib/home.ts';

const home = workOutHome(examplePlan, '2026-10-25');

describe('Home for Sam’s example plan', () => {
  it('shows the current account at £267.54, checked on Sun 25 Oct', () => {
    expect(home.account).toEqual({
      name: 'Current account',
      balance: 26754,
      checkedOn: '2026-10-25',
      warningLevel: 2000,
    });
  });

  it('has £30.00 left to spend until Fri 30 Oct, and no more than £22.54 to keep £20 (D3)', () => {
    expect(home.leftToSpend).toEqual({
      amount: 3000,
      runsTo: 'payday',
      until: '2026-10-30',
      lastDay: '2026-10-29',
      line: { kind: 'spend-no-more-than', amount: 2254 },
      payLater: [],
    });
  });

  it('has its lowest point ahead at £4.53 on Sun 1 Nov, after Rent, Tight, under £20 from Mon 26 Oct', () => {
    expect(home.lowest).toEqual({
      balance: 453,
      date: '2026-11-01',
      after: 'Rent',
      status: 'tight',
      underWarningFrom: '2026-10-26',
      short: null,
    });
  });

  it('shows this pay has to cover £721.07 going out by Thu 29 Oct, and £500.00 coming in', () => {
    expect(home.cover).toEqual({ goingOut: 72107, comingIn: 50000, by: '2026-10-29' });
  });

  it('lists the next three due, with what’s left after each', () => {
    expect(
      home.nextDue.map(({ date, name, change, leftAfter, status }) => ({
        date,
        name,
        change,
        leftAfter,
        status,
      })),
    ).toEqual([
      {
        date: '2026-10-25',
        name: 'Spending money until payday',
        change: -3000,
        leftAfter: 23754,
        status: 'ok',
      },
      { date: '2026-10-26', name: 'Family loan', change: -12500, leftAfter: 11254, status: 'ok' },
      {
        date: '2026-10-26',
        name: 'Driving lesson',
        change: -10000,
        leftAfter: 1254,
        status: 'tight',
      },
    ]);
    expect(new Set(home.nextDue.map((row) => row.key)).size).toBe(3);
  });

  it('uses the account the main pay arrives in', () => {
    expect(homeAccountId(examplePlan)).toBe('current');
  });
});

describe('planLookAhead (D167)', () => {
  it('looks to the same date 3 months on, or that month’s last day', () => {
    expect(planLookAhead('2026-10-25')).toBe('2027-01-25');
    expect(planLookAhead('2026-11-30')).toBe('2027-02-28');
    expect(planLookAhead('2027-11-30')).toBe('2028-02-29');
  });
});
