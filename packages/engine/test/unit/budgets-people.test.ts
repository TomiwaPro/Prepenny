// Budgets, "Set aside" and savings goals for the other people (step 1e):
// owner tests 6, 7 and 8, D29, D61, D64, D108, D111, D113, D114 and D116.

import { describe, expect, it } from 'vitest';
import {
  type Budget,
  type BudgetPlan,
  balanceAtEndOf,
  type Debt,
  debtsLookAhead,
  editPlan,
  formatPounds,
  type Goal,
  type Plan,
  type PlanInput,
  type Series,
  workOutGoals,
  workOutPlan,
} from '../../src/index.ts';
import { canonical, edited, editedInTurn } from '../fixtures/edit.ts';
import { englandAndWales } from '../fixtures/holidays.ts';
import { account, accountOf, balanceUpdate, planInput, pounds } from '../fixtures/plan.ts';
import { samPlan, samSeries, samSpend, samTravel } from '../fixtures/sam.ts';
import { series } from '../fixtures/series.ts';

function budgetOf(plan: Plan, id: string): BudgetPlan {
  const found = plan.budgets.find((one) => one.budget.id === id);
  if (found === undefined) throw new Error(`No budget ${id}.`);
  return found;
}

const periodsOf = (plan: Plan, id: string, count: number) =>
  budgetOf(plan, id)
    .periods.slice(0, count)
    .map((period) => [period.start, period.end]);

function budget(fields: Partial<Budget> & Pick<Budget, 'id'>): Budget {
  return {
    accountId: 'current',
    name: 'Food',
    amount: pounds('50.00'),
    every: 'week',
    leaves: 'at-start',
    rollOver: false,
    startsOn: '2026-10-01',
    createdAt: '2026-10-01T09:00:00Z',
    ...fields,
  };
}

/** Kofi (brief Part 2): irregular pay with a weekly estimate, and a Tax account. */
const kofiWork = series({
  id: 'driving-work',
  name: 'Driving work',
  direction: 'in',
  amount: pounds('400.00'),
  start: '2026-11-02',
  schedule: { kind: 'irregular' },
  type: 'pay',
  isEstimate: true,
  setAside: { percent: '25', accountId: 'tax' },
});

/** The same, with no money set aside. */
const { setAside: _setAside, ...kofiWorkNoSetAside } = kofiWork;

function kofi(fields: Partial<PlanInput> = {}): PlanInput {
  return planInput({
    today: '2026-10-28', // a Wednesday
    to: '2026-11-30',
    accounts: [account('current'), account('tax', { kind: 'savings', warningLevel: 0 })],
    balanceUpdates: [
      balanceUpdate('current', '640.00', '2026-10-28'),
      balanceUpdate('tax', '1200.00', '2026-10-28'),
    ],
    series: [kofiWork],
    mainPayFamilyId: 'driving-work',
    ...fields,
  });
}

/** Priya (brief 8.5): £2,100 salary on the last working day, moved to the working day before. */
const priyaSalary = series({
  id: 'salary',
  name: 'Salary',
  direction: 'in',
  amount: pounds('2100.00'),
  start: '2026-10-01',
  schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
  holidayRule: 'working-day-before',
  type: 'pay',
});

function priya(today: string, salary: Series = priyaSalary): Plan {
  return workOutPlan(
    planInput({
      today,
      to: '2027-03-31',
      balanceUpdates: [balanceUpdate('current', '900.00', today)],
      series: [salary],
      mainPayFamilyId: 'salary',
      holidays: englandAndWales,
      budgets: [budget({ id: 'food', every: 'month', amount: pounds('200.00') })],
    }),
  );
}

