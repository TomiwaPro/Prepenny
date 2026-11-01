// Property tests (fast-check) for budgets (step 1e): rules that must hold
// for thousands of made-up budgets, spends, balance updates and main pays.
//
// - The end balance is the start plus every row, budget rows and spends
//   included (brief 5.8).
// - A budget's periods follow on with no gaps, and each period's budget,
//   spent and left add up: left = max(0, budget − spent) (D2, D30).
// - From this period on, what's left leaves in full: as one row, or spread
//   in equal days rounded down with the pennies over on the last (D2, D31).
// - Every spend recorded after the update is a row on its day, and none
//   recorded at or before it is (D2, D33).
// - A pay-later bill is the budget, or what was spent if that's more (D32).
// - Left to spend follows D28, and its line follows D117 and D118.
// - The plan is the same whatever order the records come in.
// - "I spent", changing and removing a spend, and ticking, changing, moving
//   or removing a pay-later bill are each undone exactly (D111, D115), and
//   "I spent" refuses a day after today (D119).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyWrites,
  type Budget,
  dayFromParts,
  type EditCommand,
  type EditInput,
  editPlan,
  formatDate,
  type Plan,
  type PlanInput,
  parseDate,
  type Series,
  type Spend,
  workOutPlan,
} from '../../src/index.ts';
import { canonical } from '../fixtures/edit.ts';
import { englandAndWales } from '../fixtures/holidays.ts';

const at = (date: string, days: number) => formatDate(addDays(parseDate(date), days));
const two = (n: number) => n.toString().padStart(2, '0');
const timeOn = (date: string, minute: number) =>
  `${date}T${two(Math.floor(minute / 60) % 24)}:${two(minute % 60)}:00Z`;

const budgetWish = fc.record({
  amount: fc.integer({ min: 0, max: 50_000 }),
  monthly: fc.boolean(),
  leaves: fc.constantFrom('at-start', 'spread', 'pay-later'),
  rollOver: fc.boolean(),
  rollOverFrom: fc.option(fc.integer({ min: -60, max: 10 })),
  startsOffset: fc.integer({ min: -70, max: 20 }),
  endsAfter: fc.option(fc.integer({ min: 0, max: 120 })),
  billDay: fc.integer({ min: 1, max: 31 }),
  statementDay: fc.option(fc.integer({ min: 1, max: 31 })),
  createdMinute: fc.integer({ min: 0, max: 5 }),
  savings: fc.boolean(),
});

const spendWish = fc.record({
  budget: fc.nat(),
  amount: fc.integer({ min: 1, max: 9_000 }),
  daysFromToday: fc.integer({ min: -60, max: 40 }),
  minutesFromUpdate: fc.integer({ min: -3000, max: 3000 }),
});

const wishes = fc.record({
  today: fc.integer({ min: dayFromParts(2026, 1, 1), max: dayFromParts(2027, 12, 31) }),
  balanceDaysAgo: fc.integer({ min: 0, max: 20 }),
  updateMinute: fc.integer({ min: 0, max: 1439 }),
  balance: fc.integer({ min: -50_000, max: 200_000 }),
  pay: fc.constantFrom('none', 'weekly', 'fortnightly', 'monthly', 'last-working-day', 'irregular'),
  payOffset: fc.integer({ min: -40, max: 30 }),
  spending: fc.option(fc.integer({ min: 0, max: 8_000 })),
  length: fc.integer({ min: 0, max: 120 }),
  budgets: fc.array(budgetWish, { minLength: 1, maxLength: 3 }),
  spends: fc.array(spendWish, { maxLength: 10 }),
});

type Wishes = typeof wishes extends fc.Arbitrary<infer T> ? T : never;

