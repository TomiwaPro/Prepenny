// A private transfer is stored as two linked halves (ARCHITECTURE.md 3.6,
// D16): money going out of Jess's own account, and "From Jess" arriving in
// the joint account. Every edit keeps both halves in step (D94).

import { describe, expect, it } from 'vitest';
import {
  type EditCommand,
  type EditInput,
  EngineInputError,
  editPlan,
  type PlanInput,
  workOutPlan,
} from '../../src/index.ts';
import { canonical, edited, halvesProblems, paymentsOfSeries } from '../fixtures/edit.ts';
import { noBankHolidays } from '../fixtures/holidays.ts';
import { account, accountOf, balanceUpdate, planInput, pounds } from '../fixtures/plan.ts';
import { series } from '../fixtures/series.ts';

const monthlyOn28th = { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } } as const;

const jessPay = series({
  id: 'jess-pay',
  accountId: 'jess',
  name: 'Pay',
  direction: 'in',
  type: 'pay',
  amount: pounds('2100.00'),
  start: '2026-10-28',
  schedule: monthlyOn28th,
});
const privateHalf = series({
  id: 'to-joint',
  accountId: 'jess',
  name: 'To the joint account',
  note: 'For the bills',
  type: 'bills',
  amount: pounds('600.00'),
  start: '2026-10-28',
  schedule: monthlyOn28th,
});
const sharedHalf = series({
  id: 'from-jess',
  accountId: 'joint',
  name: 'From Jess',
  direction: 'in',
  type: 'bills',
  amount: pounds('600.00'),
  start: '2026-10-28',
  schedule: monthlyOn28th,
  mirrorOf: 'to-joint',
});
const jointBills = series({
  id: 'joint-bills',
  accountId: 'joint',
  name: 'Bills',
  type: 'bills',
  amount: pounds('450.00'),
  start: '2026-11-01',
  schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
});

const jess: PlanInput = planInput({
  today: '2026-10-26',
  to: '2027-03-31',
  accounts: [account('jess'), account('joint', { kind: 'joint' })],
  balanceUpdates: [
    balanceUpdate('jess', '310.00', '2026-10-26'),
    balanceUpdate('joint', '95.00', '2026-10-26'),
  ],
  series: [jessPay, privateHalf, sharedHalf, jointBills],
  mainPayFamilyId: 'jess-pay',
  holidays: noBankHolidays,
});

const problems = (input: EditInput) => halvesProblems(input, '2026-10-01', '2027-12-31');

// Every kind of edit, on one half or the other, made one after another.
const steps: [string, EditCommand][] = [
  [
    'just this one, a new amount, on the private half',
    {
      kind: 'just-this-one',
      seriesId: 'to-joint',
      originalDate: '2026-11-28',
      edits: { amount: pounds('650.00'), note: 'Extra for the boiler' },
    },
  ],
  [
    'just this one, an estimate, on the shared half',
    {
      kind: 'just-this-one',
      seriesId: 'from-jess',
      originalDate: '2026-12-28',
      edits: { amount: pounds('620.00'), isEstimate: true },
    },
  ],
  [
    'move, on the private half',
    { kind: 'move', seriesId: 'to-joint', originalDate: '2026-11-28', date: '2026-11-27' },
  ],
  [
    'move to next payday, on the shared half',
    { kind: 'move-to-next-payday', seriesId: 'from-jess', originalDate: '2027-01-28' },
  ],
  [
    'remove this one, on the shared half',
    { kind: 'remove-this-one', seriesId: 'from-jess', originalDate: '2027-02-28' },
  ],
  [
    'tick, on the private half, paid early',
    {
      kind: 'tick',
      seriesId: 'to-joint',
      originalDate: '2026-10-28',
      tickedAt: '2026-10-26T10:00:00Z',
    },
  ],
  [
    'this and all later ones, a split, on the private half',
    {
      kind: 'this-and-later',
      seriesId: 'to-joint',
      originalDate: '2026-12-28',
      edits: { amount: pounds('700.00'), name: 'To our account' },
      newSeriesId: 'to-joint-from-dec',
      newOtherHalfSeriesId: 'from-jess-from-dec',
    },
  ],
  [
    'this and all later ones, a new date, on the shared half',
    {
      kind: 'this-and-later',
      seriesId: 'from-jess-from-dec',
      originalDate: '2027-03-28',
      edits: {
        date: '2027-03-27',
        schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 27 } },
      },
      newSeriesId: 'from-jess-from-mar',
      newOtherHalfSeriesId: 'to-joint-from-mar',
    },
  ],
  [
    'this and all later ones, on the first payment, which reaches the whole family',
    {
      kind: 'this-and-later',
      seriesId: 'from-jess',
      originalDate: '2026-10-28',
      edits: { isEstimate: true },
      newSeriesId: 'unused',
    },
  ],
  [
    'untick, on the shared half',
    { kind: 'untick', seriesId: 'from-jess', originalDate: '2026-10-28' },
  ],
  [
    'a balance update, with a tick made in its steps',
    {
      kind: 'update-balance',
      update: {
        id: 'jess-26-oct-later',
        accountId: 'jess',
        balance: pounds('300.00'),
        checkedOn: '2026-10-26',
        checkedAt: '2026-10-26T18:00:00Z',
      },
      ticks: [
        { seriesId: 'to-joint', originalDate: '2026-10-28', tickedAt: '2026-10-26T18:01:00Z' },
      ],
    },
  ],
  [
    'remove this and later, on the shared half',
    { kind: 'remove-this-and-later', seriesId: 'from-jess-from-dec', originalDate: '2027-02-28' },
  ],
];