describe('owner test 6 and D29: budget weeks and months', () => {
  it("runs Sam's weekly budgets from Friday to Thursday", () => {
    const plan = workOutPlan(samPlan({ budgets: [samTravel()] }));
    expect(periodsOf(plan, 'travel', 3)).toEqual([
      ['2026-10-23', '2026-10-29'],
      ['2026-10-30', '2026-11-05'],
      ['2026-11-06', '2026-11-12'],
    ]);
  });

  it("runs Kofi's weekly budgets from Monday to Sunday", () => {
    const plan = workOutPlan(kofi({ budgets: [budget({ id: 'fuel' })] }));
    expect(periodsOf(plan, 'fuel', 2)).toEqual([
      ['2026-10-26', '2026-11-01'],
      ['2026-11-02', '2026-11-08'],
    ]);
  });

  it("runs Priya's monthly budget from payday to the day before the next: Thu 31 Dec 2026 to Thu 28 Jan 2027", () => {
    const plan = priya('2027-01-05');
    expect(periodsOf(plan, 'food', 3)).toEqual([
      ['2026-12-31', '2027-01-28'],
      ['2027-01-29', '2027-02-25'],
      ['2027-02-26', '2027-03-30'],
    ]);
    // What's left of this month leaves today, and next month's on payday.
    const rows = accountOf(plan, 'current').rows.filter((row) => row.budgetId === 'food');
    expect(rows.map((row) => [row.date, formatPounds(row.change)])).toEqual([
      ['2027-01-05', '-200.00'],
      ['2027-01-29', '-200.00'],
      ['2027-02-26', '-200.00'],
      ['2027-03-31', '-200.00'],
    ]);
  });

  it('runs a monthly budget in whole months back from the first payday, before it (D108)', () => {
    // Priya sets up on Sun 25 Oct, with her next payday on Fri 30 Oct.
    const plan = priya('2026-10-25', { ...priyaSalary, start: '2026-10-30' });
    expect(periodsOf(plan, 'food', 2)).toEqual([
      ['2026-09-30', '2026-10-29'],
      // Mon 30 Nov is the last working day of November.
      ['2026-10-30', '2026-11-29'],
    ]);
  });

  it('runs a monthly budget in whole months on from the last payday, after it (D108)', () => {
    const plan = priya('2027-01-05', {
      ...priyaSalary,
      end: { kind: 'on', date: '2027-01-31' },
    });
    expect(periodsOf(plan, 'food', 3)).toEqual([
      ['2026-12-31', '2027-01-28'],
      // A month on from Fri 29 Jan is Sun 28 Feb, then Mon 29 Mar.
      ['2027-01-29', '2027-02-27'],
      ['2027-02-28', '2027-03-28'],
    ]);
  });

  it('runs a weekly budget from Monday for someone paid monthly', () => {
    const plan = workOutPlan(
      planInput({
        today: '2027-01-05',
        to: '2027-01-31',
        balanceUpdates: [balanceUpdate('current', '900.00', '2027-01-05')],
        series: [priyaSalary],
        mainPayFamilyId: 'salary',
        holidays: englandAndWales,
        budgets: [budget({ id: 'lunch' })],
      }),
    );
    expect(periodsOf(plan, 'lunch', 1)).toEqual([['2027-01-04', '2027-01-10']]);
  });
});

