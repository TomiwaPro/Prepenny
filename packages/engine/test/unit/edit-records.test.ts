// Step 2a: the commands for adding and changing records (D149 to D156), each
// one undoable edit, and the owner's test 4: every refusal has a plain code.

import { describe, expect, it } from 'vitest';
import {
  applyWrites,
  type Budget,
  type Debt,
  type EditCommand,
  EngineInputError,
  editPlan,
  formatPounds,
  type NewSeries,
  type PayAdjustment,
  type PlanRecords,
  workOutDebts,
  workOutPlan,
} from '../../src/index.ts';
import {
  allRecords,
  build,
  inputFor,
  recordsOf,
  samEverythingSteps,
  samSteps,
} from '../fixtures/from-empty.ts';
import { samPayProfile, samPayWeeks } from '../fixtures/pay.ts';
import { pounds } from '../fixtures/plan.ts';
import { samSpend, samToday, samTravel, samViewEnd } from '../fixtures/sam.ts';

/** Sam's plan from brief 8.1 and 8.2, built with the commands, on Sun 25 Oct 2026. */
const sam: PlanRecords = build(samSteps()).records;

function run(records: PlanRecords, command: EditCommand, today = samToday) {
  const input = inputFor(records, today);
  const edit = editPlan(input, command);
  return { edit, after: recordsOf(applyWrites(input, edit.writes)) };
}

/** Makes an edit, checks one undo gives back exactly the records before, and gives the records after. */
function made(records: PlanRecords, command: EditCommand, today = samToday): PlanRecords {
  const { edit, after } = run(records, command, today);
  const undone = run(after, { kind: 'undo', edit }, today).after;
  expect(allRecords(undone)).toEqual(allRecords(records));
  return after;
}

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

const refuses = (code: string, command: EditCommand, records = sam, today = samToday) =>
  refusedWith(code, () => run(records, command, today));

const planOf = (records: PlanRecords, today = samToday) =>
  workOutPlan({ ...inputFor(records, today), to: samViewEnd });

/** A new payment: £10.00 going out of the current account on Fri 6 Nov, once, unless it says otherwise. */
function payment(fields: Partial<NewSeries> = {}): EditCommand {
  return {
    kind: 'add-payment',
    series: {
      id: 'new',
      accountId: 'current',
      name: 'Haircut',
      direction: 'out',
      amount: pounds('10.00'),
      start: '2026-11-06',
      schedule: { kind: 'once' },
      end: { kind: 'never' },
      holidayRule: 'keep',
      type: 'other',
      isEstimate: false,
      ...fields,
    },
    madeAt: '2026-10-25T12:00:00Z',
  };
}

const newAccount = (id = 'pot', name = 'Christmas pot', balance = '40.00'): EditCommand => ({
  kind: 'add-account',
  account: { id, name, kind: 'savings', overdraftLimit: 0, warningLevel: 0 },
  balance: {
    id: `${id}-start`,
    balance: pounds(balance),
    checkedOn: samToday,
    checkedAt: '2026-10-25T12:00:00Z',
  },
});

