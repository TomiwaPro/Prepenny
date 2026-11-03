// The owner's step 1g test 4: each of the other five people's whole plans
// (test/fixtures/people.ts) works out with no errors, and shows what brief
// Part 2 says that person needs most. With brief 8.5's tests on their own
// plans.

import { describe, expect, it } from 'vitest';
import {
  type EditCommand,
  formatPounds,
  groupIntoPeriods,
  type Plan,
  type PlanRow,
  parseDate,
  type WhatIfInput,
  whatIf,
  workOutPlan,
} from '../../src/index.ts';
import { edited } from '../fixtures/edit.ts';
import { englandAndWales } from '../fixtures/holidays.ts';
import {
  aliPlan,
  deePlan,
  jessAndTomPlan,
  kofiPlan,
  otherPeople,
  priyaPlan,
  tomMainPay,
} from '../fixtures/people.ts';
import { pounds } from '../fixtures/plan.ts';

const accountOf = (plan: Plan, id = 'current') => {
  const found = plan.accounts.find((one) => one.account.id === id);
  if (found === undefined) throw new Error(`No account ${id}.`);
  return found;
};
const rowsOf = (plan: Plan, seriesId: string, id = 'current'): PlanRow[] =>
  accountOf(plan, id).rows.filter((row) => row.payment.seriesId === seriesId);
const datesOf = (plan: Plan, seriesId: string, id = 'current') =>
  rowsOf(plan, seriesId, id).map((row) => row.date);

describe.each(Object.entries(otherPeople))("%s's plan", (_name, make) => {
  const input = make();

  it('works out with no errors: the plan, its periods, debts, goals and What if', () => {
    const result = whatIf(input, []);
    const plan = result.real.plan;
    expect(plan.accounts).toHaveLength(input.accounts.length);
    expect(groupIntoPeriods(plan, 'pay').by).toBe('pay');
    expect(groupIntoPeriods(plan, 'months').by).toBe('months');
    expect(result.real.debts.debts).toHaveLength(input.debts?.length ?? 0);
    expect(result.real.goals.goals).toHaveLength(input.goals?.length ?? 0);
    expect(result.practice.plan).toEqual(plan);
    expect(plan.nextMainPayday).not.toBeNull();
  });

  it('has nothing Not ticked yet, and every row follows from the one before', () => {
    for (const one of workOutPlan(input).accounts) {
      expect(one.notTickedYet).toEqual([]);
      let balance = one.start.balance;
      for (const row of one.rows) {
        balance += row.change;
        expect(row.leftAfter).toBe(balance);
      }
      expect(one.days.at(-1)?.balance).toBe(balance);
    }
  });

  it('can be edited: a payment moved to the next payday, and undone in one step', () => {
    const plan = workOutPlan(input);
    const row = accountOf(plan, input.accounts[0]?.id)
      .rows.filter((one) => one.kind === 'payment' && one.change < 0 && !one.ticked)
      .find((one) => one.date > plan.today);
    expect(row).toBeDefined();
    if (row === undefined) return;
    const command: EditCommand = {
      kind: 'move-to-next-payday',
      seriesId: row.payment.seriesId,
      originalDate: row.payment.originalDate,
    };
    const { edit, after } = edited(input, command);
    expect(edit.writes).toHaveLength(1);
    const undone = edited(after, { kind: 'undo', edit }).after;
    expect(workOutPlan(undone as WhatIfInput)).toEqual(plan);
  });
});