describe("D61 and D111: a pay-later card's own statement day", () => {
  const card = (fields: Partial<Budget>) =>
    workOutPlan(
      samPlan({
        budgets: [
          budget({
            id: 'card',
            every: 'month',
            leaves: 'pay-later',
            amount: pounds('100.00'),
            startsOn: '2026-11-01',
            ...fields,
          }),
        ],
      }),
    );

  it('covers spends from the day after the last statement day to this one, in the bill’s month when the statement day comes first', () => {
    // Statement day the 20th, bill on the 25th.
    const plan = card({ billDay: 25, statementDay: 20 });
    expect(
      budgetOf(plan, 'card')
        .periods.slice(0, 2)
        .map((p) => [p.start, p.end, p.bill?.date]),
    ).toEqual([
      ['2026-10-21', '2026-11-20', '2026-11-25'],
      ['2026-11-21', '2026-12-20', '2026-12-25'],
    ]);
  });

  it('takes the statement from the month before when the statement day comes after the bill day', () => {
    // Statement day the 20th, bill on the 5th of the next month.
    const plan = card({ billDay: 5, statementDay: 20 });
    expect(
      budgetOf(plan, 'card')
        .periods.slice(0, 2)
        .map((p) => [p.start, p.end, p.bill?.date]),
    ).toEqual([
      ['2026-10-21', '2026-11-20', '2026-12-05'],
      ['2026-11-21', '2026-12-20', '2027-01-05'],
    ]);
  });

  it('never ends a statement period on or after its bill date', () => {
    // Statement day the 30th, bill on the 31st: in February both fall on the 28th.
    const plan = card({ billDay: 31, statementDay: 30, startsOn: '2027-01-15' });
    expect(
      budgetOf(plan, 'card')
        .periods.slice(0, 2)
        .map((p) => [p.start, p.end, p.bill?.date]),
    ).toEqual([
      ['2026-12-31', '2027-01-30', '2027-01-31'],
      ['2027-01-31', '2027-02-27', '2027-02-28'],
    ]);
  });

  it('uses the real bill once it’s typed in, and keeps the estimate label off it', () => {
    const plan = workOutPlan(
      samPlan({
        budgets: [
          budget({
            id: 'card',
            every: 'month',
            leaves: 'pay-later',
            amount: pounds('100.00'),
            billDay: 29,
            startsOn: '2026-11-01',
          }),
        ],
        spends: [samSpend('shop', '150.00', '2026-11-10', '2026-11-10T18:00:00Z', 'card')],
        changes: [
          ...(samPlan().changes ?? []),
          {
            seriesId: 'card',
            originalDate: '2026-11-29',
            amount: pounds('142.10'),
            isEstimate: false,
          },
        ],
      }),
    );
    expect(budgetOf(plan, 'card').current?.bill).toEqual({
      originalDate: '2026-11-29',
      date: '2026-11-29',
      amount: pounds('142.10'),
      isEstimate: false,
      ticked: false,
      skipped: false,
    });
    const row = accountOf(plan, 'current').rows.find((r) => r.kind === 'bill');
    expect([row?.change, row?.payment.isEstimate]).toEqual([-14210, false]);
  });
});

describe('owner test 7 and D64: Set aside', () => {
  it("moves £100.00 to Kofi's Tax account on Mon 2 Nov, from his £400.00 estimate with 25% set aside", () => {
    const plan = workOutPlan(kofi());
    const current = accountOf(plan, 'current').rows.filter((row) => row.date === '2026-11-02');
    expect(
      current.map((row) => [row.kind, row.flow, formatPounds(row.change), row.payment.isEstimate]),
    ).toEqual([
      ['payment', 'in', '400.00', true],
      ['set-aside', 'transfer-out', '-100.00', true],
    ]);
    const tax = accountOf(plan, 'tax').rows.filter((row) => row.date === '2026-11-02');
    expect(tax.map((row) => [row.kind, row.flow, formatPounds(row.change)])).toEqual([
      ['set-aside', 'transfer-in', '100.00'],
    ]);
  });

  it('moves £109.38 when the real amount is typed as £437.50 (£109.375, rounded halves away from zero)', () => {
    const plan = workOutPlan(
      kofi({
        changes: [
          {
            seriesId: 'driving-work',
            originalDate: '2026-11-02',
            amount: pounds('437.50'),
            isEstimate: false,
          },
        ],
      }),
    );
    const tax = accountOf(plan, 'tax').rows.find((row) => row.date === '2026-11-02');
    expect([formatPounds(tax?.change ?? 0), tax?.payment.isEstimate]).toEqual(['109.38', false]);
  });

  it('goes with its payment when it is removed (D113)', () => {
    const removed = workOutPlan(
      kofi({ changes: [{ seriesId: 'driving-work', originalDate: '2026-11-02', skipped: true }] }),
    );
    expect(accountOf(removed, 'tax').rows.filter((row) => row.date === '2026-11-02')).toEqual([]);
  });

  it('is only for money coming in, to another account in the plan, above 0% and up to 100%', () => {
    const refused = (fields: Partial<Series>, code: string) =>
      expect(() => workOutPlan(kofi({ series: [{ ...kofiWork, ...fields }] }))).toThrow(
        expect.objectContaining({ code }),
      );
    refused({ direction: 'out' }, 'bad-set-aside');
    refused({ setAside: { percent: '0', accountId: 'tax' } }, 'bad-set-aside');
    refused({ setAside: { percent: '100.5', accountId: 'tax' } }, 'bad-set-aside');
    refused({ setAside: { percent: '25', accountId: 'current' } }, 'bad-set-aside');
    refused({ setAside: { percent: '25', accountId: 'nowhere' } }, 'unknown-account');
    expect(() =>
      workOutPlan(
        kofi({ series: [{ ...kofiWork, setAside: { percent: '100', accountId: 'tax' } }] }),
      ),
    ).not.toThrow();
  });
});