describe('accounts (D151)', () => {
  it('adds an account and its first balance as one edit, one undo', () => {
    const { edit } = run(sam, newAccount());
    expect(edit.writes.map((write) => write.kind)).toEqual(['balance-update', 'account']);
    const after = made(sam, newAccount());
    const pot = planOf(after).accounts.find((one) => one.account.id === 'pot');
    expect([pot?.account.name, formatPounds(pot?.lowestPoint.balance ?? 0)]).toEqual([
      'Christmas pot',
      '40.00',
    ]);
  });

  it('changes the warning level: Sam goes under £10 on Sun 1 Nov, not Mon 26 Oct', () => {
    const after = made(sam, {
      kind: 'change-account',
      accountId: 'current',
      edits: { name: 'Bank', warningLevel: pounds('10.00') },
    });
    const current = planOf(after).accounts[0];
    expect([current?.account.name, current?.firstUnderWarning?.date]).toEqual([
      'Bank',
      '2026-11-01',
    ]);
  });

  it('closes an account once nothing is planned in it, and then takes nothing new', () => {
    const withPot = made(sam, newAccount('pot', 'Christmas pot', '0.00'));
    const closed = made(withPot, { kind: 'close-account', accountId: 'pot' });
    expect(closed.accounts.find((one) => one.id === 'pot')?.closed).toBe(true);
    refuses('account-closed', payment({ accountId: 'pot' }), closed);
    refuses('account-closed', { kind: 'close-account', accountId: 'pot' }, closed);
    refuses('account-closed', { kind: 'change-account', accountId: 'pot', edits: {} }, closed);
  });

  it('closes an account only at £0.00 at the end of today, once its money has moved (D158, D181)', () => {
    // £40.00 left in it: refused until it's moved to another account.
    const withPot = made(sam, newAccount());
    refuses('account-has-money', { kind: 'close-account', accountId: 'pot' }, withPot);
    const move = (from: string, to: string, amount: string): EditCommand[] => [
      payment({
        id: `move-${from}`,
        accountId: from,
        toAccountId: to,
        name: 'Move',
        direction: 'transfer',
        amount: pounds(amount),
        start: samToday,
        type: 'savings',
      }),
      {
        kind: 'tick',
        seriesId: `move-${from}`,
        originalDate: samToday,
        tickedAt: '2026-10-25T12:05:00Z',
      },
    ];
    const moved = move('pot', 'current', '40.00').reduce((now, one) => made(now, one), withPot);
    const closed = made(moved, { kind: 'close-account', accountId: 'pot' });
    expect(closed.accounts.find((one) => one.id === 'pot')?.closed).toBe(true);
    // Overdrawn by £3.12: refused until that's moved into it from another account.
    const overdrawn = made(sam, {
      kind: 'add-account',
      account: { id: 'old', name: 'Old', kind: 'current', overdraftLimit: 10_000, warningLevel: 0 },
      balance: {
        id: 'old-start',
        balance: -pounds('3.12'),
        checkedOn: samToday,
        checkedAt: '2026-10-25T12:00:00Z',
      },
    });
    refuses('account-has-money', { kind: 'close-account', accountId: 'old' }, overdrawn);
    const filled = move('current', 'old', '3.12').reduce((now, one) => made(now, one), overdrawn);
    made(filled, { kind: 'close-account', accountId: 'old' });
    // An unticked move is still planned, so it's refused for that instead.
    const unticked = made(withPot, move('pot', 'current', '40.00')[0] as EditCommand);
    refuses('account-in-use', { kind: 'close-account', accountId: 'pot' }, unticked);
  });

  it('refuses to close an account while payments, budgets or goals still use it', () => {
    refuses('account-in-use', { kind: 'close-account', accountId: 'savings' });
    const goal = made(made(sam, newAccount()), {
      kind: 'add-goal',
      goal: {
        id: 'xmas',
        name: 'Christmas',
        target: pounds('100.00'),
        accountId: 'pot',
        startingAmount: 0,
      },
    });
    refuses('account-in-use', { kind: 'close-account', accountId: 'pot' }, goal);
  });
});