function build(wish: Wishes): PlanInput {
  const today = formatDate(wish.today);
  const balanceOn = at(today, -wish.balanceDaysAgo);
  const checkedAt = timeOn(balanceOn, wish.updateMinute);
  const base = {
    accountId: 'current',
    holidayRule: 'working-day-before',
    end: { kind: 'never' },
    isEstimate: false,
  } as const;
  const series: Series[] = [];
  const payStart = at(today, wish.payOffset);
  if (wish.pay !== 'none') {
    const schedule: Series['schedule'] =
      wish.pay === 'weekly'
        ? { kind: 'weekly', every: 1 }
        : wish.pay === 'fortnightly'
          ? { kind: 'weekly', every: 2 }
          : wish.pay === 'monthly'
            ? { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } }
            : wish.pay === 'last-working-day'
              ? { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } }
              : { kind: 'irregular' };
    series.push({
      ...base,
      id: 'pay',
      name: 'Pay',
      direction: 'in',
      type: 'pay',
      amount: 60_000,
      start: payStart,
      schedule,
      familyId: 'pay',
      familyCreatedAt: '2026-01-01T00:00:00Z',
    });
  }
  if (wish.spending !== null) {
    series.push({
      ...base,
      id: 'spending',
      name: 'Spending money',
      direction: 'out',
      type: 'spending-money',
      amount: wish.spending,
      start: at(today, -3),
      schedule: { kind: 'weekly', every: 1 },
      familyId: 'spending',
      familyCreatedAt: '2026-01-01T00:01:00Z',
    });
  }
  const budgets: Budget[] = wish.budgets.map((b, i) => {
    const startsOn = at(today, b.startsOffset);
    return {
      id: `budget-${i}`,
      accountId: b.savings ? 'savings' : 'current',
      name: 'Budget',
      amount: b.amount,
      every: b.leaves === 'pay-later' || b.monthly ? 'month' : 'week',
      leaves: b.leaves as Budget['leaves'],
      rollOver: b.rollOver,
      ...(b.rollOverFrom === null ? {} : { rollOverFrom: at(today, b.rollOverFrom) }),
      startsOn,
      ...(b.endsAfter === null ? {} : { endsOn: at(startsOn, b.endsAfter) }),
      ...(b.leaves === 'pay-later'
        ? {
            billDay: b.billDay,
            ...(b.statementDay === null ? {} : { statementDay: b.statementDay }),
          }
        : {}),
      createdAt: `2026-01-01T00:0${b.createdMinute}:00Z`,
    };
  });
  const spends: Spend[] = wish.spends.map((s, i) => {
    const minutes = parseDate(balanceOn) * 1440 + wish.updateMinute + s.minutesFromUpdate;
    const day = formatDate(Math.floor(minutes / 1440));
    return {
      id: `spend-${i}`,
      budgetId: `budget-${s.budget % budgets.length}`,
      amount: s.amount,
      spentOn: at(today, s.daysFromToday),
      recordedAt: timeOn(day, ((minutes % 1440) + 1440) % 1440),
    };
  });
  return {
    accounts: [
      { id: 'current', kind: 'current', overdraftLimit: 0, warningLevel: 2000 },
      { id: 'savings', kind: 'savings', overdraftLimit: 0, warningLevel: 0 },
    ],
    balanceUpdates: [
      {
        id: 'u-current',
        accountId: 'current',
        balance: wish.balance,
        checkedOn: balanceOn,
        checkedAt,
      },
      { id: 'u-savings', accountId: 'savings', balance: 10_000, checkedOn: balanceOn, checkedAt },
    ],
    series,
    changes: [],
    ticks: [],
    budgets,
    spends,
    mainPayFamilyId: wish.pay === 'none' ? null : 'pay',
    holidays: englandAndWales,
    today,
    to: at(today, wish.length),
  };
}