describe('D116: money set aside has a tick of its own', () => {
  // Kofi on Tue 3 Nov, the day after his £400.00 came in with £100.00 set aside.
  const nov3 = kofi({ today: '2026-11-03' });
  const ref = { seriesId: 'driving-work', originalDate: '2026-11-02' };
  const tickedAt = '2026-11-02T18:00:00Z';
  const onNov2 = (plan: Plan, id: string) =>
    accountOf(plan, id)
      .rows.filter((row) => row.date === '2026-11-02')
      .map((row) => [row.kind, formatPounds(row.change), row.ticked, row.notTickedYet]);
  const plan = (input: PlanInput) => workOutPlan(input);

  it('leaves the £100.00 unticked when the £400.00 is ticked: it still moves on Mon 2 Nov, and is Not ticked yet', () => {
    const { after } = edited(nov3, { kind: 'tick', ...ref, tickedAt });
    expect(after.ticks).toEqual([{ ...ref, tickedAt, paidOn: '2026-11-02' }]);
    expect(onNov2(plan(after), 'current')).toEqual([
      ['payment', '400.00', true, false],
      ['set-aside', '-100.00', false, true],
    ]);
    expect(onNov2(plan(after), 'tax')).toEqual([['set-aside', '100.00', false, true]]);
    expect(accountOf(plan(after), 'current').notTickedYet.map((row) => row.kind)).toEqual([
      'set-aside',
    ]);
  });

  it('ticks the £100.00 on its own, leaving the £400.00 Not ticked yet', () => {
    const { after } = edited(nov3, { kind: 'tick', ...ref, tickedAt, setAside: true });
    expect(after.ticks).toEqual([{ ...ref, tickedAt, paidOn: '2026-11-02', setAside: true }]);
    expect(onNov2(plan(after), 'current')).toEqual([
      ['payment', '400.00', false, true],
      ['set-aside', '-100.00', true, false],
    ]);
  });

  it('ticks both, and each moves money once', () => {
    const after = editedInTurn(nov3, [
      { kind: 'tick', ...ref, tickedAt },
      { kind: 'tick', ...ref, tickedAt, setAside: true },
    ]);
    expect(onNov2(plan(after), 'current')).toEqual([
      ['payment', '400.00', true, false],
      ['set-aside', '-100.00', true, false],
    ]);
    // £640.00 + £400.00 − £100.00, and £1,200.00 + £100.00.
    expect(formatPounds(balanceAtEndOf(accountOf(plan(after), 'current'), '2026-11-02'))).toBe(
      '940.00',
    );
    expect(formatPounds(balanceAtEndOf(accountOf(plan(after), 'tax'), '2026-11-02'))).toBe(
      '1300.00',
    );
    expect(accountOf(plan(after), 'current').notTickedYet).toEqual([]);
  });

  it('unticks the £100.00 alone, and undoes a set-aside tick in one step', () => {
    const both = editedInTurn(nov3, [
      { kind: 'tick', ...ref, tickedAt },
      { kind: 'tick', ...ref, tickedAt, setAside: true },
    ]);
    const { edit, after } = edited(both, { kind: 'untick', ...ref, setAside: true });
    expect(after.ticks).toEqual([{ ...ref, tickedAt, paidOn: '2026-11-02' }]);
    expect(canonical(edited(after, { kind: 'undo', edit }).after)).toEqual(canonical(both));
    const ticking = edited(nov3, { kind: 'tick', ...ref, tickedAt, setAside: true });
    expect(canonical(edited(ticking.after, { kind: 'undo', edit: ticking.edit }).after)).toEqual(
      canonical(nov3),
    );
  });

  it('can be ticked in the Update balance steps', () => {
    const { after } = edited(nov3, {
      kind: 'update-balance',
      update: {
        id: 'tax-3-nov',
        accountId: 'tax',
        balance: pounds('1300.00'),
        checkedOn: '2026-11-03',
        checkedAt: '2026-11-03T09:00:00Z',
      },
      ticks: [{ ...ref, tickedAt: '2026-11-03T09:00:30Z', setAside: true }],
    });
    expect(after.ticks).toEqual([
      {
        ...ref,
        tickedAt: '2026-11-03T09:00:30Z',
        paidOn: '2026-11-02',
        inBalanceUpdate: 'tax-3-nov',
        setAside: true,
      },
    ]);
    // Inside the Tax account's new balance, so it isn't counted again there.
    expect(onNov2(plan(after), 'tax')).toEqual([]);
  });

  it('moves the £100.00 when only it is ticked, even if the payment was removed (D83)', () => {
    const after = workOutPlan(
      kofi({
        today: '2026-11-03',
        changes: [{ ...ref, skipped: true }],
        ticks: [{ ...ref, tickedAt, paidOn: '2026-11-02', setAside: true }],
      }),
    );
    expect(onNov2(after, 'current')).toEqual([['set-aside', '-100.00', true, false]]);
  });

  it('moves both ticks to the new series in a split, by payment number', () => {
    const nov10 = kofi({ today: '2026-11-10' });
    const ninth = { seriesId: 'driving-work', originalDate: '2026-11-09' };
    const ticked = editedInTurn(nov10, [
      { kind: 'tick', ...ninth, tickedAt: '2026-11-09T18:00:00Z' },
      { kind: 'tick', ...ninth, tickedAt: '2026-11-09T18:05:00Z', setAside: true },
    ]);
    const { edit, after } = edited(ticked, {
      kind: 'this-and-later',
      ...ninth,
      edits: { note: 'Busy week' },
      newSeriesId: 'driving-work-2',
    });
    expect(canonical(after).ticks).toEqual([
      {
        seriesId: 'driving-work-2',
        originalDate: '2026-11-09',
        tickedAt: '2026-11-09T18:00:00Z',
        paidOn: '2026-11-09',
      },
      {
        seriesId: 'driving-work-2',
        originalDate: '2026-11-09',
        tickedAt: '2026-11-09T18:05:00Z',
        paidOn: '2026-11-09',
        setAside: true,
      },
    ]);
    expect(canonical(edited(after, { kind: 'undo', edit }).after)).toEqual(canonical(ticked));
  });

  it('refuses Remove this and later while only the £100.00 is ticked: the money really moved', () => {
    const { after } = edited(nov3, { kind: 'tick', ...ref, tickedAt, setAside: true });
    expect(() => editPlan(after, { kind: 'remove-this-and-later', ...ref })).toThrow(
      expect.objectContaining({ code: 'ticked' }),
    );
  });

  it('refuses a set-aside tick on a payment with none, a second one, and an untick with none', () => {
    const noSetAside = kofi({
      today: '2026-11-03',
      series: [kofiWorkNoSetAside],
    });
    expect(() => editPlan(noSetAside, { kind: 'tick', ...ref, tickedAt, setAside: true })).toThrow(
      expect.objectContaining({ code: 'no-set-aside' }),
    );
    const { after } = edited(nov3, { kind: 'tick', ...ref, tickedAt, setAside: true });
    expect(() => editPlan(after, { kind: 'tick', ...ref, tickedAt, setAside: true })).toThrow(
      expect.objectContaining({ code: 'already-ticked' }),
    );
    // The payment's own tick is still free.
    expect(() => editPlan(after, { kind: 'tick', ...ref, tickedAt })).not.toThrow();
    expect(() => editPlan(nov3, { kind: 'untick', ...ref, setAside: true })).toThrow(
      expect.objectContaining({ code: 'not-ticked' }),
    );
  });

  it('refuses a set-aside tick inside an Update from statement: money set aside pays no debt', () => {
    const loan: Debt[] = [
      {
        id: 'van',
        name: 'Van finance',
        kind: 'loan',
        currency: 'GBP',
        balance: pounds('5000.00'),
        balanceOn: '2026-10-28',
        balanceAt: '2026-10-28T09:00:00Z',
        startingBalance: pounds('9000.00'),
      },
    ];
    expect(() =>
      editPlan(
        { ...nov3, debts: loan },
        {
          kind: 'update-from-statement',
          debtId: 'van',
          balance: pounds('4900.00'),
          balanceOn: '2026-11-03',
          balanceAt: '2026-11-03T09:00:00Z',
          ticks: [{ ...ref, tickedAt: '2026-11-03T09:00:30Z', setAside: true }],
        },
      ),
    ).toThrow(expect.objectContaining({ code: 'not-linked' }));
  });

  it('ignores a stored set-aside tick on a series with no money set aside, like any tick with no payment (D83)', () => {
    const input = kofi({
      today: '2026-11-03',
      series: [kofiWorkNoSetAside],
      ticks: [{ ...ref, tickedAt, paidOn: '2026-11-02', setAside: true }],
    });
    expect(onNov2(workOutPlan(input), 'current')).toEqual([['payment', '400.00', false, true]]);
  });
});

