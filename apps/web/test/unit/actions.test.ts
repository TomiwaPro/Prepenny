// The logic behind the four actions on Home (D197 to D200), with Sam's
// example on Sun 25 Oct 2026 and on Fri 30 Oct 2026 (brief 8.4 test 5).

import type { PlanRecords } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import { workOutActionsView } from '../../lib/actions-view.ts';
import { parseSignedAmount } from '../../lib/amount.ts';
import { formatTime, weekdayName } from '../../lib/dates.ts';
import { runEdit } from '../../lib/edit.ts';
import { englandAndWales } from '../../lib/holidays.ts';
import { workOutHome } from '../../lib/home.ts';
import {
  blankPayment,
  buildPayment,
  monthlyChoices,
  type PaymentForm,
} from '../../lib/new-payment.ts';
import { previewPayChange } from '../../lib/pay-preview.ts';
import { workOutPlanTo } from '../../lib/plan-input.ts';
import { monthsUpTo, workOutPlanView } from '../../lib/plan-view.ts';
import { strings } from '../../strings/en-GB.ts';

const SUNDAY = '2026-10-25';
const FRIDAY = '2026-10-30';
const holidays = englandAndWales();

describe('Update balance (D46, D197)', () => {
  it('on Sun 25 Oct expects £237.54, the end of today before anything is ticked', () => {
    const current = workOutActionsView(examplePlan, SUNDAY).accounts[0];
    expect([current?.name, current?.expected]).toEqual(['Current account', 23754]);
    expect(current?.toTick.map((row) => row.name)).toEqual(['Spending money until payday']);
  });

  it('on Fri 30 Oct expects £604.53, and lists the 7 payments from Sun 25 Oct, oldest first', () => {
    const view = workOutActionsView(examplePlan, FRIDAY);
    expect(view.homeAccountId).toBe('current');
    const current = view.accounts.find((one) => one.id === 'current');
    expect(current?.expected).toBe(60453);
    expect(current?.toTick.map((row) => [row.date, row.name, row.change])).toEqual([
      ['2026-10-25', 'Spending money until payday', -3000],
      ['2026-10-26', 'Family loan', -12500],
      ['2026-10-26', 'Driving lesson', -10000],
      ['2026-10-28', 'From savings', 50000],
      ['2026-10-29', 'Pay-later card', -46607],
      ['2026-10-30', 'Pay', 60306],
      ['2026-10-30', 'Spending money', -4500],
    ]);
  });

  it('with £600.00 and everything ticked as one change, has its lowest point at £0.00 on Sun 1 Nov, Tight, and one undo puts it back', () => {
    const before = workOutActionsView(examplePlan, FRIDAY);
    const rows = before.accounts.find((one) => one.id === 'current')?.toTick ?? [];
    const made = runEdit(examplePlan, FRIDAY, {
      kind: 'update-balance',
      update: {
        id: 'update-30-oct',
        accountId: 'current',
        balance: 60000,
        checkedOn: FRIDAY,
        checkedAt: '2026-10-30T09:14:00Z',
      },
      ticks: rows.map((row) => ({
        seriesId: row.seriesId,
        originalDate: row.originalDate,
        tickedAt: '2026-10-30T09:14:00Z',
      })),
    });
    const after = workOutActionsView(made.records, FRIDAY).accounts.find(
      (one) => one.id === 'current',
    );
    expect(after?.lowest).toEqual({
      balance: 0,
      date: '2026-11-01',
      after: 'Rent',
      status: 'tight',
      // Fri 30 Oct ends at £600.00, so it's first under £20 on Sun 1 Nov.
      underWarningFrom: '2026-11-01',
      short: null,
    });
    expect(after?.toTick).toEqual([]);
    const undone = runEdit(made.records, FRIDAY, { kind: 'undo', edit: made.edit }).records;
    expect(workOutHome(undone, FRIDAY)).toEqual(workOutHome(examplePlan, FRIDAY));
  });

  it('reads a balance below zero, typed with a minus sign', () => {
    expect(['-300', '−£300.00', '£-300', '600', '-0', 'ten'].map(parseSignedAmount)).toEqual([
      -30000,
      -30000,
      -30000,
      60000,
      0,
      null,
    ]);
  });
});

