// The other people from brief Part 2 through the balance rule (step 1b):
// tests 16 and 17, the next main payday for irregular pay (D66) and plan
// periods (D14).

import { describe, expect, it } from 'vitest';
import {
  formatPounds,
  groupIntoPeriods,
  type PlanInput,
  type Series,
  workOutPlan,
} from '../../src/index.ts';
import { englandAndWales } from '../fixtures/holidays.ts';
import {
  account,
  accountOf,
  balanceUpdate,
  planInput,
  pounds,
  rowsText,
} from '../fixtures/plan.ts';
import { series } from '../fixtures/series.ts';

describe('test 16: Jess and Tom move £600 to the joint account on payday', () => {
  const jessPay = series({
    id: 'jess-pay',
    accountId: 'jess',
    name: 'Pay',
    direction: 'in',
    amount: pounds('2100.00'),
    start: '2026-10-28',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } },
    type: 'pay',
  });
  const toJoint = series({
    id: 'to-joint',
    accountId: 'jess',
    toAccountId: 'joint',
    name: 'To the joint account',
    direction: 'transfer',
    amount: pounds('600.00'),
    start: '2026-10-28',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } },
    type: 'bills',
  });
  const bills = series({
    id: 'joint-bills',
    accountId: 'joint',
    name: 'Bills',
    amount: pounds('450.00'),
    start: '2026-11-01',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
    type: 'bills',
  });
  const input = (list: readonly Series[]): PlanInput =>
    planInput({
      today: '2026-10-26',
      to: '2026-12-31',
      accounts: [account('jess'), account('tom'), account('joint', { kind: 'joint' })],
      balanceUpdates: [
        balanceUpdate('jess', '310.00', '2026-10-26'),
        balanceUpdate('tom', '420.00', '2026-10-26'),
        balanceUpdate('joint', '95.00', '2026-10-26'),
      ],
      series: list,
      mainPayFamilyId: 'jess-pay',
    });
  const without = workOutPlan(input([jessPay, bills]));
  const withTransfer = workOutPlan(input([jessPay, toJoint, bills]));

  it("lowers Jess's balance and raises the joint account's by £600, on payday, after the pay", () => {
    expect(rowsText(withTransfer, 'jess').slice(0, 2)).toEqual([
      '2026-10-28 Pay 2100.00 2410.00',
      '2026-10-28 To the joint account -600.00 1810.00',
    ]);
    expect(rowsText(withTransfer, 'joint')[0]).toBe(
      '2026-10-28 To the joint account 600.00 695.00',
    );
    const balanceOn = (plan: typeof without, id: string, date: string) =>
      accountOf(plan, id).days.find((day) => day.date === date)?.balance ?? Number.NaN;
    expect(
      balanceOn(without, 'jess', '2026-10-28') - balanceOn(withTransfer, 'jess', '2026-10-28'),
    ).toBe(pounds('600.00'));
    expect(
      balanceOn(withTransfer, 'joint', '2026-10-28') - balanceOn(without, 'joint', '2026-10-28'),
    ).toBe(pounds('600.00'));
  });

  it('leaves the total across all accounts unchanged on every day', () => {
    const total = (plan: typeof without, i: number) =>
      plan.accounts.reduce((sum, one) => sum + (one.days[i]?.balance ?? Number.NaN), 0);
    const days = accountOf(without, 'jess').days.length;
    for (let i = 0; i < days; i += 1) {
      expect(total(withTransfer, i)).toBe(total(without, i));
    }
    expect(accountOf(withTransfer, 'tom').days).toEqual(accountOf(without, 'tom').days);
  });

  it('keeps the joint account off the floor that it would hit without the transfer', () => {
    // Without Jess's £600, the £450 bills take the joint account under zero.
    expect(accountOf(without, 'joint').shortfalls.map((s) => [s.date, s.amount])).toEqual([
      ['2026-11-01', pounds('355.00')],
    ]);
    expect(accountOf(withTransfer, 'joint').shortfalls).toEqual([]);
  });
});

describe('test 17: Ali with a £1,000 overdraft', () => {
  const ali = (balance: string, payments: readonly Series[] = []) =>
    accountOf(
      workOutPlan(
        planInput({
          today: '2026-11-02',
          to: '2026-11-30',
          accounts: [account('current', { overdraftLimit: pounds('1000.00') })],
          balanceUpdates: [balanceUpdate('current', balance, '2026-11-02')],
          series: payments,
        }),
      ),
    );

  it('shows −£300 as Tight, not Short', () => {
    const plan = ali('-300.00');
    expect(plan.floor).toBe(pounds('-1000.00'));
    expect(plan.lowestPoint.status).toBe('tight');
    expect(plan.firstUnderWarning?.date).toBe('2026-11-02');
    expect(plan.shortfalls).toEqual([]);
  });

  it('counts only a balance below −£1,000 as a shortfall', () => {
    const phone = series({
      id: 'phone',
      name: 'Phone',
      amount: pounds('700.00'),
      start: '2026-11-10',
      schedule: { kind: 'once' },
    });
    const books = series({
      id: 'books',
      name: 'Books',
      amount: 1,
      start: '2026-11-20',
      schedule: { kind: 'once' },
    });
    const plan = ali('-300.00', [phone, books]);
    expect(plan.rows.map((row) => [row.date, formatPounds(row.leftAfter), row.status])).toEqual([
      ['2026-11-10', '-1000.00', 'tight'],
      ['2026-11-20', '-1000.01', 'short'],
    ]);
    expect(plan.shortfalls.map((s) => [s.date, s.amount, s.lastDate])).toEqual([
      ['2026-11-20', 1, '2026-11-30'],
    ]);
  });
});

