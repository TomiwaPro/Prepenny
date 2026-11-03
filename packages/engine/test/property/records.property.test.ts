// Step 2a, the owner's test 3 (brief 5.8): undo after each command for
// adding and changing records gives back exactly the plan from before. Tried
// on every step that builds the six people's plans from empty, and on
// thousands of made-up commands on top of their plans.
//
// Also: no such command is ever refused because it would leave records the
// plan can't use (edit-breaks-plan), the plan still works out after every
// one, and making the same command again on the same records gives the same edit.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyWrites,
  type EditCommand,
  EngineInputError,
  editPlan,
  formatDate,
  NATIONS,
  PAYMENT_TYPES,
  type PlanRecords,
  parseDate,
  type Schedule,
  workOutPlan,
} from '../../src/index.ts';
import {
  allRecords,
  build,
  inputFor,
  otherPeopleSteps,
  recordsOf,
  type Step,
  samEverythingSteps,
  samSteps,
} from '../fixtures/from-empty.ts';

const at = (date: string, days: number) => formatDate(addDays(parseDate(date), days));
const two = (n: number) => (n % 60).toString().padStart(2, '0');

/** Each person's steps from empty, and the day their plan is at. */
const people: [string, Step[]][] = [
  ['Sam', samSteps()],
  ['Sam with everything', samEverythingSteps()],
  ...Object.entries(otherPeopleSteps).map(([name, { steps }]): [string, Step[]] => [name, steps()]),
];

function undone(records: PlanRecords, edit: ReturnType<typeof editPlan>, today: string) {
  const input = inputFor(records, today);
  return recordsOf(applyWrites(input, editPlan(input, { kind: 'undo', edit }).writes));
}

describe('owner test 3: undo after every command that builds the six people’s plans', () => {
  for (const [name, steps] of people) {
    it(`gives back exactly the plan from before, at every one of ${name}’s steps`, () => {
      const { history, records } = build(steps);
      expect(history).toHaveLength(steps.length);
      history.forEach(({ step, before, edit }, i) => {
        const after = i + 1 < history.length ? (history[i + 1]?.before as PlanRecords) : records;
        expect(allRecords(undone(after, edit, step.today)), `step ${i + 1}`).toEqual(
          allRecords(before),
        );
      });
    });
  }
});

const KINDS = [
  'add-account',
  'change-account',
  'close-account',
  'add-payment',
  'delete-payment',
  'link-pay',
  'add-debt',
  'change-debt',
  'close-debt',
  'add-budget',
  'change-budget',
  'end-budget',
  'add-goal',
  'change-goal',
  'close-goal',
  'add-pay-profile',
  'change-pay-profile',
  'add-pay-week',
  'change-pay-week',
  'choose-main-pay',
  'set-nation',
  'overtime',
] as const;

type Kind = (typeof KINDS)[number];

const wish = fc.record({
  kind: fc.constantFrom<Kind>(...KINDS),
  a: fc.nat(),
  b: fc.nat(),
  c: fc.nat(),
  amount: fc.integer({ min: 0, max: 150_000 }),
  days: fc.integer({ min: -5, max: 90 }),
  flag: fc.boolean(),
  other: fc.boolean(),
  text: fc.constantFrom('New', 'Renamed', '', 'A note'),
});

type Wish = typeof wish extends fc.Arbitrary<infer W> ? W : never;

function pick<T>(list: readonly T[], n: number): T | undefined {
  return list.length === 0 ? undefined : list[n % list.length];
}

