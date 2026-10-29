// Each editing command (step 1c, brief 5.4, ARCHITECTURE.md 2.3):
// tests 19 to 23, D4, the whole family (D88), new dates (D91), "just this
// one" keeping only what differs (D93), ticks (D71, D83), balance updates
// (D33), undo, and refusals that hold no money data.

import { describe, expect, it } from 'vitest';
import {
  type EditCommand,
  type EditInput,
  EngineInputError,
  editPlan,
  formatPounds,
  type Payment,
  type PlanInput,
  workOutPayments,
  workOutPlan,
} from '../../src/index.ts';
import { canonical, edited, editedInTurn, paymentsOfSeries } from '../fixtures/edit.ts';
import { noBankHolidays } from '../fixtures/holidays.ts';
import { accountOf, balanceUpdate, planInput, pounds } from '../fixtures/plan.ts';
import { samPlan } from '../fixtures/sam.ts';
import { series } from '../fixtures/series.ts';

const today = '2026-10-25';

// Pay follows a pattern with an offset, so splits must keep its position.
const pay = series({
  id: 'pay',
  name: 'Pay',
  direction: 'in',
  type: 'pay',
  amount: 0,
  amountCycle: [10000, 20000, 30000, 40000],
  cycleOffset: 1,
  start: '2026-10-30',
  schedule: { kind: 'weekly', every: 1 },
  isEstimate: true,
});
const rent = series({
  id: 'rent',
  name: 'Rent',
  type: 'rent',
  amount: pounds('550.00'),
  start: '2026-11-01',
  schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
});
// The name and amounts stand in for private money data: no refusal may show them.
const loan = series({
  id: 'loan',
  name: 'Secret Shop',
  type: 'debt',
  amount: 98765,
  lastAmount: 12345,
  start: '2026-11-07',
  schedule: { kind: 'weekly', every: 2 },
  end: { kind: 'after', payments: 4 },
});
const plan: PlanInput = planInput({
  today,
  to: '2027-03-31',
  balanceUpdates: [balanceUpdate('current', '1000.00', today)],
  series: [pay, rent, loan],
  mainPayFamilyId: 'pay',
  holidays: noBankHolidays,
});

function payments(input: EditInput, from = '2026-10-01', to = '2027-06-30'): Payment[] {
  return workOutPayments({
    series: input.series,
    changes: input.changes ?? [],
    holidays: input.holidays,
    from,
    to,
  });
}

function refusedWith(code: string, input: EditInput, command: EditCommand): void {
  let error: unknown = null;
  try {
    editPlan(input, command);
  } catch (caught) {
    error = caught;
  }
  expect(error, `expected a refusal: ${code}`).toBeInstanceOf(EngineInputError);
  expect((error as EngineInputError).code).toBe(code);
  // Never amounts, payment names or notes (CLAUDE.md: privacy).
  expect((error as Error).message).not.toMatch(/Secret|987\.65|98765|123\.45|12345|Boiler/);
}

