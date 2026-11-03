// The owner's step 1g test 1: brief 8.3 in full on Sam's plan, with every
// engine part switched on at once (samEverything: debts, the pay-later food
// budget, his pay profile and pay weeks, a savings goal, plan periods, Left
// to spend and What if), and the D15 names. ARCHITECTURE.md tests 47 to 52.

import { describe, expect, it } from 'vitest';
import {
  balanceAtEndOf,
  formatPounds,
  groupIntoPeriods,
  type PlanRow,
  whatIf,
} from '../../src/index.ts';
import { pounds } from '../fixtures/plan.ts';
import { samEverything, samViewEnd } from '../fixtures/sam.ts';

// Debts look to the end of February 2027 for brief 8.3 (D43), and 24 months
// ahead for "when the view is extended".
const everything = samEverything();
const inView = whatIf({ ...everything, debtsTo: samViewEnd }, []);
const extended = whatIf(everything, []);
const plan = inView.real.plan;
const current = plan.accounts.find((one) => one.account.id === 'current');
const savings = plan.accounts.find((one) => one.account.id === 'savings');
const debtNamed = (side: typeof inView, name: string) =>
  side.real.debts.debts.find((one) => one.debt.name === name);

describe('brief 8.3 in full, with every engine part switched on at once', () => {
  it('test 47: the lowest end-of-day balance is £4.53 on Sun 1 Nov 2026, after Rent', () => {
    expect([
      current?.lowestPoint.date,
      formatPounds(current?.lowestPoint.balance ?? 0),
      current?.lowestPoint.after?.payment.name,
      current?.lowestPoint.status,
    ]).toEqual(['2026-11-01', '4.53', 'Rent', 'tight']);
    // D8: the balance first goes under £20 on Mon 26 Oct, at £12.54 after Driving lesson.
    expect([
      current?.firstUnderWarning?.date,
      formatPounds(current?.firstUnderWarning?.balance ?? 0),
      current?.firstUnderWarning?.after?.payment.name,
    ]).toEqual(['2026-10-26', '12.54', 'Driving lesson']);
  });

  it('test 48: the current account ends Oct to Feb at £604.53, £732.91, £1,024.60, £2,235.89 and £3,304.87', () => {
    const ends = ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'];
    expect(
      ends.map((date) => formatPounds(current === undefined ? 0 : balanceAtEndOf(current, date))),
    ).toEqual(['604.53', '732.91', '1024.60', '2235.89', '3304.87']);
  });

  it('test 49: total pay in the view is £9,748.96 from 18 paydays', () => {
    const paydays = (current?.rows ?? []).filter((row) => row.payment.seriesId === 'pay');
    expect(paydays).toHaveLength(18);
    expect(formatPounds(paydays.reduce((sum, row) => sum + row.change, 0))).toBe('9748.96');
    expect([paydays[0]?.date, paydays.at(-1)?.date]).toEqual(['2026-10-30', '2027-02-26']);
    // Every one is an estimate (brief 8.2).
    expect(paydays.every((row) => row.payment.isEstimate)).toBe(true);
  });

  it('test 50: paid off on 29 Oct 2026, 6 Dec 2026, 1 Jan 2027 and 20 Feb 2027, with the D15 names', () => {
    expect(
      ['Pay-later card', 'Pay in 3', 'Family loan', 'Laptop loan'].map((name) => [
        name,
        debtNamed(inView, name)?.paidOffOn,
      ]),
    ).toEqual([
      ['Pay-later card', '2026-10-29'],
      ['Pay in 3', '2026-12-06'],
      ['Family loan', '2027-01-01'],
      ['Laptop loan', '2027-02-20'],
    ]);
    // The Family loan ends at −€0.01, so it shows Paid off and €0.00 (D34).
    expect(debtNamed(inView, 'Family loan')?.leftAtEnd).toBeNull();
  });

  it('test 51: Sofa finance £225.25 and Credit card £320.99 still owed at the end of Feb 2027', () => {
    expect(
      ['Sofa finance', 'Credit card'].map((name) => [
        name,
        debtNamed(inView, name)?.paidOffOn,
        formatPounds(debtNamed(inView, name)?.leftAtEnd ?? 0),
      ]),
    ).toEqual([
      ['Sofa finance', null, '225.25'],
      ['Credit card', null, '320.99'],
    ]);
    // When the view is extended (D43): Sofa finance is paid off on 23 Aug
    // 2027, and the Credit card on Wed 15 Mar 2028 (D70), with no interest
    // in this test (brief 8.1), so its screen says "Interest not included".
    expect(debtNamed(extended, 'Sofa finance')?.paidOffOn).toBe('2027-08-23');
    expect(debtNamed(extended, 'Credit card')?.paidOffOn).toBe('2028-03-15');
    expect(debtNamed(extended, 'Credit card')?.interestNotIncluded).toBe(true);
  });

  it('test 52: savings are £0 from 28 Oct, £150 from 13 Nov and £0 from 30 Nov', () => {
    const days = savings?.days ?? [];
    const changes = days.filter((day, i) => i === 0 || day.balance !== days[i - 1]?.balance);
    expect(changes.map((day) => [day.date, formatPounds(day.balance)])).toEqual([
      ['2026-10-25', '500.00'],
      ['2026-10-28', '0.00'],
      ['2026-11-13', '150.00'],
      ['2026-11-30', '0.00'],
    ]);
  });

  it('uses the D15 names everywhere, and no real company', () => {
    const names = new Set([
      ...(current?.rows ?? []).map((row: PlanRow) => row.payment.name),
      ...inView.real.debts.debts.map((one) => one.debt.name),
    ]);
    for (const name of [
      'Pay-later card',
      'Pay-later card (food)',
      'Pay in 3 (£165.20 order)',
      'Pay in 3 (£79.99 order)',
      'Laptop loan',
      'Sofa finance',
      'Credit card',
      'Family loan',
      'Pay in 3',
    ]) {
      expect(names.has(name)).toBe(true);
    }
    const text = JSON.stringify([...names]);
    for (const brand of ['Monzo', 'Clearpay', 'Lemfi', 'Klarna', 'Capital One', 'Partner loan']) {
      expect(text).not.toContain(brand);
    }
  });
});

