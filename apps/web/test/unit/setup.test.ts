// First-time setup's logic (step 2e): each step's boxes checked and turned
// into the engine's commands (D149, D222 to D226), several commands saved as
// one change that one undo takes back (D221), and the day a new budget
// starts (D225).

import { applyWrites, type PlanRecords, parsePounds } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { runEdits } from '../../lib/edit.ts';
import { holidaysFor } from '../../lib/holidays.ts';
import {
  blankAccount,
  blankIncome,
  blankPayDetails,
  buildAccount,
  buildBudget,
  buildIncome,
  buildPayDetails,
  eachPaydayOf,
  firstPaydays,
} from '../../lib/setup-forms.ts';
import { workOutSetupView } from '../../lib/setup-view.ts';

const holidays = holidaysFor('england-and-wales');
const SUNDAY = '2026-10-25';
const NOW = '2026-11-04T10:00:00.000Z';
const EMPTY: PlanRecords = { accounts: [], balanceUpdates: [], series: [] };

describe('Step 1: an account (D222)', () => {
  it('takes what the bank shows, below zero when it’s overdrawn, and £20 to warn under (D47)', () => {
    const form = {
      ...blankAccount(true, 'Current account'),
      balance: '300',
      overdrawn: true,
      overdraft: '1,000',
    };
    expect(form.warning).toBe('20.00');
    const built = buildAccount(form, SUNDAY, { accountId: 'a', balanceId: 'b' }, NOW);
    expect(built).toEqual({
      ok: true,
      command: {
        kind: 'add-account',
        account: {
          id: 'a',
          name: 'Current account',
          kind: 'current',
          overdraftLimit: 100000,
          warningLevel: 2000,
        },
        balance: { id: 'b', balance: -30000, checkedOn: SUNDAY, checkedAt: NOW },
      },
    });
  });

  it('says which boxes need changing', () => {
    const built = buildAccount(
      { ...blankAccount(false), balance: 'lots', overdraft: '-5' },
      SUNDAY,
      { accountId: 'a', balanceId: 'b' },
      NOW,
    );
    expect(built).toEqual({
      ok: false,
      errors: { name: 'nameError', balance: 'balanceError', overdraft: 'overdraftError' },
    });
  });
});

describe('Step 2: how you’re paid (D223)', () => {
  const pay = (change: Partial<ReturnType<typeof blankIncome>>) => ({
    ...blankIncome('current', 'savings', 'Salary'),
    ...change,
  });

  it('stores pay on the last working day as moving to the working day before (brief 8.5, D145)', () => {
    const built = buildIncome(
      pay({ often: 'last-working-day', date: '2026-10-30', amount: '2100', holidayRule: 'keep' }),
      SUNDAY,
      holidays,
      false,
    );
    expect(built.ok && built.series).toMatchObject({
      schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
      holidayRule: 'working-day-before',
      amount: 210000,
      start: '2026-10-30',
    });
  });

  it('refuses a next payday that isn’t a month’s last working day, or is before today', () => {
    expect(
      buildIncome(
        pay({ often: 'last-working-day', date: '2026-10-31', amount: '1' }),
        SUNDAY,
        holidays,
        false,
      ),
    ).toEqual({ ok: false, errors: { date: 'notLastWorkingDay' } });
    expect(buildIncome(pay({ date: '2026-10-23', amount: '1' }), SUNDAY, holidays, false)).toEqual({
      ok: false,
      errors: { date: 'beforeToday' },
    });
  });

  it('plans an irregular weekly estimate as an estimate, with 25% set aside (D64)', () => {
    const built = buildIncome(
      pay({
        often: 'irregular',
        date: '2026-11-02',
        amount: '380',
        setAside: true,
        percent: '25',
        setAsideTo: 'tax',
      }),
      SUNDAY,
      holidays,
      true,
    );
    expect(built.ok && built.series).toMatchObject({
      schedule: { kind: 'irregular' },
      isEstimate: true,
      setAside: { percent: '25', accountId: 'tax' },
    });
  });

  it('keeps a pattern of amounts, the first one first (brief 4.1)', () => {
    const built = buildIncome(
      pay({ date: '2026-10-30', pattern: true, amounts: ['452.17', '618.46', '469.06', '592.17'] }),
      SUNDAY,
      holidays,
      false,
    );
    expect(built.ok && built.series).toMatchObject({
      amount: 45217,
      amountCycle: [45217, 61846, 46906, 59217],
      cycleOffset: 0,
    });
  });

  it('saves the usual week for each payday of the pattern, linked to its step (D5, D131)', () => {
    const built = buildIncome(
      pay({ name: 'Pay', date: '2026-10-30', pattern: true, amounts: ['452.17', '618.46'] }),
      SUNDAY,
      holidays,
      false,
    );
    if (!built.ok) throw new Error('The pay should be fine.');
    const series = { ...built.series, id: 'pay', familyId: 'pay', familyCreatedAt: NOW };
    expect(firstPaydays(series, SUNDAY, holidays, 2).map((one) => one.date)).toEqual([
      '2026-10-30',
      '2026-11-06',
    ]);
    const details = {
      ...blankPayDetails('pay', 2),
      overtimeRate: '19.07',
      coveredTo: '2026-10-25',
      rate: '12.71',
      weeks: [
        { hours: '34.5', extras: '114.69' },
        { hours: '46', extras: '' },
      ],
    };
    const result = buildPayDetails(
      details,
      { series, payday: '2026-10-30' },
      { profileId: 'job', weekIds: ['w1', 'w2'] },
      { week: (step) => `Week ${step}`, basic: 'Basic', extras: 'Extras' },
    );
    expect(result).toEqual({
      ok: true,
      commands: [
        {
          kind: 'add-pay-profile',
          profile: {
            id: 'job',
            name: 'Pay',
            frequency: 'weekly',
            taxCode: '1257L',
            basis: 'cumulative',
            overtimeRate: '19.07',
            coveredTo: { kind: 'days-before', days: 5 },
          },
        },
        {
          kind: 'add-pay-week',
          week: {
            id: 'w1',
            name: 'Week 1',
            payProfileId: 'job',
            lines: [{ name: 'Basic', kind: 'basic', hours: '34.5', rate: '12.71' }],
            fixed: [{ name: 'Extras', amount: 11469 }],
          },
        },
        {
          kind: 'add-pay-week',
          week: {
            id: 'w2',
            name: 'Week 2',
            payProfileId: 'job',
            lines: [{ name: 'Basic', kind: 'basic', hours: '46', rate: '12.71' }],
          },
        },
        { kind: 'link-pay', seriesId: 'pay', payProfileId: 'job', cyclePayWeeks: ['w1', 'w2'] },
      ],
    });
    // A last day of work after the payday is refused (D142).
    expect(
      buildPayDetails(
        { ...details, coveredTo: '2026-10-31' },
        { series, payday: '2026-10-30' },
        { profileId: 'job', weekIds: ['w1', 'w2'] },
        { week: (step) => `Week ${step}`, basic: 'Basic', extras: 'Extras' },
      ),
    ).toEqual({ ok: false, errors: { coveredTo: 'coveredToTooFar' } });
  });
});

