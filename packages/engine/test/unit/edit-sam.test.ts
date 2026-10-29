// Editing Sam's plan (step 1c): brief 8.4 tests 1 to 4 with balances
// (ARCHITECTURE.md tests 24 to 27), D60, "Move to next payday" (D14, D81)
// and a split on a series that ends after a number of payments.

import { describe, expect, it } from 'vitest';
import {
  type EditCommand,
  formatPounds,
  type Plan,
  type PlanInput,
  workOutPayments,
  workOutPlan,
} from '../../src/index.ts';
import { edited, editedInTurn, paymentsOfSeries } from '../fixtures/edit.ts';
import { accountOf, pounds } from '../fixtures/plan.ts';
import { samPlan } from '../fixtures/sam.ts';

const sam = samPlan();
const before = workOutPlan(sam);

/** Each row of the current account: date, name, amount, and how far "Left after this" moved. */
function rowsMoved(was: Plan, now: Plan): [string, string, string, string][] {
  const old = accountOf(was).rows;
  const rows = accountOf(now).rows;
  return rows.map((row, i) => [
    row.date,
    row.payment.name,
    formatPounds(row.change),
    formatPounds(row.leftAfter - (old[i]?.leftAfter ?? Number.NaN)),
  ]);
}

/** The current account's balance at the end of each month of the view, in pounds. */
function monthEnds(plan: Plan): string[] {
  const ends = ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'];
  return ends.map((date) =>
    formatPounds(accountOf(plan).days.find((day) => day.date === date)?.balance ?? Number.NaN),
  );
}

function planAfter(command: EditCommand, input: PlanInput = sam): Plan {
  return workOutPlan(edited(input, command).after);
}

describe('test 24 (brief 8.4 test 1): rent £560 for this and all later ones from Fri 1 Jan 2027', () => {
  const command: EditCommand = {
    kind: 'this-and-later',
    seriesId: 'rent',
    originalDate: '2027-01-01',
    edits: { amount: pounds('560.00') },
    newSeriesId: 'rent-from-jan',
  };
  const { after } = edited(sam, command);
  const plan = workOutPlan(after);

  it('makes January and February £560, and leaves November (£600) and December (£550)', () => {
    const rent = accountOf(plan).rows.filter((row) => row.payment.name === 'Rent');
    expect(rent.map((row) => [row.date, formatPounds(row.change)])).toEqual([
      ['2026-11-01', '-600.00'],
      ['2026-12-01', '-550.00'],
      ['2027-01-01', '-560.00'],
      ['2027-02-01', '-560.00'],
    ]);
  });

  it('ends the old series on Thu 31 Dec 2026 and starts the new one at payment 2 (ARCHITECTURE.md 2.3)', () => {
    const old = after.series.find((one) => one.id === 'rent');
    const rest = after.series.find((one) => one.id === 'rent-from-jan');
    expect(old?.end).toEqual({ kind: 'on', date: '2026-12-31' });
    expect(rest).toMatchObject({
      start: '2027-01-01',
      firstNumber: 2,
      familyId: 'rent',
      splitFrom: 'rent',
      amount: pounds('560.00'),
      end: { kind: 'never' },
    });
    // The November £600 one-off change stays with the old series.
    expect(after.changes?.filter((c) => c.seriesId === 'rent')).toEqual([
      { seriesId: 'rent', originalDate: '2026-11-01', amount: pounds('600.00') },
    ]);
  });

  it('lowers every balance from the January rent on by £10, and from the February rent by £20', () => {
    let rentsAt560 = 0;
    for (const [date, name, , moved] of rowsMoved(before, plan)) {
      if (name === 'Rent' && date >= '2027-01-01') rentsAt560 += 1;
      expect(moved, `${date} ${name}`).toBe(formatPounds(-1000 * rentsAt560));
    }
    expect(rentsAt560).toBe(2);
    expect(monthEnds(plan)).toEqual(['604.53', '732.91', '1024.60', '2225.89', '3284.87']);
  });
});

