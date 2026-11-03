// The other five people from brief Part 2, as whole plans beside Sam's
// (sam.ts): Priya, Dee, Kofi, Jess and Tom, and Ali. Each uses the details in
// Part 2, with amounts that make sense for that person, and every engine part
// that person needs. Phase 2's end-to-end tests use them (brief Part 10).
//
// Each plan is everything stored for it, its main pay, its nation's bank
// holidays, today and how far the plan looks, ready for workOutPlan, editPlan
// and whatIf. Ticks show what was already paid when the balance was checked,
// so nothing is left in Not ticked yet.

import type {
  Account,
  BalanceUpdate,
  Budget,
  Debt,
  Goal,
  PaymentChange,
  PayProfile,
  PayWeek,
  Series,
  Tick,
  WhatIfInput,
} from '../../src/index.ts';
import { parsePounds as pounds } from '../../src/index.ts';
import { englandAndWales } from './holidays.ts';

type SeriesFields = Omit<
  Series,
  'familyId' | 'familyCreatedAt' | 'holidayRule' | 'isEstimate' | 'end'
> &
  Partial<Pick<Series, 'holidayRule' | 'isEstimate' | 'end'>>;

/**
 * Series made one minute apart from `madeFrom`, in the order given, each its
 * own family (D12, D49), keeping their dates unless they say otherwise.
 */
function seriesInOrder(madeFrom: string, list: readonly SeriesFields[]): Series[] {
  const start = Date.parse(madeFrom);
  return list.map((one, i) => ({
    holidayRule: 'keep',
    isEstimate: false,
    end: { kind: 'never' },
    ...one,
    familyId: one.id,
    familyCreatedAt: new Date(start + i * 60_000).toISOString().replace('.000Z', 'Z'),
  }));
}

function balance(accountId: string, amount: string, checkedOn: string, at: string): BalanceUpdate {
  return {
    id: `${accountId}-${checkedOn}`,
    accountId,
    balance: pounds(amount),
    checkedOn,
    checkedAt: at,
  };
}

/** A payment already paid before the balance was checked: inside that balance (brief 5.5, D33). */
function paidBefore(seriesId: string, originalDate: string, tickedAt: string): Tick {
  return { seriesId, originalDate, tickedAt, paidOn: originalDate };
}

/**
 * Priya, office worker (brief Part 2): a monthly salary on the last working
 * day, paid earlier when that's a weekend or bank holiday. No debts. A yearly
 * car insurance, a TV licence, a quarterly water bill and subscriptions.
 * Saving for a holiday. She looks a year ahead, so the yearly bills show.
 */
