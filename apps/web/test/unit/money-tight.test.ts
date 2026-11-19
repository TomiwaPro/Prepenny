// Step 4g: when Home offers "Free, confidential help is available." (D584,
// D585, and the owner's change, D592), and how long "Not now" hides it (D586).

import { type PlanRecords, parsePounds as pounds, type Series } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import {
  joShortFromNow,
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

describe("Short in three pay periods in a row, from the one we're in now or the next (D592)", () => {
  it("is the owner's example: Dee, short on Sun 29 Nov, Tue 29 Dec and Fri 29 Jan, though not now", () => {
    expect(workOutHome(shortThreeRunning, TIGHT_TODAY).shortRunning).toEqual([
      '2026-11-29',
      '2026-12-29',
      '2027-01-29',
    ]);
  });

  it('is nothing when only two pay periods running are short', () => {
    expect(workOutHome(shortTwoOfThree, TIGHT_TODAY).shortRunning).toBeNull();
  });

  it("is the owner's example: Jo, short now, and up to the 25 Dec and 25 Jan paydays, but not in February's", () => {
    const home = workOutHome(joShortFromNow, TIGHT_TODAY);
    expect(home.lowest.short?.date).toBe('2026-11-20');
    expect(home.shortRunning).toEqual(['2026-11-20', '2026-12-01', '2027-01-01']);
  });

  it('shows from now when the next three are short too', () => {
    // The tax refund a month later: short in the pay period from Mon 25 Jan
    // too (−£50.00 on Mon 1 Feb), so both runs are short; the one from now is given.
    const later: PlanRecords = {
      ...joShortFromNow,
      series: joShortFromNow.series.map((one) =>
        one.id === 'tax-refund' ? { ...one, start: '2027-02-25' } : one,
      ),
    };
    expect(workOutHome(later, TIGHT_TODAY).shortRunning).toEqual([
      '2026-11-20',
      '2026-12-01',
      '2027-01-01',
    ]);
  });

  it('is nothing when the pay period after next has no short day, even short now', () => {
    // £100.00 more on Fri 25 Dec: £1,050.00 − £1,000.00 = £50.00 on Fri 1 Jan.
    const gap = withSeries(joShortFromNow, once('gift', 'in', '100.00', '2026-12-25'));
    expect(workOutHome(gap, TIGHT_TODAY).lowest.short?.date).toBe('2026-11-20');
    expect(workOutHome(gap, TIGHT_TODAY).shortRunning).toBeNull();
  });

  it("counts the pay period we're in from today on, payday included", () => {
    // £1,000.00 coming in on Fri 26 Feb, in the fourth, changes nothing: on
    // payday, Fri 27 Nov, and the day after, the three from now are short.
    const rescuedInFeb = withSeries(
      shortThreeRunning,
      once('bonus', 'in', '1000.00', '2027-02-26'),
    );
    for (const today of ['2026-11-27', '2026-11-28']) {
      expect(workOutHome(rescuedInFeb, today).shortRunning).toEqual([
        '2026-11-29',
        '2026-12-29',
        '2027-01-29',
      ]);
    }
    // On Wed 30 Dec, the pay periods from Thu 24 Dec (still −£180.00) and
    // Thu 28 Jan are short, but February's, from Fri 26 Feb, isn't.
    expect(workOutHome(rescuedInFeb, '2026-12-30').shortRunning).toBeNull();
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
    // November from today, December and January: −£30.00 on Sun 29 Nov,
    // still −£30.00 on Tue 1 Dec, and −£180.00 on Fri 1 Jan.
    expect(workOutHome(noMainPay, TIGHT_TODAY).shortRunning).toEqual([
      '2026-11-29',
      '2026-12-01',
      '2027-01-01',
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
