// What the step 1g engine review found and fixed (D138 to D141), each with
// the example that showed it.

import { describe, expect, it } from 'vitest';
import {
  checkPayslip,
  type EditCommand,
  type EditInput,
  editPlan,
  formatPounds,
  type Goal,
  type PlanInput,
  parseTaxCode,
  type Series,
  workOutDebts,
  workOutGoals,
  workOutPayments,
  workOutPlan,
  workOutTakeHome,
} from '../../src/index.ts';
import { edited } from '../fixtures/edit.ts';
import { englandAndWales, noBankHolidays } from '../fixtures/holidays.ts';
import { basic, premium, samPayPlan, samSettings } from '../fixtures/pay.ts';
import { accountOf, balanceUpdate, planInput, pounds } from '../fixtures/plan.ts';
import { samPlan } from '../fixtures/sam.ts';
import { series } from '../fixtures/series.ts';

describe('D138: a payment ticked before an update, but paid after its balance date', () => {
  // On Tue 3 Nov at 9am the person types in their balance as it was on Sun
  // 1 Nov. They had ticked the £25.00 phone bill, paid Mon 2 Nov, at 6pm on
  // the Monday: it isn't in a balance from Sunday.
  const phone = series({
    id: 'phone',
    name: 'Phone',
    amount: pounds('25.00'),
    start: '2026-11-02',
    schedule: { kind: 'once' },
  });
  const rent = series({
    id: 'rent',
    name: 'Rent',
    amount: pounds('400.00'),
    start: '2026-11-01',
    schedule: { kind: 'once' },
  });
  const plan = (ticks: NonNullable<PlanInput['ticks']>) =>
    workOutPlan(
      planInput({
        today: '2026-11-03',
        to: '2026-11-10',
        balanceUpdates: [balanceUpdate('current', '500.00', '2026-11-01', '2026-11-03T09:00:00Z')],
        series: [phone, rent],
        ticks,
      }),
    );

  it('takes it off on the day it was paid, not counting it as inside the balance', () => {
    const current = accountOf(
      plan([
        {
          seriesId: 'rent',
          originalDate: '2026-11-01',
          tickedAt: '2026-11-01T08:00:00Z',
          paidOn: '2026-11-01',
        },
        {
          seriesId: 'phone',
          originalDate: '2026-11-02',
          tickedAt: '2026-11-02T18:00:00Z',
          paidOn: '2026-11-02',
        },
      ]),
    );
    // The rent, paid on the balance date, is inside it (brief 5.5 rule 1).
    expect(
      current.rows.map((row) => [row.date, row.payment.name, formatPounds(row.leftAfter)]),
    ).toEqual([['2026-11-02', 'Phone', '475.00']]);
    expect(current.days.find((day) => day.date === '2026-11-03')?.balance).toBe(pounds('475.00'));
  });

  it('still counts a tick made inside the Update balance steps as inside it (D33)', () => {
    const current = accountOf(
      plan([
        {
          seriesId: 'phone',
          originalDate: '2026-11-02',
          tickedAt: '2026-11-03T09:00:30Z',
          paidOn: '2026-11-02',
          inBalanceUpdate: 'current-2026-11-03T09:00:00Z',
        },
        {
          seriesId: 'rent',
          originalDate: '2026-11-01',
          tickedAt: '2026-11-01T08:00:00Z',
          paidOn: '2026-11-01',
        },
      ]),
    );
    expect(current.rows).toEqual([]);
  });

  it('takes it off a debt updated from an older statement: £75.00 left now, paid off Tue 2 Feb 2027', () => {
    const payment = series({
      id: 'loan-payment',
      name: 'Loan',
      amount: pounds('25.00'),
      start: '2026-11-02',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 2 } },
      type: 'debt',
      debtId: 'loan',
    });
    const debts = workOutDebts({
      debts: [
        {
          id: 'loan',
          name: 'Loan',
          kind: 'loan',
          currency: 'GBP',
          balance: pounds('100.00'),
          balanceOn: '2026-11-01',
          balanceAt: '2026-11-03T09:00:00Z',
          startingBalance: pounds('100.00'),
        },
      ],
      series: [payment],
      ticks: [
        {
          seriesId: 'loan-payment',
          originalDate: '2026-11-02',
          tickedAt: '2026-11-02T18:00:00Z',
          paidOn: '2026-11-02',
        },
      ],
      holidays: noBankHolidays,
      today: '2026-11-03',
      to: '2027-12-31',
    });
    const loan = debts.debts[0];
    expect([formatPounds(loan?.leftNow ?? 0), loan?.paidOffOn]).toEqual(['75.00', '2027-02-02']);
  });
});

