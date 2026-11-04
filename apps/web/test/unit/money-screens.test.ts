// What the Debts, Budgets, Savings goals and Accounts screens are worked out
// from (step 2f), with Sam's example on Sun 25 Oct 2026: the owner's tests 1
// to 7 checked on the figures themselves, as well as on the screens.

import { applyWrites, formatPounds, type PlanRecords, parsePounds } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import { compareWaysToPay, type DebtPaymentView, workOutDebtsView } from '../../lib/debts-view.ts';
import { runEdits } from '../../lib/edit.ts';
import { englandAndWales } from '../../lib/holidays.ts';
import {
  workOutAccountsView,
  workOutBudgetsView,
  workOutGoalsView,
} from '../../lib/money-views.ts';
import { blankPayment, repeatSchedule, sameSchedule } from '../../lib/new-payment.ts';

const SUNDAY = '2026-10-25';
const pence = (amount: number) => formatPounds(amount);

describe('Debts (brief 4.6, D43, D99, D100)', () => {
  const view = workOutDebtsView(examplePlan, SUNDAY);

  it('test 1: Owed now £3,214.86, and each debt in the order it is paid off', () => {
    expect(pence(view.owedNow)).toBe('3214.86');
    expect(view.to).toBe('2028-10-25');
    expect(view.debts.map((one) => [one.name, one.paidOffOn, one.isEstimate])).toEqual([
      ['Pay-later card', '2026-10-29', false],
      ['Pay in 3', '2026-12-06', false],
      ['Family loan', '2027-01-01', false],
      ['Laptop loan', '2027-02-20', false],
      ['Sofa finance', '2027-08-23', false],
      ['Credit card', '2028-03-15', true],
    ]);
    const family = view.debts[2];
    expect([family?.leftNow, family?.leftNowInPounds, family?.percentPaid]).toEqual([
      140057, 120614, 42,
    ]);
    expect(view.rates).toEqual([{ name: 'Family loan', currency: 'EUR', rate: '1.1612' }]);
  });

  it('test 2: the Family loan comes off in euros, leaving €1,255.42 down to Paid off', () => {
    const rows = (view.debts[2]?.rows ?? []) as readonly DebtPaymentView[];
    expect(rows.map((row) => [pence(row.inDebt), pence(row.leftAfter), row.paidOff])).toEqual([
      ['145.15', '1255.42', false],
      ['145.15', '1110.27', false],
      ['290.30', '819.97', false],
      ['290.30', '529.67', false],
      ['290.30', '239.37', false],
      ['239.38', '0.00', true],
    ]);
    // A cent over is only rounding, so the last payment offers no fix (D100).
    expect(rows.every((row) => row.fix === null)).toBe(true);
  });

  it('test 3: the Credit card fix makes Wed 15 Mar 2028 £20.99 and removes the payments after it, as one undo', () => {
    const card = view.debts[5];
    const rows = (card?.rows ?? []) as readonly DebtPaymentView[];
    const march = rows.find((row) => row.date === '2028-03-15');
    expect(march?.moreThanLeft).toBe(401);
    expect(march?.fix?.amount).toBe(2099);
    expect(march?.fix?.commands).toEqual([
      {
        kind: 'just-this-one',
        seriesId: 'credit-card',
        originalDate: '2028-03-15',
        edits: { amount: 2099 },
      },
      { kind: 'remove-this-and-later', seriesId: 'credit-card', originalDate: '2028-04-15' },
    ]);
    const fixed = runEdits(examplePlan, SUNDAY, march?.fix?.commands ?? []);
    const after = workOutDebtsView(fixed.records, SUNDAY).debts[5];
    expect(after?.paidOffOn).toBe('2028-03-15');
    expect(after?.rows.at(-1)?.date).toBe('2028-03-15');
    expect(
      ((after?.rows ?? []) as readonly DebtPaymentView[]).some((row) => row.moreThanLeft !== null),
    ).toBe(false);
    // One undo puts the debt back exactly as it was (D87).
    const undone = applyWrites(fixed.records, fixed.edit.undo);
    expect(workOutDebtsView(undone, SUNDAY).debts[5]).toEqual(card);
  });

  it("test 4: comparing ways to pay step 1d's hand-worked card gives 150, 21 and 1 payments", () => {
    const records: PlanRecords = {
      ...examplePlan,
      debts: (examplePlan.debts ?? []).map((debt) =>
        debt.id === 'credit-card'
          ? {
              ...debt,
              interestRate: '24.9',
              statementDay: 10,
              minimumRule: { kind: 'rule', percent: '1', atLeast: parsePounds('5.00') },
            }
          : debt,
      ),
    };
    const card = workOutDebtsView(records, SUNDAY).debts.find((one) => one.id === 'credit-card');
    expect(card?.card?.compare).toEqual({
      left: parsePounds('420.99'),
      paysOn: 15,
      fixed: parsePounds('25.00'),
      paidOnFrom: false,
    });
    expect(card?.card?.nextStatement).toEqual({
      date: '2026-11-10',
      interest: parsePounds('8.74'),
      minimum: parsePounds('12.95'),
    });
    const compared = compareWaysToPay(records, SUNDAY, {
      debtId: 'credit-card',
      fixed: parsePounds('25.00'),
      paysOn: 15,
    });
    expect(
      [compared.minimum, compared.fixed, compared.full].map((way) => [
        way?.payments,
        pence(way?.interest ?? 0),
      ]),
    ).toEqual([
      [150, '647.14'],
      [21, '102.32'],
      [1, '8.74'],
    ]);
  });
});