describe('test 25 (brief 8.4 test 2): only the note on pay, from Fri 4 Dec, this and all later ones', () => {
  const { after } = edited(sam, {
    kind: 'this-and-later',
    seriesId: 'pay',
    originalDate: '2026-12-04',
    edits: { note: 'From the new rota' },
    newSeriesId: 'pay-from-4-dec',
  });
  const plan = workOutPlan(after);
  const pay = (input: PlanInput) =>
    workOutPayments({
      series: input.series,
      changes: input.changes ?? [],
      holidays: input.holidays,
      from: '2026-10-25',
      to: '2027-02-28',
    }).filter((p) => p.name === 'Pay');

  it('keeps every pay amount exactly the same, and the 4-week pattern carries on', () => {
    expect(pay(after).map((p) => [p.date, p.amount])).toEqual(
      pay(sam).map((p) => [p.date, p.amount]),
    );
    expect(
      pay(after)
        .filter((p) => p.date >= '2026-12-04')
        .slice(0, 5)
        .map((p) => [p.number, formatPounds(p.amount)]),
    ).toEqual([
      [5, '618.46'],
      [6, '469.06'],
      [7, '592.17'],
      [8, '452.17'],
      [9, '618.46'],
    ]);
    expect(pay(after).map((p) => p.note)).toEqual(
      pay(sam).map((p) => (p.date >= '2026-12-04' ? 'From the new rota' : null)),
    );
  });

  it('leaves every balance exactly as it was', () => {
    expect(rowsMoved(before, plan).every(([, , , moved]) => moved === '0.00')).toBe(true);
    const days = (one: Plan) =>
      accountOf(one).days.map((day) => [day.date, day.balance, day.status]);
    expect(days(plan)).toEqual(days(before));
    expect(monthEnds(plan)).toEqual(['604.53', '732.91', '1024.60', '2235.89', '3304.87']);
  });
});

describe('test 26 (brief 8.4 test 3): £640 as the real pay on Fri 6 Nov, just this one', () => {
  const plan = planAfter({
    kind: 'just-this-one',
    seriesId: 'pay',
    originalDate: '2026-11-06',
    edits: { amount: pounds('640.00'), isEstimate: false },
  });

  it('takes the estimate label off that payday only', () => {
    const pays = accountOf(plan).rows.filter((row) => row.payment.name === 'Pay');
    expect(pays).toHaveLength(18);
    expect(pays.filter((row) => !row.payment.isEstimate).map((row) => row.date)).toEqual([
      '2026-11-06',
    ]);
  });

  it('raises every balance from that pay on by exactly £21.54, and none before it', () => {
    const moved = rowsMoved(before, plan);
    const payRow = moved.findIndex(([date, name]) => date === '2026-11-06' && name === 'Pay');
    expect(moved[payRow]?.[2]).toBe('640.00');
    moved.forEach(([date, , , by], i) => {
      expect(by, date).toBe(i < payRow ? '0.00' : '21.54');
    });
    for (const day of accountOf(plan).days) {
      const was = accountOf(before).days.find((d) => d.date === day.date)?.balance ?? Number.NaN;
      expect(day.balance - was, day.date).toBe(day.date >= '2026-11-06' ? 2154 : 0);
    }
  });
});

describe('test 27 (brief 8.4 test 4): remove spending money from Fri 8 Jan 2027, this and all later', () => {
  const plan = planAfter({
    kind: 'remove-this-and-later',
    seriesId: 'spending-money',
    originalDate: '2027-01-08',
  });

  it('makes Fri 1 Jan 2027 the last spending money row', () => {
    const spending = accountOf(plan).rows.filter((row) => row.payment.name === 'Spending money');
    expect(spending.at(-1)?.date).toBe('2027-01-01');
    expect(spending.at(-1)?.change).toBe(-pounds('54.00'));
  });

  it('raises each balance from Fri 8 Jan by £54 for every spending money row removed by then', () => {
    const removed = ['2027-01-08', '2027-01-15', '2027-01-22', '2027-01-29'].concat([
      '2027-02-05',
      '2027-02-12',
      '2027-02-19',
      '2027-02-26',
    ]);
    for (const day of accountOf(plan).days) {
      const was = accountOf(before).days.find((d) => d.date === day.date)?.balance ?? Number.NaN;
      const gone = removed.filter((date) => date <= day.date).length;
      expect(day.balance - was, day.date).toBe(gone * pounds('54.00'));
    }
  });
});