describe('D141: smaller fixes to records and edits', () => {
  it('refuses two balance updates for one account at the same moment, in any order (D85)', () => {
    const a = balanceUpdate('current', '100.00', '2026-10-24', '2026-10-24T10:00:00Z', 'a');
    const b = balanceUpdate('current', '120.00', '2026-10-24', '2026-10-24T10:00:00Z', 'b');
    const c = balanceUpdate('current', '140.00', '2026-10-25', '2026-10-25T10:00:00Z', 'c');
    for (const order of [
      [a, b, c],
      [c, a, b],
      [a, c, b],
    ]) {
      expect(() =>
        workOutPlan(planInput({ today: '2026-10-25', to: '2026-10-31', balanceUpdates: order })),
      ).toThrow(expect.objectContaining({ code: 'same-time-balances' }));
    }
  });

  it('gives the right pattern step whatever the offset, and refuses a payment number no plan reaches', () => {
    const pattern = (cycleOffset: number) =>
      workOutPayments({
        series: [
          series({
            amount: 100,
            amountCycle: [100, 200, 300, 400],
            cycleOffset,
            start: '2026-11-02',
            schedule: { kind: 'weekly', every: 1 },
          }),
        ],
        holidays: noBankHolidays,
        from: '2026-11-02',
        to: '2026-11-30',
      }).map((one) => one.amount);
    expect(pattern(Number.MAX_SAFE_INTEGER)).toEqual(pattern(Number.MAX_SAFE_INTEGER % 4));
    expect(pattern(3)).toEqual([400, 100, 200, 300, 400]);
    expect(() =>
      workOutPayments({
        series: [series({ start: '2026-11-02', schedule: { kind: 'once' }, firstNumber: 100_001 })],
        holidays: noBankHolidays,
        from: '2026-11-01',
        to: '2026-11-30',
      }),
    ).toThrow(expect.objectContaining({ code: 'bad-number' }));
  });

  it('takes an end on Tue 31 Dec 2999, the last day there can be, as never ending', () => {
    const monthly = (end: Series['end']) =>
      workOutPayments({
        series: [
          series({
            start: '2026-11-01',
            schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
            end,
          }),
        ],
        holidays: noBankHolidays,
        from: '2026-11-01',
        to: '2027-02-28',
      });
    expect(monthly({ kind: 'on', date: '2999-12-31' })).toEqual(monthly({ kind: 'never' }));
  });

  it('treats a payment’s own date sent as its new date as no new date (D60, D91)', () => {
    // Monthly on the first Monday, with a note from Mon 7 Dec for this and all later ones.
    const firstMonday = series({
      id: 'club',
      name: 'Club',
      start: '2026-11-02',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'weekday', weekday: 1, position: 1 } },
    });
    const input: EditInput = {
      ...planInput({ today: '2026-11-02', to: '2027-03-31' }),
      balanceUpdates: [balanceUpdate('current', '100.00', '2026-11-02')],
      series: [firstMonday],
    };
    const command = (edits: { note: string; date?: string }): EditCommand => ({
      kind: 'this-and-later',
      seriesId: 'club',
      originalDate: '2026-12-07',
      edits,
      newSeriesId: 'club-later',
    });
    const dates = (after: EditInput) =>
      workOutPayments({
        series: after.series,
        holidays: noBankHolidays,
        from: '2026-11-01',
        to: '2027-03-31',
      }).map((one) => one.date);
    const withDate = edited(input, command({ note: 'New coach', date: '2026-12-07' })).after;
    const withoutDate = edited(input, command({ note: 'New coach' })).after;
    expect(dates(withDate)).toEqual(dates(withoutDate));
    expect(dates(withDate)).toEqual([
      '2026-11-02',
      '2026-12-07',
      '2027-01-04',
      '2027-02-01',
      '2027-03-01',
    ]);
  });
});

