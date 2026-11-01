// Budgets on Sam's plan (step 1e, brief 4.5 and 5.5 rule 7, ARCHITECTURE.md
// 2.5): the owner's tests 1 to 5, ARCHITECTURE.md tests 31 to 33, and the
// step 1e tests for D2, D28, D30, D32, D33 and D61. Every figure here was
// worked out by hand by the owner, or follows from Sam's plan in brief 8.3.

import { describe, expect, it } from 'vitest';
import {
  type BudgetPlan,
  balanceAtEndOf,
  formatPounds,
  type Plan,
  type PlanInput,
  type PlanRow,
  paidDate,
  type Spend,
  type Tick,
  workOutDebts,
  workOutPayments,
  workOutPlan,
} from '../../src/index.ts';
import { accountOf, daysText } from '../fixtures/plan.ts';
import {
  samChanges,
  samDebtsInput,
  samFood,
  samPlan,
  samSeries,
  samSeriesWithoutFood,
  samSpend,
  samTravel,
  samTravelSpends,
} from '../fixtures/sam.ts';

const current = (plan: Plan) => accountOf(plan, 'current');
const at = (plan: Plan, date: string) => formatPounds(balanceAtEndOf(current(plan), date));

/** The rows a budget put in the current account: [date, kind, amount]. */
function budgetRows(plan: Plan, budgetId: string, to = '2027-02-28'): [string, string, string][] {
  return current(plan)
    .rows.filter((row: PlanRow) => row.budgetId === budgetId && row.date <= to)
    .map((row) => [row.date, row.kind, formatPounds(row.change)]);
}

function budgetOf(plan: Plan, id: string): BudgetPlan {
  const found = plan.budgets.find((one) => one.budget.id === id);
  if (found === undefined) throw new Error(`No budget ${id}.`);
  return found;
}

const withTravel = (fields: Partial<PlanInput> = {}) =>
  workOutPlan(samPlan({ budgets: [samTravel()], spends: samTravelSpends, ...fields }));

describe('owner test 1: a Travel budget all at the start (D2, D28, D3)', () => {
  const plan = withTravel();

  it('has a −£6.00 spend row and a −£15.00 row for what is left of this week on Sun 25 Oct', () => {
    expect(budgetRows(plan, 'travel', '2026-10-29')).toEqual([
      ['2026-10-25', 'spend', '-6.00'],
      ['2026-10-25', 'budget', '-15.00'],
    ]);
  });

  it('says spent £10.00 and left £15.00 for this week, Fri 23 to Thu 29 Oct', () => {
    expect(budgetOf(plan, 'travel').current).toMatchObject({
      start: '2026-10-23',
      end: '2026-10-29',
      amount: 2500,
      spent: 1000,
      left: 1500,
    });
  });

  it('ends Sun 25 Oct at £216.54, Mon 26 at −£8.46, Thu 29 at £25.47, Fri 30 at £558.53 and Sun 1 Nov at −£41.47', () => {
    expect(
      ['2026-10-25', '2026-10-26', '2026-10-29', '2026-10-30', '2026-11-01'].map((date) =>
        at(plan, date),
      ),
    ).toEqual(['216.54', '-8.46', '25.47', '558.53', '-41.47']);
  });

  it('ends November at £586.91 and February at £2,833.87', () => {
    expect([at(plan, '2026-11-30'), at(plan, '2027-02-28')]).toEqual(['586.91', '2833.87']);
  });

  it('is £8.46 short on Mon 26 Oct (to Tue 27 Oct) and £41.47 short on Sun 1 Nov (to Thu 5 Nov)', () => {
    expect(
      current(plan).shortfalls.map((short) => [
        short.date,
        formatPounds(short.amount),
        short.lastDate,
      ]),
    ).toEqual([
      ['2026-10-26', '8.46', '2026-10-27'],
      ['2026-11-01', '41.47', '2026-11-05'],
    ]);
  });

  it('has £45.00 left to spend until Fri 30 Oct, and "Spend no more than £16.54 to keep at least £20"', () => {
    const left = current(plan).leftToSpend;
    expect(left?.until).toBe('2026-10-30');
    // £30.00 spending money and £15.00 travel.
    expect(formatPounds(left?.amount ?? 0)).toBe('45.00');
    expect(formatPounds(left?.spendNoMoreThan ?? 0)).toBe('16.54');
    expect([left?.lowest.date, formatPounds(left?.lowest.balance ?? 0)]).toEqual([
      '2026-10-26',
      '-8.46',
    ]);
  });

  it('leaves each later week in full on its Friday, as one row (test 31, brief 5.5 rule 7)', () => {
    expect(budgetRows(plan, 'travel', '2026-11-20').slice(2)).toEqual([
      ['2026-10-30', 'budget', '-25.00'],
      ['2026-11-06', 'budget', '-25.00'],
      ['2026-11-13', 'budget', '-25.00'],
      ['2026-11-20', 'budget', '-25.00'],
    ]);
  });

  it('never puts a budget row or a spend in Not ticked yet, or in Payments that could move', () => {
    expect(current(plan).notTickedYet).toEqual([]);
    for (const short of current(plan).shortfalls) {
      expect(short.couldMove.every((row) => row.kind === 'payment' || row.kind === 'bill')).toBe(
        true,
      );
    }
  });
});