function checkPlan(input: PlanInput, plan: Plan): void {
  const today = input.today;
  const checkedAt = input.balanceUpdates[0]?.checkedAt as string;

  // The end balance is the start plus every row (brief 5.8).
  for (const account of plan.accounts) {
    const total = account.rows.reduce((sum, row) => sum + row.change, account.start.balance);
    expect(account.days.at(-1)?.balance).toBe(total);
  }

  for (const budgetPlan of plan.budgets) {
    const { budget, periods, current } = budgetPlan;
    expect(current).toEqual(periods[0] ?? null);
    const rows = (plan.accounts.find((a) => a.account.id === budget.accountId)?.rows ?? []).filter(
      (row) => row.budgetId === budget.id,
    );
    periods.forEach((period, i) => {
      // No gaps, and the sums add up (D2, D30).
      if (i > 0) expect(period.start).toBe(at(periods[i - 1]?.end as string, 1));
      expect(period.end >= period.start).toBe(true);
      expect(period.amount).toBe(period.base + period.rolledOver);
      expect(period.left).toBe(Math.max(0, period.amount - period.spent));
      // Only an ended period rolls over, so nothing rolls into a period after this one.
      if (i > 0) expect(period.rolledOver).toBe(0);
      if (!budget.rollOver) expect(period.rolledOver).toBe(0);

      if (budget.leaves === 'pay-later') {
        // A bill is the budget, or what was spent if that's more, until the
        // real one is typed in (D32).
        const real = (input.changes ?? []).find(
          (c) => c.seriesId === budget.id && c.originalDate === period.bill?.originalDate,
        );
        expect(period.bill?.amount).toBe(real?.amount ?? Math.max(period.amount, period.spent));
        expect(period.bill?.isEstimate).toBe(real?.isEstimate ?? true);
        expect(period.bill !== null && period.bill.originalDate > period.end).toBe(true);
        return;
      }
      // What's left leaves in full from today, or from the period's first day (D2, D31).
      const first = [period.start, today].sort()[1] as string;
      const leaving = rows.filter(
        (row) => row.kind === 'budget' && row.date >= period.start && row.date <= period.end,
      );
      if (period.end <= input.to) {
        expect(leaving.reduce((sum, row) => sum - row.change, 0)).toBe(period.left);
      }
      for (const row of leaving) expect(row.date >= first).toBe(true);
      if (budget.leaves === 'at-start') {
        expect(leaving.length).toBeLessThanOrEqual(1);
        if (leaving[0] !== undefined) expect(leaving[0].date).toBe(first);
      } else {
        const days = parseDate(period.end) - parseDate(first) + 1;
        expect(period.perDay).toBe(Math.floor(period.left / days));
        for (const row of leaving) {
          const expected =
            row.date === period.end
              ? period.left - (period.perDay as number) * (days - 1)
              : period.perDay;
          expect(0 - row.change).toBe(expected);
        }
      }
    });
    // No budget rows outside the periods from this one on.
    for (const row of rows.filter((r) => r.kind === 'budget')) {
      expect(row.date >= today).toBe(true);
      expect(periods.some((p) => row.date >= p.start && row.date <= p.end)).toBe(true);
    }
    // Every spend recorded after the update is a row on its day; none before it (D2, D33).
    const expectedSpends = (input.spends ?? []).filter(
      (s) =>
        s.budgetId === budget.id &&
        budget.leaves !== 'pay-later' &&
        s.recordedAt > checkedAt &&
        s.spentOn <= input.to,
    );
    const spendRows = rows.filter((row) => row.kind === 'spend');
    expect(spendRows.map((row) => row.spendId).sort()).toEqual(
      expectedSpends.map((s) => s.id).sort(),
    );
    for (const row of spendRows) {
      const spend = expectedSpends.find((s) => s.id === row.spendId) as Spend;
      expect([row.date, 0 - row.change, row.notTickedYet]).toEqual([
        spend.spentOn,
        spend.amount,
        false,
      ]);
    }
  }

  // Left to spend (D3, D28): budget rows and Spending money from today to the day before payday.
  for (const account of plan.accounts) {
    const left = account.leftToSpend;
    if (plan.nextMainPayday === null) {
      expect(left).toBeNull();
      continue;
    }
    if (left === null) throw new Error('Left to spend is missing.');
    const last = [at(plan.nextMainPayday, -1), input.to].sort()[0] as string;
    const spending = account.rows.filter(
      (row) =>
        row.date >= today &&
        row.date <= last &&
        (row.kind === 'budget' ||
          (row.kind === 'payment' && row.payment.type === 'spending-money' && !row.ticked)),
    );
    expect(left.amount).toBe(spending.reduce((sum, row) => sum - row.change, 0));
    const window = account.days.filter((day) => day.date >= today && day.date <= last);
    expect(left.lowest.balance).toBe(Math.min(...window.map((day) => day.balance)));
    // The line (D117, D118): for each day, its end balance + the spending
    // money due by then − the warning level. Under 0 on any day means even
    // spending nothing goes under, from the first such day.
    const warning = account.account.warningLevel;
    const rooms = window.map((day) => {
      const dueBy = spending
        .filter((row) => row.date <= day.date)
        .reduce((sum, row) => sum - row.change, 0);
      return { date: day.date, room: day.balance + dueBy - warning };
    });
    const needsLine = left.lowest.balance < warning;
    const firstUnder = rooms.find((one) => one.room < 0)?.date ?? null;
    expect(left.underEvenSpendingNothing).toBe(needsLine ? firstUnder : null);
    expect(left.spendNoMoreThan).toBe(
      needsLine && firstUnder === null
        ? Math.max(0, Math.min(...rooms.map((one) => one.room)))
        : null,
    );
  }
}