describe('test 19: just this one', () => {
  it('changes the amount, name, note and estimate label of that payment only', () => {
    const { after } = edited(plan, {
      kind: 'just-this-one',
      seriesId: 'pay',
      originalDate: '2026-11-13',
      edits: { amount: 25000, name: 'Pay and bonus', note: 'Boiler money', isEstimate: false },
    });
    const was = payments(plan);
    const now = payments(after);
    expect(now).toHaveLength(was.length);
    now.forEach((payment, i) => {
      if (payment.seriesId === 'pay' && payment.originalDate === '2026-11-13') {
        expect(payment).toMatchObject({
          amount: 25000,
          name: 'Pay and bonus',
          note: 'Boiler money',
          isEstimate: false,
          changed: true,
        });
      } else {
        expect(payment).toEqual(was[i]);
      }
    });
  });

  it('moves it to a date, and moving it back to its own date clears the move (D93)', () => {
    const moved = edited(plan, {
      kind: 'move',
      seriesId: 'rent',
      originalDate: '2026-12-01',
      date: '2026-12-04',
    }).after;
    expect(paymentsOfSeries(moved, 'rent', '2026-12-01', '2026-12-31')[0]).toMatchObject({
      date: '2026-12-04',
      moved: true,
    });
    const back = edited(moved, {
      kind: 'move',
      seriesId: 'rent',
      originalDate: '2026-12-01',
      date: '2026-12-01',
    });
    expect(back.after.changes).toEqual([]);
    expect(back.edit.writes).toEqual([
      { kind: 'change', seriesId: 'rent', originalDate: '2026-12-01', value: null },
    ]);
  });

  it("clears the series' note for just this one with an empty note", () => {
    const noted = {
      ...plan,
      series: plan.series.map((one) =>
        one.id === 'rent' ? { ...one, note: 'Standing order' } : one,
      ),
    };
    const { after } = edited(noted, {
      kind: 'just-this-one',
      seriesId: 'rent',
      originalDate: '2026-12-01',
      edits: { note: '' },
    });
    expect(after.changes).toEqual([{ seriesId: 'rent', originalDate: '2026-12-01', note: '' }]);
    expect(paymentsOfSeries(after, 'rent', '2026-11-01', '2027-01-31').map((p) => p.note)).toEqual([
      'Standing order',
      null,
      'Standing order',
    ]);
  });

  it('clears a part that comes out the same as the series would give (D93)', () => {
    const { after } = edited(plan, {
      kind: 'just-this-one',
      seriesId: 'pay',
      originalDate: '2026-11-06',
      edits: { amount: 30000, isEstimate: false },
    });
    // Payment 1: cycle[(1 + 1) mod 4] = £300.00, so only the estimate label is saved.
    expect(after.changes).toEqual([
      { seriesId: 'pay', originalDate: '2026-11-06', isEstimate: false },
    ]);
  });
});

describe('test 20: this and all later ones', () => {
  // One-off changes on later pay: payment 4 has a new amount and a name,
  // payment 6 is moved, and payment 5 is ticked as paid early.
  const setUp = editedInTurn(plan, [
    {
      kind: 'just-this-one',
      seriesId: 'pay',
      originalDate: '2026-11-27',
      edits: { amount: 1, name: 'Pay with overtime' },
    },
    { kind: 'move', seriesId: 'pay', originalDate: '2026-12-11', date: '2026-12-10' },
    { kind: 'tick', seriesId: 'pay', originalDate: '2026-12-04', tickedAt: '2026-10-25T12:00:00Z' },
  ]);

  it('splits the series: the old one ends the day before, the new one starts here, in the same family', () => {
    const { after } = edited(setUp, {
      kind: 'this-and-later',
      seriesId: 'pay',
      originalDate: '2026-11-20',
      edits: { name: 'Wages' },
      newSeriesId: 'wages',
    });
    expect(after.series.find((one) => one.id === 'pay')?.end).toEqual({
      kind: 'on',
      date: '2026-11-19',
    });
    expect(after.series.find((one) => one.id === 'wages')).toMatchObject({
      name: 'Wages',
      start: '2026-11-20',
      firstNumber: 3,
      familyId: 'pay',
      familyCreatedAt: pay.familyCreatedAt,
      splitFrom: 'pay',
      amountCycle: pay.amountCycle,
      cycleOffset: 1,
    });
  });

  it('moves later changes and ticks across by payment number, dropping only the parts it replaces (D60)', () => {
    const { after } = edited(setUp, {
      kind: 'this-and-later',
      seriesId: 'pay',
      originalDate: '2026-11-20',
      edits: { name: 'Wages' },
      newSeriesId: 'wages',
    });
    expect(after.changes).toEqual([
      // The amount stays; the one-off name is replaced by the edit.
      { seriesId: 'wages', originalDate: '2026-11-27', amount: 1 },
      { seriesId: 'wages', originalDate: '2026-12-11', newDate: '2026-12-10' },
    ]);
    expect(after.ticks).toEqual([
      {
        seriesId: 'wages',
        originalDate: '2026-12-04',
        tickedAt: '2026-10-25T12:00:00Z',
        paidOn: '2026-10-25',
      },
    ]);
    const names = payments(after).filter((p) => p.direction === 'in');
    expect(names.map((p) => [p.date, p.name, p.amount])).toEqual(
      payments(setUp)
        .filter((p) => p.direction === 'in')
        .map((p) => [p.date, p.date >= '2026-11-20' ? 'Wages' : 'Pay', p.amount]),
    );
  });

  it('on the first payment of a series, changes the whole series instead', () => {
    const { edit, after } = edited(plan, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2026-11-01',
      edits: { amount: pounds('575.00'), note: 'New tenancy' },
      newSeriesId: 'not-needed',
    });
    expect(after.series.map((one) => one.id)).toEqual(['pay', 'rent', 'loan']);
    expect(edit.writes).toEqual([
      {
        kind: 'series',
        id: 'rent',
        value: { ...rent, amount: pounds('575.00'), note: 'New tenancy' },
      },
    ]);
  });

  it('changes nothing when nothing is changed on a first payment', () => {
    expect(
      editPlan(plan, {
        kind: 'this-and-later',
        seriesId: 'rent',
        originalDate: '2026-11-01',
        edits: {},
        newSeriesId: 'not-needed',
      }),
    ).toEqual({ writes: [], undo: [] });
  });
});