describe('test 32 and D3: Sam on Sun 25 Oct, with no budgets', () => {
  it('has L = £30.00, M = £12.54 (Mon 26 Oct), W = £20, so "Spend no more than £22.54"', () => {
    const left = current(workOutPlan(samPlan())).leftToSpend;
    expect(left).toMatchObject({ until: '2026-10-30', amount: 3000, spendNoMoreThan: 2254 });
    expect([left?.lowest.date, left?.lowest.balance]).toEqual(['2026-10-26', 1254]);
  });

  it('gives no "Spend no more than" line when spending it all stays at or above the warning level', () => {
    // With £10.00 more on Sun 25 Oct, the lowest point to Thu 29 Oct is £22.54.
    const richer = workOutPlan(
      samPlan({
        balanceUpdates: [
          {
            id: 'current-25-oct',
            accountId: 'current',
            balance: 27754,
            checkedOn: '2026-10-25',
            checkedAt: '2026-10-25T08:30:00Z',
          },
          {
            id: 'savings-25-oct',
            accountId: 'savings',
            balance: 50000,
            checkedOn: '2026-10-25',
            checkedAt: '2026-10-25T08:30:00Z',
          },
        ],
      }),
    );
    expect(current(richer).leftToSpend).toMatchObject({ amount: 3000, spendNoMoreThan: null });
  });

  it('says "You\'ll go under £20 on Mon 26 Oct, even if you spend nothing." with £217.54 on Sun 25 Oct (D117)', () => {
    // −£7.46 at the end of Mon 26 Oct even with none of the £30.00 spent (−£37.46 with it spent).
    const poorer = workOutPlan(
      samPlan({
        balanceUpdates: [
          {
            id: 'current-25-oct',
            accountId: 'current',
            balance: 21754,
            checkedOn: '2026-10-25',
            checkedAt: '2026-10-25T08:30:00Z',
          },
          {
            id: 'savings-25-oct',
            accountId: 'savings',
            balance: 50000,
            checkedOn: '2026-10-25',
            checkedAt: '2026-10-25T08:30:00Z',
          },
        ],
      }),
    );
    const left = current(poorer).leftToSpend;
    expect(left).toMatchObject({
      amount: 3000,
      spendNoMoreThan: null,
      underEvenSpendingNothing: '2026-10-26',
    });
    expect(at(poorer, '2026-10-26')).toBe('-37.46');
  });

  it('runs to the day before the next main payday, and is labelled with that payday (D28)', () => {
    // On payday itself, Fri 30 Oct, it runs to Thu 5 Nov: the £45.00 spending money that day.
    const payday = workOutPlan(samPlan({ today: '2026-10-30' }));
    expect(current(payday).leftToSpend).toMatchObject({ until: '2026-11-06', amount: 4500 });
  });

  it('is null with no main pay: there is no payday to last until', () => {
    expect(current(workOutPlan(samPlan({ mainPayFamilyId: null }))).leftToSpend).toBeNull();
  });
});

