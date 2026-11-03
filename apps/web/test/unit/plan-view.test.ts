// The Plan screen's figures for Sam's example plan on Sun 25 Oct 2026 (brief
// 4.8, the Plan sketch in ARCHITECTURE.md 4.6, brief 8.3 and 8.4, and the
// owner's step 2c tests 1 to 5), worked out exactly as the screen does.

import type { EditCommand, PlanRecords } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import { runEdit } from '../../lib/edit.ts';
import { workOutHome } from '../../lib/home.ts';
import { filtersOn, NO_FILTERS, rowMatches } from '../../lib/plan-filters.ts';
import { type PlanView, workOutPlanView } from '../../lib/plan-view.ts';

const TODAY = '2026-10-25';

const current = (view: PlanView) => {
  const account = view.accounts.find((one) => one.id === 'current');
  if (account === undefined) throw new Error('No current account.');
  return account;
};

/** Each period as [start, end, came in, left at the end]. */
const periodsOf = (view: PlanView) =>
  current(view).periods.map((period) => [
    period.start,
    period.end,
    period.cameIn,
    period.leftAtEnd,
  ]);

/** Each row as [name, change, left after, status, estimate, lowest]. */
const rowsOf = (view: PlanView, start: string) =>
  (current(view).periods.find((period) => period.start === start)?.rows ?? []).map((row) => [
    row.name,
    row.change,
    row.leftAfter,
    row.status,
    row.isEstimate,
    row.isLowest,
  ]);

function edit(records: PlanRecords, command: EditCommand): PlanRecords {
  return runEdit(records, TODAY, command).records;
}

describe('Pay periods (owner test 1)', () => {
  const view = workOutPlanView(examplePlan, TODAY, { grouping: 'pay', months: 3 });

  it('groups by Sam’s pay periods, Friday to Thursday, from today', () => {
    expect(view.grouping).toBe('pay');
    expect(periodsOf(view).slice(0, 3)).toEqual([
      ['2026-10-25', '2026-10-29', 50000, 4647],
      ['2026-10-30', '2026-11-05', 60306, 453],
      ['2026-11-06', '2026-11-12', 61846, 15569],
    ]);
  });

  it('lists every row to Thu 29 Oct with what’s left after it', () => {
    expect(rowsOf(view, '2026-10-25')).toEqual([
      ['Spending money until payday', -3000, 23754, 'ok', false, false],
      ['Family loan', -12500, 11254, 'ok', false, false],
      ['Driving lesson', -10000, 1254, 'tight', false, false],
      ['From savings', 50000, 51254, 'ok', false, false],
      ['Pay-later card', -46607, 4647, 'ok', false, false],
    ]);
  });

  it('marks the pay an estimate and Rent as the lowest point, Tight', () => {
    expect(rowsOf(view, '2026-10-30')).toEqual([
      ['Pay', 60306, 64953, 'ok', true, false],
      ['Spending money', -4500, 60453, 'ok', false, false],
      ['Rent', -60000, 453, 'tight', false, true],
    ]);
  });

  it('shows the lowest point ahead, £4.53 on Sun 1 Nov after Rent, under £20 from Mon 26 Oct', () => {
    expect(current(view).lowest).toEqual({
      balance: 453,
      date: '2026-11-01',
      after: 'Rent',
      status: 'tight',
      underWarningFrom: '2026-10-26',
      short: null,
    });
    expect(current(view).notTickedYet).toEqual([]);
  });

  it('shows whole pay periods for 3 months, to Thu 28 Jan 2027 (D183)', () => {
    expect(view.to).toBe('2027-01-28');
    expect(periodsOf(view).at(-1)?.slice(0, 2)).toEqual(['2027-01-22', '2027-01-28']);
    expect(view.canShowMore).toBe(true);
  });

  it('shows the current account first, and Savings too', () => {
    expect(view.firstAccountId).toBe('current');
    expect(view.accounts.map((one) => one.name)).toEqual(['Current account', 'Savings']);
  });
});

describe('Calendar months (owner test 2)', () => {
  it('ends Oct at £604.53, Nov at £732.91 and Dec at £1,024.60', () => {
    const view = workOutPlanView(examplePlan, TODAY, { grouping: 'months', months: 3 });
    expect(view.grouping).toBe('months');
    expect(periodsOf(view)).toEqual([
      ['2026-10-01', '2026-10-31', 110306, 60453],
      ['2026-11-01', '2026-11-30', expect.any(Number), 73291],
      ['2026-12-01', '2026-12-31', expect.any(Number), 102460],
    ]);
  });

  it('after Show another month twice, Jan ends at £2,235.89 and Feb at £3,304.87', () => {
    const view = workOutPlanView(examplePlan, TODAY, { grouping: 'months', months: 5 });
    expect(periodsOf(view).map((period) => period[3])).toEqual([
      60453, 73291, 102460, 223589, 330487,
    ]);
  });

  it('shows up to 24 months, and no more', () => {
    const view = workOutPlanView(examplePlan, TODAY, { grouping: 'months', months: 30 });
    expect(view.months).toBe(24);
    expect(view.canShowMore).toBe(false);
    expect(current(view).periods).toHaveLength(24);
    expect(view.to).toBe('2028-09-30');
  });
});