describe('test 21: a pattern carries on correctly after a split', () => {
  it('gives every payment the same amount and number after two splits', () => {
    const after = editedInTurn(plan, [
      {
        kind: 'this-and-later',
        seriesId: 'pay',
        originalDate: '2026-11-20',
        edits: { note: 'First split' },
        newSeriesId: 'pay-2',
      },
      {
        kind: 'this-and-later',
        seriesId: 'pay-2',
        originalDate: '2027-01-01',
        edits: { isEstimate: false },
        newSeriesId: 'pay-3',
      },
    ]);
    const amounts = (input: EditInput) =>
      payments(input)
        .filter((p) => p.direction === 'in')
        .map((p) => [p.number, p.date, p.amount]);
    expect(amounts(after)).toEqual(amounts(plan));
    // Payment 3 on Fri 20 Nov: cycle[(3 + 1) mod 4] = £100.00.
    expect(amounts(after).find(([number]) => number === 3)).toEqual([3, '2026-11-20', 10000]);
  });

  it('keeps the months left out of a pattern of months', () => {
    // Council tax: every month on the 1st, April to January (nothing in February or March).
    const councilTax = series({
      id: 'council-tax',
      amount: pounds('132.00'),
      start: '2026-04-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 }, leaveOut: [2, 3] },
      end: { kind: 'after', payments: 20 },
    });
    const input = { ...plan, series: [councilTax] };
    const after = edited(input, {
      kind: 'this-and-later',
      seriesId: 'council-tax',
      originalDate: '2027-01-01',
      edits: { amount: pounds('140.00') },
      newSeriesId: 'council-tax-2027',
    }).after;
    const dates = (one: EditInput) => payments(one, '2026-04-01', '2028-12-31').map((p) => p.date);
    expect(dates(after)).toEqual(dates(input));
    expect(dates(after)).toHaveLength(20);
    expect(dates(after).filter((d) => /-0[23]-/.test(d))).toEqual([]);
  });
});

