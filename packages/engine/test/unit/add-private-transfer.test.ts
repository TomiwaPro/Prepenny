// "Add a payment" for money between the person's private account and a
// shared one (step 3f, D16, D52, D94): two linked halves in one edit, the
// shared half named "From Jess" or "To Jess" and carrying nothing else.

import { describe, expect, it } from 'vitest';
import {
  type EditCommand,
  EngineInputError,
  editPlan,
  type NewSeries,
  type PlanInput,
  workOutGoals,
  workOutPlan,
} from '../../src/index.ts';
import { canonical, edited, halvesProblems } from '../fixtures/edit.ts';
import { noBankHolidays } from '../fixtures/holidays.ts';
import { account, accountOf, balanceUpdate, planInput, pounds } from '../fixtures/plan.ts';

const monthlyOn28th = { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } } as const;

const jess: PlanInput = planInput({
  today: '2026-10-26',
  to: '2027-03-31',
  accounts: [account('jess'), account('joint', { kind: 'joint' })],
  balanceUpdates: [
    balanceUpdate('jess', '1310.00', '2026-10-26'),
    balanceUpdate('joint', '95.00', '2026-10-26'),
  ],
  series: [],
  holidays: noBankHolidays,
});

const toJoint: NewSeries = {
  id: 'to-joint',
  accountId: 'jess',
  name: 'To the joint account',
  note: 'For the bills',
  direction: 'out',
  type: 'bills',
  amount: pounds('600.00'),
  start: '2026-10-28',
  schedule: monthlyOn28th,
  end: { kind: 'never' },
  holidayRule: 'keep',
  isEstimate: false,
};

const fromJess: EditCommand = {
  kind: 'add-payment',
  series: toJoint,
  madeAt: '2026-10-26T09:30:00Z',
  otherHalf: { id: 'from-jess', accountId: 'joint', name: 'From Jess' },
};

const endOfDay = (input: PlanInput, accountId: string, date: string) =>
  accountOf(workOutPlan(input), accountId).days.find((day) => day.date === date)?.balance;

describe("Add a payment: £600 from Jess's own account into the joint account", () => {
  const { edit, after } = edited(jess, fromJess);

  it('makes both halves in one edit: hers, and "From Jess" in the joint account with nothing else', () => {
    expect(edit.writes.map((write) => write.kind === 'series' && write.id).sort()).toEqual([
      'from-jess',
      'to-joint',
    ]);
    const shared = after.series.find((one) => one.id === 'from-jess');
    expect(shared).toEqual({
      id: 'from-jess',
      accountId: 'joint',
      name: 'From Jess',
      direction: 'in',
      type: 'bills',
      amount: pounds('600.00'),
      start: '2026-10-28',
      schedule: monthlyOn28th,
      end: { kind: 'never' },
      holidayRule: 'keep',
      isEstimate: false,
      familyId: 'from-jess',
      familyCreatedAt: '2026-10-26T09:30:00Z',
      mirrorOf: 'to-joint',
    });
    expect(halvesProblems(after, '2026-10-01', '2027-12-31')).toEqual([]);
  });

  it('lowers her account by £600 and raises the joint one by £600 on the day, the total unchanged', () => {
    expect(endOfDay(after, 'jess', '2026-10-28')).toBe(pounds('710.00'));
    expect(endOfDay(after, 'joint', '2026-10-28')).toBe(pounds('695.00'));
    expect(
      (endOfDay(after, 'jess', '2026-10-28') ?? 0) + (endOfDay(after, 'joint', '2026-10-28') ?? 0),
    ).toBe(pounds('1405.00'));
  });

  it('is undone in one step, both halves together', () => {
    const back = edited(after, { kind: 'undo', edit }).after;
    expect(canonical(back)).toEqual(canonical(jess));
  });

  it('a new amount on either half changes both (D94)', () => {
    const changed = edited(after, {
      kind: 'this-and-later',
      seriesId: 'from-jess',
      originalDate: '2026-10-28',
      edits: { amount: pounds('650.00') },
      newSeriesId: 'unused',
    }).after;
    expect(changed.series.map((one) => [one.id, one.amount]).sort()).toEqual([
      ['from-jess', pounds('650.00')],
      ['to-joint', pounds('650.00')],
    ]);
  });

  it('removing it before its first payment removes both halves', () => {
    const removed = edited(after, { kind: 'delete-payment', seriesId: 'to-joint' }).after;
    expect(removed.series).toEqual([]);
    const fromShared = edited(after, { kind: 'delete-payment', seriesId: 'from-jess' }).after;
    expect(fromShared.series).toEqual([]);
  });

  it('works the other way: "To Jess" from the joint account into hers (D52)', () => {
    const back = edited(jess, {
      kind: 'add-payment',
      series: { ...toJoint, id: 'from-joint', direction: 'in', name: 'From the joint account' },
      madeAt: '2026-10-26T09:30:00Z',
      otherHalf: { id: 'to-jess', accountId: 'joint', name: 'To Jess' },
    }).after;
    expect(back.series.find((one) => one.id === 'to-jess')?.direction).toBe('out');
    expect(endOfDay(back, 'joint', '2026-10-28')).toBe(pounds('-505.00'));
    expect(endOfDay(back, 'jess', '2026-10-28')).toBe(pounds('1910.00'));
  });
});