describe('test 6: the two halves of a private transfer still match after every kind of edit', () => {
  it('starts in step, and the check finds halves that are not', () => {
    expect(problems(jess)).toEqual([]);
    const outOfStep = {
      ...jess,
      series: jess.series.map((one) => (one.id === 'from-jess' ? { ...one, amount: 1 } : one)),
    };
    expect(problems(outOfStep)).not.toEqual([]);
  });

  let input: PlanInput = jess;
  for (const [what, command] of steps) {
    it(`matches after ${what}, and its undo puts both halves back`, () => {
      const { edit, after } = edited(input, command);
      expect(edit.writes.length).toBeGreaterThan(0);
      expect(problems(after)).toEqual([]);
      const back = edited(after, { kind: 'undo', edit }).after;
      expect(canonical(back)).toEqual(canonical(input));
      expect(problems(back)).toEqual([]);
      input = after;
    });
  }

  it('changes the money on both sides, and the joint account sees only "From Jess"', () => {
    const plan = workOutPlan(input);
    const fromJess = accountOf(plan, 'joint').rows.filter((row) => row.flow === 'in');
    expect(fromJess.length).toBeGreaterThan(0);
    expect(
      fromJess.every((row) => row.payment.name === 'From Jess' && row.payment.note === null),
    ).toBe(true);
    // The 28 Oct transfer was ticked inside Jess's balance update, so it's
    // inside her balance but still comes off the joint one (D83). The rest match.
    const unticked = (id: string) =>
      accountOf(plan, id)
        .rows.filter((row) => row.payment.type === 'bills' && row.flow !== 'out' && !row.ticked)
        .map((row) => [row.date, row.change]);
    const outOfJess = accountOf(plan, 'jess')
      .rows.filter((row) => row.payment.type === 'bills' && !row.ticked)
      .map((row) => [row.date, -row.change]);
    expect(outOfJess).toEqual(unticked('joint'));
    expect(outOfJess.length).toBeGreaterThan(2);
  });
});

describe('what a private transfer refuses', () => {
  it('refuses a name or note for the shared half, which has none of its own (D16)', () => {
    for (const command of [
      {
        kind: 'just-this-one',
        seriesId: 'from-jess',
        originalDate: '2026-11-28',
        edits: { name: 'Rent money' },
      },
      {
        kind: 'this-and-later',
        seriesId: 'from-jess',
        originalDate: '2026-11-28',
        edits: { note: 'Rent money' },
        newSeriesId: 'a',
        newOtherHalfSeriesId: 'b',
      },
    ] satisfies EditCommand[]) {
      expect(() => editPlan(jess, command)).toThrow(
        expect.objectContaining({ code: 'shared-half' }),
      );
    }
  });

  it('needs a second new id to split both halves, and two different ones', () => {
    const split = {
      kind: 'this-and-later',
      seriesId: 'to-joint',
      originalDate: '2026-11-28',
      edits: { amount: 1 },
      newSeriesId: 'a',
    } as const;
    expect(() => editPlan(jess, split)).toThrow(expect.objectContaining({ code: 'needs-id' }));
    expect(() => editPlan(jess, { ...split, newOtherHalfSeriesId: 'a' })).toThrow(
      expect.objectContaining({ code: 'id-taken' }),
    );
  });

  it('refuses to change halves that no longer match', () => {
    const shorter = {
      ...jess,
      series: jess.series.map((one) =>
        one.id === 'from-jess' ? { ...one, end: { kind: 'after', payments: 1 } as const } : one,
      ),
    };
    let error: unknown;
    try {
      editPlan(shorter, {
        kind: 'remove-this-one',
        seriesId: 'to-joint',
        originalDate: '2026-12-28',
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EngineInputError);
    expect((error as EngineInputError).code).toBe('halves-out-of-step');
    expect(paymentsOfSeries(shorter, 'from-jess', '2026-10-01', '2027-12-31')).toHaveLength(1);
  });
});