describe('test 22 and D4: remove this one, and remove this and later', () => {
  it('skips just that payment; it still counts towards "after N payments" and nothing is added', () => {
    const { after } = edited(plan, {
      kind: 'remove-this-one',
      seriesId: 'loan',
      originalDate: '2026-11-21',
    });
    const left = paymentsOfSeries(after, 'loan', '2026-10-01', '2027-12-31');
    expect(left.map((p) => [p.date, p.amount, p.skipped])).toEqual([
      ['2026-11-07', 98765, false],
      ['2026-11-21', 98765, true],
      ['2026-12-05', 98765, false],
      ['2026-12-19', 12345, false],
    ]);
    const rows = accountOf(workOutPlan(after)).rows.filter((r) => r.payment.seriesId === 'loan');
    expect(rows.map((r) => r.date)).toEqual(['2026-11-07', '2026-12-05', '2026-12-19']);
  });

  it('refuses to remove a payment that is already removed', () => {
    const removed = edited(plan, {
      kind: 'remove-this-one',
      seriesId: 'loan',
      originalDate: '2026-11-21',
    }).after;
    refusedWith('already-removed', removed, {
      kind: 'remove-this-one',
      seriesId: 'loan',
      originalDate: '2026-11-21',
    });
  });

  it('ends a series by count before the payment, and the payments left keep their amounts (D92)', () => {
    const { after } = edited(plan, {
      kind: 'remove-this-and-later',
      seriesId: 'loan',
      originalDate: '2026-12-05',
    });
    expect(after.series.find((one) => one.id === 'loan')).toEqual({
      ...loan,
      end: { kind: 'after', payments: 2 },
      lastAmount: undefined,
    });
    expect(
      paymentsOfSeries(after, 'loan', '2026-10-01', '2027-12-31').map((p) => [p.date, p.amount]),
    ).toEqual([
      ['2026-11-07', 98765],
      ['2026-11-21', 98765],
    ]);
  });

  it('removes the one-off changes of the payments it removes', () => {
    const { after } = edited(
      editedInTurn(plan, [
        { kind: 'move', seriesId: 'rent', originalDate: '2026-12-01', date: '2026-12-02' },
        { kind: 'move', seriesId: 'rent', originalDate: '2027-02-01', date: '2027-02-02' },
      ]),
      { kind: 'remove-this-and-later', seriesId: 'rent', originalDate: '2027-01-01' },
    );
    expect(after.series.find((one) => one.id === 'rent')?.end).toEqual({
      kind: 'on',
      date: '2026-12-31',
    });
    expect(after.changes).toEqual([
      { seriesId: 'rent', originalDate: '2026-12-01', newDate: '2026-12-02' },
    ]);
  });

  it('removes the whole series from its first payment', () => {
    const { after } = edited(plan, {
      kind: 'remove-this-and-later',
      seriesId: 'loan',
      originalDate: '2026-11-07',
    });
    expect(after.series.map((one) => one.id)).toEqual(['pay', 'rent']);
  });

  it('refuses when a payment it would remove is ticked as paid (D92)', () => {
    const ticked = edited(plan, {
      kind: 'tick',
      seriesId: 'loan',
      originalDate: '2026-12-05',
      tickedAt: '2026-10-25T12:00:00Z',
    }).after;
    refusedWith('ticked', ticked, {
      kind: 'remove-this-and-later',
      seriesId: 'loan',
      originalDate: '2026-11-21',
    });
  });
});

describe('D88: "this and all later ones" and "remove this and later" reach the whole family', () => {
  const splitInJanuary = edited(plan, {
    kind: 'this-and-later',
    seriesId: 'rent',
    originalDate: '2027-01-01',
    edits: { amount: pounds('560.00') },
    newSeriesId: 'rent-2027',
  }).after;
  const rentAmounts = (input: EditInput) =>
    payments(input, '2026-11-01', '2027-03-31')
      .filter((p) => p.name === 'Rent')
      .map((p) => [p.date, formatPounds(p.amount)]);

  it('changes the series split off later too', () => {
    const after = edited(splitInJanuary, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2026-12-01',
      edits: { amount: pounds('555.00') },
      newSeriesId: 'rent-december',
    }).after;
    expect(rentAmounts(after)).toEqual([
      ['2026-11-01', '550.00'],
      ['2026-12-01', '555.00'],
      ['2027-01-01', '555.00'],
      ['2027-02-01', '555.00'],
      ['2027-03-01', '555.00'],
    ]);
  });

  it('keeps what the later series changed when the edit changes something else', () => {
    const after = edited(splitInJanuary, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2026-12-01',
      edits: { note: 'Standing order' },
      newSeriesId: 'rent-december',
    }).after;
    expect(rentAmounts(after)).toEqual(rentAmounts(splitInJanuary));
    expect(
      payments(after, '2026-11-01', '2027-03-31')
        .filter((p) => p.name === 'Rent')
        .map((p) => p.note),
    ).toEqual([null, 'Standing order', 'Standing order', 'Standing order', 'Standing order']);
  });

  it('removes the series split off later too', () => {
    const after = edited(splitInJanuary, {
      kind: 'remove-this-and-later',
      seriesId: 'rent',
      originalDate: '2026-12-01',
    }).after;
    expect(rentAmounts(after)).toEqual([['2026-11-01', '550.00']]);
    expect(after.series.some((one) => one.id === 'rent-2027')).toBe(false);
  });
});