describe('Brief 8.4 test 1 through the screen (owner test 3)', () => {
  const changed = edit(examplePlan, {
    kind: 'this-and-later',
    seriesId: 'rent',
    originalDate: '2027-01-01',
    edits: { amount: 56000 },
    newSeriesId: 'rent-from-january',
  });
  const view = workOutPlanView(changed, TODAY, { grouping: 'months', months: 5 });
  const rent = current(view)
    .periods.flatMap((period) => period.rows)
    .filter((row) => row.name === 'Rent')
    .map((row) => [row.date, row.change]);

  it('makes January and February £560.00, and leaves November at £600.00 and December at £550.00', () => {
    expect(rent).toEqual([
      ['2026-11-01', -60000],
      ['2026-12-01', -55000],
      ['2027-01-01', -56000],
      ['2027-02-01', -56000],
    ]);
  });

  it('can be undone, giving back the plan exactly', () => {
    const made = runEdit(examplePlan, TODAY, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2027-01-01',
      edits: { amount: 56000 },
      newSeriesId: 'rent-from-january',
    });
    const undone = runEdit(made.records, TODAY, { kind: 'undo', edit: made.edit }).records;
    expect(workOutPlanView(undone, TODAY, { grouping: 'months', months: 5 })).toEqual(
      workOutPlanView(examplePlan, TODAY, { grouping: 'months', months: 5 }),
    );
  });
});

describe('Brief 8.4 test 3 through the screen (owner test 4)', () => {
  it('takes the Estimate label off Fri 6 Nov’s £640.00, and the period ends at £177.23', () => {
    const changed = edit(examplePlan, {
      kind: 'just-this-one',
      seriesId: 'pay',
      originalDate: '2026-11-06',
      edits: { amount: 64000, isEstimate: false },
    });
    const view = workOutPlanView(changed, TODAY, { grouping: 'pay', months: 3 });
    const pay = current(view).periods.flatMap((period) =>
      period.rows.filter((row) => row.name === 'Pay'),
    );
    expect(pay.map((row) => [row.date, row.change, row.isEstimate]).slice(0, 3)).toEqual([
      ['2026-10-30', 60306, true],
      ['2026-11-06', 64000, false],
      ['2026-11-13', 46906, true],
    ]);
    expect(periodsOf(view)[2]).toEqual(['2026-11-06', '2026-11-12', 64000, 17723]);
  });
});

describe('Move to next payday (owner test 5)', () => {
  const view = workOutPlanView(examplePlan, TODAY);
  const lesson = current(view).periods[0]?.rows.find((row) => row.name === 'Driving lesson');

  it('says the Driving lesson on Mon 26 Oct moves to Fri 30 Oct', () => {
    expect(lesson?.nextPayday).toBe('2026-10-30');
  });

  it('then Home is under £20 from Sun 1 Nov, and the lowest point is still £4.53', () => {
    const moved = edit(examplePlan, {
      kind: 'move-to-next-payday',
      seriesId: 'driving-lessons',
      originalDate: '2026-10-26',
    });
    const home = workOutHome(moved, TODAY);
    expect(home.lowest.underWarningFrom).toBe('2026-11-01');
    expect(home.lowest.balance).toBe(453);
    expect(home.lowest.date).toBe('2026-11-01');
  });
});

describe('Not ticked yet (D11)', () => {
  it('lists a payment moved to before today, not in any period', () => {
    const moved = edit(examplePlan, {
      kind: 'just-this-one',
      seriesId: 'family-loan-first',
      originalDate: '2026-10-26',
      edits: { date: '2026-10-24' },
    });
    const view = workOutPlanView(moved, TODAY);
    expect(current(view).notTickedYet.map((row) => [row.name, row.date, row.notTickedYet])).toEqual(
      [['Family loan', '2026-10-24', true]],
    );
    const names = current(view).periods[0]?.rows.map((row) => row.name);
    expect(names).not.toContain('Family loan');
  });
});

describe('A ticked payment', () => {
  it('shows as paid, on the day it was ticked (D1)', () => {
    const ticked = edit(examplePlan, {
      kind: 'tick',
      seriesId: 'family-loan-first',
      originalDate: '2026-10-26',
      tickedAt: '2026-11-03T21:00:00Z',
    });
    const view = workOutPlanView(ticked, TODAY);
    const row = current(view).periods[0]?.rows.find((one) => one.name === 'Family loan');
    expect([row?.date, row?.ticked]).toEqual(['2026-10-25', true]);
  });
});

describe('Filters only hide rows (D184)', () => {
  const view = workOutPlanView(examplePlan, TODAY);
  const first = current(view).periods[0]?.rows ?? [];
  const names = (filters: Parameters<typeof rowMatches>[1]) =>
    first.filter((row) => rowMatches(row, filters)).map((row) => row.name);

  it('shows everything with no filters', () => {
    expect(filtersOn(NO_FILTERS)).toBe(0);
    expect(names(NO_FILTERS)).toHaveLength(5);
  });

  it('shows what’s still to pay, money in, debt payments or one type', () => {
    expect(names({ show: 'still-to-pay', type: 'all' })).toEqual([
      'Spending money until payday',
      'Family loan',
      'Driving lesson',
      'Pay-later card',
    ]);
    expect(names({ show: 'money-in', type: 'all' })).toEqual(['From savings']);
    expect(names({ show: 'debts', type: 'all' })).toEqual(['Family loan', 'Pay-later card']);
    expect(names({ show: 'everything', type: 'other' })).toEqual(['Driving lesson']);
    expect(filtersOn({ show: 'debts', type: 'other' })).toBe(2);
    expect(names({ show: 'debts', type: 'other' })).toEqual([]);
  });
});