describe('payments (D150, D156)', () => {
  it('adds a payment that starts on its next payment, today or later (D86)', () => {
    const after = made(sam, payment());
    const row = planOf(after).accounts[0]?.rows.find((one) => one.payment.seriesId === 'new');
    expect([row?.date, formatPounds(row?.change ?? 0)]).toEqual(['2026-11-06', '-10.00']);
    // Today itself is fine: Sam's spending money until payday was added for Sun 25 Oct.
    made(sam, payment({ id: 'today', start: samToday }));
  });

  it('refuses a payment dated before today: Update balance covers it (D150)', () => {
    refuses('payment-before-today', payment({ start: '2026-10-24' }));
    // Sun 25 Oct moved to the working day before is Fri 23 Oct.
    refuses(
      'payment-before-today',
      payment({
        start: '2026-10-25',
        schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 25 } },
        holidayRule: 'working-day-before',
      }),
    );
  });

  it('deletes a payment that hasn’t started yet, with its changes, as one undo', () => {
    const after = made(sam, { kind: 'delete-payment', seriesId: 'driving-test' });
    expect(after.series.some((one) => one.id === 'driving-test')).toBe(false);
    refuses('started', { kind: 'delete-payment', seriesId: 'spending-until-payday' });
    // The driving lessons start on Mon 26 Oct: they can be deleted on Sun 25 Oct, not after.
    made(sam, { kind: 'delete-payment', seriesId: 'driving-lessons' });
    refuses('started', { kind: 'delete-payment', seriesId: 'driving-lessons' }, sam, '2026-10-26');
  });

  it('links pay to its pay profile and pay weeks for the whole family (D154)', () => {
    let records = made(sam, { kind: 'add-pay-profile', profile: samPayProfile });
    for (const week of samPayWeeks) records = made(records, { kind: 'add-pay-week', week });
    const linked = made(records, {
      kind: 'link-pay',
      seriesId: 'pay',
      payProfileId: 'warehouse',
      cyclePayWeeks: ['week-26', 'week-27', 'week-28', 'week-27'],
    });
    const pay = linked.series.find((one) => one.id === 'pay');
    expect([pay?.payProfileId, pay?.cyclePayWeeks]).toEqual([
      'warehouse',
      ['week-26', 'week-27', 'week-28', 'week-27'],
    ]);
    refuses(
      'patterns-differ',
      { kind: 'link-pay', seriesId: 'pay', payProfileId: 'warehouse', cyclePayWeeks: ['week-26'] },
      records,
    );
    const unlinked = made(linked, { kind: 'link-pay', seriesId: 'pay', payProfileId: null });
    expect(unlinked.series.find((one) => one.id === 'pay')?.payProfileId).toBeUndefined();
  });
});

describe('debts (D153)', () => {
  const card = sam.debts?.find((one) => one.id === 'credit-card') as Debt;

  it('adds, changes and closes a debt; a closed one is left out of Owed now', () => {
    const owed = (records: PlanRecords) =>
      formatPounds(
        workOutDebts({
          debts: records.debts ?? [],
          series: records.series,
          changes: records.changes ?? [],
          holidays: inputFor(records, samToday).holidays,
          today: samToday,
          to: samViewEnd,
        }).owedNow,
      );
    expect(owed(sam)).toBe('3214.86');
    const added = made(sam, {
      kind: 'add-debt',
      debt: {
        id: 'phone-loan',
        name: 'Phone loan',
        kind: 'loan',
        currency: 'GBP',
        balance: pounds('100.00'),
        balanceOn: samToday,
        balanceAt: '2026-10-25T12:00:00Z',
        startingBalance: pounds('300.00'),
      },
    });
    expect(owed(added)).toBe('3314.86');
    const changed = made(added, {
      kind: 'change-debt',
      debtId: 'credit-card',
      edits: { interestRate: '24.9', statementDay: 10 },
    });
    expect(changed.debts?.find((one) => one.id === 'credit-card')).toEqual({
      ...card,
      interestRate: '24.9',
      statementDay: 10,
    });
    const closed = made(added, { kind: 'close-debt', debtId: 'phone-loan' });
    expect(owed(closed)).toBe('3214.86');
    refuses('debt-closed', { kind: 'close-debt', debtId: 'phone-loan' }, closed);
    refuses('debt-closed', payment({ debtId: 'phone-loan' }), closed);
  });

  it('adds a credit card with 0% until a date and a minimum rule (D101, D106)', () => {
    made(sam, {
      kind: 'add-debt',
      debt: {
        id: 'new-card',
        name: 'New card',
        kind: 'credit-card',
        currency: 'GBP',
        balance: pounds('420.99'),
        balanceOn: samToday,
        balanceAt: '2026-10-25T12:00:00Z',
        startingBalance: pounds('420.99'),
        interestRate: '24.9',
        zeroInterestUntil: '2026-11-30',
        statementDay: 10,
        minimumRule: { kind: 'rule', percent: '1', atLeast: pounds('5.00') },
      },
    });
  });
});