describe('Budgets (brief 4.5, D30, D110)', () => {
  it('test 5: with roll-over on and £18.00 spent the week before, this week is £25 + £7', () => {
    const records: PlanRecords = {
      ...examplePlan,
      budgets: [
        {
          id: 'travel',
          accountId: 'current',
          name: 'Travel',
          amount: parsePounds('25.00'),
          every: 'week',
          leaves: 'at-start',
          rollOver: true,
          startsOn: '2026-10-16',
          createdAt: '2026-10-16T09:00:00Z',
        },
      ],
      spends: [
        {
          id: 'week-before',
          budgetId: 'travel',
          amount: parsePounds('18.00'),
          spentOn: '2026-10-20',
          recordedAt: '2026-10-20T17:00:00Z',
        },
      ],
    };
    const travel = workOutBudgetsView(records, SUNDAY).budgets[0];
    expect(travel?.current).toMatchObject({
      start: '2026-10-23',
      end: '2026-10-29',
      base: 2500,
      rolledOver: 700,
      amount: 3200,
      spent: 0,
      left: 3200,
    });
    expect(travel?.hasSpends).toBe(true);
  });

  it('shows a budget that starts after the plan would end, with its first week (PLAN.md, left for later 3)', () => {
    const records: PlanRecords = {
      ...examplePlan,
      budgets: [
        {
          id: 'later',
          accountId: 'current',
          name: 'Holiday money',
          amount: parsePounds('100.00'),
          every: 'week',
          leaves: 'at-start',
          rollOver: false,
          startsOn: '2027-06-04',
          createdAt: '2026-10-25T09:00:00Z',
        },
      ],
    };
    const later = workOutBudgetsView(records, SUNDAY).budgets[0];
    expect([later?.startsLater, later?.current.start]).toEqual([true, '2027-06-04']);
  });
});

describe('Savings goals (brief 4.7, D114)', () => {
  it('test 6: £1,200.00 from £0 with £50.00 every Friday from Fri 30 Oct is reached on Fri 9 Apr 2027', () => {
    const records: PlanRecords = {
      ...examplePlan,
      goals: [
        {
          id: 'holiday',
          name: 'Holiday',
          target: parsePounds('1200.00'),
          accountId: 'savings',
          startingAmount: 0,
        },
      ],
      series: [
        ...examplePlan.series,
        {
          id: 'to-holiday',
          accountId: 'current',
          toAccountId: 'savings',
          name: 'Saving for Holiday',
          direction: 'transfer',
          amount: parsePounds('50.00'),
          start: '2026-10-30',
          schedule: { kind: 'weekly', every: 1 },
          end: { kind: 'never' },
          holidayRule: 'keep',
          type: 'savings',
          goalId: 'holiday',
          isEstimate: false,
          familyId: 'to-holiday',
          familyCreatedAt: '2026-10-25T12:00:00Z',
        },
      ],
    };
    const goal = workOutGoalsView(records, SUNDAY).goals[0];
    expect([goal?.reachedOn, goal?.savedSoFar, goal?.percentSaved, goal?.moves]).toEqual([
      '2027-04-09',
      0,
      0,
      1,
    ]);
  });
});

describe('Accounts (brief 4.2, D151, D158, D181)', () => {
  const withOld = (balance: string): PlanRecords => ({
    ...examplePlan,
    accounts: [
      ...examplePlan.accounts,
      { id: 'old', name: 'Old account', kind: 'current', overdraftLimit: 10_000, warningLevel: 0 },
    ],
    balanceUpdates: [
      ...examplePlan.balanceUpdates,
      {
        id: 'old-balance',
        accountId: 'old',
        balance: parsePounds(balance.replace('-', '')) * (balance.startsWith('-') ? -1 : 1),
        checkedOn: SUNDAY,
        checkedAt: '2026-10-25T08:00:00Z',
      },
    ],
  });

  it('test 7: £3.12 left must move first; overdrawn must be paid in first; nothing planned can close', () => {
    const view = workOutAccountsView(withOld('3.12'), SUNDAY);
    expect(view.accounts.map((one) => [one.name, one.closing, one.endOfToday])).toEqual([
      ['Current account', 'in-use', 23754],
      ['Savings', 'in-use', 50000],
      ['Old account', 'money-left', 312],
    ]);
    expect(workOutAccountsView(withOld('-3.12'), SUNDAY).accounts[2]?.closing).toBe('overdrawn');
    expect(workOutAccountsView(withOld('0.00'), SUNDAY).accounts[2]?.closing).toBe('ready');
    expect(view.nation).toBe('england-and-wales');
  });
});

describe('Changing how often a payment repeats (D96, step 2f)', () => {
  const holidays = englandAndWales();
  it('makes the schedule from the date: the 3rd of the month from Sun 3 Jan 2027', () => {
    const form = { ...blankPayment('2027-01-03', '', ''), howOften: 'monthly' as const };
    expect(repeatSchedule(form, holidays, {})).toEqual({
      kind: 'monthly',
      every: 1,
      on: { kind: 'day', day: 3 },
    });
    expect(repeatSchedule({ ...form, howOften: 'weekly', weeks: '2' }, holidays, {})).toEqual({
      kind: 'weekly',
      every: 2,
    });
    const errors = {};
    expect(repeatSchedule({ ...form, months: '13' }, holidays, errors)).toBeNull();
    expect(errors).toEqual({ months: 'monthsError' });
    expect(
      sameSchedule(
        { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
        { on: { day: 1, kind: 'day' }, kind: 'monthly', every: 1 },
      ),
    ).toBe(true);
  });
});
