// A shared budget leaves on the payday of the person who added it, on both
// phones (D508), with the other person's phone given that person's paydays,
// the dates only (D512), in step 4a.
//
// Jess added the joint account's £300 food month. Her pay, monthly on the
// 28th (moved to the working day before), goes into her own account. Tom's
// phone has his own main pay, Jess's paydays as dates and nothing else of
// her pay, and must show the joint account exactly as hers does, every day
// for a year.

import { describe, expect, it } from 'vitest';
import {
  type Budget,
  editPlan,
  type OtherPaydays,
  ownPaydaysFollowed,
  type PaydaySchedule,
  type Plan,
  type PlanInput,
  type Series,
  workOutPlan,
} from '../../src/index.ts';
import { edited } from '../fixtures/edit.ts';
import { jessAndTomPlan } from '../fixtures/people.ts';
import { daysText } from '../fixtures/plan.ts';

const YEAR_ON = '2027-10-25';

/**
 * What the server gives Tom's phone of a person's main pay (D512): each
 * series of its family with only the fields that say when it comes, and
 * the paydays moved or removed. Built here from the records exactly as the
 * database builds it from its rows (supabase/migrations, `app.paydays_of`).
 */
function paydaysFrom(input: PlanInput, familyId: string, person: string): OtherPaydays {
  const series = input.series
    .filter((one) => one.familyId === familyId)
    .map((one): PaydaySchedule => {
      const changes = (input.changes ?? []).filter((change) => change.seriesId === one.id);
      const moved = changes
        .filter((change) => change.newDate !== undefined)
        .map((change) => ({ from: change.originalDate, to: change.newDate as string }));
      const skipped = changes
        .filter((change) => change.skipped === true)
        .map((change) => change.originalDate);
      return {
        id: `dates-of-${one.id}`,
        start: one.start,
        schedule: one.schedule,
        end: one.end,
        holidayRule: one.holidayRule,
        ...(one.firstNumber === undefined ? {} : { firstNumber: one.firstNumber }),
        ...(moved.length === 0 ? {} : { moved }),
        ...(skipped.length === 0 ? {} : { skipped }),
      };
    });
  return { person, series };
}

/** Jess's plan as her phone has it: her own main pay, everything she can see. */
function jessView(input: PlanInput = { ...jessAndTomPlan(), to: YEAR_ON }): PlanInput {
  return input;
}

/**
 * Tom's phone (D289, D512): his own main pay, and nothing of Jess's own
 * account or pay. Her £600 into the joint account is "From Jess", money
 * arriving on the same dates (D16). The food budget names Jess, whose
 * paydays come as dates only.
 */
function tomView(jess: PlanInput, follows = true): PlanInput {
  const { toAccountId: _to, ...fromJess } = jess.series.find(
    (one) => one.id === 'jess-to-joint',
  ) as Series;
  const series: Series[] = [
    ...jess.series.filter(
      (one) => one.accountId !== 'jess' && one.toAccountId !== 'jess' && one.id !== 'jess-to-joint',
    ),
    {
      ...fromJess,
      id: 'from-jess',
      accountId: 'joint',
      direction: 'in',
      name: 'From Jess',
      familyId: 'from-jess',
    },
  ];
  return {
    ...jess,
    accounts: jess.accounts.filter((one) => one.id !== 'jess'),
    balanceUpdates: jess.balanceUpdates.filter((one) => one.accountId !== 'jess'),
    series,
    changes: (jess.changes ?? []).filter((change) =>
      series.some((one) => one.id === change.seriesId),
    ),
    budgets: (jess.budgets ?? []).map((one) => (follows ? { ...one, followsPayOf: 'jess' } : one)),
    otherPaydays: follows ? [paydaysFrom(jess, 'jess-pay', 'jess')] : [],
    mainPayFamilyId: 'tom-pay',
  };
}

