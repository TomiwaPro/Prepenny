// The owner's answers to step 2f, built in step 2g, checked on the figures
// the debt page is drawn from, with Sam's example on Sun 25 Oct 2026:
// "Make it £20.99 and stop after it" says first what else goes, closing a
// debt offers to remove its planned payments, and a debt's payments open the
// same edit sheet as on Coming up.

import { applyWrites, type PlanRecords, parsePounds } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import { type DebtPaymentView, workOutDebtsView } from '../../lib/debts-view.ts';
import { runEdits } from '../../lib/edit.ts';
import { strings } from '../../strings/en-GB.ts';

const SUNDAY = '2026-10-25';

const debtNamed = (records: PlanRecords, name: string) => {
  const view = workOutDebtsView(records, SUNDAY);
  const debt = view.debts.find((one) => one.name === name);
  if (debt === undefined) throw new Error(`No debt called ${name}.`);
  return debt;
};

const paymentsOf = (records: PlanRecords, name: string) =>
  debtNamed(records, name).rows.filter((row): row is DebtPaymentView => row.kind === 'payment');

describe('"Make it £20.99 and stop after it" says first what else goes (answer 3)', () => {
  it('on the Credit card, whose payments never end, it says every later payment goes', () => {
    const fix = paymentsOf(examplePlan, 'Credit card').find((row) => row.fix !== null)?.fix;
    expect(fix?.alsoRemoves).toEqual({ count: 7, continues: true });
    expect(strings.debt.alsoRemoves('Credit card', 7, true)).toBe(
      'This also removes every later payment to Credit card. Undo puts them back.',
    );
  });

  it('on a loan with an end, it counts them: "This also removes 2 later payments to Laptop loan."', () => {
    // The Laptop loan at £250.00: £150.00 on Tue 10 Nov leaves £100.00, so
    // the £150.00 on Sun 20 Dec is £50.00 more than what's left.
    const records: PlanRecords = {
      ...examplePlan,
      debts: (examplePlan.debts ?? []).map((one) =>
        one.id === 'laptop-loan' ? { ...one, balance: parsePounds('250.00') } : one,
      ),
    };
    const rows = paymentsOf(records, 'Laptop loan');
    const december = rows.find((row) => row.date === '2026-12-20');
    expect(december?.fix?.amount).toBe(parsePounds('100.00'));
    expect(december?.fix?.alsoRemoves).toEqual({ count: 2, continues: false });
    expect(strings.debt.alsoRemoves('Laptop loan', 2, false)).toBe(
      'This also removes 2 later payments to Laptop loan. Undo puts them back.',
    );
    // The fix removes exactly those two: Wed 20 Jan and Sat 20 Feb 2027.
    const fixed = runEdits(records, SUNDAY, december?.fix?.commands ?? []);
    const after = paymentsOf(fixed.records, 'Laptop loan');
    expect(after.map((row) => [row.date, row.amount])).toEqual([
      ['2026-11-10', parsePounds('150.00')],
      ['2026-12-20', parsePounds('100.00')],
    ]);
    // One Undo puts them back.
    const undone = applyWrites(fixed.records, fixed.edit.undo);
    expect(paymentsOf(undone, 'Laptop loan').map((row) => row.date)).toEqual(
      rows.map((row) => row.date),
    );
  });
});

describe('Closing a debt offers "Also remove its 3 planned payments?" (answer 4)', () => {
  it('counts the payments still to come, or says "every" when they never end', () => {
    expect(debtNamed(examplePlan, 'Family loan').planned?.removing).toEqual({
      count: 6,
      continues: false,
    });
    expect(debtNamed(examplePlan, 'Sofa finance').planned?.removing).toEqual({
      count: 11,
      continues: false,
    });
    expect(debtNamed(examplePlan, 'Credit card').planned?.removing.continues).toBe(true);
    expect(strings.closing.alsoRemove(6, false)).toBe('Also remove its 6 planned payments?');
    expect(strings.closing.alsoRemove(1, false)).toBe('Also remove its planned payment?');
    expect(strings.closing.alsoRemove(42, true)).toBe('Also remove every payment planned to it?');
  });

  it('Yes removes them and closes it as one change, which one Undo puts back', () => {
    const debt = debtNamed(examplePlan, 'Family loan');
    const commands = [
      ...(debt.planned?.commands ?? []),
      { kind: 'close-debt' as const, debtId: debt.id },
    ];
    const closed = runEdits(examplePlan, SUNDAY, commands);
    const loan = closed.records.series.filter((one) => one.debtId === 'family-loan');
    // Each of the Family loan's series started after today, so each is removed.
    expect(loan).toEqual([]);
    expect(closed.records.debts?.find((one) => one.id === 'family-loan')?.closed).toBe(true);
    const undone = applyWrites(closed.records, closed.edit.undo);
    const byId = (list: PlanRecords['series']) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(byId(undone.series)).toEqual(byId(examplePlan.series));
    expect(undone.debts).toEqual(examplePlan.debts);
  });

  it('a debt with nothing still to come asks nothing more', () => {
    // The Pay-later card is paid in full on Thu 29 Oct: once that's ticked,
    // nothing is planned for it.
    const ticked = runEdits(examplePlan, SUNDAY, [
      {
        kind: 'tick',
        seriesId: 'pay-later-card-in-full',
        originalDate: '2026-10-29',
        tickedAt: '2026-10-25T09:00:00Z',
      },
    ]).records;
    expect(debtNamed(ticked, 'Pay-later card').planned).toBeNull();
  });
});

describe("A debt's payments open the same edit sheet as on Coming up (answer 5)", () => {
  it('gives each payment the edit sheet row, looking as far ahead as the debt does', () => {
    const rows = paymentsOf(examplePlan, 'Credit card');
    expect(rows.every((row) => row.edit !== null)).toBe(true);
    const march = rows.find((row) => row.date === '2028-03-15');
    expect(march?.edit).toMatchObject({
      seriesId: march?.seriesId,
      originalDate: '2028-03-15',
      name: 'Credit card',
      amount: parsePounds('25.00'),
      editing: 'payment',
      linkedToDebt: true,
    });
    // The Family loan's in pounds on the bank's side, with its bank balance after it.
    const family = paymentsOf(examplePlan, 'Family loan')[0];
    expect(family?.edit).toMatchObject({
      date: '2026-10-26',
      change: -parsePounds('125.00'),
      leftAfter: parsePounds('112.54'),
    });
  });
});
