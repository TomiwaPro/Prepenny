// "I spent" and pay-later bills as edits (step 1e, brief 4.5, D87, D111,
// D115): every change is one undoable step, and a bill is ticked, moved and
// given its real amount like a payment.

import { describe, expect, it } from 'vitest';
import {
  type EditCommand,
  type EditInput,
  EngineInputError,
  editPlan,
  type Plan,
  type Spend,
  workOutPlan,
} from '../../src/index.ts';
import { canonical, edited, editedInTurn } from '../fixtures/edit.ts';
import { accountOf, pounds } from '../fixtures/plan.ts';
import {
  samFood,
  samPlan,
  samSeriesWithoutFood,
  samSpend,
  samTravel,
  samTravelSpends,
} from '../fixtures/sam.ts';

// Sam's plan with the Travel budget and owner test 1's spends.
const sam: EditInput & { to: string } = samPlan({
  budgets: [samTravel()],
  spends: samTravelSpends,
});

// Sam's plan with the pay-later food budget of owner test 3, on Sun 29 Nov.
const foodSam: EditInput & { to: string } = samPlan({
  series: samSeriesWithoutFood,
  budgets: [samFood],
});

function refusedWith(code: string, input: EditInput, command: EditCommand): void {
  let error: unknown = null;
  try {
    editPlan(input, command);
  } catch (caught) {
    error = caught;
  }
  expect(error, `expected a refusal: ${code}`).toBeInstanceOf(EngineInputError);
  expect((error as EngineInputError).code).toBe(code);
  // Never amounts or names (CLAUDE.md: privacy).
  expect((error as Error).message).not.toMatch(/Travel|Pay-later card|6\.00|200\.00/);
}

const plan = (input: EditInput & { to: string }): Plan =>
  workOutPlan({ ...input, mainPayFamilyId: input.mainPayFamilyId });
const travelThisWeek = (input: EditInput & { to: string }) =>
  plan(input).budgets.find((one) => one.budget.id === 'travel')?.current;

const coffee: Spend = samSpend('coffee-25-oct', '2.50', '2026-10-25', '2026-10-25T15:00:00Z');

describe('"I spent" (D115)', () => {
  it('records a spend as one edit, and the plan takes it off at once', () => {
    const { edit, after } = edited(sam, { kind: 'spend', spend: coffee });
    expect(edit.writes).toEqual([{ kind: 'spend', id: 'coffee-25-oct', value: coffee }]);
    expect(edit.undo).toEqual([{ kind: 'spend', id: 'coffee-25-oct', value: null }]);
    expect(travelThisWeek(after)).toMatchObject({ spent: 1250, left: 1250 });
    // £2.50 more as a spend, £2.50 less left: the day ends the same.
    const day = (input: EditInput & { to: string }) =>
      accountOf(plan(input)).days.find((d) => d.date === '2026-10-25')?.balance;
    expect(day(after)).toBe(day(sam));
  });

  it('is undone in one step, and the undo can be undone', () => {
    const { edit, after } = edited(sam, { kind: 'spend', spend: coffee });
    const undone = edited(after, { kind: 'undo', edit });
    expect(canonical(undone.after)).toEqual(canonical(sam));
    const redone = edited(undone.after, { kind: 'undo', edit: undone.edit });
    expect(canonical(redone.after)).toEqual(canonical(after));
  });

  it('changes a spend’s amount, day or note, keeping when it was recorded', () => {
    const after = editedInTurn(sam, [
      { kind: 'spend', spend: { ...coffee, note: 'Bus' } },
      {
        kind: 'change-spend',
        spendId: 'coffee-25-oct',
        edits: { amount: pounds('3.00'), note: '' },
      },
    ]);
    expect(after.spends?.find((one) => one.id === 'coffee-25-oct')).toEqual({
      ...coffee,
      amount: pounds('3.00'),
    });
    expect(travelThisWeek(after)).toMatchObject({ spent: 1300, left: 1200 });
  });

  it('removes a spend, and puts it back on undo', () => {
    const { edit, after } = edited(sam, { kind: 'remove-spend', spendId: 'bus-25-oct' });
    expect(travelThisWeek(after)).toMatchObject({ spent: 400, left: 2100 });
    expect(canonical(edited(after, { kind: 'undo', edit }).after)).toEqual(canonical(sam));
  });

  it('refuses a spend id already used, an unknown budget or spend, and an amount of zero or less', () => {
    refusedWith('id-taken', sam, { kind: 'spend', spend: { ...coffee, id: 'bus-25-oct' } });
    refusedWith('unknown-budget', sam, { kind: 'spend', spend: { ...coffee, budgetId: 'food' } });
    refusedWith('bad-spend', sam, { kind: 'spend', spend: { ...coffee, amount: 0 } });
    refusedWith('bad-date', sam, { kind: 'spend', spend: { ...coffee, spentOn: '2026-10-32' } });
    refusedWith('unknown-spend', sam, { kind: 'remove-spend', spendId: 'nope' });
    refusedWith('bad-spend', sam, {
      kind: 'change-spend',
      spendId: 'bus-25-oct',
      edits: { amount: -100 },
    });
  });

  it('takes today or an earlier day only (D119)', () => {
    // Today is Sun 25 Oct: Mon 26 Oct is refused, Sun 25 and Sat 24 Oct are fine.
    refusedWith('spend-after-today', sam, {
      kind: 'spend',
      spend: { ...coffee, spentOn: '2026-10-26' },
    });
    refusedWith('spend-after-today', sam, {
      kind: 'change-spend',
      spendId: 'bus-25-oct',
      edits: { spentOn: '2026-10-26' },
    });
    expect(() => editPlan(sam, { kind: 'spend', spend: coffee })).not.toThrow();
    expect(() =>
      editPlan(sam, { kind: 'spend', spend: { ...coffee, spentOn: '2026-10-24' } }),
    ).not.toThrow();
  });

  it('still changes the amount of a stored spend dated after today, without a new day (D119, D85)', () => {
    // In a shared plan, a partner whose today is already Mon 26 Oct can record a spend that day.
    const tomorrow = samSpend('bus-26-oct', '2.00', '2026-10-26', '2026-10-25T23:30:00Z');
    const withIt = { ...sam, spends: [...(sam.spends ?? []), tomorrow] };
    expect(() => plan(withIt)).not.toThrow();
    const { after } = edited(withIt, {
      kind: 'change-spend',
      spendId: 'bus-26-oct',
      edits: { amount: pounds('2.50') },
    });
    expect(after.spends?.find((one) => one.id === 'bus-26-oct')?.amount).toBe(250);
  });
});