describe('I spent (D198)', () => {
  it('has no budgets in Sam’s example (D180)', () => {
    expect(workOutActionsView(examplePlan, SUNDAY).budgets).toEqual([]);
  });

  it('shows Travel’s week, Fri 23 to Thu 29 Oct, with £4.00 spent and £21.00 left', () => {
    const plan: PlanRecords = {
      ...examplePlan,
      budgets: [
        {
          id: 'travel',
          accountId: 'current',
          name: 'Travel',
          amount: 2500,
          every: 'week',
          leaves: 'at-start',
          rollOver: false,
          startsOn: '2026-10-23',
          createdAt: '2026-10-23T09:00:00Z',
        },
      ],
      spends: [
        {
          id: 'bus',
          budgetId: 'travel',
          amount: 400,
          spentOn: '2026-10-24',
          recordedAt: '2026-10-24T17:00:00Z',
        },
      ],
    };
    expect(workOutActionsView(plan, SUNDAY).budgets[0]?.current).toEqual({
      start: '2026-10-23',
      end: '2026-10-29',
      base: 2500,
      rolledOver: 0,
      amount: 2500,
      spent: 400,
      left: 2100,
    });
  });
});

describe('Add a payment (D199)', () => {
  const form = (fields: Partial<PaymentForm>): PaymentForm => ({
    ...blankPayment(SUNDAY, 'current', 'savings'),
    ...fields,
  });

  it('turns Car MOT, £54.85 once on Fri 13 Nov, into a new payment going out', () => {
    expect(
      buildPayment(
        form({ name: ' Car MOT ', amount: '54.85', date: '2026-11-13' }),
        SUNDAY,
        holidays,
      ),
    ).toEqual({
      ok: true,
      series: {
        accountId: 'current',
        name: 'Car MOT',
        direction: 'out',
        amount: 5485,
        start: '2026-11-13',
        schedule: { kind: 'once' },
        end: { kind: 'never' },
        holidayRule: 'keep',
        type: 'other',
        isEstimate: false,
      },
    });
  });

  it('refuses a date before today, and says what to do', () => {
    const built = buildPayment(
      form({ name: 'MOT', amount: '5', date: '2026-10-24' }),
      SUNDAY,
      holidays,
    );
    expect(built).toEqual({ ok: false, errors: { date: 'beforeToday' } });
    expect(strings.addPayment.beforeToday).toBe(
      "Pick today or a later date. If it's already gone, update your balance instead.",
    );
  });

  it('explains every box that needs changing', () => {
    const built = buildPayment(
      form({
        direction: 'transfer',
        toAccountId: 'current',
        howOften: 'monthly',
        months: '13',
        ends: 'after',
        count: 'none',
        differentLast: true,
        lastAmount: 'ten',
      }),
      SUNDAY,
      holidays,
    );
    expect(built).toEqual({
      ok: false,
      errors: {
        name: 'nameError',
        amount: 'amountError',
        toAccount: 'sameAccount',
        months: 'monthsError',
        count: 'howManyError',
        lastAmount: 'amountError',
      },
    });
  });

  it('makes every 2 weeks, every 3 months on the second Friday, chosen dates and months left out', () => {
    const weekly = buildPayment(
      form({
        name: 'A',
        amount: '1',
        howOften: 'weekly',
        weeks: '2',
        ends: 'after',
        count: '3',
        differentLast: true,
        lastAmount: '0.50',
      }),
      SUNDAY,
      holidays,
    );
    expect(
      weekly.ok && [weekly.series.schedule, weekly.series.end, weekly.series.lastAmount],
    ).toEqual([{ kind: 'weekly', every: 2 }, { kind: 'after', payments: 3 }, 50]);
    const monthly = buildPayment(
      form({
        name: 'A',
        amount: '1',
        date: '2026-11-13',
        howOften: 'monthly',
        months: '3',
        monthlyOn: 'weekday',
        ends: 'on',
        endDate: '2027-11-13',
      }),
      SUNDAY,
      holidays,
    );
    expect(monthly.ok && [monthly.series.schedule, monthly.series.end]).toEqual([
      { kind: 'monthly', every: 3, on: { kind: 'weekday', weekday: 5, position: 2 } },
      { kind: 'on', date: '2027-11-13' },
    ]);
    const councilTax = buildPayment(
      form({
        name: 'Council tax',
        amount: '132',
        date: '2026-11-01',
        howOften: 'monthly',
        leaveOut: true,
        leftOut: [3, 2],
      }),
      SUNDAY,
      holidays,
    );
    expect(councilTax.ok && councilTax.series.schedule).toEqual({
      kind: 'monthly',
      every: 1,
      on: { kind: 'day', day: 1 },
      leaveOut: [2, 3],
    });
    const dates = buildPayment(
      form({
        name: 'Loan',
        amount: '1',
        date: '2026-11-02',
        howOften: 'dates',
        laterDates: ['2027-04-26', '2027-01-11'],
      }),
      SUNDAY,
      holidays,
    );
    expect(dates.ok && dates.series.schedule).toEqual({
      kind: 'dates',
      dates: ['2026-11-02', '2027-01-11', '2027-04-26'],
    });
    expect(
      buildPayment(
        form({ name: 'Loan', amount: '1', howOften: 'dates', laterDates: ['2026-10-25'] }),
        SUNDAY,
        holidays,
      ),
    ).toEqual({ ok: false, errors: { dates: 'datesError' } });
  });

  it('offers the last day and the last working day only on those days', () => {
    // Sat 31 Oct 2026: the last day; the last working day is Fri 30 Oct.
    expect(monthlyChoices('2026-10-31', holidays)).toEqual(['day', 'last-weekday', 'last-day']);
    expect(monthlyChoices('2026-10-30', holidays)).toEqual([
      'day',
      'last-weekday',
      'last-working-day',
    ]);
    expect(monthlyChoices('2026-11-13', holidays)).toEqual(['day', 'weekday']);
  });

  it('adds Car MOT to Fri 13 Nov after Spending money, and the day ends at £365.90 instead of £420.75', () => {
    const built = buildPayment(
      form({ name: 'Car MOT', amount: '54.85', date: '2026-11-13' }),
      SUNDAY,
      holidays,
    );
    if (!built.ok) throw new Error('Car MOT should be fine.');
    const { records } = runEdit(examplePlan, SUNDAY, {
      kind: 'add-payment',
      series: { ...built.series, id: 'car-mot' },
      madeAt: '2026-11-03T22:00:00Z',
    });
    const view = workOutPlanView(records, SUNDAY);
    const period = view.accounts[0]?.periods.find((one) => one.start === '2026-11-13');
    const names = period?.rows.filter((row) => row.date === '2026-11-13').map((row) => row.name);
    expect(names).toEqual(['Pay', 'To savings', 'Spending money', 'Car MOT']);
    expect(period?.rows.find((row) => row.name === 'Car MOT')?.leftAfter).toBe(36590);
    expect(period?.rows.find((row) => row.name === 'Spending money')?.leftAfter).toBe(42075);
  });
});

