// Priya's and Kofi's answers to setup (step 2e), as the step 2a commands
// build them (D149), written out by hand with ids of their own. The setup
// tests type the same answers into the screens and check the plan saved on
// the phone is the same as these commands build, and that its balances are
// the same as each person's test plan (D137, D157).

import {
  applyWrites,
  type EditCommand,
  editPlan,
  type PlanRecords,
  parsePounds as pounds,
  type Series,
} from '@prepenny/engine';
import { calendarFor as holidaysFor } from '../../../packages/engine/test/fixtures/holidays.ts';

type NewPayment = Omit<
  Series,
  'familyId' | 'familyCreatedAt' | 'firstNumber' | 'splitFrom' | 'mirrorOf'
>;

const EMPTY: PlanRecords = { accounts: [], balanceUpdates: [], series: [] };

/** Makes each command in turn, as the phone does, from an empty plan. */
export function buildFrom(commands: readonly EditCommand[], today: string): PlanRecords {
  let records = EMPTY;
  for (const command of commands) {
    const input = {
      ...records,
      mainPayFamilyId: records.settings?.mainPayFamilyId ?? null,
      holidays: holidaysFor(records.settings?.nation ?? 'england-and-wales'),
      today,
    };
    const edit = editPlan(input, command);
    const {
      mainPayFamilyId: _main,
      holidays: _holidays,
      today: _today,
      ...stored
    } = applyWrites(input, edit.writes);
    records = stored;
  }
  return records;
}

/** A clock that moves on a second each time, so things keep the order they were made in. */
function clock(from: string) {
  let at = Date.parse(from);
  return () => {
    at += 1000;
    return new Date(at).toISOString();
  };
}

const monthlyOn = (day: number, every = 1) =>
  ({ kind: 'monthly', every, on: { kind: 'day', day } }) as const;

/** Priya on Sun 25 Oct 2026 (brief Part 2 and 8.5, D137): her fixture's amounts and dates. */
export const PRIYA_TODAY = '2026-10-25';

export function priyaCommands(): EditCommand[] {
  const now = clock('2026-11-04T10:00:00Z');
  const out = (
    id: string,
    name: string,
    amount: string,
    start: string,
    schedule: NewPayment['schedule'],
    type: NewPayment['type'],
    extra: Partial<NewPayment> = {},
  ): EditCommand => ({
    kind: 'add-payment',
    series: {
      id,
      accountId: 'current',
      name,
      direction: 'out',
      amount: pounds(amount),
      start,
      schedule,
      end: { kind: 'never' },
      holidayRule: 'keep',
      type,
      isEstimate: false,
      ...extra,
    },
    madeAt: now(),
  });
  return [
    {
      kind: 'add-account',
      account: {
        id: 'current',
        name: 'Current account',
        kind: 'current',
        overdraftLimit: 0,
        warningLevel: pounds('50.00'),
      },
      balance: {
        id: 'current-balance',
        balance: pounds('1240.00'),
        checkedOn: PRIYA_TODAY,
        checkedAt: now(),
      },
    },
    {
      kind: 'add-account',
      account: {
        id: 'savings',
        name: 'Holiday savings',
        kind: 'savings',
        overdraftLimit: 0,
        warningLevel: 0,
      },
      balance: {
        id: 'savings-balance',
        balance: pounds('300.00'),
        checkedOn: PRIYA_TODAY,
        checkedAt: now(),
      },
    },
    { kind: 'set-nation', nation: 'england-and-wales' },
    {
      kind: 'add-payment',
      series: {
        id: 'salary',
        accountId: 'current',
        name: 'Salary',
        direction: 'in',
        amount: pounds('2100.00'),
        start: '2026-10-30',
        schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
        end: { kind: 'never' },
        // Brief 8.5: the last working day, moved to the working day before.
        holidayRule: 'working-day-before',
        type: 'pay',
        isEstimate: false,
      },
      madeAt: now(),
    },
    { kind: 'choose-main-pay', familyId: 'salary' },
    out('rent', 'Rent', '850.00', '2026-11-01', monthlyOn(1), 'rent'),
    out(
      'council-tax',
      'Council tax',
      '148.00',
      '2026-11-01',
      { ...monthlyOn(1), leaveOut: [2, 3] },
      'bills',
    ),
    out('energy', 'Energy', '96.00', '2026-11-15', monthlyOn(15), 'bills', { isEstimate: true }),
    out('water', 'Water', '118.60', '2026-11-05', monthlyOn(5, 3), 'bills'),
    out('phone', 'Phone', '18.00', '2026-11-20', monthlyOn(20), 'bills'),
    out('broadband', 'Broadband', '30.00', '2026-11-08', monthlyOn(8), 'bills'),
    out('tv-licence', 'TV licence', '174.50', '2027-03-01', monthlyOn(1, 12), 'bills'),
    out('car-insurance', 'Car insurance', '612.40', '2027-01-14', monthlyOn(14, 12), 'bills'),
    out('streaming', 'Streaming', '10.99', '2026-11-12', monthlyOn(12), 'bills'),
    out('cloud-storage', 'Cloud storage', '2.99', '2026-10-27', monthlyOn(27), 'bills'),
    {
      kind: 'add-budget',
      budget: {
        id: 'food',
        accountId: 'current',
        name: 'Food',
        amount: pounds('260.00'),
        every: 'month',
        leaves: 'at-start',
        rollOver: false,
        // Her next pay month starts on her next payday (D29, D108).
        startsOn: '2026-10-30',
        createdAt: now(),
      },
    },
    {
      kind: 'add-budget',
      budget: {
        id: 'travel',
        accountId: 'current',
        name: 'Travel',
        amount: pounds('25.00'),
        every: 'week',
        leaves: 'spread',
        rollOver: false,
        // Her next week starts on Monday, as her pay is monthly (D29).
        startsOn: '2026-10-26',
        createdAt: now(),
      },
    },
    {
      kind: 'add-goal',
      goal: {
        id: 'holiday',
        name: 'Holiday',
        target: pounds('1500.00'),
        targetDate: '2027-07-30',
        accountId: 'savings',
        startingAmount: pounds('300.00'),
      },
    },
    {
      kind: 'add-payment',
      series: {
        id: 'to-holiday',
        accountId: 'current',
        toAccountId: 'savings',
        name: 'Saving for Holiday',
        direction: 'transfer',
        amount: pounds('150.00'),
        // Each payday: her salary's own schedule from her next payday.
        start: '2026-10-30',
        schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
        end: { kind: 'never' },
        holidayRule: 'working-day-before',
        type: 'savings',
        goalId: 'holiday',
        isEstimate: false,
      },
      madeAt: now(),
    },
  ];
}

