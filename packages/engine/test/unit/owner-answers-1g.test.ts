// The owner's answers to the step 1g questions (D142 to D147), built in step 2a.

import { describe, expect, it } from 'vitest';
import {
  type BankHolidayLookup,
  compareCardPayments,
  coveredToFromDates,
  type Debt,
  type EditInput,
  EngineInputError,
  editPlan,
  formatPounds,
  groupIntoPeriods,
  type PayAdjustment,
  type PayProfile,
  type PayWeek,
  parseDate,
  parsePounds as pounds,
  type Series,
  workOutPlan,
} from '../../src/index.ts';
import { englandAndWales } from '../fixtures/holidays.ts';
import { aliPlan, priyaPlan } from '../fixtures/people.ts';
import { samFood, samPlan, samSeriesWithoutFood, samSpend } from '../fixtures/sam.ts';

function refusedWith(code: string, run: () => unknown): void {
  let error: unknown = null;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  expect(error, `expected a refusal: ${code}`).toBeInstanceOf(EngineInputError);
  expect((error as EngineInputError).code).toBe(code);
}

describe('D142: pay that covers last month’s work, worked out from the dates picked in setup', () => {
  it('keeps days before payday for weekly pay: Fri 6 Nov pays for work up to Sun 1 Nov', () => {
    expect(coveredToFromDates('weekly', '2026-11-06', '2026-11-01')).toEqual({
      kind: 'days-before',
      days: 5,
    });
  });

  it('keeps a day of the payday’s own month, or its last day', () => {
    expect(coveredToFromDates('monthly', '2026-12-31', '2026-12-15')).toEqual({
      kind: 'day-of-month',
      day: 15,
    });
    expect(coveredToFromDates('monthly', '2026-10-30', '2026-10-31')).toEqual({ kind: 'last-day' });
  });

  it('reads "Fri 5 Dec pays for work up to Mon 30 Nov" as last month’s work, up to its last day', () => {
    expect(coveredToFromDates('monthly', '2026-12-05', '2026-11-30')).toEqual({
      kind: 'last-day',
      monthBefore: true,
    });
    expect(coveredToFromDates('monthly', '2026-12-05', '2026-11-28')).toEqual({
      kind: 'day-of-month',
      day: 28,
      monthBefore: true,
    });
  });

  it('refuses work that ends too long before, or after, a payday', () => {
    refusedWith('covered-to-too-far', () =>
      coveredToFromDates('weekly', '2026-11-06', '2026-11-07'),
    );
    refusedWith('covered-to-too-far', () =>
      coveredToFromDates('weekly', '2027-01-29', '2026-11-01'),
    );
    refusedWith('covered-to-too-far', () =>
      coveredToFromDates('monthly', '2026-12-05', '2026-10-31'),
    );
    refusedWith('covered-to-too-far', () =>
      coveredToFromDates('monthly', '2026-12-05', '2027-01-04'),
    );
  });

  it('puts a shift on the payday after the month it was worked in', () => {
    const profile: PayProfile = {
      id: 'office',
      frequency: 'monthly',
      taxCode: '1257L',
      basis: 'cumulative',
      overtimeRate: '19.07',
      coveredTo: coveredToFromDates('monthly', '2026-12-05', '2026-11-30'),
    };
    const week: PayWeek = {
      id: 'office-month',
      payProfileId: 'office',
      lines: [{ name: 'Basic', kind: 'basic', hours: '160', rate: '12.71' }],
    };
    const pay: Series = {
      id: 'pay',
      accountId: 'current',
      name: 'Pay',
      direction: 'in',
      amount: pounds('1800.00'),
      start: '2026-12-05',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 5 } },
      end: { kind: 'never' },
      holidayRule: 'keep',
      type: 'pay',
      isEstimate: true,
      payProfileId: 'office',
      cyclePayWeeks: ['office-month'],
      familyId: 'pay',
      familyCreatedAt: '2026-11-25T09:00:00Z',
    };
    const input: EditInput = {
      accounts: [{ id: 'current', kind: 'current', overdraftLimit: 0, warningLevel: 0 }],
      balanceUpdates: [
        {
          id: 'start',
          accountId: 'current',
          balance: pounds('100.00'),
          checkedOn: '2026-11-25',
          checkedAt: '2026-11-25T09:00:00Z',
        },
      ],
      series: [pay],
      payProfiles: [profile],
      payWeeks: [week],
      payAdjustments: [],
      mainPayFamilyId: 'pay',
      holidays: englandAndWales,
      today: '2026-11-25',
    };
    const payday = (workedOn: string) => {
      const write = editPlan(input, {
        kind: 'overtime',
        id: `overtime-${workedOn}`,
        seriesId: 'pay',
        workedOn,
        hours: '2',
      }).writes[0];
      return (write?.value as PayAdjustment | undefined)?.number;
    };
    // Payment 0 is Sat 5 Dec, payment 1 Tue 5 Jan.
    expect(payday('2026-11-30')).toBe(0);
    expect(payday('2026-12-01')).toBe(1);
    expect(payday('2026-12-31')).toBe(1);
  });
});