describe('owner test 7 and D66: Kofi, whose main pay is irregular', () => {
  const kofi = planInput({
    today: '2026-10-28', // a Wednesday
    to: '2026-11-30',
    balanceUpdates: [balanceUpdate('current', '640.00', '2026-10-28')],
    series: [
      series({
        id: 'driving-work',
        name: 'Driving work',
        direction: 'in',
        amount: pounds('400.00'),
        start: '2026-10-30',
        schedule: { kind: 'irregular' },
        type: 'pay',
        isEstimate: true,
      }),
      series({
        id: 'van-finance',
        name: 'Van finance',
        amount: pounds('289.00'),
        start: '2026-11-05',
        schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 5 } },
        type: 'debt',
      }),
    ],
    mainPayFamilyId: 'driving-work',
  });
  const plan = workOutPlan(kofi);

  it('gets Mon 2 Nov as the next main payday on Wed 28 Oct 2026', () => {
    expect(plan.mainPay).toBe('irregular');
    expect(plan.nextMainPayday).toBe('2026-11-02');
  });

  it('gets the Monday after, on a Monday', () => {
    expect(workOutPlan({ ...kofi, today: '2026-11-02' }).nextMainPayday).toBe('2026-11-09');
  });

  it('groups his plan into weeks from Monday to Sunday (D14)', () => {
    const periods = groupIntoPeriods(plan, 'pay').accounts[0]?.periods ?? [];
    expect(periods.map((period) => [period.start, period.end, period.from, period.to])).toEqual([
      ['2026-10-26', '2026-11-01', '2026-10-28', '2026-11-01'],
      ['2026-11-02', '2026-11-08', '2026-11-02', '2026-11-08'],
      ['2026-11-09', '2026-11-15', '2026-11-09', '2026-11-15'],
      ['2026-11-16', '2026-11-22', '2026-11-16', '2026-11-22'],
      ['2026-11-23', '2026-11-29', '2026-11-23', '2026-11-29'],
      ['2026-11-30', '2026-12-06', '2026-11-30', '2026-11-30'],
    ]);
    expect(periods.map((period) => formatPounds(period.cameIn))).toEqual([
      '400.00',
      '400.00',
      '400.00',
      '400.00',
      '400.00',
      '0.00',
    ]);
  });
});

describe('D14: plan periods from the main pay', () => {
  // Priya: £2,100 on the last working day of the month, moved to the working
  // day before (brief 8.5).
  const salary = series({
    id: 'salary',
    name: 'Salary',
    direction: 'in',
    amount: pounds('2100.00'),
    start: '2026-10-01',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
    holidayRule: 'working-day-before',
    type: 'pay',
  });
  const priya = planInput({
    today: '2026-11-02',
    to: '2027-01-31',
    balanceUpdates: [balanceUpdate('current', '1500.00', '2026-11-02')],
    series: [salary],
    mainPayFamilyId: 'salary',
    holidays: englandAndWales,
  });
  const boundsOf = (input: PlanInput, by: 'pay' | 'months' = 'pay') =>
    (groupIntoPeriods(workOutPlan(input), by).accounts[0]?.periods ?? []).map((period) => [
      period.start,
      period.end,
    ]);

  it('runs from one main payday to the day before the next', () => {
    expect(boundsOf(priya)).toEqual([
      ['2026-10-30', '2026-11-29'], // Fri 30 Oct is October's last working day
      ['2026-11-30', '2026-12-30'],
      ['2026-12-31', '2027-01-28'],
      ['2027-01-29', '2027-02-25'], // cut at 31 Jan in the plan, ends before Fri 26 Feb
    ]);
    expect(workOutPlan(priya).nextMainPayday).toBe('2026-11-30');
  });

  it('counts a moved payday on its new date', () => {
    const moved = {
      ...priya,
      changes: [{ seriesId: 'salary', originalDate: '2026-11-30', newDate: '2026-11-27' }],
    };
    expect(boundsOf(moved).slice(0, 2)).toEqual([
      ['2026-10-30', '2026-11-26'],
      ['2026-11-27', '2026-12-30'],
    ]);
    expect(workOutPlan(moved).nextMainPayday).toBe('2026-11-27');
  });

  it("doesn't count a removed payday as a payday (D81)", () => {
    const skipped = {
      ...priya,
      changes: [{ seriesId: 'salary', originalDate: '2026-11-30', skipped: true }],
    };
    expect(boundsOf(skipped).slice(0, 1)).toEqual([['2026-10-30', '2026-12-30']]);
    expect(workOutPlan(skipped).nextMainPayday).toBe('2026-12-31');
  });

  it('groups by calendar month when asked, or when there is no main pay (D84)', () => {
    const months = [
      ['2026-11-01', '2026-11-30'],
      ['2026-12-01', '2026-12-31'],
      ['2027-01-01', '2027-01-31'],
    ];
    expect(boundsOf(priya, 'months')).toEqual(months);
    const noMainPay = workOutPlan({ ...priya, mainPayFamilyId: null });
    expect(noMainPay.mainPay).toBe('none');
    expect(noMainPay.nextMainPayday).toBeNull();
    expect(noMainPay.mainPaydays).toEqual([]);
    expect(groupIntoPeriods(noMainPay, 'pay').by).toBe('months');
    expect(boundsOf({ ...priya, mainPayFamilyId: null })).toEqual(months);
  });

  it('follows the family, so the pay still counts after a split (D49)', () => {
    const before = { ...salary, end: { kind: 'on' as const, date: '2026-12-31' } };
    const after = {
      ...salary,
      id: 'salary-from-january',
      start: '2027-01-01',
      amount: pounds('2200.00'),
      firstNumber: 3,
    };
    expect(boundsOf({ ...priya, series: [before, after] })).toEqual(boundsOf(priya));
  });
});