/** Kofi on Tue 27 Oct 2026, the day he sets up (brief Part 2, D137, D157). */
export const KOFI_TODAY = '2026-10-27';

export function kofiCommands(): EditCommand[] {
  const now = clock('2026-11-04T11:00:00Z');
  const forTax = { percent: '25', accountId: 'tax' } as const;
  const platform = (id: string, name: string, amount: string, start: string): EditCommand => ({
    kind: 'add-payment',
    series: {
      id,
      accountId: 'current',
      name,
      direction: 'in',
      amount: pounds(amount),
      start,
      schedule: { kind: 'irregular' },
      end: { kind: 'never' },
      holidayRule: 'keep',
      type: 'pay',
      setAside: forTax,
      isEstimate: true,
    },
    madeAt: now(),
  });
  const out = (
    id: string,
    name: string,
    amount: string,
    start: string,
    schedule: NewPayment['schedule'],
    type: NewPayment['type'],
    extra: Partial<NewPayment> = {},
  ): EditCommand => ({
    kind: 'add-payment',
    series: {
      id,
      accountId: 'current',
      name,
      direction: 'out',
      amount: pounds(amount),
      start,
      schedule,
      end: { kind: 'never' },
      holidayRule: 'keep',
      type,
      isEstimate: false,
      ...extra,
    },
    madeAt: now(),
  });
  const weekly = (id: string, name: string, amount: string): EditCommand => ({
    kind: 'add-budget',
    budget: {
      id,
      accountId: 'current',
      name,
      amount: pounds(amount),
      every: 'week',
      leaves: 'at-start',
      rollOver: false,
      // His weeks run Monday to Sunday (D14, D108).
      startsOn: '2026-11-02',
      createdAt: now(),
    },
  });
  return [
    {
      kind: 'add-account',
      account: {
        id: 'current',
        name: 'Current account',
        kind: 'current',
        overdraftLimit: 0,
        warningLevel: pounds('50.00'),
      },
      balance: {
        id: 'current-balance',
        balance: pounds('640.00'),
        checkedOn: KOFI_TODAY,
        checkedAt: now(),
      },
    },
    {
      kind: 'add-account',
      account: { id: 'tax', name: 'Tax', kind: 'savings', overdraftLimit: 0, warningLevel: 0 },
      balance: {
        id: 'tax-balance',
        balance: pounds('1180.00'),
        checkedOn: KOFI_TODAY,
        checkedAt: now(),
      },
    },
    { kind: 'set-nation', nation: 'england-and-wales' },
    platform('rides', 'Rides', '380.00', '2026-11-02'),
    platform('deliveries', 'Deliveries', '145.00', '2026-10-28'),
    platform('parcels', 'Parcels', '90.00', '2026-10-30'),
    { kind: 'choose-main-pay', familyId: 'rides' },
    out('rent', 'Rent', '650.00', '2026-11-01', monthlyOn(1), 'rent'),
    // The bills in the checklist's order: phone, then insurance (brief 4.1).
    out('phone', 'Phone', '25.00', '2026-11-20', monthlyOn(20), 'bills'),
    out('van-insurance', 'Van insurance', '96.00', '2026-11-12', monthlyOn(12), 'bills'),
    out('tax-bill', 'Self Assessment', '1450.00', '2027-01-29', { kind: 'once' }, 'bills', {
      accountId: 'tax',
      isEstimate: true,
    }),
    {
      kind: 'add-debt',
      debt: {
        id: 'van-finance',
        name: 'Van finance',
        kind: 'loan',
        currency: 'GBP',
        balance: pounds('6936.00'),
        balanceOn: KOFI_TODAY,
        balanceAt: now(),
        startingBalance: pounds('10404.00'),
      },
    },
    out('van-payment', 'Van finance', '289.00', '2026-11-05', monthlyOn(5), 'debt', {
      end: { kind: 'after', payments: 24 },
      debtId: 'van-finance',
    }),
    weekly('fuel', 'Fuel', '70.00'),
    weekly('food', 'Food', '45.00'),
  ];
}