describe('D60: "this and all later ones" drops only the one-off changes it replaces', () => {
  // March's rent changed on its own to £580; February's moved to Tue 2 Feb;
  // April's has a note; and April's is ticked as paid early, today.
  const setUp = editedInTurn(sam, [
    {
      kind: 'just-this-one',
      seriesId: 'rent',
      originalDate: '2027-03-01',
      edits: { amount: pounds('580.00') },
    },
    { kind: 'move', seriesId: 'rent', originalDate: '2027-02-01', date: '2027-02-02' },
    {
      kind: 'just-this-one',
      seriesId: 'rent',
      originalDate: '2027-04-01',
      edits: { note: 'Ask about the boiler' },
    },
    {
      kind: 'tick',
      seriesId: 'rent',
      originalDate: '2027-04-01',
      tickedAt: '2026-10-25T10:00:00Z',
    },
  ]);
  const { after } = edited(setUp, {
    kind: 'this-and-later',
    seriesId: 'rent',
    originalDate: '2027-01-01',
    edits: { amount: pounds('560.00') },
    newSeriesId: 'rent-from-jan',
  });
  const rent = paymentsOfSeries(after, 'rent-from-jan', '2027-01-01', '2027-05-31');

  it('makes March £560: the one-off amount is replaced', () => {
    expect(rent.map((p) => [p.originalDate, formatPounds(p.amount)])).toEqual([
      ['2027-01-01', '560.00'],
      ['2027-02-01', '560.00'],
      ['2027-03-01', '560.00'],
      ['2027-04-01', '560.00'],
      ['2027-05-01', '560.00'],
    ]);
    expect(after.changes?.some((c) => c.originalDate === '2027-03-01')).toBe(false);
  });

  it('keeps the moved date, the note and the tick, now on the new series', () => {
    expect(rent.find((p) => p.originalDate === '2027-02-01')?.date).toBe('2027-02-02');
    expect(rent.find((p) => p.originalDate === '2027-04-01')?.note).toBe('Ask about the boiler');
    expect(after.changes?.filter((c) => c.seriesId === 'rent-from-jan')).toEqual([
      { seriesId: 'rent-from-jan', originalDate: '2027-02-01', newDate: '2027-02-02' },
      { seriesId: 'rent-from-jan', originalDate: '2027-04-01', note: 'Ask about the boiler' },
    ]);
    expect(after.ticks).toEqual([
      {
        seriesId: 'rent-from-jan',
        originalDate: '2027-04-01',
        tickedAt: '2026-10-25T10:00:00Z',
        paidOn: '2026-10-25',
      },
    ]);
  });
});

describe('D14 and D81: Move to next payday, on Sun 25 Oct', () => {
  it('moves the Driving lesson on Mon 26 Oct to Fri 30 Oct', () => {
    const plan = planAfter({
      kind: 'move-to-next-payday',
      seriesId: 'driving-lessons',
      originalDate: '2026-10-26',
    });
    const lessons = accountOf(plan).rows.filter((row) => row.payment.name === 'Driving lesson');
    expect(lessons.map((row) => row.date).slice(0, 2)).toEqual(['2026-10-30', '2026-11-17']);
  });

  it('moves Rent on Sun 1 Nov to Fri 6 Nov', () => {
    const plan = planAfter({
      kind: 'move-to-next-payday',
      seriesId: 'rent',
      originalDate: '2026-11-01',
    });
    const rent = accountOf(plan).rows.filter((row) => row.payment.name === 'Rent');
    expect(rent.map((row) => [row.date, formatPounds(row.change)])[0]).toEqual([
      '2026-11-06',
      '-600.00',
    ]);
  });

  it('moves a payment already on a payday to the payday after, because "next" means after its date', () => {
    const plan = planAfter({
      kind: 'move-to-next-payday',
      seriesId: 'spending-money',
      originalDate: '2026-10-30',
    });
    const spending = accountOf(plan).rows.filter((row) => row.payment.name === 'Spending money');
    expect(spending.slice(0, 2).map((row) => [row.date, formatPounds(row.change)])).toEqual([
      ['2026-11-06', '-45.00'],
      ['2026-11-06', '-54.00'],
    ]);
  });
});