describe('owner test 2 and test 33: the same budget spread across the days (D31)', () => {
  const plan = withTravel({
    budgets: [samTravel({ leaves: 'spread' })],
    spends: [
      samSpend('bus-24-oct', '4.00', '2026-10-24', '2026-10-24T17:00:00Z'),
      samSpend('bus-25-oct', '4.99', '2026-10-25', '2026-10-25T12:00:00Z'),
    ],
  });

  it('spreads the unspent £16.01 as £3.20 on Sun 25 to Wed 28 Oct and £3.21 on Thu 29 Oct', () => {
    expect(budgetRows(plan, 'travel', '2026-10-29')).toEqual([
      ['2026-10-25', 'spend', '-4.99'],
      ['2026-10-25', 'budget', '-3.20'],
      ['2026-10-26', 'budget', '-3.20'],
      ['2026-10-27', 'budget', '-3.20'],
      ['2026-10-28', 'budget', '-3.20'],
      ['2026-10-29', 'budget', '-3.21'],
    ]);
    expect(budgetOf(plan, 'travel').current).toMatchObject({ left: 1601, perDay: 320 });
  });

  it('spreads the next week as £3.57 a day from Fri 30 Oct to Wed 4 Nov, and £3.58 on Thu 5 Nov', () => {
    expect(
      budgetRows(plan, 'travel', '2026-11-05').filter(([date]) => date >= '2026-10-30'),
    ).toEqual([
      ['2026-10-30', 'budget', '-3.57'],
      ['2026-10-31', 'budget', '-3.57'],
      ['2026-11-01', 'budget', '-3.57'],
      ['2026-11-02', 'budget', '-3.57'],
      ['2026-11-03', 'budget', '-3.57'],
      ['2026-11-04', 'budget', '-3.57'],
      ['2026-11-05', 'budget', '-3.58'],
    ]);
    expect(budgetOf(plan, 'travel').periods[1]).toMatchObject({ amount: 2500, perDay: 357 });
  });

  it('counts the spread days to Thu 29 Oct in Left to spend', () => {
    // £30.00 spending money and the £16.01 spread from Sun 25 to Thu 29 Oct.
    expect(current(plan).leftToSpend?.amount).toBe(4601);
  });

  it('says "Spend no more than £17.55", counting only the spending money due by each day (D118)', () => {
    // The lowest day is Tue 27 Oct (−£2.05), but £6.41 of the £46.01 is due
    // after it, on Wed 28 and Thu 29 Oct. Mon 26 Oct ends at £1.15 with
    // £36.40 due by then (£30.00 and two days of £3.20): £1.15 + £36.40 −
    // £20.00 = £17.55. Tue 27 Oct gives the same: −£2.05 + £39.60 − £20.00.
    const left = current(plan).leftToSpend;
    expect(formatPounds(left?.spendNoMoreThan ?? -1)).toBe('17.55');
    expect(left?.underEvenSpendingNothing).toBeNull();
  });
});