describe('D91: a new date for this and all later ones', () => {
  it('moves a weekly payment to a new weekday; later moved dates go, notes stay (D60)', () => {
    const setUp = editedInTurn(plan, [
      { kind: 'move', seriesId: 'pay', originalDate: '2026-12-18', date: '2026-12-17' },
      {
        kind: 'just-this-one',
        seriesId: 'pay',
        originalDate: '2026-12-25',
        edits: { note: 'Christmas' },
      },
    ]);
    const { after } = edited(setUp, {
      kind: 'this-and-later',
      seriesId: 'pay',
      originalDate: '2026-12-04',
      edits: { date: '2026-12-05' },
      newSeriesId: 'pay-saturdays',
    });
    const pays = payments(after, '2026-11-20', '2027-01-02').filter((p) => p.direction === 'in');
    expect(pays.map((p) => [p.number, p.date, p.amount, p.note])).toEqual([
      [3, '2026-11-20', 10000, null],
      [4, '2026-11-27', 20000, null],
      [5, '2026-12-05', 30000, null],
      [6, '2026-12-12', 40000, null],
      [7, '2026-12-19', 10000, null],
      [8, '2026-12-26', 20000, 'Christmas'],
      [9, '2027-01-02', 30000, null],
    ]);
    expect(after.changes).toEqual([
      { seriesId: 'pay-saturdays', originalDate: '2026-12-26', note: 'Christmas' },
    ]);
  });

  it('moves a monthly payment to a new day with the schedule the app sends', () => {
    const { after } = edited(plan, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2027-01-01',
      edits: {
        date: '2027-01-03',
        schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 3 } },
      },
      newSeriesId: 'rent-on-the-3rd',
    });
    expect(
      payments(after, '2026-11-01', '2027-03-31')
        .filter((p) => p.name === 'Rent')
        .map((p) => p.date),
    ).toEqual(['2026-11-01', '2026-12-01', '2027-01-03', '2027-02-03', '2027-03-03']);
  });

  it('refuses a new date on or before the payment before it, so no payment doubles up', () => {
    refusedWith('date-before-earlier-payment', plan, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2027-01-01',
      edits: { date: '2026-12-01' },
      newSeriesId: 'rent-early',
    });
    refusedWith('date-before-earlier-payment', plan, {
      kind: 'this-and-later',
      seriesId: 'pay',
      originalDate: '2026-11-20',
      edits: { date: '2026-11-02' },
      newSeriesId: 'pay-early',
    });
    // The payment before can be in an earlier series of the family.
    const split = edited(plan, {
      kind: 'this-and-later',
      seriesId: 'pay',
      originalDate: '2026-11-20',
      edits: { note: 'Split' },
      newSeriesId: 'pay-2',
    }).after;
    refusedWith('date-before-earlier-payment', split, {
      kind: 'this-and-later',
      seriesId: 'pay-2',
      originalDate: '2026-11-20',
      edits: { date: '2026-11-13' },
      newSeriesId: 'unused',
    });
    // The day after the payment before is fine.
    expect(() =>
      editPlan(split, {
        kind: 'this-and-later',
        seriesId: 'pay-2',
        originalDate: '2026-11-20',
        edits: { date: '2026-11-14' },
        newSeriesId: 'unused',
      }),
    ).not.toThrow();
  });

  it('refuses a date the schedule never gives', () => {
    refusedWith('date-not-in-schedule', plan, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2027-01-01',
      edits: { date: '2027-01-03' },
      newSeriesId: 'rent-on-the-3rd',
    });
  });

  it('never adds or loses a payment: an end date becomes the same number of payments', () => {
    const card = series({
      id: 'card',
      amount: 2500,
      start: '2026-11-15',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 15 } },
      end: { kind: 'on', date: '2027-03-15' },
    });
    const input = { ...plan, series: [card] };
    const { after } = edited(input, {
      kind: 'this-and-later',
      seriesId: 'card',
      originalDate: '2027-01-15',
      edits: {
        date: '2027-01-16',
        schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 16 } },
      },
      newSeriesId: 'card-16th',
    });
    expect(payments(after, '2026-11-01', '2027-12-31').map((p) => p.date)).toEqual([
      '2026-11-15',
      '2026-12-15',
      '2027-01-16',
      '2027-02-16',
      '2027-03-16',
    ]);
    expect(after.series.find((one) => one.id === 'card-16th')?.end).toEqual({
      kind: 'after',
      payments: 5,
    });
    refusedWith('dates-dont-fit', input, {
      kind: 'this-and-later',
      seriesId: 'card',
      originalDate: '2027-01-15',
      edits: { schedule: { kind: 'once' } },
      newSeriesId: 'card-once',
    });
  });
});