describe('budgets hold for any budgets, spends, balance updates and main pay', () => {
  it('keeps every row, period, bill and Left to spend consistent, whatever the order of the records', () => {
    let rows = 0;
    let rolled = 0;
    let bills = 0;
    fc.assert(
      fc.property(wishes, (wish) => {
        const input = build(wish);
        const plan = workOutPlan(input);
        checkPlan(input, plan);
        rows += plan.accounts.flatMap((a) => a.rows).filter((r) => r.budgetId !== null).length;
        rolled += plan.budgets.filter((b) => (b.current?.rolledOver ?? 0) > 0).length;
        bills += plan.budgets.filter((b) => b.current?.bill != null).length;

        const reversed = workOutPlan({
          ...input,
          series: [...input.series].reverse(),
          budgets: [...(input.budgets ?? [])].reverse(),
          spends: [...(input.spends ?? [])].reverse(),
        });
        // The pay-later lines come in the order the budgets were given, as the budgets do.
        const sameOrder = (accounts: Plan['accounts']) =>
          accounts.map((a) => ({
            ...a,
            leftToSpend:
              a.leftToSpend === null
                ? null
                : {
                    ...a.leftToSpend,
                    payLater: [...a.leftToSpend.payLater].sort((x, y) =>
                      x.budgetId < y.budgetId ? -1 : 1,
                    ),
                  },
          }));
        expect(sameOrder(reversed.accounts)).toEqual(sameOrder(plan.accounts));
        expect([...reversed.budgets].reverse()).toEqual(plan.budgets);
      }),
      { numRuns: 1000 },
    );
    // Enough of each for this to mean something.
    expect(rows).toBeGreaterThan(2000);
    expect(rolled).toBeGreaterThan(50);
    expect(bills).toBeGreaterThan(200);
  });

  it('undoes "I spent", spends changed and removed, and edits to pay-later bills exactly (D111, D115)', () => {
    const commandWish = fc.record({
      kind: fc.constantFrom(
        'spend',
        'change-spend',
        'remove-spend',
        'tick-bill',
        'real-bill',
        'move-bill',
        'remove-bill',
      ),
      which: fc.nat(),
      amount: fc.integer({ min: 1, max: 5_000 }),
      days: fc.integer({ min: -10, max: 10 }),
    });
    fc.assert(
      fc.property(
        wishes,
        fc.array(commandWish, { minLength: 1, maxLength: 4 }),
        (wish, commandWishes) => {
          let records: EditInput = build(wish);
          for (const [i, c] of commandWishes.entries()) {
            const spends = records.spends ?? [];
            const existing = spends[c.which % Math.max(1, spends.length)];
            let command: EditCommand;
            // A pay-later bill in the plan, ticked, given its real amount, moved or removed (D111).
            const bills = workOutPlan(records as PlanInput).budgets.flatMap((b) =>
              b.periods.flatMap((p) =>
                p.bill === null || p.bill.skipped
                  ? []
                  : [{ seriesId: b.budget.id, originalDate: p.bill.originalDate, bill: p.bill }],
              ),
            );
            const bill = bills[c.which % Math.max(1, bills.length)];
            if (c.kind.endsWith('-bill') && bill !== undefined) {
              const ref = { seriesId: bill.seriesId, originalDate: bill.originalDate };
              command =
                c.kind === 'tick-bill'
                  ? bill.bill.ticked
                    ? { kind: 'untick', ...ref }
                    : { kind: 'tick', ...ref, tickedAt: timeOn(records.today, 700 + i) }
                  : c.kind === 'real-bill'
                    ? {
                        kind: 'just-this-one',
                        ...ref,
                        edits: { amount: c.amount, isEstimate: false },
                      }
                    : c.kind === 'move-bill'
                      ? { kind: 'move', ...ref, date: at(bill.originalDate, c.days) }
                      : { kind: 'remove-this-one', ...ref };
            } else if (c.kind === 'spend' || c.kind.endsWith('-bill') || existing === undefined) {
              command = {
                kind: 'spend',
                spend: {
                  id: `new-${i}`,
                  budgetId: `budget-${c.which % (records.budgets?.length ?? 1)}`,
                  amount: c.amount,
                  spentOn: at(records.today, c.days),
                  recordedAt: timeOn(records.today, 600 + i),
                },
              };
            } else if (c.kind === 'change-spend') {
              command = {
                kind: 'change-spend',
                spendId: existing.id,
                edits: { amount: c.amount, spentOn: at(records.today, c.days) },
              };
            } else {
              command = { kind: 'remove-spend', spendId: existing.id };
            }
            // "I spent" takes today or an earlier day only (D119).
            const later =
              (command.kind === 'spend' && command.spend.spentOn > records.today) ||
              (command.kind === 'change-spend' &&
                (command.edits.spentOn ?? records.today) > records.today);
            if (later) {
              expect(() => editPlan(records, command)).toThrow(
                expect.objectContaining({ code: 'spend-after-today' }),
              );
              continue;
            }
            const edit = editPlan(records, command);
            const after = applyWrites(records, edit.writes);
            const undone = applyWrites(after, editPlan(after, { kind: 'undo', edit }).writes);
            expect(canonical(undone)).toEqual(canonical(records));
            // And the plan after it still works out.
            checkPlan(after as PlanInput, workOutPlan(after as PlanInput));
            records = after;
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