describe('Priya: never surprised by a yearly bill', () => {
  const plan = workOutPlan(priyaPlan());

  it('shows her yearly car insurance once in the year ahead', () => {
    expect(
      rowsOf(plan, 'car-insurance').map((row) => [row.date, formatPounds(row.change)]),
    ).toEqual([['2027-01-14', '-612.40']]);
    // And once a year when she looks 24 months ahead.
    const twoYears = workOutPlan({ ...priyaPlan(), to: '2028-10-24' });
    expect(datesOf(twoYears, 'car-insurance')).toEqual(['2027-01-14', '2028-01-14']);
    expect(datesOf(plan, 'tv-licence')).toEqual(['2027-03-01']);
  });

  it('shows the quarterly water bill every 3 months (brief 8.5)', () => {
    expect(datesOf(plan, 'water')).toEqual([
      '2026-11-05',
      '2027-02-05',
      '2027-05-05',
      '2027-08-05',
    ]);
  });

  it('gets her £2,100 salary on Thu 31 Dec 2026 and Fri 29 Jan 2027 (brief 8.5)', () => {
    const paydays = rowsOf(plan, 'salary');
    expect(paydays.slice(2, 4).map((row) => [row.date, formatPounds(row.change)])).toEqual([
      ['2026-12-31', '2100.00'],
      ['2027-01-29', '2100.00'],
    ]);
  });

  it('shows her month by month, from one payday to the day before the next', () => {
    const periods = groupIntoPeriods(plan, 'pay').accounts[0]?.periods ?? [];
    expect(periods.slice(0, 4).map((one) => [one.start, one.end])).toEqual([
      ['2026-10-25', '2026-10-29'],
      ['2026-10-30', '2026-11-29'],
      ['2026-11-30', '2026-12-30'],
      ['2026-12-31', '2027-01-28'],
    ]);
    expect(accountOf(plan).shortfalls).toEqual([]);
  });

  it('watches her holiday fund grow: £1,500 by Fri 28 May 2027, with the 8th move', () => {
    const goal = whatIf(priyaPlan(), []).real.goals.goals[0];
    expect([goal?.goal.name, goal?.reachedOn, goal?.reachedWith, goal?.byTargetDate]).toEqual([
      'Holiday',
      '2027-05-28',
      8,
      true,
    ]);
  });
});

describe('Dee: estimates she can correct, and a warning before she goes overdrawn', () => {
  const plan = workOutPlan(deePlan());

  it('gets Universal Credit on Thu 24 Dec 2026, before Christmas and the Boxing Day holiday (brief 8.5)', () => {
    const credit = rowsOf(plan, 'universal-credit');
    expect(credit.map((row) => row.date)).toEqual([
      '2026-11-27',
      '2026-12-24',
      '2027-01-28',
      '2027-02-26',
    ]);
    expect(credit[1]?.payment.originalDate).toBe('2026-12-28');
    // Christmas Day and the Boxing Day substitute, with a weekend between them.
    expect(englandAndWales.isBankHoliday(parseDate('2026-12-25'))).toBe(true);
    expect(englandAndWales.isBankHoliday(parseDate('2026-12-28'))).toBe(true);
  });

  it('pays council tax April to January, with nothing in February or March (brief 8.5)', () => {
    const twoYears = workOutPlan({ ...deePlan(), to: '2027-12-31' });
    const months = datesOf(twoYears, 'council-tax').map((date) => date.slice(0, 7));
    expect(months).toEqual([
      '2026-12',
      '2027-01',
      '2027-04',
      '2027-05',
      '2027-06',
      '2027-07',
      '2027-08',
      '2027-09',
      '2027-10',
      '2027-11',
      '2027-12',
    ]);
  });

  it("has October's Universal Credit as the real £812.46, and the rest as estimates", () => {
    // Paid before today, so inside the balance she typed in.
    expect(rowsOf(plan, 'universal-credit').every((row) => row.payment.isEstimate)).toBe(true);
    const input = deePlan();
    const real = input.changes?.find((one) => one.seriesId === 'universal-credit');
    expect([real?.amount, real?.isEstimate]).toEqual([pounds('812.46'), false]);
  });

  it('warns her from Mon 9 Nov that it’s tight, and she’s never overdrawn', () => {
    const current = accountOf(plan);
    expect(current.firstUnderWarning?.date).toBe('2026-11-09');
    expect([
      current.lowestPoint.date,
      formatPounds(current.lowestPoint.balance),
      current.lowestPoint.status,
    ]).toEqual(['2026-11-10', '7.40', 'tight']);
    expect(current.shortfalls).toEqual([]);
  });

  it('can type in the real Universal Credit when it lands, and see the difference', () => {
    const { after } = edited(deePlan(), {
      kind: 'just-this-one',
      seriesId: 'universal-credit',
      originalDate: '2026-11-28',
      edits: { amount: pounds('801.20'), isEstimate: false },
    });
    const later = workOutPlan(after as WhatIfInput);
    const row = rowsOf(later, 'universal-credit')[0];
    expect([row?.date, formatPounds(row?.change ?? 0), row?.payment.isEstimate]).toEqual([
      '2026-11-27',
      '801.20',
      false,
    ]);
    expect(accountOf(later).days.at(-1)?.balance).toBe(
      (accountOf(plan).days.at(-1)?.balance ?? 0) - pounds('43.80'),
    );
  });

  it('can say "I missed a shift" at the café: Tue 3 Nov comes off Fri 13 Nov (D131)', () => {
    const { after } = edited(deePlan(), {
      kind: 'missed-shift',
      id: 'missed-3-nov',
      seriesId: 'wages',
      workedOn: '2026-11-03',
      hours: '6',
    });
    const saved = after.payAdjustments?.[0];
    // Fri 30 Oct is payment 0, so Fri 13 Nov, covering work up to Sun 8 Nov, is payment 1.
    expect(saved?.number).toBe(1);
    // Under the tax and National Insurance thresholds, so it's the whole 6 h × £12.71.
    expect(formatPounds(saved?.change ?? 0)).toBe('-76.26');
  });
});