describe('ticks (D1, D71, D83)', () => {
  it('uses the day it was ticked when that is before the payment is due', () => {
    const { after } = edited(plan, {
      kind: 'tick',
      seriesId: 'rent',
      originalDate: '2026-11-01',
      tickedAt: '2026-10-25T18:30:00Z',
    });
    expect(after.ticks).toEqual([
      {
        seriesId: 'rent',
        originalDate: '2026-11-01',
        tickedAt: '2026-10-25T18:30:00Z',
        paidOn: '2026-10-25',
      },
    ]);
  });

  it("otherwise uses the payment's own date, after a move, and keeps it if it moves again", () => {
    const later = { ...plan, today: '2026-12-10' };
    const after = editedInTurn(later, [
      { kind: 'move', seriesId: 'rent', originalDate: '2026-12-01', date: '2026-12-03' },
      {
        kind: 'tick',
        seriesId: 'rent',
        originalDate: '2026-12-01',
        tickedAt: '2026-12-10T08:00:00Z',
      },
      { kind: 'move', seriesId: 'rent', originalDate: '2026-12-01', date: '2026-12-04' },
    ]);
    expect(after.ticks?.[0]?.paidOn).toBe('2026-12-03');
  });

  it('refuses to tick twice, unticks, and refuses to untick what is not ticked', () => {
    const tick: EditCommand = {
      kind: 'tick',
      seriesId: 'rent',
      originalDate: '2026-11-01',
      tickedAt: '2026-10-25T18:30:00Z',
    };
    const ticked = edited(plan, tick).after;
    refusedWith('already-ticked', ticked, tick);
    const unticked = edited(ticked, {
      kind: 'untick',
      seriesId: 'rent',
      originalDate: '2026-11-01',
    }).after;
    expect(unticked.ticks).toEqual([]);
    refusedWith('not-ticked', unticked, {
      kind: 'untick',
      seriesId: 'rent',
      originalDate: '2026-11-01',
    });
    refusedWith('unknown-balance-update', plan, { ...tick, inBalanceUpdate: 'no-such-update' });
  });
});

describe('D33 and brief 8.4 test 5: Update balance on Fri 30 Oct, with the ticks made in its steps', () => {
  const sam = samPlan({ today: '2026-10-30' });
  const ticked: [string, string][] = [
    ['spending-until-payday', '2026-10-25'],
    ['family-loan-first', '2026-10-26'],
    ['driving-lessons', '2026-10-26'],
    ['from-savings', '2026-10-28'],
    ['pay-later-card-in-full', '2026-10-29'],
    ['pay', '2026-10-30'],
    ['spending-money', '2026-10-30'],
  ];
  const update = {
    id: 'current-30-oct',
    accountId: 'current',
    balance: pounds('600.00'),
    checkedOn: '2026-10-30',
    checkedAt: '2026-10-30T09:14:00Z',
  };
  const command: EditCommand = {
    kind: 'update-balance',
    update,
    ticks: ticked.map(([seriesId, originalDate]) => ({
      seriesId,
      originalDate,
      tickedAt: '2026-10-30T09:15:00Z',
    })),
  };
  const { edit, after } = edited(sam, command);

  it('saves the update and every tick, each inside the update, in one edit', () => {
    expect(edit.writes).toHaveLength(8);
    expect(after.ticks?.every((t) => t.inBalanceUpdate === 'current-30-oct')).toBe(true);
    // Each paid date is the payment's own date, as all are due by today (D71).
    expect(after.ticks?.map((t) => [t.seriesId, t.originalDate, t.paidOn]).sort()).toEqual(
      ticked.map(([seriesId, date]) => [seriesId, date, date]).sort(),
    );
  });

  it('works forward from £600 and counts nothing ticked twice', () => {
    const current = accountOf(workOutPlan(after));
    expect(current.start.id).toBe('current-30-oct');
    expect(current.days[0]).toMatchObject({ date: '2026-10-30', balance: pounds('600.00') });
    expect(current.lowestPoint).toMatchObject({ date: '2026-11-01', balance: 0 });
    expect(current.lowestPoint.after?.payment.name).toBe('Rent');
  });

  it('is undone in one step', () => {
    const back = edited(after, { kind: 'undo', edit }).after;
    expect(canonical(back)).toEqual(canonical(sam));
  });

  it('refuses a balance date after today, and two updates at the same moment (D85)', () => {
    refusedWith('balance-after-today', sam, {
      kind: 'update-balance',
      update: { ...update, checkedOn: '2026-10-31' },
    });
    refusedWith('same-time-balances', sam, {
      kind: 'update-balance',
      update: {
        id: 'another',
        accountId: 'current',
        balance: 0,
        checkedOn: '2026-10-25',
        checkedAt: '2026-10-25T08:30:00Z',
      },
    });
  });
});

