// Step 2a, the owner's tests 1 and 2: every person's plan built from an
// empty plan with the commands for adding and changing records only (D149),
// giving exactly the records in their fixture files, and Sam's giving every
// figure in brief 8.3.

import { describe, expect, it } from 'vitest';
import {
  balanceAtEndOf,
  debtsLookAhead,
  formatPounds,
  workOutDebts,
  workOutPlan,
} from '../../src/index.ts';
import {
  allRecords,
  build,
  fixtureRecords,
  inputFor,
  otherPeopleSteps,
  samEverythingSteps,
  samSteps,
} from '../fixtures/from-empty.ts';
import { samDebts, samEverything, samPlan, samToday, samViewEnd } from '../fixtures/sam.ts';

/** Sam's plan, the debts and the goals, worked out from built records. */
function workedOut(records: ReturnType<typeof build>['records'], to: string, debtsTo: string) {
  const input = inputFor(records, samToday);
  const common = {
    series: records.series,
    changes: records.changes ?? [],
    ticks: records.ticks ?? [],
    holidays: input.holidays,
    today: samToday,
    to: debtsTo,
  };
  return {
    plan: workOutPlan({ ...input, to }),
    debts: workOutDebts({ ...common, debts: records.debts ?? [] }),
  };
}

describe("owner test 1: Sam's example plan from an empty plan, with the commands only", () => {
  const built = build(samSteps());
  const { plan, debts } = workedOut(built.records, samViewEnd, samViewEnd);
  const extended = workedOut(built.records, samViewEnd, debtsLookAhead(samToday)).debts;
  const current = plan.accounts.find((one) => one.account.id === 'current');
  const savings = plan.accounts.find((one) => one.account.id === 'savings');
  const debt = (list: typeof debts, name: string) =>
    list.debts.find((one) => one.debt.name === name);

  it('builds exactly the records in his fixture, brief 8.1 and 8.2 with the D15 names', () => {
    expect(allRecords(built.records)).toEqual(
      allRecords(fixtureRecords({ ...samPlan(), debts: samDebts })),
    );
    // One command each: the nation, 2 accounts, 6 debts, 21 payments, the
    // main pay and the 3 first payments that differ.
    expect(built.history).toHaveLength(34);
  });

  it('has the lowest point £4.53 on Sun 1 Nov 2026, after Rent', () => {
    expect([
      current?.lowestPoint.date,
      formatPounds(current?.lowestPoint.balance ?? 0),
      current?.lowestPoint.after?.payment.name,
    ]).toEqual(['2026-11-01', '4.53', 'Rent']);
  });

  it('ends October to February at £604.53, £732.91, £1,024.60, £2,235.89 and £3,304.87', () => {
    const ends = ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'];
    expect(
      ends.map((date) => formatPounds(current === undefined ? 0 : balanceAtEndOf(current, date))),
    ).toEqual(['604.53', '732.91', '1024.60', '2235.89', '3304.87']);
  });

  it('has £9,748.96 of pay from 18 paydays', () => {
    const paydays = (current?.rows ?? []).filter((row) => row.payment.seriesId === 'pay');
    expect(paydays).toHaveLength(18);
    expect(formatPounds(paydays.reduce((sum, row) => sum + row.change, 0))).toBe('9748.96');
  });

  it('pays off each debt on the brief’s dates, and owes what it says at the end of February', () => {
    expect(
      ['Pay-later card', 'Pay in 3', 'Family loan', 'Laptop loan'].map(
        (name) => debt(debts, name)?.paidOffOn,
      ),
    ).toEqual(['2026-10-29', '2026-12-06', '2027-01-01', '2027-02-20']);
    expect(
      ['Sofa finance', 'Credit card'].map((name) => [
        debt(debts, name)?.paidOffOn,
        formatPounds(debt(debts, name)?.leftAtEnd ?? 0),
      ]),
    ).toEqual([
      [null, '225.25'],
      [null, '320.99'],
    ]);
    // Sofa finance is paid off on 23 Aug 2027 when the view is extended.
    expect(debt(extended, 'Sofa finance')?.paidOffOn).toBe('2027-08-23');
  });

  it('has savings of £0 from 28 Oct, £150 from 13 Nov and £0 from 30 Nov', () => {
    const days = savings?.days ?? [];
    const changes = days.filter((day, i) => i === 0 || day.balance !== days[i - 1]?.balance);
    expect(changes.map((day) => [day.date, formatPounds(day.balance)])).toEqual([
      ['2026-10-25', '500.00'],
      ['2026-10-28', '0.00'],
      ['2026-11-13', '150.00'],
      ['2026-11-30', '0.00'],
    ]);
  });
});

describe("Sam's plan with every engine part switched on, from an empty plan", () => {
  const built = build(samEverythingSteps());

  it('builds exactly the records of step 1g’s whole plan: pay profile, pay weeks, goal and food budget too', () => {
    expect(allRecords(built.records)).toEqual(allRecords(fixtureRecords(samEverything())));
  });

  it('still has the lowest point £4.53 on Sun 1 Nov and £3,304.87 at the end of February', () => {
    const current = workedOut(built.records, samViewEnd, samViewEnd).plan.accounts[0];
    expect([
      current?.lowestPoint.date,
      formatPounds(current?.lowestPoint.balance ?? 0),
      formatPounds(current === undefined ? 0 : balanceAtEndOf(current, '2027-02-28')),
    ]).toEqual(['2026-11-01', '4.53', '3304.87']);
  });
});

describe('owner test 2: the other five people from empty plans, with the commands only', () => {
  for (const [name, { plan, steps }] of Object.entries(otherPeopleSteps)) {
    it(`builds exactly the records in ${name}'s fixture`, () => {
      const built = build(steps());
      expect(allRecords(built.records)).toEqual(allRecords(fixtureRecords(plan())));
    });
  }
});