describe('owner test 3: a pay-later budget in place of the Pay-later card (food) series (D32, D61)', () => {
  const foodPlan = (spends: readonly Spend[] = []) =>
    workOutPlan(samPlan({ series: samSeriesWithoutFood, budgets: [samFood], spends }));
  const original = workOutPlan(samPlan());

  describe('with no spends, every figure in brief 8.3 stays exactly the same', () => {
    const plan = foodPlan();

    it('keeps every end-of-day balance in both accounts, and every row', () => {
      for (const id of ['current', 'savings']) {
        expect(accountOf(plan, id).days).toEqual(
          accountOf(original, id).days.map((day) => ({
            ...day,
            after: accountOf(plan, id).days.find((d) => d.date === day.date)?.after,
          })),
        );
        expect(
          accountOf(plan, id).rows.map((row) => [row.date, row.change, row.leftAfter]),
        ).toEqual(accountOf(original, id).rows.map((row) => [row.date, row.change, row.leftAfter]));
      }
    });

    it('has the lowest point £4.53 on Sun 1 Nov, after Rent', () => {
      const lowest = current(plan).lowestPoint;
      expect([lowest.date, formatPounds(lowest.balance), lowest.after?.payment.name]).toEqual([
        '2026-11-01',
        '4.53',
        'Rent',
      ]);
    });

    it('ends Oct, Nov, Dec, Jan and Feb at £604.53, £732.91, £1,024.60, £2,235.89 and £3,304.87', () => {
      expect(
        ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'].map((date) =>
          at(plan, date),
        ),
      ).toEqual(['604.53', '732.91', '1024.60', '2235.89', '3304.87']);
    });

    it('has total pay of £9,748.96 from 18 paydays', () => {
      const pay = current(plan).rows.filter((row) => row.payment.seriesId === 'pay');
      expect([pay.length, formatPounds(pay.reduce((sum, row) => sum + row.change, 0))]).toEqual([
        18,
        '9748.96',
      ]);
    });

    it('pays off the same debts on the same days, with the same left at the end of February', () => {
      const debts = workOutDebts(samDebtsInput({ series: samSeriesWithoutFood })).debts;
      expect(debts.map((one) => [one.debt.id, one.paidOffOn, one.leftAtEnd])).toEqual(
        workOutDebts(samDebtsInput()).debts.map((one) => [
          one.debt.id,
          one.paidOffOn,
          one.leftAtEnd,
        ]),
      );
    });

    it('has savings £0 from 28 Oct, £150 from 13 Nov and £0 from 30 Nov', () => {
      expect(
        daysText(plan, 'savings', '2026-10-27', '2026-11-30').filter(([d]) =>
          [
            '2026-10-27',
            '2026-10-28',
            '2026-11-12',
            '2026-11-13',
            '2026-11-29',
            '2026-11-30',
          ].includes(d),
        ),
      ).toEqual([
        ['2026-10-27', '500.00'],
        ['2026-10-28', '0.00'],
        ['2026-11-12', '0.00'],
        ['2026-11-13', '150.00'],
        ['2026-11-29', '150.00'],
        ['2026-11-30', '0.00'],
      ]);
    });

    it('pays £200.00 bills on 29 Nov, 29 Dec, 29 Jan and 28 Feb, as estimates', () => {
      expect(
        current(plan)
          .rows.filter((row) => row.kind === 'bill')
          .map((row) => [
            row.date,
            formatPounds(row.change),
            row.payment.isEstimate,
            row.payment.type,
          ]),
      ).toEqual([
        ['2026-11-29', '-200.00', true, 'bills'],
        ['2026-12-29', '-200.00', true, 'bills'],
        ['2027-01-29', '-200.00', true, 'bills'],
        ['2027-02-28', '-200.00', true, 'bills'],
      ]);
    });
  });

  it('makes the 29 Nov bill £230.00 with £230.00 spent: £702.91 at the end of November, £3,274.87 at the end of February', () => {
    const plan = foodPlan([
      samSpend('shop-29-oct', '100.00', '2026-10-29', '2026-10-29T18:00:00Z', 'food'),
      samSpend('shop-28-nov', '130.00', '2026-11-28', '2026-11-28T18:00:00Z', 'food'),
    ]);
    expect(budgetRows(plan, 'food', '2026-11-30')).toEqual([['2026-11-29', 'bill', '-230.00']]);
    expect([at(plan, '2026-11-30'), at(plan, '2027-02-28')]).toEqual(['702.91', '3274.87']);
  });

  it('shows "On the pay-later card: £80.00 left until Sat 28 Nov" with £120.00 spent, not in Left to spend', () => {
    const plan = foodPlan([
      samSpend('shop-1-nov', '120.00', '2026-11-01', '2026-11-01T18:00:00Z', 'food'),
    ]);
    const left = current(plan).leftToSpend;
    expect(left?.payLater).toEqual([{ budgetId: 'food', left: 8000, until: '2026-11-28' }]);
    expect(left?.amount).toBe(3000);
    // The card's spends never leave the bank account: the bill is still £200.00.
    expect(budgetRows(plan, 'food', '2026-11-30')).toEqual([['2026-11-29', 'bill', '-200.00']]);
  });

  it("lands February's bill on Sun 28 Feb, covering spends from Fri 29 Jan to Sat 27 Feb", () => {
    const plan = foodPlan();
    const february = budgetOf(plan, 'food').periods.find(
      (period) => period.bill?.originalDate === '2027-02-28',
    );
    expect([february?.start, february?.end, february?.bill?.date]).toEqual([
      '2027-01-29',
      '2027-02-27',
      '2027-02-28',
    ]);
    // A spend on Thu 28 Jan is on January's bill; Fri 29 Jan and Sat 27 Feb are on February's; Sun 28 Feb is on March's.
    const spent = foodPlan([
      samSpend('a', '1.00', '2027-01-28', '2027-01-28T18:00:00Z', 'food'),
      samSpend('b', '300.00', '2027-01-29', '2027-01-29T18:00:00Z', 'food'),
      samSpend('c', '2.00', '2027-02-27', '2027-02-27T18:00:00Z', 'food'),
      samSpend('d', '400.00', '2027-02-28', '2027-02-28T18:00:00Z', 'food'),
    ]);
    expect(budgetRows(spent, 'food').slice(2)).toEqual([
      ['2027-01-29', 'bill', '-200.00'],
      ['2027-02-28', 'bill', '-302.00'],
    ]);
  });
});