describe('test 23: every edit is one undoable step', () => {
  // A split that moves two changes and a tick touches six records.
  const setUp = editedInTurn(plan, [
    {
      kind: 'just-this-one',
      seriesId: 'pay',
      originalDate: '2026-11-27',
      edits: { amount: 1 },
    },
    { kind: 'move', seriesId: 'pay', originalDate: '2026-12-11', date: '2026-12-10' },
    { kind: 'tick', seriesId: 'pay', originalDate: '2026-12-04', tickedAt: '2026-10-25T12:00:00Z' },
  ]);
  const split: EditCommand = {
    kind: 'this-and-later',
    seriesId: 'pay',
    originalDate: '2026-11-20',
    edits: { amount: 15000 },
    newSeriesId: 'pay-2',
  };
  const { edit, after } = edited(setUp, split);

  it('puts back every record it touched, in one undo', () => {
    expect(edit.writes.length).toBeGreaterThan(5);
    expect(edit.undo.map((w) => w.kind)).toEqual(edit.writes.map((w) => w.kind));
    const back = edited(after, { kind: 'undo', edit });
    expect(canonical(back.after)).toEqual(canonical(setUp));
    // Undoing the undo puts the edit back.
    expect(canonical(edited(back.after, { kind: 'undo', edit: back.edit }).after)).toEqual(
      canonical(after),
    );
  });

  it('refuses to undo once something it changed has been changed again', () => {
    const renamed = edited(after, {
      kind: 'this-and-later',
      seriesId: 'pay-2',
      originalDate: '2026-11-20',
      edits: { name: 'Wages' },
      newSeriesId: 'unused',
    }).after;
    refusedWith('changed-since', renamed, { kind: 'undo', edit });
  });

  it('refuses to undo a split once a payment of the new series has its own change', () => {
    // The note is a new record, but undoing the split would take away the
    // series it's on, and the note with it.
    const noted = edited(after, {
      kind: 'just-this-one',
      seriesId: 'pay-2',
      originalDate: '2027-01-01',
      edits: { note: 'Boiler' },
    }).after;
    refusedWith('changed-since', noted, { kind: 'undo', edit });
  });
});

describe('refusals hold no money data', () => {
  it.each<[string, EditCommand]>([
    [
      'unknown-series',
      { kind: 'remove-this-one', seriesId: 'nothing', originalDate: '2026-11-07' },
    ],
    ['no-payment', { kind: 'remove-this-one', seriesId: 'loan', originalDate: '2026-11-08' }],
    [
      'id-taken',
      {
        kind: 'this-and-later',
        seriesId: 'loan',
        originalDate: '2026-11-21',
        edits: { amount: 1 },
        newSeriesId: 'rent',
      },
    ],
    [
      'needs-id',
      {
        kind: 'this-and-later',
        seriesId: 'loan',
        originalDate: '2026-11-21',
        edits: { amount: 1 },
        newSeriesId: '',
      },
    ],
    ['bad-command', { kind: 'paint-it-red' } as never],
    [
      'negative-pence',
      {
        kind: 'just-this-one',
        seriesId: 'loan',
        originalDate: '2026-11-21',
        edits: { amount: -98765 },
      },
    ],
    ['bad-date', { kind: 'move', seriesId: 'loan', originalDate: '2026-11-21', date: 'Friday' }],
  ])('refuses with %s', (code, command) => {
    refusedWith(code, plan, command);
  });

  it('refuses "Move to next payday" with no main pay (D81)', () => {
    refusedWith(
      'no-main-pay',
      { ...plan, mainPayFamilyId: null },
      { kind: 'move-to-next-payday', seriesId: 'loan', originalDate: '2026-11-21' },
    );
  });
});