export function priyaPlan(): WhatIfInput {
  const accounts: Account[] = [
    { id: 'current', kind: 'current', overdraftLimit: 0, warningLevel: pounds('50.00') },
    { id: 'savings', kind: 'savings', overdraftLimit: 0, warningLevel: 0 },
  ];
  const series = seriesInOrder('2026-10-24T19:00:00Z', [
    {
      // Brief 8.5: £2,100 on the last working day, moved to the working day before.
      id: 'salary',
      accountId: 'current',
      name: 'Salary',
      direction: 'in',
      amount: pounds('2100.00'),
      start: '2026-10-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
      holidayRule: 'working-day-before',
      type: 'pay',
    },
    {
      id: 'rent',
      accountId: 'current',
      name: 'Rent',
      direction: 'out',
      amount: pounds('850.00'),
      start: '2026-11-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
      type: 'rent',
    },
    {
      id: 'council-tax',
      accountId: 'current',
      name: 'Council tax',
      direction: 'out',
      amount: pounds('148.00'),
      start: '2026-11-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 }, leaveOut: [2, 3] },
      type: 'bills',
    },
    {
      id: 'energy',
      accountId: 'current',
      name: 'Energy',
      direction: 'out',
      amount: pounds('96.00'),
      start: '2026-11-15',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 15 } },
      type: 'bills',
      isEstimate: true,
    },
    {
      // Every 3 months: Nov, Feb, May and Aug (brief 8.5).
      id: 'water',
      accountId: 'current',
      name: 'Water',
      direction: 'out',
      amount: pounds('118.60'),
      start: '2026-11-05',
      schedule: { kind: 'monthly', every: 3, on: { kind: 'day', day: 5 } },
      type: 'bills',
    },
    {
      id: 'phone',
      accountId: 'current',
      name: 'Phone',
      direction: 'out',
      amount: pounds('18.00'),
      start: '2026-11-20',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 20 } },
      type: 'bills',
    },
    {
      id: 'broadband',
      accountId: 'current',
      name: 'Broadband',
      direction: 'out',
      amount: pounds('30.00'),
      start: '2026-11-08',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 8 } },
      type: 'bills',
    },
    {
      id: 'tv-licence',
      accountId: 'current',
      name: 'TV licence',
      direction: 'out',
      amount: pounds('174.50'),
      start: '2027-03-01',
      schedule: { kind: 'monthly', every: 12, on: { kind: 'day', day: 1 } },
      type: 'bills',
    },
    {
      // Yearly (brief 8.5): it appears once a year.
      id: 'car-insurance',
      accountId: 'current',
      name: 'Car insurance',
      direction: 'out',
      amount: pounds('612.40'),
      start: '2027-01-14',
      schedule: { kind: 'monthly', every: 12, on: { kind: 'day', day: 14 } },
      type: 'bills',
    },
    {
      id: 'streaming',
      accountId: 'current',
      name: 'Streaming',
      direction: 'out',
      amount: pounds('10.99'),
      start: '2026-11-12',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 12 } },
      type: 'bills',
    },
    {
      id: 'cloud-storage',
      accountId: 'current',
      name: 'Cloud storage',
      direction: 'out',
      amount: pounds('2.99'),
      start: '2026-10-27',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 27 } },
      type: 'bills',
    },
    {
      // On payday, into savings for the holiday (brief 4.7).
      id: 'to-holiday',
      accountId: 'current',
      toAccountId: 'savings',
      name: 'To the holiday fund',
      direction: 'transfer',
      amount: pounds('150.00'),
      start: '2026-10-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
      holidayRule: 'working-day-before',
      type: 'savings',
      goalId: 'holiday',
    },
  ]);
  const budgets: Budget[] = [
    {
      // Monthly, from one payday to the day before the next (D29).
      id: 'food',
      accountId: 'current',
      name: 'Food',
      amount: pounds('260.00'),
      every: 'month',
      leaves: 'at-start',
      rollOver: false,
      startsOn: '2026-10-30',
      createdAt: '2026-10-24T19:30:00Z',
    },
    {
      // Weekly from Monday, because her pay is monthly (D29), and spread
      // across the days (D31).
      id: 'travel',
      accountId: 'current',
      name: 'Travel',
      amount: pounds('25.00'),
      every: 'week',
      leaves: 'spread',
      rollOver: false,
      startsOn: '2026-10-26',
      createdAt: '2026-10-24T19:31:00Z',
    },
  ];
  const goals: Goal[] = [
    {
      id: 'holiday',
      name: 'Holiday',
      target: pounds('1500.00'),
      targetDate: '2027-07-30',
      accountId: 'savings',
      startingAmount: pounds('300.00'),
    },
  ];
  return {
    accounts,
    balanceUpdates: [
      balance('current', '1240.00', '2026-10-25', '2026-10-25T09:00:00Z'),
      balance('savings', '300.00', '2026-10-25', '2026-10-25T09:00:00Z'),
    ],
    series,
    changes: [],
    ticks: [],
    debts: [],
    budgets,
    spends: [],
    goals,
    mainPayFamilyId: 'salary',
    holidays: englandAndWales,
    today: '2026-10-25',
    to: '2027-10-24',
  };
}