describe('owner test 4 and D30: roll-over', () => {
  const rollOver = samTravel({ rollOver: true, startsOn: '2026-10-16' });
  const lastWeek = [
    samSpend('bus-16-oct', '8.00', '2026-10-16', '2026-10-16T18:00:00Z'),
    samSpend('bus-22-oct', '10.00', '2026-10-22', '2026-10-22T18:00:00Z'),
  ];
  const plan = workOutPlan(
    samPlan({ budgets: [rollOver], spends: [...lastWeek, samTravelSpends[0] as Spend] }),
  );

  it('makes this week "£25 + £7 from last week", £32.00, after £18.00 spent from Fri 16 to Thu 22 Oct', () => {
    expect(budgetOf(plan, 'travel').current).toMatchObject({
      start: '2026-10-23',
      base: 2500,
      rolledOver: 700,
      amount: 3200,
    });
  });

  it('leaves £28.00 on Sun 25 Oct, with £4.00 spent before the update this week', () => {
    expect(budgetRows(plan, 'travel', '2026-10-29')).toEqual([['2026-10-25', 'budget', '-28.00']]);
  });

  it('makes the weeks after that £25.00: nothing rolls over until a week has ended', () => {
    expect(
      budgetOf(plan, 'travel')
        .periods.slice(1, 4)
        .map((p) => [p.start, p.rolledOver, p.amount]),
    ).toEqual([
      ['2026-10-30', 0, 2500],
      ['2026-11-06', 0, 2500],
      ['2026-11-13', 0, 2500],
    ]);
  });

  it('moves nothing when roll-over is off: this week is £25.00', () => {
    const off = workOutPlan(
      samPlan({
        budgets: [{ ...rollOver, rollOver: false }],
        spends: [...lastWeek, samTravelSpends[0] as Spend],
      }),
    );
    expect(budgetOf(off, 'travel').current).toMatchObject({
      rolledOver: 0,
      amount: 2500,
      left: 2100,
    });
  });

  it('rolls over only from weeks that ended on or after the day it was switched on', () => {
    const later = workOutPlan(
      samPlan({
        budgets: [{ ...rollOver, rollOverFrom: '2026-10-23' }],
        spends: [...lastWeek, samTravelSpends[0] as Spend],
      }),
    );
    expect(budgetOf(later, 'travel').current?.rolledOver).toBe(0);
  });

  it('carries on: what is left of a week with roll-over is added to the next, and so on', () => {
    // From Fri 9 Oct with nothing spent that week: £25 rolls into the week of 16 Oct, which leaves £32.
    const fromNinth = workOutPlan(
      samPlan({
        budgets: [{ ...rollOver, startsOn: '2026-10-09' }],
        spends: [...lastWeek],
      }),
    );
    expect(budgetOf(fromNinth, 'travel').current).toMatchObject({ rolledOver: 3200, amount: 5700 });
  });
});