describe('I did overtime and I missed a shift (D200)', () => {
  it('says 11.5 hours on Mon 26 Oct go on Fri 6 Nov, +£155.12, making it £773.58, with extras', () => {
    expect(
      previewPayChange(examplePlan, SUNDAY, {
        kind: 'overtime',
        id: 'preview',
        seriesId: 'pay',
        workedOn: '2026-10-26',
        hours: '11.5',
      }),
    ).toEqual({
      ok: true,
      payday: '2026-11-06',
      change: 15512,
      payAfter: 77358,
      rate: '19.07',
      hasExtras: true,
    });
  });

  it('says 11.5 hours missed on Tue 3 Nov come off Fri 13 Nov, −£100.43, at £12.71 an hour', () => {
    expect(
      previewPayChange(examplePlan, SUNDAY, {
        kind: 'missed-shift',
        id: 'preview',
        seriesId: 'pay',
        workedOn: '2026-11-03',
        hours: '11.5',
      }),
    ).toEqual({
      ok: true,
      payday: '2026-11-13',
      change: -10043,
      payAfter: 36863,
      rate: '12.71',
      hasExtras: true,
    });
  });

  it('gives the engine’s refusal once that payday has its real amount (D44)', () => {
    const real = runEdit(examplePlan, SUNDAY, {
      kind: 'just-this-one',
      seriesId: 'pay',
      originalDate: '2026-11-06',
      edits: { amount: 64000, isEstimate: false },
    }).records;
    expect(
      previewPayChange(real, SUNDAY, {
        kind: 'overtime',
        id: 'preview',
        seriesId: 'pay',
        workedOn: '2026-10-26',
        hours: '11.5',
      }),
    ).toEqual({ ok: false, code: 'payday-not-estimate' });
  });

  it('remembers the rate and the hours from the last overtime', () => {
    expect(workOutActionsView(examplePlan, SUNDAY).pay).toEqual([
      {
        seriesId: 'pay',
        familyId: 'pay',
        name: 'Pay',
        overtimeRate: '19.07',
        lastHours: { overtime: null, missed: null },
      },
    ]);
    const { records } = runEdit(examplePlan, SUNDAY, {
      kind: 'overtime',
      id: 'ot',
      seriesId: 'pay',
      workedOn: '2026-10-26',
      hours: '9.25',
      rate: '20.00',
    });
    expect(workOutActionsView(records, SUNDAY).pay[0]).toMatchObject({
      overtimeRate: '20.00',
      lastHours: { overtime: '9.25', missed: null },
    });
  });
});