/** Dee's job: a café, paid every 2 weeks, 32 hours at £12.71 (brief 4.15). */
export const deeCafe: PayProfile = {
  id: 'cafe',
  frequency: 'two-weekly',
  taxCode: '1257L',
  basis: 'cumulative',
  overtimeRate: '12.71',
  // Each Friday payday covers work up to the Sunday before (D131).
  coveredTo: { kind: 'days-before', days: 5 },
};

export const deeFortnight: PayWeek = {
  id: 'cafe-fortnight',
  payProfileId: 'cafe',
  lines: [{ name: 'Basic', kind: 'basic', hours: '32', rate: '12.71' }],
};

/**
 * Dee, Universal Credit and part-time work (brief Part 2): Universal Credit
 * monthly on the 28th, which changes with her earnings, so it's an estimate
 * she corrects when the real amount arrives. Wages every 2 weeks. Council
 * tax in 10 instalments, April to January. Childcare. Tight every month.
 * Today is Mon 2 Nov 2026: October's Universal Credit came in at £812.46.
 */
export function deePlan(): WhatIfInput {
  const series = seriesInOrder('2026-10-30T20:00:00Z', [
    {
      // Brief 8.5: due on the 28th, moved to the working day before.
      id: 'universal-credit',
      accountId: 'current',
      name: 'Universal Credit',
      direction: 'in',
      amount: pounds('845.00'),
      start: '2026-10-28',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } },
      holidayRule: 'working-day-before',
      type: 'benefits',
      isEstimate: true,
    },
    {
      id: 'wages',
      accountId: 'current',
      name: 'Café wages',
      direction: 'in',
      amount: pounds('406.72'),
      start: '2026-10-30',
      schedule: { kind: 'weekly', every: 2 },
      holidayRule: 'working-day-before',
      type: 'pay',
      isEstimate: true,
      payProfileId: 'cafe',
      cyclePayWeeks: ['cafe-fortnight'],
    },
    {
      id: 'rent',
      accountId: 'current',
      name: 'Rent',
      direction: 'out',
      amount: pounds('795.00'),
      start: '2026-11-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
      type: 'rent',
    },
    {
      // 10 instalments, April to January: nothing in February or March (brief 8.5).
      id: 'council-tax',
      accountId: 'current',
      name: 'Council tax',
      direction: 'out',
      amount: pounds('118.00'),
      start: '2026-11-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 }, leaveOut: [2, 3] },
      type: 'bills',
    },
    {
      id: 'childcare',
      accountId: 'current',
      name: 'Childcare',
      direction: 'out',
      amount: pounds('95.00'),
      start: '2026-11-02',
      schedule: { kind: 'weekly', every: 1 },
      type: 'bills',
    },
    {
      id: 'energy',
      accountId: 'current',
      name: 'Energy',
      direction: 'out',
      amount: pounds('82.00'),
      start: '2026-11-03',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 3 } },
      type: 'bills',
      isEstimate: true,
    },
    {
      id: 'kids-clubs',
      accountId: 'current',
      name: 'Kids clubs',
      direction: 'out',
      amount: pounds('28.00'),
      start: '2026-11-10',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 10 } },
      type: 'other',
    },
    {
      id: 'phone',
      accountId: 'current',
      name: 'Phone',
      direction: 'out',
      amount: pounds('12.00'),
      start: '2026-11-18',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 18 } },
      type: 'bills',
    },
  ]);
  const changes: PaymentChange[] = [
    // The real amounts, typed in when they arrived (brief 4.3, Part 3 principle 5).
    {
      seriesId: 'universal-credit',
      originalDate: '2026-10-28',
      amount: pounds('812.46'),
      isEstimate: false,
    },
    { seriesId: 'wages', originalDate: '2026-10-30', isEstimate: false },
  ];
  const ticks: Tick[] = [
    paidBefore('universal-credit', '2026-10-28', '2026-10-28T09:00:00Z'),
    paidBefore('wages', '2026-10-30', '2026-10-30T10:00:00Z'),
    paidBefore('rent', '2026-11-01', '2026-11-01T07:00:00Z'),
    paidBefore('council-tax', '2026-11-01', '2026-11-01T07:00:00Z'),
  ];
  const budgets: Budget[] = [
    {
      // Weekly from Monday, because her main pay is monthly (D29).
      id: 'food',
      accountId: 'current',
      name: 'Food',
      amount: pounds('60.00'),
      every: 'week',
      leaves: 'at-start',
      rollOver: false,
      startsOn: '2026-11-02',
      createdAt: '2026-10-30T20:30:00Z',
    },
  ];
  return {
    accounts: [
      // She's chosen a £50 warning level, to be warned well before she's overdrawn.
      { id: 'current', kind: 'current', overdraftLimit: 0, warningLevel: pounds('50.00') },
    ],
    balanceUpdates: [balance('current', '427.40', '2026-11-02', '2026-11-02T08:00:00Z')],
    series,
    changes,
    ticks,
    debts: [],
    budgets,
    spends: [],
    goals: [],
    payProfiles: [deeCafe],
    payWeeks: [deeFortnight],
    payAdjustments: [],
    mainPayFamilyId: 'universal-credit',
    holidays: englandAndWales,
    today: '2026-11-02',
    to: '2027-02-28',
  };
}

