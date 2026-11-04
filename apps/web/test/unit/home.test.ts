// Every figure Home shows for Sam's example plan on Sun 25 Oct 2026 (brief
// 4.9, the Home sketch in ARCHITECTURE.md 4.6, brief 8.3, D3, D8).

import type { PlanRecords } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import { workOutActionsView } from '../../lib/actions-view.ts';
import { runEdit } from '../../lib/edit.ts';
import { homeAccountId, workOutHome, workOutHomePlan } from '../../lib/home.ts';
import { planLookAhead, workOutPlanTo } from '../../lib/plan-input.ts';

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
    expect(home.cover).toEqual({
      goingOut: 72107,
      comingIn: 50000,
      by: '2026-10-29',
      payToday: null,
    });
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

  it('looks 12 months ahead, to Mon 25 Oct 2027 (D178)', () => {
    expect(home.lookAheadTo).toBe('2027-10-25');
  });

  it('opens each of the next three due in the edit sheet as a whole payment', () => {
    expect(
      home.nextDue.map(({ seriesId, originalDate, editing, amount, nextPayday }) => ({
        seriesId,
        originalDate,
        editing,
        amount,
        nextPayday,
      })),
    ).toEqual([
      {
        seriesId: 'spending-until-payday',
        originalDate: '2026-10-25',
        editing: 'payment',
        amount: 3000,
        nextPayday: '2026-10-30',
      },
      {
        seriesId: 'family-loan-first',
        originalDate: '2026-10-26',
        editing: 'payment',
        amount: 12500,
        nextPayday: '2026-10-30',
      },
      {
        seriesId: 'driving-lessons',
        originalDate: '2026-10-26',
        editing: 'payment',
        amount: 10000,
        nextPayday: '2026-10-30',
      },
    ]);
  });

  it('uses the account the main pay arrives in', () => {
    expect(homeAccountId(examplePlan)).toBe('current');
  });
});

describe('planLookAhead (D167, D178)', () => {
  it('looks to the same date some months on, or that month’s last day', () => {
    expect(planLookAhead('2026-10-25', 3)).toBe('2027-01-25');
    expect(planLookAhead('2026-11-30', 3)).toBe('2027-02-28');
    expect(planLookAhead('2027-11-30', 3)).toBe('2028-02-29');
    expect(planLookAhead('2026-10-25', 12)).toBe('2027-10-25');
    expect(planLookAhead('2028-02-29', 12)).toBe('2029-02-28');
  });
});

describe('Home looks 12 months ahead, so a yearly bill is never missed (D178)', () => {
  it('warns about a bill 11 months away that 3 months would miss', () => {
    // A yearly bill on Mon 20 Sep 2027 of £100.00 more than Sam will have that day.
    const before = workOutHomePlan(examplePlan, '2026-10-25');
    const current = before.accounts.find((one) => one.account.id === 'current');
    const balance = current?.days.find((one) => one.date === '2027-09-20')?.balance ?? 0;
    expect(balance).toBeGreaterThan(0);
    const yearly: PlanRecords = {
      ...examplePlan,
      series: [
        ...examplePlan.series,
        {
          id: 'car-insurance',
          familyId: 'car-insurance',
          familyCreatedAt: '2026-10-25T09:00:00Z',
          accountId: 'current',
          name: 'Car insurance',
          direction: 'out',
          type: 'bills',
          amount: balance + 10000,
          start: '2027-09-20',
          schedule: { kind: 'monthly', every: 12, on: { kind: 'day', day: 20 } },
          end: { kind: 'never' },
          holidayRule: 'keep',
          isEstimate: false,
        },
      ],
    };
    const later = workOutHome(yearly, '2026-10-25');
    expect(later.lowest.status).toBe('short');
    expect(later.lowest.short).toEqual({ amount: 10000, date: '2027-09-20' });
    // Looking only 3 months ahead, it wouldn't show.
    const threeMonths = workOutPlanTo(yearly, '2026-10-25', planLookAhead('2026-10-25', 3));
    expect(threeMonths.accounts[0]?.lowestPoint.balance).toBe(453);
  });
});

describe('This pay has to cover, on payday (D206)', () => {
  const FRIDAY = '2026-10-30';

  it('shows the pay coming in today, and no "Coming in £0.00"', () => {
    // Fri 30 Oct to Thu 5 Nov: Spending money £45.00 and Rent £600.00 go out.
    expect(workOutHome(examplePlan, FRIDAY).cover).toEqual({
      goingOut: 64500,
      comingIn: 0,
      by: '2026-11-05',
      payToday: { amount: 60306, ticked: false },
    });
  });

  it('shows the pay that came in today once Update balance has ticked it', () => {
    const toTick =
      workOutActionsView(examplePlan, FRIDAY).accounts.find((one) => one.id === 'current')
        ?.toTick ?? [];
    const made = runEdit(examplePlan, FRIDAY, {
      kind: 'update-balance',
      update: {
        id: 'update-30-oct',
        accountId: 'current',
        balance: 60000,
        checkedOn: FRIDAY,
        checkedAt: '2026-10-30T09:14:00Z',
      },
      ticks: toTick.map((row) => ({
        seriesId: row.seriesId,
        originalDate: row.originalDate,
        tickedAt: '2026-10-30T09:14:00Z',
      })),
    });
    // The pay is inside the balance now, so it isn't a row: it's on its own line.
    // Today's £45.00 spending money was ticked too, so only Rent is still to go out.
    expect(workOutHome(made.records, FRIDAY).cover).toEqual({
      goingOut: 60000,
      comingIn: 0,
      by: '2026-11-05',
      payToday: { amount: 60306, ticked: true },
    });
  });

  it('isn’t shown on a day that isn’t payday', () => {
    expect(workOutHome(examplePlan, '2026-10-31').cover?.payToday).toBeNull();
  });
});