describe('D140: overtime and missed shifts, the payday a shift is paid on, and the payslip check', () => {
  const plan = samPayPlan();
  const overtime = (id: string, workedOn: string, fields: Partial<EditCommand> = {}): EditCommand =>
    ({ kind: 'overtime', id, seriesId: 'pay', workedOn, hours: '11.5', ...fields }) as EditCommand;
  const payOn = (input: EditInput, date: string) =>
    accountOf(workOutPlan(input as PlanInput)).rows.find(
      (row) => row.payment.seriesId === 'pay' && row.date === date,
    )?.change;

  it('works the other shift out again when one of two on the same payday is removed', () => {
    const both = edited(
      edited(plan, overtime('a', '2026-10-26')).after,
      overtime('b', '2026-10-27'),
    ).after;
    const bOnly = edited(plan, overtime('b', '2026-10-27')).after;
    // B on its own raises Fri 6 Nov by £155.12, like A, but on top of A it's
    // more, because A has already taken the pay past the pension band.
    expect(payOn(bOnly, '2026-11-06')).toBe(pounds('773.58'));
    const removedA = edited(both, { kind: 'remove-pay-adjustment', id: 'a' }).after;
    expect(payOn(removedA, '2026-11-06')).toBe(pounds('773.58'));
    expect(removedA.payAdjustments).toEqual(bOnly.payAdjustments);
  });

  it('refuses to undo the first of two shifts on a payday, but not the second', () => {
    const editA = editPlan(plan, overtime('a', '2026-10-26'));
    const withA = edited(plan, overtime('a', '2026-10-26')).after;
    const editB = editPlan(withA, overtime('b', '2026-10-27'));
    const both = edited(withA, overtime('b', '2026-10-27')).after;
    expect(() => editPlan(both, { kind: 'undo', edit: editA })).toThrow(
      expect.objectContaining({ code: 'changed-since' }),
    );
    const undoneB = edited(both, { kind: 'undo', edit: editB }).after;
    expect(undoneB.payAdjustments).toEqual(withA.payAdjustments);
  });

  it('refuses an undo that would take away the payday of an overtime saved since (D87)', () => {
    const removeEdit = editPlan(plan, {
      kind: 'remove-this-and-later',
      seriesId: 'pay',
      originalDate: '2026-11-06',
    });
    const removed = edited(plan, {
      kind: 'remove-this-and-later',
      seriesId: 'pay',
      originalDate: '2026-11-06',
    }).after;
    const putBack = editPlan(removed, { kind: 'undo', edit: removeEdit });
    const back = edited(removed, { kind: 'undo', edit: removeEdit }).after;
    const withOvertime = edited(back, overtime('a', '2026-10-26')).after;
    expect(() => editPlan(withOvertime, { kind: 'undo', edit: putBack })).toThrow(
      expect.objectContaining({ code: 'changed-since' }),
    );
  });

  it('refuses removing overtime when a missed shift on that payday would take off more extras than it has', () => {
    const withExtras = edited(
      plan,
      overtime('a', '2026-10-26', { extras: pounds('50.00') } as Partial<EditCommand>),
    ).after;
    const withMissed = edited(withExtras, {
      kind: 'missed-shift',
      id: 'b',
      seriesId: 'pay',
      workedOn: '2026-10-28',
      hours: '11.5',
      extras: pounds('260.23'),
    }).after;
    expect(() => editPlan(withMissed, { kind: 'remove-pay-adjustment', id: 'a' })).toThrow(
      expect.objectContaining({ code: 'too-much-extras' }),
    );
  });

  it('puts a shift on the payday that covers its work, even when another payday is moved before it', () => {
    // Fri 13 Nov's pay moved to Thu 5 Nov still covers work up to Sun 8 Nov,
    // so Mon 26 Oct is still paid on Fri 6 Nov, payment 1.
    const moved = edited(plan, {
      kind: 'move',
      seriesId: 'pay',
      originalDate: '2026-11-13',
      date: '2026-11-05',
    }).after;
    const saved = edited(moved, overtime('a', '2026-10-26')).after.payAdjustments?.[0];
    expect([saved?.number, formatPounds(saved?.change ?? 0)]).toEqual([1, '155.12']);
  });

  it('reads NONCUM on a payslip as an emergency code, on the week 1/month 1 basis', () => {
    expect(parseTaxCode('1257L NONCUM')).toEqual(parseTaxCode('1257L W1'));
    expect(parseTaxCode('S1257L NONCUM')).toMatchObject({ regime: 'scotland', weekOne: true });
  });

  it('doesn’t list National Insurance or take-home pay 1p away, as brief 8.6 allows', () => {
    const week26 = {
      settings: samSettings,
      soFar: {
        taxYear: '2026-27',
        period: 25,
        grossForTax: pounds('7927.57'),
        taxPaid: pounds('375.80'),
      },
      payDate: '2026-10-02',
      lines: [basic('34.5')],
      fixed: premium('114.69'),
    };
    const expected = workOutTakeHome(week26);
    const check = (nationalInsurance: number, takeHome: number, tax: number) =>
      checkPayslip(week26, { nationalInsurance, takeHome, tax }).differences.map(
        (one) => one.figure,
      );
    expect(check(expected.nationalInsurance + 1, expected.takeHome - 1, expected.tax)).toEqual([]);
    expect(check(expected.nationalInsurance + 2, expected.takeHome, expected.tax + 1)).toEqual([
      'tax',
      'nationalInsurance',
    ]);
  });

  it('refuses another deduction below zero, which would add to take-home pay', () => {
    expect(() =>
      workOutTakeHome({
        settings: { ...samSettings, otherDeductions: [{ name: 'Union', amount: -5000 }] },
        payDate: '2026-11-06',
        lines: [basic('40')],
      }),
    ).toThrow(expect.objectContaining({ code: 'negative-pence' }));
  });
});