describe('budgets (D152)', () => {
  // Owner test 4's roll-over Travel budget, from Fri 16 Oct, with £18.00 spent last week.
  const travel: PlanRecords = {
    ...sam,
    budgets: [samTravel({ rollOver: true, startsOn: '2026-10-16' })],
    spends: [
      samSpend('bus-16-oct', '8.00', '2026-10-16', '2026-10-16T18:00:00Z'),
      samSpend('bus-22-oct', '10.00', '2026-10-22', '2026-10-22T18:00:00Z'),
    ],
  };
  const thisWeek = (records: PlanRecords) => {
    const current = planOf(records).budgets[0]?.current;
    return [current?.start, current?.base, current?.rolledOver, current?.amount];
  };

  it('adds a budget from today on, and refuses one of £0 (owner test 4)', () => {
    const food: Budget = {
      id: 'food',
      accountId: 'current',
      name: 'Food',
      amount: pounds('50.00'),
      every: 'week',
      leaves: 'at-start',
      rollOver: false,
      startsOn: '2026-10-30',
      createdAt: '2026-10-25T12:00:00Z',
    };
    made(sam, { kind: 'add-budget', budget: food });
    refuses('budget-zero', { kind: 'add-budget', budget: { ...food, amount: 0 } });
    refuses('starts-before-today', {
      kind: 'add-budget',
      budget: { ...food, startsOn: '2026-10-23' },
    });
  });

  it('changes the amount from this week on: last week keeps its £25.00, so £7.00 still rolls over', () => {
    expect(thisWeek(travel)).toEqual(['2026-10-23', 2500, 700, 3200]);
    const after = made(travel, {
      kind: 'change-budget',
      budgetId: 'travel',
      edits: { amount: pounds('30.00') },
    });
    expect(after.budgets?.[0]?.amountsBefore).toEqual([{ until: '2026-10-22', amount: 2500 }]);
    expect(thisWeek(after)).toEqual(['2026-10-23', 3000, 700, 3700]);
    // A second change the same week keeps the same earlier amounts.
    const again = made(after, {
      kind: 'change-budget',
      budgetId: 'travel',
      edits: { amount: pounds('35.00') },
    });
    expect(again.budgets?.[0]?.amountsBefore).toEqual([{ until: '2026-10-22', amount: 2500 }]);
  });

  it('switches roll-over on from today, and off again (D110)', () => {
    const off = made(travel, {
      kind: 'change-budget',
      budgetId: 'travel',
      edits: { rollOver: false },
    });
    expect([off.budgets?.[0]?.rollOver, off.budgets?.[0]?.rollOverFrom]).toEqual([
      false,
      undefined,
    ]);
    const on = made(off, { kind: 'change-budget', budgetId: 'travel', edits: { rollOver: true } });
    expect([on.budgets?.[0]?.rollOver, on.budgets?.[0]?.rollOverFrom]).toEqual([true, samToday]);
    // Last week ended before today, so it doesn't roll over now.
    expect(thisWeek(on)).toEqual(['2026-10-23', 2500, 0, 2500]);
  });

  it('changes how it leaves, but not to a pay-later bill once it has spends', () => {
    const spread = made(travel, {
      kind: 'change-budget',
      budgetId: 'travel',
      edits: { leaves: 'spread' },
    });
    expect(spread.budgets?.[0]?.leaves).toBe('spread');
    refuses(
      'budget-has-history',
      { kind: 'change-budget', budgetId: 'travel', edits: { leaves: 'pay-later', billDay: 29 } },
      travel,
    );
  });

  it('ends a budget: its last week is the one with the end in it', () => {
    const ended = made(travel, { kind: 'end-budget', budgetId: 'travel', endsOn: '2026-11-01' });
    const periods = planOf(ended).budgets[0]?.periods ?? [];
    expect(periods.map((one) => one.start)).toEqual(['2026-10-23', '2026-10-30']);
    refuses(
      'ends-before-today',
      { kind: 'end-budget', budgetId: 'travel', endsOn: '2026-10-24' },
      travel,
    );
    refuses(
      'budget-ended',
      { kind: 'change-budget', budgetId: 'travel', edits: { name: 'Bus' } },
      ended,
      '2026-11-06',
    );
  });
});