describe('a pay-later bill as a payment (D32, D111)', () => {
  const bill = { seriesId: 'food', originalDate: '2026-11-29' } as const;
  const billRow = (input: EditInput & { to: string }, date = '2026-11-29') =>
    accountOf(plan(input)).rows.find(
      (row) => row.kind === 'bill' && row.payment.originalDate === date,
    );

  it('takes the real bill typed in, just this one, and loses its estimate label', () => {
    const after = editedInTurn(foodSam, [
      { kind: 'just-this-one', ...bill, edits: { amount: pounds('187.42'), isEstimate: false } },
    ]);
    expect([billRow(after)?.change, billRow(after)?.payment.isEstimate]).toEqual([-18742, false]);
    // Only this one: December's is still the estimate.
    expect(billRow(after, '2026-12-29')?.payment.isEstimate).toBe(true);
  });

  it('keeps a real bill of exactly the budget, even when more was spent', () => {
    const spent = {
      ...foodSam,
      spends: [samSpend('shop', '250.00', '2026-11-02', '2026-11-02T18:00:00Z', 'food')],
    };
    expect(billRow(spent)?.change).toBe(-25000);
    const after = editedInTurn(spent, [
      { kind: 'just-this-one', ...bill, edits: { amount: pounds('200.00'), isEstimate: false } },
    ]);
    expect(after.changes?.find((c) => c.seriesId === 'food')).toMatchObject({ amount: 20000 });
    expect(billRow(after)?.change).toBe(-20000);
  });

  it('can be ticked, moved to the next payday or removed, just this one', () => {
    const ticked = editedInTurn({ ...foodSam, today: '2026-11-29' }, [
      { kind: 'tick', ...bill, tickedAt: '2026-11-29T10:00:00Z' },
    ]);
    expect(billRow(ticked)?.ticked).toBe(true);
    const moved = editedInTurn(foodSam, [{ kind: 'move-to-next-payday', ...bill }]);
    expect(billRow(moved)?.date).toBe('2026-12-04');
    const removed = editedInTurn(foodSam, [{ kind: 'remove-this-one', ...bill }]);
    expect(billRow(removed)).toBeUndefined();
    expect(billRow(removed, '2026-12-29')?.change).toBe(-20000);
  });

  it('refuses this and all later ones, and removing this and later: those change the budget', () => {
    refusedWith('budget-bills', foodSam, {
      kind: 'this-and-later',
      ...bill,
      edits: { amount: pounds('150.00') },
      newSeriesId: 'food-2',
    });
    refusedWith('budget-bills', foodSam, { kind: 'remove-this-and-later', ...bill });
  });
});