describe('D143: Left to spend always counts to the day before the next main payday', () => {
  it('gives Ali £525.00 until Mon 26 Apr on Mon 11 Jan, whatever the view length', () => {
    for (const to of ['2027-01-31', '2027-04-10', '2027-04-25', '2027-05-31', '2028-01-10']) {
      const left = workOutPlan({ ...aliPlan(), today: '2027-01-11', to }).accounts[0]?.leftToSpend;
      expect([left?.until, left?.lastDay, left?.runsTo, formatPounds(left?.amount ?? 0)]).toEqual([
        '2027-04-26',
        '2027-04-25',
        'payday',
        '525.00',
      ]);
      expect([left?.lowest.date, formatPounds(left?.lowest.balance ?? 0)]).toEqual([
        '2027-01-18',
        '731.48',
      ]);
    }
  });

  it('leaves the plan itself as long as it was asked for', () => {
    const plan = workOutPlan({ ...aliPlan(), today: '2027-01-11', to: '2027-04-10' });
    expect(plan.accounts[0]?.days.at(-1)?.date).toBe('2027-04-10');
  });
});

describe('D144: when the main pay stops', () => {
  // Ali on Tue 27 Apr 2027, the day after his last student loan payment.
  const plan = workOutPlan({ ...aliPlan(), today: '2027-04-27', to: '2027-07-31' });

  it('says the main pay has no more paydays', () => {
    expect([plan.mainPay, plan.nextMainPayday, plan.mainPayEnded]).toEqual(['regular', null, true]);
    expect(workOutPlan(aliPlan()).mainPayEnded).toBe(false);
  });

  it('runs Left to spend to the end of this month', () => {
    const left = plan.accounts[0]?.leftToSpend;
    expect([left?.until, left?.lastDay, left?.runsTo, formatPounds(left?.amount ?? 0)]).toEqual([
      '2027-05-01',
      '2027-04-30',
      'month-end',
      '35.00',
    ]);
  });

  it('groups the plan by calendar month after the last payday', () => {
    const periods = groupIntoPeriods(plan, 'pay').accounts[0]?.periods ?? [];
    expect(periods.map((one) => [one.start, one.end, one.from])).toEqual([
      ['2027-04-26', '2027-04-30', '2027-04-27'],
      ['2027-05-01', '2027-05-31', '2027-05-01'],
      ['2027-06-01', '2027-06-30', '2027-06-01'],
      ['2027-07-01', '2027-07-31', '2027-07-01'],
    ]);
  });
});