describe('Kofi: estimates, weeks from Monday to Sunday, and 25% set aside for tax', () => {
  const plan = workOutPlan(kofiPlan());

  it('plans in weeks from Monday to Sunday (D14)', () => {
    expect(plan.mainPay).toBe('irregular');
    expect(plan.nextMainPayday).toBe('2026-11-02');
    const periods = groupIntoPeriods(plan, 'pay').accounts[0]?.periods ?? [];
    expect(periods.slice(0, 3).map((one) => [one.start, one.end])).toEqual([
      ['2026-10-26', '2026-11-01'],
      ['2026-11-02', '2026-11-08'],
      ['2026-11-09', '2026-11-15'],
    ]);
  });

  it('sets 25% of everything coming in aside to his Tax account, the same day (D64)', () => {
    const setAside = accountOf(plan).rows.filter((row) => row.kind === 'set-aside');
    expect(
      setAside.slice(0, 4).map((row) => [row.date, row.payment.name, formatPounds(row.change)]),
    ).toEqual([
      ['2026-10-28', 'Deliveries', '-36.25'],
      ['2026-10-30', 'Parcels', '-22.50'],
      ['2026-11-02', 'Rides', '-95.00'],
      ['2026-11-04', 'Deliveries', '-36.25'],
    ]);
    const intoTax = accountOf(plan, 'tax').rows.filter((row) => row.kind === 'set-aside');
    expect(intoTax.reduce((sum, row) => sum + row.change, 0)).toBe(
      -setAside.reduce((sum, row) => sum + row.change, 0),
    );
    // Every income row is an estimate, and every one has its 25% beside it.
    const income = accountOf(plan).rows.filter((row) => row.kind === 'payment' && row.change > 0);
    expect(income.every((row) => row.payment.isEstimate)).toBe(true);
    expect(income).toHaveLength(setAside.length);
  });

  it('pays his Self Assessment from the money set aside', () => {
    const tax = accountOf(plan, 'tax');
    expect(rowsOf(plan, 'tax-bill', 'tax').map((row) => row.date)).toEqual(['2027-01-29']);
    expect(tax.shortfalls).toEqual([]);
  });

  it('shows when the van finance is paid off: Thu 5 Oct 2028', () => {
    const debt = whatIf(kofiPlan(), []).real.debts.debts[0];
    expect([debt?.debt.name, debt?.paidOffOn]).toEqual(['Van finance', '2028-10-05']);
  });
});