const SCHEDULES: readonly Schedule[] = [
  { kind: 'once' },
  { kind: 'weekly', every: 1 },
  { kind: 'weekly', every: 2 },
  { kind: 'monthly', every: 1, on: { kind: 'day', day: 15 } },
  { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
  { kind: 'monthly', every: 3, on: { kind: 'day', day: 31 } },
  { kind: 'irregular' },
];

/** A command from a wish, about the records as they are now. Some are meant to be refused. */
function commandFor(records: PlanRecords, today: string, w: Wish, n: number): EditCommand {
  const accounts = records.accounts.map((one) => one.id);
  const series = records.series.map((one) => one.id);
  const debts = (records.debts ?? []).map((one) => one.id);
  const budgets = (records.budgets ?? []).map((one) => one.id);
  const goals = (records.goals ?? []).map((one) => one.id);
  const profiles = records.payProfiles ?? [];
  const weeks = records.payWeeks ?? [];
  const time = `${today}T23:${two(n)}:${two(w.a)}Z`;
  const account = pick(accounts, w.a) ?? 'current';
  const day = at(today, w.days);
  switch (w.kind) {
    case 'add-account':
      return {
        kind: 'add-account',
        account: {
          id: `account-${n}`,
          name: w.text,
          kind: pick(['current', 'savings', 'joint'] as const, w.b) ?? 'current',
          overdraftLimit: w.flag ? w.amount : 0,
          warningLevel: w.amount - 50_000,
        },
        balance: {
          id: `balance-${n}`,
          balance: w.amount - 20_000,
          checkedOn: today,
          checkedAt: time,
        },
      };
    case 'change-account':
      return {
        kind: 'change-account',
        accountId: account,
        edits: {
          ...(w.flag ? { name: w.text } : {}),
          ...(w.other ? { overdraftLimit: w.amount } : { warningLevel: w.amount - 10_000 }),
          ...(w.c % 3 === 0 ? { kind: 'joint' as const } : {}),
        },
      };
    case 'close-account': {
      // Half the time an account added in this run, which has nothing planned in it yet.
      const added = accounts.filter((id) => id.startsWith('account-')).at(-1);
      return { kind: 'close-account', accountId: w.flag ? (added ?? account) : account };
    }
    case 'add-payment': {
      const direction = pick(['in', 'out', 'out', 'transfer'] as const, w.b) ?? 'out';
      const to = pick(
        accounts.filter((id) => id !== account),
        w.c,
      );
      return {
        kind: 'add-payment',
        series: {
          id: `payment-${n}`,
          accountId: account,
          ...(direction === 'transfer' && to !== undefined ? { toAccountId: to } : {}),
          name: w.text === '' ? 'Payment' : w.text,
          direction: direction === 'transfer' && to === undefined ? 'out' : direction,
          amount: w.amount,
          start: day,
          schedule: pick(SCHEDULES, w.c) as Schedule,
          end: w.flag ? { kind: 'after', payments: 1 + (w.a % 6) } : { kind: 'never' },
          ...(w.other && w.a % 2 === 0 ? { lastAmount: w.amount + 100 } : {}),
          holidayRule:
            pick(['keep', 'working-day-before', 'working-day-after'] as const, w.a) ?? 'keep',
          type: pick(PAYMENT_TYPES, w.b + w.c) ?? 'other',
          ...(direction === 'out' && w.other && debts.length > 0
            ? { debtId: pick(debts, w.c) as string }
            : {}),
          ...(w.flag && w.other && goals.length > 0 ? { goalId: pick(goals, w.b) as string } : {}),
          isEstimate: w.flag,
          ...(w.text === 'A note' ? { note: w.text } : {}),
        },
        madeAt: time,
      };
    }
    case 'delete-payment':
      return { kind: 'delete-payment', seriesId: pick(series, w.a) ?? 'nothing' };
    case 'link-pay': {
      const profile = pick(profiles, w.b);
      const ofProfile = weeks
        .filter((week) => week.payProfileId === profile?.id)
        .map((week) => week.id);
      return {
        kind: 'link-pay',
        seriesId: pick(series, w.a) ?? 'nothing',
        payProfileId: w.flag || profile === undefined ? null : profile.id,
        ...(ofProfile.length > 0 && w.other
          ? {
              cyclePayWeeks: Array.from(
                { length: w.c % 2 === 0 ? 1 : 4 },
                (_, i) => ofProfile[(w.a + i) % ofProfile.length] as string,
              ),
            }
          : {}),
      };
    }
    case 'add-debt': {
      const card = w.flag;
      return {
        kind: 'add-debt',
        debt: {
          id: `debt-${n}`,
          name: w.text === '' ? 'Debt' : w.text,
          kind: card
            ? 'credit-card'
            : (pick(['loan', 'pay-later', 'owed-to-a-person'] as const, w.b) ?? 'loan'),
          currency: w.other ? 'EUR' : 'GBP',
          ...(w.other ? { rate: '1.1612' } : {}),
          balance: w.amount,
          balanceOn: today,
          balanceAt: time,
          startingBalance: w.amount + w.c,
          ...(card
            ? {
                interestRate: '24.9',
                statementDay: 1 + (w.a % 31),
                minimumRule: { kind: 'rule' as const, percent: '1', atLeast: 500 },
                ...(w.c % 2 === 0 ? { zeroInterestUntil: day } : {}),
              }
            : {}),
        },
      };
    }
    case 'change-debt':
      return {
        kind: 'change-debt',
        debtId: pick(debts, w.a) ?? 'nothing',
        edits: {
          ...(w.flag ? { name: w.text } : {}),
          startingBalance: w.amount,
          ...(w.other ? { kind: 'loan' as const } : {}),
          ...(w.c % 3 === 0 ? { interestRate: null, statementDay: null, minimumRule: null } : {}),
        },
      };
    case 'close-debt':
      return { kind: 'close-debt', debtId: pick(debts, w.a) ?? 'nothing' };
    case 'add-budget': {
      const payLater = w.c % 4 === 0;
      return {
        kind: 'add-budget',
        budget: {
          id: `budget-${n}`,
          accountId: account,
          name: w.text === '' ? 'Food' : w.text,
          amount: w.amount % 40_000,
          every: payLater || w.flag ? 'month' : 'week',
          leaves: payLater ? 'pay-later' : w.other ? 'spread' : 'at-start',
          rollOver: w.flag,
          startsOn: day,
          ...(payLater ? { billDay: 1 + (w.a % 31) } : {}),
          createdAt: time,
        },
      };
    }
    case 'change-budget':
      return {
        kind: 'change-budget',
        budgetId: pick(budgets, w.a) ?? 'nothing',
        edits: {
          ...(w.flag ? { amount: w.amount % 40_000 } : {}),
          ...(w.other ? { rollOver: w.c % 2 === 0 } : {}),
          ...(w.c % 3 === 0
            ? { leaves: w.b % 2 === 0 ? ('at-start' as const) : ('spread' as const) }
            : {}),
          ...(w.c % 5 === 0 ? { name: w.text } : {}),
        },
      };
    case 'end-budget':
      return { kind: 'end-budget', budgetId: pick(budgets, w.a) ?? 'nothing', endsOn: day };
    case 'add-goal':
      return {
        kind: 'add-goal',
        goal: {
          id: `goal-${n}`,
          name: w.text === '' ? 'Goal' : w.text,
          target: w.amount,
          ...(w.flag ? { targetDate: day } : {}),
          accountId: w.other ? '' : account,
          startingAmount: w.c % 10_000,
        },
      };
    case 'change-goal':
      return {
        kind: 'change-goal',
        goalId: pick(goals, w.a) ?? 'nothing',
        edits: {
          target: w.amount,
          ...(w.flag ? { accountId: account } : {}),
          ...(w.other ? { targetDate: null } : {}),
        },
      };
    case 'close-goal':
      return { kind: 'close-goal', goalId: pick(goals, w.a) ?? 'nothing' };
    case 'add-pay-profile': {
      const monthly = w.flag;
      return {
        kind: 'add-pay-profile',
        profile: {
          id: `profile-${n}`,
          name: w.text === '' ? 'Job' : w.text,
          frequency: monthly ? 'monthly' : 'weekly',
          taxCode: pick(['1257L', 'BR', 'S1257L', 'K475'], w.b) ?? '1257L',
          basis: w.other ? 'week-one' : 'cumulative',
          overtimeRate: '19.07',
          coveredTo: monthly
            ? {
                kind: 'day-of-month',
                day: 1 + (w.a % 28),
                ...(w.c % 2 === 0 ? { monthBefore: true } : {}),
              }
            : { kind: 'days-before', days: w.a % 10 },
        },
      };
    }
    case 'change-pay-profile':
      return {
        kind: 'change-pay-profile',
        payProfileId: pick(profiles, w.a)?.id ?? 'nothing',
        edits: {
          ...(w.flag ? { taxCode: pick(['1257L', 'BR', '1100L'], w.b) as string } : {}),
          ...(w.other ? { soFar: null } : { overtimeRate: '20.50' }),
        },
      };
    case 'add-pay-week':
      return {
        kind: 'add-pay-week',
        week: {
          id: `week-${n}`,
          name: w.text === '' ? 'Week' : w.text,
          payProfileId: pick(profiles, w.a)?.id ?? 'nothing',
          lines: [{ name: 'Basic', kind: 'basic', hours: `${w.amount % 60}`, rate: '12.71' }],
          ...(w.flag ? { fixed: [{ name: 'Shift premium', amount: w.c % 30_000 }] } : {}),
        },
      };
    case 'change-pay-week':
      return {
        kind: 'change-pay-week',
        payWeekId: pick(weeks, w.a)?.id ?? 'nothing',
        edits: {
          lines: [
            { name: 'Basic', kind: 'basic', hours: `${20 + (w.amount % 30)}`, rate: '12.71' },
          ],
          ...(w.flag
            ? { fixed: w.other ? null : [{ name: 'Premium', amount: w.c % 30_000 }] }
            : {}),
        },
      };
    case 'choose-main-pay':
      return {
        kind: 'choose-main-pay',
        familyId: w.flag ? null : (pick(records.series, w.a)?.familyId ?? null),
      };
    case 'set-nation':
      return { kind: 'set-nation', nation: pick(NATIONS, w.a) ?? 'scotland' };
    case 'overtime':
      return {
        kind: 'overtime',
        id: `overtime-${n}`,
        seriesId:
          pick(
            records.series.filter((one) => one.payProfileId !== undefined),
            w.a,
          )?.id ?? 'nothing',
        workedOn: at(today, w.days % 30),
        hours: `${1 + (w.b % 12)}`,
      };
  }
}

describe('owner test 3: undo after any made-up command on any of the six people’s plans', () => {
  const plans = people.map(([name, steps]) => ({
    name,
    records: build(steps).records,
    today: steps.at(-1)?.today as string,
  }));

  it('gives back exactly the plan from before, and never breaks the plan', () => {
    const made = new Map<Kind, number>();
    fc.assert(
      fc.property(
        fc.nat({ max: plans.length - 1 }),
        fc.array(wish, { minLength: 1, maxLength: 8 }),
        (which, wishes) => {
          const { records: start, today } = plans[which] as (typeof plans)[number];
          let records = start;
          wishes.forEach((w, n) => {
            const command = commandFor(records, today, w, n);
            const input = inputFor(records, today);
            let edit: ReturnType<typeof editPlan>;
            try {
              edit = editPlan(input, command);
            } catch (error) {
              // Refused for a reason: fine. Never because the plan would break.
              if (!(error instanceof EngineInputError)) throw error;
              expect(error.code, `${w.kind}: ${error.message}`).not.toBe('edit-breaks-plan');
              return;
            }
            made.set(w.kind, (made.get(w.kind) ?? 0) + 1);
            const after = recordsOf(applyWrites(input, edit.writes));
            // Undo gives back exactly the records from before.
            expect(allRecords(undone(after, edit, today))).toEqual(allRecords(records));
            // The same command on the same records gives the same edit.
            expect(editPlan(input, command)).toEqual(edit);
            // The plan still works out.
            workOutPlan({ ...inputFor(after, today), to: at(today, 120) });
            records = after;
          });
        },
      ),
      { numRuns: 300 },
    );
    // Every kind of command was made at least once, not only refused.
    for (const kind of KINDS) expect(made.get(kind) ?? 0, kind).toBeGreaterThan(0);
  });
});