describe('The Plan screen’s lowest point (D190)', () => {
  it('counts the months to show up to a date, counting today’s', () => {
    expect([
      monthsUpTo(SUNDAY, '2026-11-01'),
      monthsUpTo(SUNDAY, '2027-07-01'),
      monthsUpTo(SUNDAY, '2029-01-01'),
    ]).toEqual([2, 10, 24]);
  });

  it('with those months shown, the lowest point’s row is in the plan', () => {
    const bigBill = {
      ...examplePlan.series[0],
      id: 'big-bill',
      familyId: 'big-bill',
      // Made after Rent, so it's the last row of Thu 1 Jul 2027 (D12).
      familyCreatedAt: '2026-10-25T09:00:00Z',
      name: 'Big bill',
      amount: 800000,
      start: '2027-07-01',
    } as (typeof examplePlan.series)[number];
    const plan = { ...examplePlan, series: [...examplePlan.series, bigBill] };
    const view = workOutPlanView(plan, SUNDAY, {
      grouping: 'pay',
      months: monthsUpTo(SUNDAY, '2027-07-01'),
    });
    expect(view.accounts[0]?.lowest.date).toBe('2027-07-01');
    expect(view.to >= '2027-07-01').toBe(true);
    const rows = view.accounts[0]?.periods.flatMap((one) => one.rows) ?? [];
    expect(rows.find((row) => row.isLowest)?.name).toBe('Big bill');
    expect(workOutPlanTo(plan, SUNDAY, '2027-07-01').accounts[0]?.lowestPoint.date).toBe(
      '2027-07-01',
    );
  });
});

describe('Words for times and weekdays', () => {
  it('writes "Friday" and a time on this phone’s clock like "9:14am"', () => {
    expect(weekdayName('2026-11-13')).toBe('Friday');
    expect(formatTime('2026-10-30T09:14:05Z')).toMatch(/^\d{1,2}:\d{2}(am|pm)$/);
    expect(strings.dates.time(12, '05', false)).toBe('12:05pm');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(strings.dates.ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '31st',
    ]);
  });
});