describe('Jess and Tom: two personal accounts, a joint account and transfers between them', () => {
  const input = jessAndTomPlan();
  const plan = workOutPlan(input);
  const without = workOutPlan({
    ...input,
    series: input.series.filter((one) => one.id !== 'jess-to-joint'),
  });
  const on = (one: Plan, id: string, date: string) =>
    accountOf(one, id).days.find((day) => day.date === date)?.balance ?? Number.NaN;

  it('moves Jess’s £600 to the joint account on her payday, after her pay comes in (brief 8.5)', () => {
    expect(
      rowsOf(plan, 'jess-to-joint', 'jess')
        .slice(0, 1)
        .map((row) => [row.date, formatPounds(row.change)]),
    ).toEqual([['2026-10-28', '-600.00']]);
    expect(
      rowsOf(plan, 'jess-to-joint', 'joint')
        .slice(0, 1)
        .map((row) => [row.date, formatPounds(row.change)]),
    ).toEqual([['2026-10-28', '600.00']]);
    expect(on(without, 'jess', '2026-10-28') - on(plan, 'jess', '2026-10-28')).toBe(
      pounds('600.00'),
    );
    expect(on(plan, 'joint', '2026-10-28') - on(without, 'joint', '2026-10-28')).toBe(
      pounds('600.00'),
    );
  });

  it('leaves the total across all three accounts unchanged on every day', () => {
    const total = (one: Plan, i: number) =>
      one.accounts.reduce((sum, account) => sum + (account.days[i]?.balance ?? Number.NaN), 0);
    const days = accountOf(plan, 'jess').days.length;
    for (let i = 0; i < days; i += 1) expect(total(plan, i)).toBe(total(without, i));
    expect(accountOf(plan, 'tom').days).toEqual(accountOf(without, 'tom').days);
  });

  it('keeps the joint account above zero, with each person’s pay in their own account', () => {
    expect(accountOf(plan, 'joint').shortfalls).toEqual([]);
    expect(datesOf(plan, 'tom-pay', 'tom').slice(0, 2)).toEqual(['2026-11-13', '2026-12-15']);
    expect(datesOf(plan, 'jess-pay', 'jess').slice(0, 2)).toEqual(['2026-10-28', '2026-11-27']);
  });

  it('gives Tom his own paydays when he looks at the same plan (ARCHITECTURE.md 3.2)', () => {
    const toms = workOutPlan({ ...input, mainPayFamilyId: tomMainPay });
    expect(toms.nextMainPayday).toBe('2026-11-13');
    expect(plan.nextMainPayday).toBe('2026-10-28');
  });

  it('shows when Tom’s car loan is paid off: Mon 18 Oct 2027', () => {
    const debt = whatIf(input, []).real.debts.debts[0];
    expect([debt?.debt.belongsTo, debt?.paidOffOn]).toEqual(['tom', '2027-10-18']);
  });
});

describe('Ali: three big payments to last a term, and the overdraft as the floor', () => {
  const plan = workOutPlan(aliPlan());
  const current = accountOf(plan);

  it('shows −£300 as Tight, not Short, with the floor at −£1,000 (brief 8.5)', () => {
    expect(formatPounds(current.floor)).toBe('-1000.00');
    expect(current.days[0]).toMatchObject({ date: '2026-11-02', status: 'tight' });
    expect(formatPounds(current.start.balance)).toBe('-300.00');
    expect(current.shortfalls).toEqual([]);
    expect(current.lowestPoint.status).toBe('tight');
  });

  it('runs his plan term by term, with Left to spend until the January loan', () => {
    expect(plan.mainPaydays).toEqual(['2026-09-21', '2027-01-11', '2027-04-26']);
    expect(current.leftToSpend?.until).toBe('2027-01-11');
    const periods = groupIntoPeriods(plan, 'pay').accounts[0]?.periods ?? [];
    // The first term started on Mon 21 Sep, the last loan payday on or before today (D84).
    expect(periods.map((one) => [one.start, one.end])).toEqual([
      ['2026-09-21', '2027-01-10'],
      ['2027-01-11', '2027-04-25'],
      ['2027-04-26', '2027-05-31'],
    ]);
  });

  it('gets the termly loan and pays the termly rent', () => {
    expect(rowsOf(plan, 'student-loan').map((row) => [row.date, formatPounds(row.change)])).toEqual(
      [
        ['2027-01-11', '1610.00'],
        ['2027-04-26', '1690.00'],
      ],
    );
    expect(datesOf(plan, 'rent')).toEqual(['2027-01-15', '2027-04-30']);
  });

  it('only counts going below −£1,000 as Short', () => {
    // Books dearer by just enough to take his lowest point from Fri 20 Nov
    // on to exactly −£1,000.00 isn't short; 1p more is.
    const books = (amount: number): EditCommand => ({
      kind: 'just-this-one',
      seriesId: 'books',
      originalDate: '2026-11-20',
      edits: { amount },
    });
    const fromBooks = current.days.filter((day) => day.date >= '2026-11-20');
    const lowestFromBooks = Math.min(...fromBooks.map((day) => day.balance));
    const toFloor = pounds('45.00') + (lowestFromBooks - pounds('-1000.00'));
    const atFloor = accountOf(workOutPlan(edited(aliPlan(), books(toFloor)).after as WhatIfInput));
    expect(formatPounds(atFloor.lowestPoint.balance)).toBe('-1000.00');
    expect([atFloor.lowestPoint.status, atFloor.shortfalls]).toEqual(['tight', []]);
    const below = accountOf(
      workOutPlan(edited(aliPlan(), books(toFloor + 1)).after as WhatIfInput),
    );
    expect(below.shortfalls.map((one) => formatPounds(one.amount))).toEqual(['0.01']);
  });
});