const jointDays = (plan: Plan) => daysText(plan, 'joint', '2026-10-25', YEAR_ON);

/** A day's balance in `days` with `more` whole pounds added, as daysText writes it. */
function pounds(days: ReadonlyMap<string, string>, date: string, more: number): string {
  const balance = Number((days.get(date) ?? '').replaceAll(',', ''));
  return (balance + more).toFixed(2);
}

describe('A shared budget follows the paydays of the person who added it (D508, D512)', () => {
  it("Tom's phone shows the joint account exactly as Jess's does, every day for a year", () => {
    const jess = jessView();
    const jessPlan = workOutPlan(jess);
    const tomPlan = workOutPlan(tomView(jess));
    expect(jointDays(tomPlan)).toEqual(jointDays(jessPlan));
    expect(jointDays(jessPlan)).toHaveLength(366);
    // The food month leaves on Jess's payday, Wed 28 Oct, on both phones.
    const food = tomPlan.budgets.find((one) => one.budget.id === 'food');
    expect(food?.current).toMatchObject({ start: '2026-10-28', end: '2026-11-26' });
    expect(food?.followsPaydays).toBe(true);
  });

  it('as it was before step 4a, Tom with no main pay saw a different joint account (D497)', () => {
    const jess = jessView();
    const before = workOutPlan({ ...tomView(jess, false), mainPayFamilyId: null });
    const jessDays = new Map(jointDays(workOutPlan(jess)));
    const different = jointDays(before).filter(([date, balance]) => jessDays.get(date) !== balance);
    // His food month ran from the 1st (D29), so October's month, with the
    // budget's start in it, left today: £300.00 less than on Jess's phone.
    expect(different[0]).toEqual(['2026-10-25', pounds(jessDays, '2026-10-25', -300)]);
    expect(different.length).toBeGreaterThan(100);
    // With step 4a, the same Tom with no main pay sees exactly what Jess sees.
    const now = workOutPlan({ ...tomView(jess), mainPayFamilyId: null });
    expect(jointDays(now)).toEqual([...jessDays]);
  });

  it('a payday Jess moved or removed moves the budget on both phones', () => {
    const jess = jessView({
      ...jessAndTomPlan(),
      to: YEAR_ON,
      changes: [
        { seriesId: 'jess-pay', originalDate: '2026-11-28', newDate: '2026-11-24' },
        { seriesId: 'jess-pay', originalDate: '2027-01-28', skipped: true },
      ],
    });
    const jessPlan = workOutPlan(jess);
    const tomPlan = workOutPlan(tomView(jess));
    expect(jointDays(tomPlan)).toEqual(jointDays(jessPlan));
    const months = tomPlan.budgets
      .find((one) => one.budget.id === 'food')
      ?.periods.slice(0, 3)
      .map((one) => [one.start, one.end]);
    // A removed payday isn't a payday (D81): December's month runs on to February's.
    expect(months).toEqual([
      ['2026-10-28', '2026-11-23'],
      ['2026-11-24', '2026-12-23'],
      ['2026-12-24', '2027-02-25'],
    ]);
  });

  it('a new payday from January for this and all later ones is followed on both phones', () => {
    const start = jessView();
    const { after } = edited(
      { ...start, today: '2026-12-01' },
      {
        kind: 'this-and-later',
        seriesId: 'jess-pay',
        originalDate: '2027-01-28',
        edits: { date: '2027-01-22' },
        newSeriesId: 'jess-pay-from-january',
      },
    );
    const jess = { ...after, today: '2026-10-25', to: YEAR_ON };
    expect(jess.series.filter((one) => one.familyId === 'jess-pay')).toHaveLength(2);
    expect(jointDays(workOutPlan(tomView(jess)))).toEqual(jointDays(workOutPlan(jess)));
  });

  it('changing the budget on either phone saves the same months that had ended (D152)', () => {
    const jess = { ...jessView(), today: '2026-12-01' };
    const tom = tomView(jess);
    const command = {
      kind: 'change-budget' as const,
      budgetId: 'food',
      edits: { amount: 32000 },
    };
    const fromJess = editPlan(jess, command).writes;
    const fromTom = editPlan(tom, command).writes;
    const amountsBefore = (writes: typeof fromJess) =>
      writes.flatMap((write) =>
        write.kind === 'budget' && write.value !== null ? [write.value.amountsBefore] : [],
      );
    expect(amountsBefore(fromTom)).toEqual(amountsBefore(fromJess));
    expect(amountsBefore(fromTom)).toEqual([[{ until: '2026-11-26', amount: 30000 }]]);
    // Tom's change keeps whose paydays the budget follows.
    const saved = fromTom.find((write) => write.kind === 'budget')?.value as Budget;
    expect(saved.followsPayOf).toBe('jess');
  });

  it('someone with no main pay: weeks from Monday and months from the 1st, on every phone (D29)', () => {
    const jess = jessView();
    const tom = tomView(jess);
    const plan = workOutPlan({
      ...tom,
      budgets: [
        ...(tom.budgets ?? []),
        {
          id: 'travel',
          accountId: 'joint',
          name: 'Travel',
          amount: 2500,
          every: 'week',
          leaves: 'at-start',
          rollOver: false,
          startsOn: '2026-10-25',
          createdAt: '2026-10-25T11:00:00Z',
          followsPayOf: 'someone-with-no-pay',
        },
        {
          id: 'meals',
          accountId: 'joint',
          name: 'Meals out',
          amount: 6000,
          every: 'month',
          leaves: 'at-start',
          rollOver: false,
          startsOn: '2026-10-25',
          createdAt: '2026-10-25T11:00:00Z',
          followsPayOf: 'someone-with-no-pay',
        },
      ],
    });
    const of = (id: string) => plan.budgets.find((one) => one.budget.id === id);
    expect(of('travel')?.current).toMatchObject({ start: '2026-10-19', end: '2026-10-25' });
    expect(of('meals')?.current).toMatchObject({ start: '2026-10-01', end: '2026-10-31' });
    expect(of('travel')?.followsPaydays).toBe(false);
    expect(of('meals')?.followsPaydays).toBe(false);
  });

  it("weekly pay: a weekly budget starts on the payday's weekday, a monthly one on the 1st", () => {
    const jess = jessView();
    const weekly: OtherPaydays = {
      person: 'sam',
      series: [
        {
          id: 'sam-dates',
          start: '2026-10-30',
          schedule: { kind: 'weekly', every: 1 },
          end: { kind: 'never' },
          holidayRule: 'keep',
        },
      ],
    };
    const base = jess.budgets?.[0] as Budget;
    const plan = workOutPlan({
      ...tomView(jess),
      otherPaydays: [weekly],
      budgets: [
        { ...base, id: 'week', every: 'week', followsPayOf: 'sam', startsOn: '2026-10-25' },
        { ...base, id: 'month', followsPayOf: 'sam', startsOn: '2026-10-25' },
      ],
    });
    const of = (id: string) => plan.budgets.find((one) => one.budget.id === id);
    expect(of('week')?.current).toMatchObject({ start: '2026-10-23', end: '2026-10-29' });
    expect(of('week')?.followsPaydays).toBe(true);
    expect(of('month')?.current).toMatchObject({ start: '2026-10-01', end: '2026-10-31' });
    expect(of('month')?.followsPaydays).toBe(false);
  });

  it('a pay-later card follows its bill, whoever added it', () => {
    const jess = jessView();
    const base = jess.budgets?.[0] as Budget;
    const plan = workOutPlan({
      ...tomView(jess),
      budgets: [{ ...base, leaves: 'pay-later', billDay: 29, followsPayOf: 'jess' }],
    });
    expect(plan.budgets[0]?.followsPaydays).toBe(false);
  });
});