describe('savings goals (D153)', () => {
  const goal: EditCommand = {
    kind: 'add-goal',
    goal: {
      id: 'holiday',
      name: 'Holiday',
      target: pounds('1200.00'),
      targetDate: '2027-07-30',
      accountId: 'savings',
      startingAmount: 0,
    },
  };

  it('adds, changes and closes a goal', () => {
    const added = made(sam, goal);
    const changed = made(added, {
      kind: 'change-goal',
      goalId: 'holiday',
      edits: { target: pounds('1500.00'), targetDate: null },
    });
    expect(changed.goals?.[0]).toEqual({
      id: 'holiday',
      name: 'Holiday',
      target: pounds('1500.00'),
      accountId: 'savings',
      startingAmount: 0,
    });
    const closed = made(changed, { kind: 'close-goal', goalId: 'holiday' });
    expect(closed.goals?.[0]?.closed).toBe(true);
    refuses(
      'goal-closed',
      payment({ direction: 'transfer', toAccountId: 'savings', goalId: 'holiday' }),
      closed,
    );
  });

  it('refuses moving a goal to an account its payments don’t touch', () => {
    const linked = made(
      made(made(sam, newAccount()), goal),
      payment({ direction: 'transfer', toAccountId: 'savings', goalId: 'holiday' }),
    );
    // The move goes from the current account to savings, so the goal can be
    // in either of them, but not in the Christmas pot.
    made(linked, { kind: 'change-goal', goalId: 'holiday', edits: { accountId: 'current' } });
    refuses(
      'bad-goal-link',
      { kind: 'change-goal', goalId: 'holiday', edits: { accountId: 'pot' } },
      linked,
    );
  });
});

describe('pay profiles and pay weeks (D154)', () => {
  // Sam's plan with his pay profile and pay weeks, and 11.5 hours of
  // overtime on Mon 26 Oct saved on Fri 6 Nov (+£155.12, D124).
  let records = made(sam, { kind: 'add-pay-profile', profile: samPayProfile });
  for (const week of samPayWeeks) records = made(records, { kind: 'add-pay-week', week });
  records = made(records, {
    kind: 'link-pay',
    seriesId: 'pay',
    payProfileId: 'warehouse',
    cyclePayWeeks: ['week-26', 'week-27', 'week-28', 'week-27'],
  });
  const overtime: EditCommand = {
    kind: 'overtime',
    id: 'ot-1',
    seriesId: 'pay',
    workedOn: '2026-10-26',
    hours: '11.5',
  };
  const withOvertime = made(records, overtime);
  const change = (one: PlanRecords) =>
    (
      one.payAdjustments?.find((adjustment) => adjustment.id === 'ot-1') as
        | PayAdjustment
        | undefined
    )?.change ?? 0;

  it('saves the overtime as before: £155.12 on Fri 6 Nov', () => {
    expect(formatPounds(change(withOvertime))).toBe('155.12');
  });

  it('works overtime out again when the pay week changes, as if saved on the new week', () => {
    const lines = [{ name: 'Basic', kind: 'basic' as const, hours: '40', rate: '12.71' }];
    const after = made(withOvertime, {
      kind: 'change-pay-week',
      payWeekId: 'week-27',
      edits: { lines },
    });
    const fresh = made(
      made(records, { kind: 'change-pay-week', payWeekId: 'week-27', edits: { lines } }),
      overtime,
    );
    expect(change(after)).toBe(change(fresh));
    expect(change(after)).not.toBe(change(withOvertime));
  });

  it('works overtime out again when the tax code changes', () => {
    const after = made(withOvertime, {
      kind: 'change-pay-profile',
      payProfileId: 'warehouse',
      edits: { taxCode: 'BR' },
    });
    const fresh = made(
      made(records, {
        kind: 'change-pay-profile',
        payProfileId: 'warehouse',
        edits: { taxCode: 'BR' },
      }),
      overtime,
    );
    expect(change(after)).toBe(change(fresh));
  });

  it('refuses a pay week with no lines or extras, or hours below zero', () => {
    const week = { id: 'empty', name: 'Empty', payProfileId: 'warehouse', lines: [] };
    refuses('empty-pay-week', { kind: 'add-pay-week', week }, records);
    refuses(
      'bad-pay-week',
      {
        kind: 'add-pay-week',
        week: { ...week, lines: [{ name: 'Basic', kind: 'basic', hours: '-1', rate: '12.71' }] },
      },
      records,
    );
  });
});