describe('D139: a savings goal that drops back below its target', () => {
  const into = series({
    id: 'in',
    accountId: 'current',
    toAccountId: 'savings',
    name: 'To savings',
    direction: 'transfer',
    amount: pounds('50.00'),
    start: '2026-11-06',
    schedule: { kind: 'weekly', every: 1 },
    type: 'savings',
    goalId: 'holiday',
  });
  const out = (amount: string, date: string, id = 'out') =>
    series({
      id,
      accountId: 'savings',
      toAccountId: 'current',
      name: 'From savings',
      direction: 'transfer',
      amount: pounds(amount),
      start: date,
      schedule: { kind: 'once' },
      type: 'savings',
      goalId: 'holiday',
    });
  const goal = (startingAmount: string): Goal => ({
    id: 'holiday',
    name: 'Holiday',
    target: pounds('1000.00'),
    targetDate: '2027-06-01',
    accountId: 'savings',
    startingAmount: pounds(startingAmount),
  });
  const ticked = (seriesId: string, date: string) => ({
    seriesId,
    originalDate: date,
    tickedAt: `${date}T12:00:00Z`,
    paidOn: date,
  });

  it('is reached again on the day it gets back to the target', () => {
    // £1,000 to start, £300 taken out on Tue 20 Oct, then £50 a week in.
    const plan = workOutGoals({
      goals: [goal('1000.00')],
      series: [out('300.00', '2026-10-20'), into],
      ticks: [ticked('out', '2026-10-20')],
      holidays: englandAndWales,
      today: '2026-10-25',
      to: '2027-10-25',
    }).goals[0];
    expect([formatPounds(plan?.savedSoFar ?? 0), plan?.reachedNow]).toEqual(['700.00', false]);
    expect([plan?.reachedOn, plan?.reachedWith, plan?.byTargetDate]).toEqual([
      '2026-12-11',
      7,
      true,
    ]);
  });

  it('isn’t shown as reached when money taken out leaves it below the target', () => {
    const plan = workOutGoals({
      goals: [goal('700.00')],
      series: [
        series({
          id: 'gift',
          accountId: 'current',
          toAccountId: 'savings',
          name: 'Gift',
          direction: 'transfer',
          amount: pounds('300.00'),
          start: '2026-10-10',
          schedule: { kind: 'once' },
          type: 'savings',
          goalId: 'holiday',
        }),
        out('300.00', '2026-10-20'),
      ],
      ticks: [ticked('gift', '2026-10-10'), ticked('out', '2026-10-20')],
      holidays: englandAndWales,
      today: '2026-10-25',
      to: '2027-10-25',
    }).goals[0];
    expect([plan?.reachedNow, plan?.reachedOn, plan?.percentSaved]).toEqual([false, null, 70]);
  });

  it('keeps the owner’s test: £1,200 by Fri 9 Apr 2027 with the 24th move (D114)', () => {
    const plan = workOutGoals({
      goals: [{ ...goal('0.00'), target: pounds('1200.00'), targetDate: '2027-07-30' }],
      series: [{ ...into, start: '2026-10-30' }],
      holidays: englandAndWales,
      today: '2026-10-25',
      to: '2027-10-25',
    }).goals[0];
    expect([plan?.reachedOn, plan?.reachedWith]).toEqual(['2027-04-09', 24]);
  });
});

describe('Sam’s plan is unchanged by every fix', () => {
  it('still has its lowest point of £4.53 on Sun 1 Nov', () => {
    const current = accountOf(workOutPlan(samPlan()));
    expect([current.lowestPoint.date, formatPounds(current.lowestPoint.balance)]).toEqual([
      '2026-11-01',
      '4.53',
    ]);
  });
});