describe('D145: pay on the last working day is stored against the month', () => {
  /** England and Wales with one more bank holiday: Fri 30 Oct 2026. */
  const withNewHoliday: BankHolidayLookup = {
    isBankHoliday: (day) => day === parseDate('2026-10-30') || englandAndWales.isBankHoliday(day),
  };
  const priya = { ...priyaPlan(), today: '2026-10-30', to: '2026-11-30' };
  const tick = editPlan(priya, {
    kind: 'tick',
    seriesId: 'salary',
    originalDate: '2026-10-31',
    tickedAt: '2026-10-30T12:00:00Z',
  });
  const ticks = tick.writes.flatMap((write) => (write.kind === 'tick' ? [write.value] : []));

  it('ticks October’s salary against Sat 31 Oct, paid on Fri 30 Oct', () => {
    expect(ticks).toEqual([
      {
        seriesId: 'salary',
        originalDate: '2026-10-31',
        tickedAt: '2026-10-30T12:00:00Z',
        paidOn: '2026-10-30',
      },
    ]);
  });

  it('keeps the tick on its payday when a new bank holiday moves it', () => {
    for (const holidays of [englandAndWales, withNewHoliday]) {
      const plan = workOutPlan({ ...priya, ticks: ticks as never, holidays });
      const salary = plan.accounts[0]?.rows.find((row) => row.payment.seriesId === 'salary');
      expect([salary?.payment.originalDate, salary?.ticked, salary?.payment.movedByRule]).toEqual([
        '2026-10-31',
        true,
        false,
      ]);
    }
    const moved = workOutPlan({ ...priya, ticks: ticks as never, holidays: withNewHoliday });
    expect(
      moved.accounts[0]?.rows.find((row) => row.payment.seriesId === 'salary')?.payment.date,
    ).toBe('2026-10-29');
  });

  it('lands on the last working day whatever the weekend rule says', () => {
    const plan = workOutPlan({
      ...priya,
      series: priya.series.map((one) =>
        one.id === 'salary' ? { ...one, holidayRule: 'keep' as const } : one,
      ),
      to: '2027-02-28',
    });
    const dates = plan.accounts[0]?.rows
      .filter((row) => row.payment.seriesId === 'salary')
      .map((row) => [row.payment.originalDate, row.date]);
    expect(dates).toEqual([
      ['2026-10-31', '2026-10-30'],
      ['2026-11-30', '2026-11-30'],
      ['2026-12-31', '2026-12-31'],
      ['2027-01-31', '2027-01-29'],
      ['2027-02-28', '2027-02-26'],
    ]);
  });

  it('treats the payday’s own date as no new date for this and all later ones', () => {
    const edit = editPlan(priya, {
      kind: 'this-and-later',
      seriesId: 'salary',
      originalDate: '2027-01-31',
      edits: { date: '2027-01-29', note: 'New job title' },
      newSeriesId: 'salary-from-january',
    });
    const split = edit.writes.find(
      (write) => write.kind === 'series' && write.id === 'salary-from-january',
    )?.value as Series;
    expect([split.schedule, split.start, split.note]).toEqual([
      { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
      '2027-01-31',
      'New job title',
    ]);
  });
});

describe('D146: the credit card comparison counts today’s payment until it’s ticked', () => {
  const card: Debt = {
    id: 'card',
    name: 'Credit card',
    kind: 'credit-card',
    currency: 'GBP',
    balance: pounds('420.99'),
    balanceOn: '2026-10-25',
    balanceAt: '2026-10-25T08:30:00Z',
    startingBalance: pounds('420.99'),
    interestRate: '24.9',
    statementDay: 10,
    minimumRule: { kind: 'rule', percent: '1', atLeast: pounds('5.00') },
  };
  const onPaymentDay = (left: string, paidOnFrom?: boolean) =>
    compareCardPayments({
      card,
      left: pounds(left),
      from: '2026-11-15',
      paysOn: 15,
      fixed: pounds('25.00'),
      ...(paidOnFrom === undefined ? {} : { paidOnFrom }),
    });

  it('shows 21 payments of £25 on Sun 15 Nov before that day’s payment is ticked', () => {
    // £420.99 plus £8.74 interest on Tue 10 Nov (owner test 5).
    const { fixed, full } = onPaymentDay('429.73');
    expect([fixed.payments, fixed.lastPaymentOn, formatPounds(fixed.interest ?? 0)]).toEqual([
      21,
      '2028-07-15',
      '93.58',
    ]);
    expect([full.payments, full.lastPaymentOn]).toEqual([1, '2026-11-15']);
  });

  it('shows 20 more once it’s ticked, ending on the same day', () => {
    const { fixed } = onPaymentDay('404.73', true);
    expect([fixed.payments, fixed.lastPaymentOn]).toEqual([20, '2028-07-15']);
  });

  it('refuses paidOnFrom that isn’t true or false', () => {
    refusedWith('bad-input', () =>
      compareCardPayments({
        card,
        left: pounds('429.73'),
        from: '2026-11-15',
        paysOn: 15,
        fixed: pounds('25.00'),
        paidOnFrom: 'yes' as never,
      }),
    );
  });
});

describe('D147: a pay-later bill with roll-over, once its statement period has ended', () => {
  // Owner test 3's food budget: £120.00 spent from Thu 29 Oct to Sat 28 Nov,
  // and today is Sun 29 Nov, the day of the bill for that period.
  const food = (rollOver: boolean) =>
    workOutPlan(
      samPlan({
        series: samSeriesWithoutFood,
        budgets: [{ ...samFood, rollOver }],
        spends: [samSpend('shop', '120.00', '2026-11-10', '2026-11-10T12:00:00Z', 'food')],
        today: '2026-11-29',
      }),
    );
  const bills = (rollOver: boolean) =>
    food(rollOver)
      .accounts[0]?.rows.filter((row) => row.kind === 'bill')
      .slice(0, 3)
      .map((row) => [row.date, formatPounds(row.change)]);

  it('estimates the bill at what was spent, and rolls the £80.00 not spent into the next', () => {
    expect(bills(true)).toEqual([
      ['2026-11-29', '-120.00'],
      ['2026-12-29', '-280.00'],
      ['2027-01-29', '-200.00'],
    ]);
    const next = food(true).budgets[0]?.current;
    expect([next?.base, next?.rolledOver, next?.amount]).toEqual([
      pounds('200.00'),
      pounds('80.00'),
      pounds('280.00'),
    ]);
  });

  it('keeps the budget as the estimate without roll-over (D32)', () => {
    expect(bills(false)).toEqual([
      ['2026-11-29', '-200.00'],
      ['2026-12-29', '-200.00'],
      ['2027-01-29', '-200.00'],
    ]);
  });

  it('lets the real bill replace the estimate', () => {
    const input = samPlan({
      series: samSeriesWithoutFood,
      budgets: [{ ...samFood, rollOver: true }],
      spends: [samSpend('shop', '120.00', '2026-11-10', '2026-11-10T12:00:00Z', 'food')],
      changes: [{ seriesId: 'food', originalDate: '2026-11-29', amount: pounds('125.40') }],
      today: '2026-11-29',
    });
    const bill = workOutPlan(input).accounts[0]?.rows.find((row) => row.kind === 'bill');
    expect(formatPounds(bill?.change ?? 0)).toBe('-125.40');
  });
});