describe('every other part, at the same time', () => {
  it('has the food bill on the pay-later card, £200.00 on Sun 29 Nov, as an estimate', () => {
    const bills = (current?.rows ?? []).filter((row) => row.kind === 'bill');
    expect(bills.map((row) => [row.date, formatPounds(row.change)])).toEqual([
      ['2026-11-29', '-200.00'],
      ['2026-12-29', '-200.00'],
      ['2027-01-29', '-200.00'],
      ['2027-02-28', '-200.00'],
    ]);
    expect(bills.every((row) => row.payment.isEstimate)).toBe(true);
  });

  it('has Left to spend £30.00 until Fri 30 Oct, with "Spend no more than £22.54"', () => {
    expect([
      current?.leftToSpend?.until,
      formatPounds(current?.leftToSpend?.amount ?? 0),
      formatPounds(current?.leftToSpend?.spendNoMoreThan ?? 0),
    ]).toEqual(['2026-10-30', '30.00', '22.54']);
    // The food card's line sits under it, not in it (D61): £200.00 left from Thu 29 Oct.
    expect(current?.leftToSpend?.payLater).toEqual([
      { budgetId: 'food', left: pounds('200.00'), until: '2026-11-28' },
    ]);
  });

  it('groups the plan into his pay periods, Friday to Thursday (D84)', () => {
    const periods =
      groupIntoPeriods(plan, 'pay').accounts.find((one) => one.accountId === 'current')?.periods ??
      [];
    expect(
      periods
        .slice(0, 3)
        .map((one) => [one.start, one.end, formatPounds(one.cameIn), formatPounds(one.leftAtEnd)]),
    ).toEqual([
      ['2026-10-25', '2026-10-29', '500.00', '46.47'],
      ['2026-10-30', '2026-11-05', '603.06', '4.53'],
      ['2026-11-06', '2026-11-12', '618.46', '155.69'],
    ]);
  });

  it('owes £3,214.86 now, counting the Family loan’s €1,400.57 as £1,206.14 (D99)', () => {
    expect(formatPounds(inView.real.debts.owedNow)).toBe('3214.86');
    expect(formatPounds(debtNamed(inView, 'Family loan')?.leftNowInPounds ?? 0)).toBe('1206.14');
  });

  it('works out the savings goal from the moves into and out of savings (D114)', () => {
    const goal = inView.real.goals.goals[0];
    expect([goal?.goal.name, formatPounds(goal?.savedSoFar ?? 0)]).toEqual([
      'Savings pot',
      '500.00',
    ]);
    expect([formatPounds(goal?.savedAtEnd ?? 0), goal?.reachedOn]).toEqual(['0.00', null]);
  });

  it('has nothing Not ticked yet and no shortfall, in any account', () => {
    for (const one of plan.accounts) {
      expect([one.account.id, one.notTickedYet, one.shortfalls]).toEqual([one.account.id, [], []]);
    }
  });
});