describe('main pay and nation (D155)', () => {
  it('saves them as one settings record, undone in one step', () => {
    const scotland = made(sam, { kind: 'set-nation', nation: 'scotland' });
    expect(scotland.settings).toEqual({ nation: 'scotland', mainPayFamilyId: 'pay' });
    const none = made(sam, { kind: 'choose-main-pay', familyId: null });
    expect(planOf(none).mainPay).toBe('none');
    refuses('unknown-family', { kind: 'choose-main-pay', familyId: 'nothing' });
    refuses('main-pay-not-coming-in', { kind: 'choose-main-pay', familyId: 'rent' });
    refuses('bad-nation', { kind: 'set-nation', nation: 'wales' as never });
  });

  it('starts an empty plan, so setup can begin with no accounts', () => {
    const empty: PlanRecords = { accounts: [], balanceUpdates: [], series: [] };
    const after = made(empty, { kind: 'set-nation', nation: 'northern-ireland' });
    expect(after.settings).toEqual({ nation: 'northern-ireland', mainPayFamilyId: null });
  });
});

describe('owner test 4: every refusal has a plain code', () => {
  const withPot = made(sam, newAccount('pot', 'Christmas pot', '0.00'));

  it.each<[string, string, EditCommand]>([
    [
      'a transfer to the same account',
      'same-account',
      payment({ direction: 'transfer', toAccountId: 'current', type: 'savings' }),
    ],
    [
      'money set aside to the same account',
      'same-account',
      payment({ direction: 'in', setAside: { percent: '25', accountId: 'current' } }),
    ],
    ['a payment dated before today', 'payment-before-today', payment({ start: '2026-10-01' })],
    ['a payment with no name', 'needs-name', payment({ name: ' ' })],
    ['a payment with an id already used', 'id-taken', payment({ id: 'rent' })],
    [
      'a payment in an account not in the plan',
      'unknown-account',
      payment({ accountId: 'nowhere' }),
    ],
    ['a payment linked to a debt not in the plan', 'unknown-debt', payment({ debtId: 'nothing' })],
    [
      'money coming in linked to a debt',
      'bad-debt-link',
      payment({ direction: 'in', debtId: 'credit-card' }),
    ],
    ['a payment linked to a goal not in the plan', 'unknown-goal', payment({ goalId: 'nothing' })],
    [
      'a payment on chosen dates all before its start',
      'no-payments',
      payment({ start: '2026-12-01', schedule: { kind: 'dates', dates: ['2026-11-01'] } }),
    ],
    [
      'a payment with no schedule',
      'bad-schedule',
      payment({ schedule: { kind: 'never' } as never }),
    ],
    ['an account with no name', 'needs-name', newAccount('pot2', '')],
    ['an account with an id already used', 'id-taken', newAccount('current')],
    [
      'a goal with no account',
      'needs-account',
      {
        kind: 'add-goal',
        goal: { id: 'g', name: 'Goal', target: 100, accountId: '', startingAmount: 0 },
      },
    ],
    [
      'a goal with a target of £0',
      'target-zero',
      {
        kind: 'add-goal',
        goal: { id: 'g', name: 'Goal', target: 0, accountId: 'savings', startingAmount: 0 },
      },
    ],
    [
      'a goal dated before today',
      'target-date-before-today',
      {
        kind: 'add-goal',
        goal: {
          id: 'g',
          name: 'Goal',
          target: 100,
          targetDate: '2026-10-01',
          accountId: 'savings',
          startingAmount: 0,
        },
      },
    ],
    [
      'a debt in yen, which has no pence',
      'currency-not-in-hundredths',
      {
        kind: 'add-debt',
        debt: {
          id: 'd',
          name: 'Debt',
          kind: 'loan',
          currency: 'JPY',
          rate: '190',
          balance: 100,
          balanceOn: samToday,
          balanceAt: '2026-10-25T12:00:00Z',
          startingBalance: 100,
        },
      },
    ],
    [
      'a debt in euros with no rate',
      'bad-rate',
      {
        kind: 'add-debt',
        debt: {
          id: 'd',
          name: 'Debt',
          kind: 'loan',
          currency: 'EUR',
          balance: 100,
          balanceOn: samToday,
          balanceAt: '2026-10-25T12:00:00Z',
          startingBalance: 100,
        },
      },
    ],
    [
      'interest on a loan',
      'credit-card-only',
      {
        kind: 'add-debt',
        debt: {
          id: 'd',
          name: 'Debt',
          kind: 'loan',
          currency: 'GBP',
          interestRate: '10',
          balance: 100,
          balanceOn: samToday,
          balanceAt: '2026-10-25T12:00:00Z',
          startingBalance: 100,
        },
      },
    ],
    [
      'a pay profile with a made-up tax code',
      'bad-tax-code',
      { kind: 'add-pay-profile', profile: { ...samPayProfile, id: 'p', taxCode: 'Q99' } },
    ],
    [
      'monthly pay covering work days before payday',
      'covered-to-not-for-frequency',
      { kind: 'add-pay-profile', profile: { ...samPayProfile, id: 'p', frequency: 'monthly' } },
    ],
    [
      'a pay week for a pay profile not in the plan',
      'unknown-pay-profile',
      { kind: 'add-pay-week', week: { id: 'w', name: 'Week', payProfileId: 'nothing', lines: [] } },
    ],
    [
      'deleting a payment not in the plan',
      'unknown-series',
      { kind: 'delete-payment', seriesId: 'food' },
    ],
    [
      'a budget for a closed account',
      'account-closed',
      {
        kind: 'add-budget',
        budget: {
          id: 'b',
          accountId: 'pot',
          name: 'Gifts',
          amount: 100,
          every: 'month',
          leaves: 'at-start',
          rollOver: false,
          startsOn: samToday,
          createdAt: '2026-10-25T12:00:00Z',
        },
      },
    ],
  ])('refuses %s with %s', (_what, code, command) => {
    const closed = run(withPot, { kind: 'close-account', accountId: 'pot' }).after;
    refuses(code, command, closed);
  });

  it('refuses an undo when something saved since uses what the edit added', () => {
    const { edit, after } = run(sam, newAccount());
    const used = run(after, payment({ accountId: 'pot' })).after;
    refusedWith('changed-since', () => run(used, { kind: 'undo', edit }));
  });

  it('never names an amount, a name or a note in a refusal', () => {
    let message = '';
    try {
      run(sam, payment({ name: 'Secret dentist', amount: pounds('987.65'), start: '2026-10-01' }));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toMatch(/987|Secret|dentist/);
  });
});

describe('found by the outside review of step 2a', () => {
  // Sam's whole plan with his pay profile, pay weeks and pay-later food budget.
  const everything = build(samEverythingSteps()).records;
  const overtimeOn = (workedOn: string, id = 'ot'): EditCommand => ({
    kind: 'overtime',
    id,
    seriesId: 'pay',
    workedOn,
    hours: '5',
  });
  const changeOf = (records: PlanRecords, id = 'ot') =>
    records.payAdjustments?.find((one) => one.id === id)?.change;

  it('takes a newer payslip’s year so far once overtime is saved on a payday that has gone (D154)', () => {
    // Overtime for Sat 24 Oct goes on Fri 30 Oct, tax week 30.
    const saved = made(everything, overtimeOn('2026-10-24'));
    const before = changeOf(saved);
    const week30 = made(
      saved,
      {
        kind: 'change-pay-profile',
        payProfileId: 'warehouse',
        edits: { soFar: { taxYear: '2026-27', period: 30, grossForTax: 1110000, taxPaid: 77000 } },
      },
      '2026-10-31',
    );
    expect(changeOf(week30)).toBe(before);
    made(
      saved,
      {
        kind: 'change-pay-profile',
        payProfileId: 'warehouse',
        edits: { soFar: { taxYear: '2027-28', period: 1, grossForTax: 50000, taxPaid: 0 } },
      },
      '2027-04-12',
    );
  });

  it('works overtime out again when an undo puts the tax code back (D154)', () => {
    const { edit, after } = run(everything, {
      kind: 'change-pay-profile',
      payProfileId: 'warehouse',
      edits: { taxCode: 'BR' },
    });
    const withOvertime = run(after, overtimeOn('2026-10-27')).after;
    const undone = run(withOvertime, { kind: 'undo', edit }).after;
    const fresh = run(everything, overtimeOn('2026-10-27')).after;
    expect(changeOf(undone)).toBe(changeOf(fresh));
    expect(changeOf(undone)).not.toBe(changeOf(withOvertime));
  });

  it('refuses a new last day covered that would move a saved shift to another payday (D154)', () => {
    // Tue 27 Oct is paid on Fri 6 Nov, covering work up to Sun 1 Nov.
    const saved = made(everything, overtimeOn('2026-10-27'));
    refuses(
      'shifts-saved',
      {
        kind: 'change-pay-profile',
        payProfileId: 'warehouse',
        edits: { coveredTo: { kind: 'days-before', days: 0 } },
      },
      saved,
    );
    // Covering work up to 4 days before still puts it on Fri 6 Nov.
    const after = made(saved, {
      kind: 'change-pay-profile',
      payProfileId: 'warehouse',
      edits: { coveredTo: { kind: 'days-before', days: 4 } },
    });
    expect(after.payAdjustments?.[0]?.number).toBe(1);
  });

  it('moves a pay-later budget’s bills only while nothing is stored against them, and never before today (D152)', () => {
    const spend: EditCommand = {
      kind: 'spend',
      spend: {
        id: 'shop',
        budgetId: 'food',
        amount: pounds('120.00'),
        spentOn: '2026-11-10',
        recordedAt: '2026-11-10T12:00:00Z',
      },
    };
    const billDay = (day: number): EditCommand => ({
      kind: 'change-budget',
      budgetId: 'food',
      edits: { billDay: day },
    });
    // On Tue 10 Nov a bill on the 5th would start with one on Thu 5 Nov.
    refuses('bill-before-today', billDay(5), everything, '2026-11-10');
    refuses('budget-has-history', billDay(5), made(everything, spend, '2026-11-10'), '2026-11-10');
    // On Sun 25 Oct, before any bill or spend, the bill can move to the 30th.
    const moved = made(everything, billDay(30));
    expect(moved.budgets?.[0]?.billDay).toBe(30);
    // Sam's Travel, from Fri 23 Oct, as a pay-later bill on the 24th would have had a bill on Sat 24 Oct.
    refuses(
      'bill-before-today',
      {
        kind: 'change-budget',
        budgetId: 'travel',
        edits: { leaves: 'pay-later', billDay: 24 },
      },
      { ...sam, budgets: [samTravel()] },
    );
  });
});