describe('owner test 5 and D67: a balance checked in an earlier budget week', () => {
  // Sam updates his balance at 8pm on Thu 29 Oct, ticking everything up to then, and today is Sat 31 Oct.
  const update = {
    id: 'current-29-oct',
    accountId: 'current',
    balance: 2547,
    checkedOn: '2026-10-29',
    checkedAt: '2026-10-29T20:00:00Z',
  };
  const upTo29Oct = workOutPayments({
    series: samSeries,
    changes: samChanges,
    holidays: { isBankHoliday: () => false },
    from: '2026-10-25',
    to: '2026-10-29',
  }).filter((payment) => payment.accountId === 'current' || payment.toAccountId === 'current');
  const ticks: Tick[] = upTo29Oct.map((payment) => ({
    seriesId: payment.seriesId,
    originalDate: payment.originalDate,
    tickedAt: '2026-10-29T20:00:30Z',
    paidOn: paidDate(payment.date, '2026-10-29'),
    inBalanceUpdate: 'current-29-oct',
  }));
  const plan = workOutPlan(
    samPlan({
      today: '2026-10-31',
      balanceUpdates: [...samPlan().balanceUpdates, update],
      ticks,
      budgets: [samTravel()],
      spends: [
        ...samTravelSpends,
        samSpend('bus-30-oct', '3.00', '2026-10-30', '2026-10-30T13:00:00Z'),
      ],
    }),
  );

  it('takes nothing more for last week, whose £10.00 of spends are inside the balance', () => {
    expect(budgetRows(plan, 'travel').filter(([date]) => date <= '2026-10-29')).toEqual([]);
  });

  it('has −£3.00 on Fri 30 Oct and −£22.00 on Sat 31 Oct, and nothing else from Travel before Fri 6 Nov', () => {
    expect(budgetRows(plan, 'travel', '2026-11-06')).toEqual([
      ['2026-10-30', 'spend', '-3.00'],
      ['2026-10-31', 'budget', '-22.00'],
      ['2026-11-06', 'budget', '-25.00'],
    ]);
    expect(budgetOf(plan, 'travel').current).toMatchObject({
      start: '2026-10-30',
      spent: 300,
      left: 2200,
    });
  });
});