/** Kofi's 25% for tax, moved to his Tax account on the day each payment comes in (D64). */
const forTax = { percent: '25', accountId: 'tax' } as const;

/**
 * Kofi, self-employed driver (brief Part 2): irregular money from three
 * platforms, on different days in different amounts, all estimates. Van
 * finance, fuel, and 25% of everything coming in set aside for tax. His plan
 * runs in weeks from Monday to Sunday (D14). Today is Wed 28 Oct 2026.
 */
export function kofiPlan(): WhatIfInput {
  const series = seriesInOrder('2026-10-27T21:00:00Z', [
    {
      // His main pay: the biggest platform, paid on Mondays.
      id: 'rides',
      accountId: 'current',
      name: 'Rides',
      direction: 'in',
      amount: pounds('380.00'),
      start: '2026-11-02',
      schedule: { kind: 'irregular' },
      type: 'pay',
      isEstimate: true,
      setAside: forTax,
    },
    {
      id: 'deliveries',
      accountId: 'current',
      name: 'Deliveries',
      direction: 'in',
      amount: pounds('145.00'),
      start: '2026-10-28',
      schedule: { kind: 'irregular' },
      type: 'pay',
      isEstimate: true,
      setAside: forTax,
    },
    {
      id: 'parcels',
      accountId: 'current',
      name: 'Parcels',
      direction: 'in',
      amount: pounds('90.00'),
      start: '2026-10-30',
      schedule: { kind: 'irregular' },
      type: 'pay',
      isEstimate: true,
      setAside: forTax,
    },
    {
      id: 'rent',
      accountId: 'current',
      name: 'Rent',
      direction: 'out',
      amount: pounds('650.00'),
      start: '2026-11-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
      type: 'rent',
    },
    {
      id: 'van-finance',
      accountId: 'current',
      name: 'Van finance',
      direction: 'out',
      amount: pounds('289.00'),
      start: '2026-11-05',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 5 } },
      end: { kind: 'after', payments: 24 },
      type: 'debt',
      debtId: 'van-finance',
    },
    {
      id: 'van-insurance',
      accountId: 'current',
      name: 'Van insurance',
      direction: 'out',
      amount: pounds('96.00'),
      start: '2026-11-12',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 12 } },
      type: 'bills',
    },
    {
      id: 'phone',
      accountId: 'current',
      name: 'Phone',
      direction: 'out',
      amount: pounds('25.00'),
      start: '2026-11-20',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 20 } },
      type: 'bills',
    },
    {
      // His Self Assessment bill, paid from the money set aside.
      id: 'tax-bill',
      accountId: 'tax',
      name: 'Self Assessment',
      direction: 'out',
      amount: pounds('1450.00'),
      start: '2027-01-29',
      schedule: { kind: 'once' },
      type: 'bills',
      isEstimate: true,
    },
  ]);
  const budgets: Budget[] = [
    {
      // Weekly from Monday, because his main pay is irregular (D14, D108).
      id: 'fuel',
      accountId: 'current',
      name: 'Fuel',
      amount: pounds('70.00'),
      every: 'week',
      leaves: 'at-start',
      rollOver: false,
      startsOn: '2026-11-02',
      createdAt: '2026-10-27T21:30:00Z',
    },
    {
      id: 'food',
      accountId: 'current',
      name: 'Food',
      amount: pounds('45.00'),
      every: 'week',
      leaves: 'at-start',
      rollOver: false,
      startsOn: '2026-11-02',
      createdAt: '2026-10-27T21:31:00Z',
    },
  ];
  const debts: Debt[] = [
    {
      id: 'van-finance',
      name: 'Van finance',
      kind: 'loan',
      currency: 'GBP',
      balance: pounds('6936.00'),
      balanceOn: '2026-10-28',
      balanceAt: '2026-10-28T08:00:00Z',
      startingBalance: pounds('10404.00'),
    },
  ];
  return {
    accounts: [
      { id: 'current', kind: 'current', overdraftLimit: 0, warningLevel: pounds('50.00') },
      { id: 'tax', kind: 'savings', overdraftLimit: 0, warningLevel: 0 },
    ],
    balanceUpdates: [
      balance('current', '640.00', '2026-10-28', '2026-10-28T08:00:00Z'),
      balance('tax', '1180.00', '2026-10-28', '2026-10-28T08:00:00Z'),
    ],
    series,
    changes: [],
    ticks: [],
    debts,
    budgets,
    spends: [],
    goals: [],
    mainPayFamilyId: 'rides',
    holidays: englandAndWales,
    today: '2026-10-28',
    to: '2027-02-28',
  };
}