describe("Other people's paydays are checked, and hold dates only (D512)", () => {
  const jess = jessView();
  const tom = tomView(jess);
  const refused = (input: PlanInput) => {
    try {
      workOutPlan(input);
    } catch (error) {
      return (error as { code?: string }).code;
    }
    return 'worked';
  };

  it('refuses a person given twice, no series, or a series with no id', () => {
    const given = tom.otherPaydays?.[0] as OtherPaydays;
    expect(refused({ ...tom, otherPaydays: [given, given] })).toBe('bad-paydays');
    expect(refused({ ...tom, otherPaydays: [{ person: 'jess', series: [] }] })).toBe('bad-paydays');
    expect(
      refused({
        ...tom,
        otherPaydays: [{ person: '', series: given.series }],
      }),
    ).toBe('bad-paydays');
    expect(
      refused({
        ...tom,
        otherPaydays: [{ person: 'jess', series: [{ ...given.series[0], id: '' }] }],
      } as PlanInput),
    ).toBe('bad-paydays');
  });

  it('refuses a bad date, and a budget naming nobody', () => {
    const given = tom.otherPaydays?.[0] as OtherPaydays;
    const series = given.series[0] as PaydaySchedule;
    expect(
      refused({
        ...tom,
        otherPaydays: [{ person: 'jess', series: [{ ...series, skipped: ['2026-02-30'] }] }],
      }),
    ).toBe('bad-date');
    expect(
      refused({
        ...tom,
        budgets: (tom.budgets ?? []).map((one) => ({ ...one, followsPayOf: '' })),
      }),
    ).toBe('bad-budget');
  });

  it('a payday moved and removed on the same date is one change, and not a payday', () => {
    const given = tom.otherPaydays?.[0] as OtherPaydays;
    const series = given.series[0] as PaydaySchedule;
    const plan = workOutPlan({
      ...tom,
      otherPaydays: [
        {
          person: 'jess',
          series: [
            {
              ...series,
              moved: [{ from: '2026-11-28', to: '2026-11-20' }],
              skipped: ['2026-11-28'],
            },
          ],
        },
      ],
    });
    const months = plan.budgets[0]?.periods.slice(0, 2).map((one) => [one.start, one.end]);
    expect(months).toEqual([
      ['2026-10-28', '2026-12-23'],
      ['2026-12-24', '2027-01-27'],
    ]);
  });

  it("Jess's own phone is unchanged: a budget naming nobody follows her own pay", () => {
    const plan = workOutPlan(jess);
    expect(plan.budgets[0]?.current).toMatchObject({ start: '2026-10-28', end: '2026-11-26' });
    expect(plan.budgets[0]?.followsPaydays).toBe(true);
  });
});

describe('Whether a new budget would follow your own paydays (D514)', () => {
  const jess = jessAndTomPlan();
  const of = (input: Partial<PlanInput>) =>
    ownPaydaysFollowed({ ...jess, today: '2026-10-25', ...input } as PlanInput);

  it('monthly pay: a monthly budget does, a weekly one runs from Monday', () => {
    expect(of({})).toEqual({ week: false, month: true });
  });

  it('weekly pay: a weekly budget does, a monthly one runs from the 1st', () => {
    const weekly = jess.series.map((one) =>
      one.id === 'jess-pay' ? { ...one, schedule: { kind: 'weekly' as const, every: 2 } } : one,
    );
    expect(of({ series: weekly })).toEqual({ week: true, month: false });
  });

  it('no main pay, or irregular pay: neither does', () => {
    expect(of({ mainPayFamilyId: null })).toEqual({ week: false, month: false });
    const irregular = jess.series.map((one) =>
      one.id === 'jess-pay' ? { ...one, schedule: { kind: 'irregular' as const } } : one,
    );
    expect(of({ series: irregular })).toEqual({ week: false, month: false });
  });
});