describe('D87: undo never loses a change or tick made since', () => {
  const toThe3rd: EditCommand = {
    kind: 'this-and-later',
    seriesId: 'rent',
    originalDate: '2026-11-01',
    edits: {
      date: '2026-11-03',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 3 } },
    },
    newSeriesId: 'unused',
  };

  it('refuses to undo a new date once a moved payment has its own change or tick', () => {
    const moved = edited(plan, toThe3rd);
    const changedSince = editedInTurn(moved.after, [
      {
        kind: 'just-this-one',
        seriesId: 'rent',
        originalDate: '2026-12-03',
        edits: { amount: pounds('580.00') },
      },
      {
        kind: 'tick',
        seriesId: 'rent',
        originalDate: '2027-01-03',
        tickedAt: '2026-10-25T10:00:00Z',
      },
    ]);
    refusedWith('changed-since', changedSince, { kind: 'undo', edit: moved.edit });
  });

  it('refuses to redo a removal once a payment it would remove has been ticked', () => {
    const removed = edited(plan, {
      kind: 'remove-this-and-later',
      seriesId: 'rent',
      originalDate: '2027-01-01',
    });
    const putBack = edited(removed.after, { kind: 'undo', edit: removed.edit });
    const ticked = edited(putBack.after, {
      kind: 'tick',
      seriesId: 'rent',
      originalDate: '2027-02-01',
      tickedAt: '2026-10-25T10:00:00Z',
    }).after;
    refusedWith('changed-since', ticked, { kind: 'undo', edit: putBack.edit });
  });

  it('refuses to redo a split once a later payment has its own note', () => {
    const split = edited(plan, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2027-01-01',
      edits: { amount: pounds('560.00') },
      newSeriesId: 'rent-2027',
    });
    const putBack = edited(split.after, { kind: 'undo', edit: split.edit });
    const noted = edited(putBack.after, {
      kind: 'just-this-one',
      seriesId: 'rent',
      originalDate: '2027-03-01',
      edits: { note: 'Boiler' },
    }).after;
    refusedWith('changed-since', noted, { kind: 'undo', edit: putBack.edit });
  });

  it('refuses to put a tick back on a payment removed since', () => {
    const ticked = edited(plan, {
      kind: 'tick',
      seriesId: 'rent',
      originalDate: '2027-01-01',
      tickedAt: '2026-10-25T10:00:00Z',
    }).after;
    const untick = edited(ticked, { kind: 'untick', seriesId: 'rent', originalDate: '2027-01-01' });
    const removed = edited(untick.after, {
      kind: 'remove-this-and-later',
      seriesId: 'rent',
      originalDate: '2026-12-01',
    }).after;
    refusedWith('changed-since', removed, { kind: 'undo', edit: untick.edit });
  });

  it('still undoes when the change made since stays on its payment, and keeps it', () => {
    const split = edited(plan, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2027-01-01',
      edits: { amount: pounds('560.00') },
      newSeriesId: 'rent-2027',
    });
    const noted = edited(split.after, {
      kind: 'just-this-one',
      seriesId: 'rent',
      originalDate: '2026-11-01',
      edits: { note: 'Boiler' },
    }).after;
    const back = edited(noted, { kind: 'undo', edit: split.edit }).after;
    expect(back.series.find((one) => one.id === 'rent')).toEqual(rent);
    expect(back.changes).toEqual([
      { seriesId: 'rent', originalDate: '2026-11-01', note: 'Boiler' },
    ]);
  });
});