/**
 * Jess and Tom, a couple (brief Part 2): each paid monthly on a different
 * date, with two personal accounts and a joint bills account, and standing
 * orders from each into it. Jess's £600 goes in on her payday (brief 8.5).
 * Their main pays are their own (ARCHITECTURE.md 3.2): Jess's is used here,
 * and `tomMainPay` is Tom's. Sharing the plan between their phones, with
 * private accounts, comes in Phase 3.
 */
export function jessAndTomPlan(): WhatIfInput {
  const series = seriesInOrder('2026-10-24T18:00:00Z', [
    {
      id: 'jess-pay',
      accountId: 'jess',
      name: 'Jess pay',
      direction: 'in',
      amount: pounds('2100.00'),
      start: '2026-10-28',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } },
      holidayRule: 'working-day-before',
      type: 'pay',
    },
    {
      id: 'tom-pay',
      accountId: 'tom',
      name: 'Tom pay',
      direction: 'in',
      amount: pounds('2350.00'),
      start: '2026-11-15',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 15 } },
      holidayRule: 'working-day-before',
      type: 'pay',
    },
    {
      // Brief 8.5: £600 from Jess's account to the joint account on her payday.
      id: 'jess-to-joint',
      accountId: 'jess',
      toAccountId: 'joint',
      name: 'Jess to joint account',
      direction: 'transfer',
      amount: pounds('600.00'),
      start: '2026-10-28',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } },
      holidayRule: 'working-day-before',
      type: 'bills',
    },
    {
      id: 'tom-to-joint',
      accountId: 'tom',
      toAccountId: 'joint',
      name: 'Tom to joint account',
      direction: 'transfer',
      amount: pounds('950.00'),
      start: '2026-11-15',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 15 } },
      holidayRule: 'working-day-before',
      type: 'bills',
    },
    {
      id: 'rent',
      accountId: 'joint',
      name: 'Rent',
      direction: 'out',
      amount: pounds('950.00'),
      start: '2026-11-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
      type: 'rent',
    },
    {
      id: 'council-tax',
      accountId: 'joint',
      name: 'Council tax',
      direction: 'out',
      amount: pounds('140.00'),
      start: '2026-11-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 }, leaveOut: [2, 3] },
      type: 'bills',
    },
    {
      id: 'energy',
      accountId: 'joint',
      name: 'Energy',
      direction: 'out',
      amount: pounds('110.00'),
      start: '2026-11-05',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 5 } },
      type: 'bills',
      isEstimate: true,
    },
    {
      id: 'broadband',
      accountId: 'joint',
      name: 'Broadband',
      direction: 'out',
      amount: pounds('30.00'),
      start: '2026-11-10',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 10 } },
      type: 'bills',
    },
    {
      id: 'jess-phone',
      accountId: 'jess',
      name: 'Phone',
      direction: 'out',
      amount: pounds('22.00'),
      start: '2026-11-20',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 20 } },
      type: 'bills',
    },
    {
      id: 'jess-gym',
      accountId: 'jess',
      name: 'Gym',
      direction: 'out',
      amount: pounds('30.00'),
      start: '2026-11-03',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 3 } },
      type: 'other',
    },
    {
      id: 'jess-spending',
      accountId: 'jess',
      name: 'Spending money',
      direction: 'out',
      amount: pounds('45.00'),
      start: '2026-10-30',
      schedule: { kind: 'weekly', every: 1 },
      type: 'spending-money',
    },
    {
      id: 'tom-phone',
      accountId: 'tom',
      name: 'Phone',
      direction: 'out',
      amount: pounds('15.00'),
      start: '2026-11-08',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 8 } },
      type: 'bills',
    },
    {
      id: 'tom-car-loan',
      accountId: 'tom',
      name: 'Car loan',
      direction: 'out',
      amount: pounds('180.00'),
      start: '2026-11-18',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 18 } },
      end: { kind: 'after', payments: 12 },
      type: 'debt',
      debtId: 'tom-car-loan',
    },
    {
      id: 'tom-spending',
      accountId: 'tom',
      name: 'Spending money',
      direction: 'out',
      amount: pounds('40.00'),
      start: '2026-10-31',
      schedule: { kind: 'weekly', every: 1 },
      type: 'spending-money',
    },
  ]);
  const budgets: Budget[] = [
    {
      // From the joint account, monthly from Jess's payday (D29).
      id: 'food',
      accountId: 'joint',
      name: 'Food',
      amount: pounds('300.00'),
      every: 'month',
      leaves: 'at-start',
      rollOver: false,
      startsOn: '2026-10-28',
      createdAt: '2026-10-24T18:30:00Z',
    },
  ];
  const debts: Debt[] = [
    {
      // Tom's own debt (D65): private to him once the plan is shared.
      id: 'tom-car-loan',
      name: 'Car loan',
      kind: 'loan',
      currency: 'GBP',
      balance: pounds('2160.00'),
      balanceOn: '2026-10-25',
      balanceAt: '2026-10-25T10:00:00Z',
      startingBalance: pounds('4320.00'),
      belongsTo: 'tom',
    },
  ];
  return {
    accounts: [
      { id: 'jess', kind: 'current', overdraftLimit: 0, warningLevel: pounds('50.00') },
      { id: 'tom', kind: 'current', overdraftLimit: 0, warningLevel: pounds('50.00') },
      { id: 'joint', kind: 'joint', overdraftLimit: 0, warningLevel: pounds('100.00') },
    ],
    balanceUpdates: [
      balance('jess', '410.00', '2026-10-25', '2026-10-25T10:00:00Z'),
      balance('tom', '520.00', '2026-10-25', '2026-10-25T10:00:00Z'),
      balance('joint', '1050.00', '2026-10-25', '2026-10-25T10:00:00Z'),
    ],
    series,
    changes: [],
    ticks: [],
    debts,
    budgets,
    spends: [],
    goals: [],
    mainPayFamilyId: 'jess-pay',
    holidays: englandAndWales,
    today: '2026-10-25',
    to: '2027-02-28',
  };
}