describe('D2 and D33: spends and the balance update', () => {
  const plan = (spends: readonly Spend[]) =>
    budgetRows(withTravel({ spends }), 'travel', '2026-10-29');

  it('counts a spend recorded before the update, even on the same day, as already inside the balance', () => {
    // The update was at 8:30am on Sun 25 Oct.
    expect(plan([samSpend('early', '6.00', '2026-10-25', '2026-10-25T08:00:00Z')])).toEqual([
      ['2026-10-25', 'budget', '-19.00'],
    ]);
  });

  it('makes a spend recorded after the update, even on the same day, a row of its own', () => {
    expect(plan([samSpend('late', '6.00', '2026-10-25', '2026-10-25T09:00:00Z')])).toEqual([
      ['2026-10-25', 'spend', '-6.00'],
      ['2026-10-25', 'budget', '-19.00'],
    ]);
  });

  it('takes off a spend dated before the balance date but recorded after the update at the start, as D39', () => {
    const rows = current(
      withTravel({ spends: [samSpend('late', '4.00', '2026-10-24', '2026-10-25T09:00:00Z')] }),
    ).rows;
    expect(rows[0]).toMatchObject({
      kind: 'spend',
      date: '2026-10-24',
      atStart: true,
      notTickedYet: false,
    });
  });

  it('leaves nothing on today once the week is all spent, and no more than the spends when it is overspent', () => {
    expect(
      plan([
        samSpend('a', '4.00', '2026-10-24', '2026-10-24T17:00:00Z'),
        samSpend('b', '30.00', '2026-10-25', '2026-10-25T12:00:00Z'),
      ]),
    ).toEqual([['2026-10-25', 'spend', '-30.00']]);
    expect(
      budgetOf(
        withTravel({ spends: [samSpend('b', '30.00', '2026-10-25', '2026-10-25T12:00:00Z')] }),
        'travel',
      ).current,
    ).toMatchObject({ spent: 3000, left: 0 });
  });

  it('settles weeks before this one: a spend last week recorded before the update leaves no row', () => {
    expect(plan([samSpend('old', '9.00', '2026-10-20', '2026-10-20T12:00:00Z')])).toEqual([
      ['2026-10-25', 'budget', '-25.00'],
    ]);
  });

  it('puts the budget row after the day’s spends, and gives the same plan whatever order the records come in', () => {
    const forwards = withTravel();
    const backwards = withTravel({
      budgets: [samTravel()],
      spends: [...samTravelSpends].reverse(),
      series: [...samSeries].reverse(),
    });
    expect(current(backwards).rows).toEqual(current(forwards).rows);
  });
});

describe('D29: other kinds of budget on Sam’s plan', () => {
  it('runs a monthly budget by calendar month, because Sam is paid weekly', () => {
    const monthly = workOutPlan(
      samPlan({
        budgets: [
          samTravel({ id: 'phone-top-up', every: 'month', amount: 1000, startsOn: '2026-10-01' }),
        ],
      }),
    );
    expect(
      budgetOf(monthly, 'phone-top-up')
        .periods.slice(0, 2)
        .map((p) => [p.start, p.end]),
    ).toEqual([
      ['2026-10-01', '2026-10-31'],
      ['2026-11-01', '2026-11-30'],
    ]);
    expect(budgetRows(monthly, 'phone-top-up', '2026-12-01')).toEqual([
      ['2026-10-25', 'budget', '-10.00'],
      ['2026-11-01', 'budget', '-10.00'],
      ['2026-12-01', 'budget', '-10.00'],
    ]);
  });

  it('puts nothing in before a budget starts or after the week it ends', () => {
    const later = workOutPlan(
      samPlan({ budgets: [samTravel({ startsOn: '2026-11-06', endsOn: '2026-11-18' })] }),
    );
    expect(budgetRows(later, 'travel')).toEqual([
      ['2026-11-06', 'budget', '-25.00'],
      ['2026-11-13', 'budget', '-25.00'],
    ]);
    // Before it starts, this period is its first one.
    expect(budgetOf(later, 'travel').current?.start).toBe('2026-11-06');
  });

  it('has no current period once the budget has ended', () => {
    const ended = workOutPlan(
      samPlan({ budgets: [samTravel({ startsOn: '2026-10-09', endsOn: '2026-10-15' })] }),
    );
    expect(budgetOf(ended, 'travel')).toMatchObject({ current: null, periods: [] });
    expect(budgetRows(ended, 'travel')).toEqual([]);
  });
});