describe('Several commands as one change (D221)', () => {
  it('makes an account and a payment in it as one edit, and one undo takes both back', () => {
    const account = buildAccount(
      { ...blankAccount(true, 'Current account'), balance: '500' },
      SUNDAY,
      { accountId: 'current', balanceId: 'start' },
      NOW,
    );
    if (!account.ok) throw new Error('The account should be fine.');
    const income = buildIncome(
      { ...blankIncome('current', 'current', 'Pay'), date: '2026-10-30', amount: '450' },
      SUNDAY,
      holidays,
      false,
    );
    if (!income.ok) throw new Error('The pay should be fine.');
    const made = runEdits(EMPTY, SUNDAY, [
      account.command,
      { kind: 'add-payment', series: { ...income.series, id: 'pay' }, madeAt: NOW },
      { kind: 'choose-main-pay', familyId: 'pay' },
    ]);
    expect(made.records.accounts.map((one) => one.id)).toEqual(['current']);
    expect(made.records.series.map((one) => one.id)).toEqual(['pay']);
    expect(made.records.settings?.mainPayFamilyId).toBe('pay');
    expect(applyWrites(EMPTY, made.edit.writes)).toEqual(made.records);
    const undone = runEdits(made.records, SUNDAY, [{ kind: 'undo', edit: made.edit }]);
    expect(undone.records.accounts).toEqual([]);
    expect(undone.records.series).toEqual([]);
    expect(undone.records.balanceUpdates).toEqual([]);
  });
});

describe('Step 6: a budget starts with its next week or month (D225)', () => {
  it('gives Priya Mon 26 Oct for a weekly budget and Fri 30 Oct, her payday, for a monthly one', () => {
    const records = runEdits(EMPTY, SUNDAY, [
      {
        kind: 'add-account',
        account: {
          id: 'current',
          name: 'Current account',
          kind: 'current',
          overdraftLimit: 0,
          warningLevel: 2000,
        },
        balance: {
          id: 'start',
          balance: parsePounds('1240.00'),
          checkedOn: SUNDAY,
          checkedAt: NOW,
        },
      },
      {
        kind: 'add-payment',
        series: {
          id: 'salary',
          accountId: 'current',
          name: 'Salary',
          direction: 'in',
          amount: parsePounds('2100.00'),
          start: '2026-10-30',
          schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
          end: { kind: 'never' },
          holidayRule: 'working-day-before',
          type: 'pay',
          isEstimate: false,
        },
        madeAt: NOW,
      },
      { kind: 'choose-main-pay', familyId: 'salary' },
    ]).records;
    expect(workOutSetupView(records, SUNDAY).budgetStarts).toEqual({
      week: '2026-10-26',
      month: '2026-10-30',
    });
    // "Each payday" for her savings follows the salary from its next payday (D226).
    expect(eachPaydayOf(records.series, 'salary', SUNDAY, holidays)).toEqual({
      start: '2026-10-30',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
      holidayRule: 'working-day-before',
    });
    // A budget's start before today is refused with plain words (D228).
    expect(
      buildBudget(
        {
          name: 'Food',
          amount: '260',
          every: 'month',
          leaves: 'at-start',
          billDay: '',
          accountId: 'current',
          startsOn: '2026-10-24',
          startsOnChanged: true,
        },
        SUNDAY,
        'food',
        NOW,
      ),
    ).toEqual({ ok: false, errors: { startsOn: 'startBeforeToday' } });
  });
});