describe('what the other half refuses', () => {
  const refused = (command: EditCommand) => {
    try {
      editPlan(jess, command);
    } catch (error) {
      if (error instanceof EngineInputError) return error.code;
      throw error;
    }
    return 'not refused';
  };

  it('a transfer, the same account, a debt, an unknown account or no name', () => {
    expect(
      refused({
        ...fromJess,
        series: { ...toJoint, direction: 'transfer', toAccountId: 'joint' },
      } as EditCommand),
    ).toBe('bad-other-half');
    expect(
      refused({
        ...fromJess,
        otherHalf: { id: 'from-jess', accountId: 'jess', name: 'From Jess' },
      }),
    ).toBe('same-account');
    expect(
      refused({
        ...fromJess,
        otherHalf: { id: 'from-jess', accountId: 'nowhere', name: 'From Jess' },
      }),
    ).toBe('unknown-account');
    expect(
      refused({ ...fromJess, otherHalf: { id: 'from-jess', accountId: 'joint', name: ' ' } }),
    ).toBe('needs-name');
    expect(
      refused({
        ...fromJess,
        otherHalf: { id: 'to-joint', accountId: 'joint', name: 'From Jess' },
      }),
    ).not.toBe('not refused');
  });
});

describe('"From Jess" into a shared savings goal kept in the joint account (step 3g, D464)', () => {
  const withGoal: PlanInput = {
    ...jess,
    goals: [
      {
        id: 'holiday',
        name: 'Holiday',
        target: pounds('1200.00'),
        accountId: 'joint',
        startingAmount: pounds('100.00'),
      },
    ],
  };
  const intoGoal: EditCommand = {
    ...fromJess,
    otherHalf: { id: 'from-jess', accountId: 'joint', name: 'From Jess', goalId: 'holiday' },
  };

  it('puts the goal on the shared half only, which counts towards it once ticked', () => {
    const { after } = edited(withGoal, intoGoal);
    const half = after.series.find((one) => one.id === 'from-jess');
    const mine = after.series.find((one) => one.id === 'to-joint');
    expect(half?.goalId).toBe('holiday');
    expect(mine?.goalId).toBeUndefined();
    expect(halvesProblems(after, '2026-10-01', '2027-12-31')).toEqual([]);
    const ticked = edited(after, {
      kind: 'tick',
      seriesId: 'from-jess',
      originalDate: '2026-10-28',
      tickedAt: '2026-10-28T09:00:00Z',
    }).after;
    const goal = workOutGoals({
      ...ticked,
      goals: ticked.goals ?? [],
      today: '2026-10-28',
      to: '2027-03-31',
    }).goals[0];
    expect(goal?.savedSoFar).toBe(pounds('700.00'));
    expect(goal?.rows[0]?.payment.seriesId).toBe('from-jess');
  });

  it('refuses a goal kept in another account, an unknown goal and a closed one', () => {
    const refusedOn = (input: PlanInput, command: EditCommand) => {
      try {
        editPlan(input, command);
      } catch (error) {
        if (error instanceof EngineInputError) return error.code;
        throw error;
      }
      return 'not refused';
    };
    const elsewhere: PlanInput = {
      ...withGoal,
      goals: [
        { ...(withGoal.goals?.[0] as NonNullable<PlanInput['goals']>[number]), accountId: 'jess' },
      ],
    };
    expect(refusedOn(elsewhere, intoGoal)).toBe('bad-goal-link');
    expect(
      refusedOn(withGoal, {
        ...fromJess,
        otherHalf: { id: 'from-jess', accountId: 'joint', name: 'From Jess', goalId: 'nowhere' },
      }),
    ).toBe('unknown-goal');
    const closed: PlanInput = {
      ...withGoal,
      goals: [
        { ...(withGoal.goals?.[0] as NonNullable<PlanInput['goals']>[number]), closed: true },
      ],
    };
    expect(refusedOn(closed, intoGoal)).toBe('goal-closed');
  });
});