describe('owner test 8: a savings goal (brief 4.7, D114)', () => {
  const holiday: Goal = {
    id: 'holiday',
    name: 'Holiday',
    target: pounds('1200.00'),
    targetDate: '2027-07-30',
    accountId: 'savings',
    startingAmount: 0,
  };
  const toHoliday = series({
    id: 'to-holiday',
    name: 'To holiday savings',
    direction: 'transfer',
    toAccountId: 'savings',
    type: 'savings',
    amount: pounds('50.00'),
    start: '2026-10-30',
    schedule: { kind: 'weekly', every: 1 },
    goalId: 'holiday',
    familyCreatedAt: '2026-10-25T10:00:00Z',
  });
  const goals = (fields: Partial<Parameters<typeof workOutGoals>[0]> = {}) =>
    workOutGoals({
      goals: [holiday],
      series: [...samSeries, toHoliday],
      holidays: englandAndWales,
      today: '2026-10-25',
      to: debtsLookAhead('2026-10-25'),
      ...fields,
    });

  it('is reached on Fri 9 Apr 2027, with the 24th move of £50.00 from Fri 30 Oct', () => {
    const plan = goals().goals[0];
    expect([plan?.reachedOn, plan?.reachedWith, plan?.byTargetDate]).toEqual([
      '2027-04-09',
      24,
      true,
    ]);
    expect(plan?.rows[23]).toMatchObject({ date: '2027-04-09', savedAfter: pounds('1200.00') });
  });

  it('has nothing saved so far until a move is ticked, and 0% saved', () => {
    expect(goals().goals[0]).toMatchObject({
      savedSoFar: 0,
      leftToSave: pounds('1200.00'),
      percentSaved: 0,
      reachedNow: false,
    });
  });

  it('counts ticked moves as saved so far, and a move not ticked yet on today', () => {
    const plan = goals({
      today: '2026-11-08',
      ticks: [
        {
          seriesId: 'to-holiday',
          originalDate: '2026-10-30',
          tickedAt: '2026-10-30T18:00:00Z',
          paidOn: '2026-10-30',
        },
      ],
    }).goals[0];
    expect([plan?.savedSoFar, plan?.percentSaved]).toEqual([pounds('50.00'), 4]);
    // Fri 6 Nov isn't ticked by Sun 8 Nov, so it counts on Sun 8 Nov.
    expect(plan?.rows.slice(0, 2).map((row) => [row.date, row.ticked])).toEqual([
      ['2026-10-30', true],
      ['2026-11-08', false],
    ]);
    // Still reached with the 24th move, on Fri 9 Apr.
    expect(plan?.reachedOn).toBe('2027-04-09');
  });

  it('is not reached by the target date with only £20.00 a week', () => {
    const plan = goals({ series: [...samSeries, { ...toHoliday, amount: pounds('20.00') }] })
      .goals[0];
    // 60 moves: Fri 30 Oct 2026 + 59 weeks is Fri 17 Dec 2027.
    expect([plan?.reachedOn, plan?.reachedWith, plan?.byTargetDate]).toEqual([
      '2027-12-17',
      60,
      false,
    ]);
  });

  it('is reached already when the starting amount is enough, and 100% only then', () => {
    expect(
      goals({ goals: [{ ...holiday, startingAmount: pounds('1200.00') }] }).goals[0],
    ).toMatchObject({
      reachedNow: true,
      reachedOn: null,
      percentSaved: 100,
    });
    expect(
      goals({ goals: [{ ...holiday, startingAmount: pounds('1199.99') }] }).goals[0]?.percentSaved,
    ).toBe(99);
  });

  it('takes money moved out of the goal’s account off it', () => {
    const spendingIt = series({
      id: 'holiday-spending',
      direction: 'transfer',
      accountId: 'savings',
      toAccountId: 'current',
      amount: pounds('100.00'),
      start: '2027-01-08',
      schedule: { kind: 'once' },
      goalId: 'holiday',
    });
    const plan = goals({ series: [...samSeries, toHoliday, spendingIt] }).goals[0];
    // Two more Fridays to make up the £100.00: Fri 23 Apr.
    expect([plan?.reachedOn, plan?.reachedWith]).toEqual(['2027-04-23', 27]);
  });

  it('refuses a link to a goal that isn’t there, or that doesn’t move money into or out of its account', () => {
    expect(() => goals({ goals: [] })).toThrow(expect.objectContaining({ code: 'unknown-goal' }));
    const { toAccountId: _, ...notATransfer } = toHoliday;
    // Money coming straight into the savings account counts towards it.
    expect(() =>
      goals({
        series: [...samSeries, { ...notATransfer, accountId: 'savings', direction: 'in' }],
      }),
    ).not.toThrow();
    // Money going out of the current account doesn't touch the goal's account.
    expect(() => goals({ series: [...samSeries, { ...notATransfer, direction: 'out' }] })).toThrow(
      expect.objectContaining({ code: 'bad-goal-link' }),
    );
  });

  it('checks the goal links in the plan too, when the goals are given', () => {
    expect(() => workOutPlan(samPlan({ series: [...samSeries, toHoliday], goals: [] }))).toThrow(
      expect.objectContaining({ code: 'unknown-goal' }),
    );
    expect(() =>
      workOutPlan(samPlan({ series: [...samSeries, toHoliday], goals: [holiday] })),
    ).not.toThrow();
  });
});