describe('a split on a series that ends after a number of payments', () => {
  it("keeps the Laptop loan's 3 payments from Sun 20 Dec, the last at £34.00", () => {
    const { after } = edited(sam, {
      kind: 'this-and-later',
      seriesId: 'laptop-loan',
      originalDate: '2027-01-20',
      edits: { note: 'Paying from the new account' },
      newSeriesId: 'laptop-loan-from-jan',
    });
    const loan = workOutPayments({
      series: after.series,
      changes: after.changes ?? [],
      holidays: after.holidays,
      from: '2026-12-01',
      to: '2028-12-31',
    }).filter((p) => p.name === 'Laptop loan');
    expect(loan.map((p) => [p.date, formatPounds(p.amount), p.note, p.isLast])).toEqual([
      ['2026-12-20', '150.00', null, false],
      ['2027-01-20', '150.00', 'Paying from the new account', false],
      ['2027-02-20', '34.00', 'Paying from the new account', true],
    ]);
    // The old series ends by count, after 1 payment, and loses the last amount.
    expect(after.series.find((one) => one.id === 'laptop-loan')).toMatchObject({
      end: { kind: 'after', payments: 1 },
    });
    expect(after.series.find((one) => one.id === 'laptop-loan')?.lastAmount).toBeUndefined();
    expect(after.series.find((one) => one.id === 'laptop-loan-from-jan')).toMatchObject({
      end: { kind: 'after', payments: 3 },
      firstNumber: 1,
      lastAmount: pounds('34.00'),
    });
  });
});

describe('D90 and D92: amounts after a change or a removal on the Laptop loan', () => {
  const loan = (input: PlanInput) =>
    workOutPayments({
      series: input.series,
      changes: input.changes ?? [],
      holidays: input.holidays,
      from: '2026-12-01',
      to: '2028-12-31',
    })
      .filter((p) => p.name === 'Laptop loan')
      .map((p) => [p.date, formatPounds(p.amount)]);

  it('keeps the different last amount when an earlier payment changes for this and all later ones', () => {
    const { after } = edited(sam, {
      kind: 'this-and-later',
      seriesId: 'laptop-loan',
      originalDate: '2027-01-20',
      edits: { amount: pounds('100.00') },
      newSeriesId: 'laptop-loan-from-jan',
    });
    expect(loan(after)).toEqual([
      ['2026-12-20', '150.00'],
      ['2027-01-20', '100.00'],
      ['2027-02-20', '34.00'],
    ]);
  });

  it('changes the last payment itself when that is the one changed', () => {
    const { after } = edited(sam, {
      kind: 'this-and-later',
      seriesId: 'laptop-loan',
      originalDate: '2027-02-20',
      edits: { amount: pounds('40.00') },
      newSeriesId: 'laptop-loan-last',
    });
    expect(loan(after)).toEqual([
      ['2026-12-20', '150.00'],
      ['2027-01-20', '150.00'],
      ['2027-02-20', '40.00'],
    ]);
  });

  it('leaves £150 and £150 when the £34 payment is removed', () => {
    const { after } = edited(sam, {
      kind: 'remove-this-and-later',
      seriesId: 'laptop-loan',
      originalDate: '2027-02-20',
    });
    expect(loan(after)).toEqual([
      ['2026-12-20', '150.00'],
      ['2027-01-20', '150.00'],
    ]);
  });

  it("replaces Sam's pay pattern with one amount when pay changes for this and all later ones", () => {
    const { after } = edited(sam, {
      kind: 'this-and-later',
      seriesId: 'pay',
      originalDate: '2026-12-04',
      edits: { amount: pounds('600.00') },
      newSeriesId: 'pay-from-4-dec',
    });
    const pays = workOutPayments({
      series: after.series,
      changes: after.changes ?? [],
      holidays: after.holidays,
      from: '2026-11-20',
      to: '2026-12-25',
    }).filter((p) => p.name === 'Pay');
    expect(pays.map((p) => [p.date, formatPounds(p.amount)])).toEqual([
      // Payments 3 and 4 keep the pattern: cycle[3] and cycle[0].
      ['2026-11-20', '592.17'],
      ['2026-11-27', '452.17'],
      ['2026-12-04', '600.00'],
      ['2026-12-11', '600.00'],
      ['2026-12-18', '600.00'],
      ['2026-12-25', '600.00'],
    ]);
  });
});