/** Tom's main pay, for his own view of the shared plan (ARCHITECTURE.md 3.2). */
export const tomMainPay = 'tom-pay';

/**
 * Ali, student (brief Part 2): a student loan in three termly payments
 * (September, January, April) and a weekly part-time job. Rent each term, a
 * phone contract, and a 0% overdraft of £1,000, so the floor is −£1,000, not
 * £0. His main pay is the student loan, so his plan runs term by term and
 * Left to spend lasts until the next one (D14). Today is Mon 2 Nov 2026, and
 * he's £300 into his overdraft.
 */
export function aliPlan(): WhatIfInput {
  const series = seriesInOrder('2026-09-20T12:00:00Z', [
    {
      id: 'student-loan',
      accountId: 'current',
      name: 'Student loan',
      direction: 'in',
      amount: pounds('1610.00'),
      lastAmount: pounds('1690.00'),
      start: '2026-09-21',
      schedule: { kind: 'dates', dates: ['2026-09-21', '2027-01-11', '2027-04-26'] },
      type: 'other',
    },
    {
      id: 'rent',
      accountId: 'current',
      name: 'Rent',
      direction: 'out',
      amount: pounds('1480.00'),
      start: '2026-09-25',
      schedule: { kind: 'dates', dates: ['2026-09-25', '2027-01-15', '2027-04-30'] },
      type: 'rent',
    },
    {
      // 8 hours a week at £12.71, an estimate until each payday lands.
      id: 'job',
      accountId: 'current',
      name: 'Shop job',
      direction: 'in',
      amount: pounds('101.68'),
      start: '2026-11-06',
      schedule: { kind: 'weekly', every: 1 },
      holidayRule: 'working-day-before',
      type: 'pay',
      isEstimate: true,
    },
    {
      id: 'phone',
      accountId: 'current',
      name: 'Phone contract',
      direction: 'out',
      amount: pounds('14.00'),
      start: '2026-11-09',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 9 } },
      type: 'bills',
    },
    {
      id: 'bus-pass',
      accountId: 'current',
      name: 'Bus pass',
      direction: 'out',
      amount: pounds('30.00'),
      start: '2026-12-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
      type: 'other',
    },
    {
      id: 'books',
      accountId: 'current',
      name: 'Books',
      direction: 'out',
      amount: pounds('45.00'),
      start: '2026-11-20',
      schedule: { kind: 'once' },
      type: 'other',
    },
  ]);
  const budgets: Budget[] = [
    {
      // Weekly from Monday, because his main pay comes on chosen dates (D108).
      id: 'food',
      accountId: 'current',
      name: 'Food',
      amount: pounds('35.00'),
      every: 'week',
      leaves: 'at-start',
      rollOver: false,
      startsOn: '2026-11-02',
      createdAt: '2026-11-01T12:00:00Z',
    },
  ];
  return {
    accounts: [
      // Brief 8.5: a £1,000 overdraft. He's chosen to be warned once he's in it.
      { id: 'current', kind: 'current', overdraftLimit: pounds('1000.00'), warningLevel: 0 },
    ],
    balanceUpdates: [balance('current', '-300.00', '2026-11-02', '2026-11-02T09:00:00Z')],
    series,
    changes: [],
    ticks: [
      paidBefore('student-loan', '2026-09-21', '2026-09-21T08:00:00Z'),
      paidBefore('rent', '2026-09-25', '2026-09-25T08:00:00Z'),
    ],
    debts: [],
    budgets,
    spends: [],
    goals: [],
    mainPayFamilyId: 'student-loan',
    holidays: englandAndWales,
    today: '2026-11-02',
    to: '2027-05-31',
  };
}

/** Every one of the six people's plans but Sam's, by name. */
export const otherPeople = {
  Priya: priyaPlan,
  Dee: deePlan,
  Kofi: kofiPlan,
  'Jess and Tom': jessAndTomPlan,
  Ali: aliPlan,
} as const;
