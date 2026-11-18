// Step 4g: when Home offers "Free, confidential help is available." (D584,
// D585), and how long "Not now" hides it (D586).

import { type PlanRecords, parsePounds as pounds, type Series } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import {
  shortNowAndNextTwo,
  shortThreeRunning,
  shortTwoOfThree,
  TIGHT_TODAY,
} from '../../e2e/money-tight-plans.ts';
import { workOutHome } from '../../lib/home.ts';
import { HIDDEN_FOR_DAYS, hiddenByNotNow, readNotNow } from '../../lib/money-tight.ts';

const once = (id: string, direction: 'in' | 'out', amount: string, start: string): Series => ({
  id,
  familyId: id,
  familyCreatedAt: '2026-11-01T10:00:00Z',
  accountId: 'current',
  name: id,
  direction,
  type: direction === 'in' ? 'benefits' : 'bills',
  amount: pounds(amount),
  start,
  schedule: { kind: 'once' },
  holidayRule: 'keep',
  isEstimate: false,
  end: { kind: 'never' },
});

const withSeries = (plan: PlanRecords, ...more: Series[]): PlanRecords => ({
  ...plan,
  series: [...plan.series, ...more],
});

describe('Short in each of the next three pay periods (D585)', () => {
  it("is the owner's example: short on Sun 29 Nov, Tue 29 Dec and Fri 29 Jan", () => {
    expect(workOutHome(shortThreeRunning, TIGHT_TODAY).shortRunning).toEqual([
      '2026-11-29',
      '2026-12-29',
      '2027-01-29',
    ]);
  });

  it('is nothing when one of the three has no short day', () => {
    expect(workOutHome(shortTwoOfThree, TIGHT_TODAY).shortRunning).toBeNull();
  });

  it("doesn't count the pay period today is in, when it started before today", () => {
    const home = workOutHome(shortNowAndNextTwo, TIGHT_TODAY);
    expect(home.lowest.short?.date).toBe('2026-11-20');
    expect(home.shortRunning).toBeNull();
  });

  it('counts the pay period that starts today, on payday', () => {
    // On payday, Fri 27 Nov, its pay period is the first of the three, so
    // £1,000.00 coming in on Fri 26 Feb, in the fourth, changes nothing.
    const rescuedInFeb = withSeries(
      shortThreeRunning,
      once('bonus', 'in', '1000.00', '2027-02-26'),
    );
    expect(workOutHome(rescuedInFeb, '2026-11-27').shortRunning).toEqual([
      '2026-11-29',
      '2026-12-29',
      '2027-01-29',
    ]);
    // A day later, the three are from Thu 24 Dec, and the fourth isn't short.
    expect(workOutHome(rescuedInFeb, '2026-11-28').shortRunning).toBeNull();
  });

  it('gives the first short day of each pay period', () => {
    // £700.00 on payday, Thu 28 Jan: £620.00 − £700.00 = −£80.00 at the end of that day.
    const earlier = withSeries(
      shortThreeRunning,
      once('car-repair', 'out', '700.00', '2027-01-28'),
    );
    expect(workOutHome(earlier, TIGHT_TODAY).shortRunning).toEqual([
      '2026-11-29',
      '2026-12-29',
      '2027-01-28',
    ]);
  });

  it('is short only below the overdraft floor, not under the warning level', () => {
    // A £1,000.00 overdraft: −£330.00 on Fri 29 Jan is Tight, not Short (brief
    // 8.5, Ali). £150.00 less each month, it's first short on Tue 29 Jun 2027.
    const overdraft: PlanRecords = {
      ...shortThreeRunning,
      accounts: shortThreeRunning.accounts.map((account) => ({
        ...account,
        overdraftLimit: pounds('1000.00'),
      })),
    };
    const home = workOutHome(overdraft, TIGHT_TODAY);
    expect(home.lowest.short?.date).toBe('2027-06-29');
    expect(home.shortRunning).toBeNull();
  });

  it('counts a short day in any open account, and none in a closed one', () => {
    const second: PlanRecords = {
      ...shortTwoOfThree,
      accounts: [
        ...shortTwoOfThree.accounts,
        { id: 'joint', name: 'Joint account', kind: 'joint', overdraftLimit: 0, warningLevel: 0 },
      ],
      balanceUpdates: [
        ...shortTwoOfThree.balanceUpdates,
        {
          id: 'joint-18-nov',
          accountId: 'joint',
          balance: pounds('10.00'),
          checkedOn: TIGHT_TODAY,
          checkedAt: '2026-11-18T08:00:00Z',
        },
      ],
      series: [
        ...shortTwoOfThree.series,
        { ...once('joint-bill', 'out', '20.00', '2027-02-01'), accountId: 'joint' },
      ],
    };
    // The current account is short on Sun 29 Nov and Tue 29 Dec; the joint on Mon 1 Feb.
    expect(workOutHome(second, TIGHT_TODAY).shortRunning).toEqual([
      '2026-11-29',
      '2026-12-29',
      '2027-02-01',
    ]);
  });

  it("is nothing on Sam's example, which is never short", () => {
    expect(workOutHome(examplePlan, '2026-10-25').shortRunning).toBeNull();
  });

  it('is calendar months with no main pay (D84)', () => {
    const noMainPay: PlanRecords = {
      ...shortThreeRunning,
      settings: { nation: 'england-and-wales', mainPayFamilyId: null },
    };
    // December, January and February: still −£30.00 on Tue 1 Dec, −£180.00 on
    // Fri 1 Jan and −£330.00 on Mon 1 Feb.
    expect(workOutHome(noMainPay, TIGHT_TODAY).shortRunning).toEqual([
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
    ]);
  });
});

describe('"Not now" hides it for 30 days (D586)', () => {
  it('from the day it was tapped, that day included', () => {
    expect(HIDDEN_FOR_DAYS).toBe(30);
    expect(hiddenByNotNow('2026-11-18', '2026-11-18')).toBe(true);
    expect(hiddenByNotNow('2026-11-18', '2026-12-17')).toBe(true);
    expect(hiddenByNotNow('2026-11-18', '2026-12-18')).toBe(false);
    expect(hiddenByNotNow('2026-12-31', '2027-01-29')).toBe(true);
    expect(hiddenByNotNow('2026-12-31', '2027-01-30')).toBe(false);
  });

  it('hides nothing when it was never tapped', () => {
    expect(hiddenByNotNow(null, '2026-11-18')).toBe(false);
  });

  it('reads only what it keeps', () => {
    expect(readNotNow(JSON.stringify({ notNowOn: '2026-11-18' }))).toBe('2026-11-18');
    expect(readNotNow(null)).toBeNull();
    expect(readNotNow('not json')).toBeNull();
    expect(readNotNow(JSON.stringify({ notNowOn: 'soon' }))).toBeNull();
    expect(readNotNow(JSON.stringify(['2026-11-18']))).toBeNull();
  });
});
