// Sam's plan from brief Part 8, with the example names from D15. Today is
// Sun 25 Oct 2026, nothing is ticked, the view runs to the end of February
// 2027, and every payment keeps its date (no weekend or bank holiday moves).
//
// Step 1a used the payments. Step 1b adds the accounts, balances, payment
// types (D79), families and main pay. Step 1d adds the debts (brief 8.1) and
// links each debt payment to its debt (brief 8.2). Budgets and the rest come
// in later steps.

import type {
  Account,
  BalanceUpdate,
  Debt,
  DebtsInput,
  PaymentChange,
  PlanInput,
  Series,
} from '../../src/index.ts';
import { parsePounds as pounds } from '../../src/index.ts';
import { englandAndWales } from './holidays.ts';

export const samToday = '2026-10-25';
export const samViewEnd = '2027-02-28';

/** Brief 8.1. The brief gives the savings account no warning level, so it has none (£0). */
export const samAccounts: readonly Account[] = [
  { id: 'current', kind: 'current', overdraftLimit: 0, warningLevel: pounds('20.00') },
  { id: 'savings', kind: 'savings', overdraftLimit: 0, warningLevel: 0 },
];

/** Both balances were typed in on Sun 25 Oct 2026, before any payment was added (brief 8.1). */
export const samBalanceUpdates: readonly BalanceUpdate[] = [
  {
    id: 'current-25-oct',
    accountId: 'current',
    balance: pounds('267.54'),
    checkedOn: '2026-10-25',
    checkedAt: '2026-10-25T08:30:00Z',
  },
  {
    id: 'savings-25-oct',
    accountId: 'savings',
    balance: pounds('500.00'),
    checkedOn: '2026-10-25',
    checkedAt: '2026-10-25T08:30:00Z',
  },
];

const base = {
  accountId: 'current',
  holidayRule: 'keep',
  isEstimate: false,
  end: { kind: 'never' },
} as const satisfies Partial<Series>;

type SeriesWithoutFamily = Omit<Series, 'familyId' | 'familyCreatedAt'>;

const samSeriesWithoutFamilies: readonly SeriesWithoutFamily[] = [
  {
    ...base,
    id: 'spending-until-payday',
    type: 'spending-money',
    name: 'Spending money until payday',
    direction: 'out',
    amount: pounds('30.00'),
    start: '2026-10-25',
    schedule: { kind: 'once' },
  },
  {
    ...base,
    id: 'family-loan-first',
    debtId: 'family-loan',
    type: 'debt',
    name: 'Family loan',
    direction: 'out',
    amount: pounds('125.00'),
    start: '2026-10-26',
    schedule: { kind: 'dates', dates: ['2026-10-26', '2026-11-06'] },
  },
  {
    ...base,
    id: 'driving-lessons',
    type: 'other',
    name: 'Driving lesson',
    direction: 'out',
    amount: pounds('100.00'),
    start: '2026-10-26',
    schedule: {
      kind: 'dates',
      dates: ['2026-10-26', '2026-11-17', '2026-11-23', '2026-12-15', '2027-01-12'],
    },
  },
  {
    ...base,
    id: 'from-savings',
    type: 'savings',
    accountId: 'savings',
    toAccountId: 'current',
    name: 'From savings',
    direction: 'transfer',
    amount: pounds('500.00'),
    start: '2026-10-28',
    schedule: { kind: 'once' },
  },
  {
    // Linked to the Pay-later card. Its monthly food bill isn't (brief 8.2).
    ...base,
    id: 'pay-later-card-in-full',
    debtId: 'pay-later-card',
    type: 'debt',
    name: 'Pay-later card',
    direction: 'out',
    amount: pounds('466.07'),
    start: '2026-10-29',
    schedule: { kind: 'once' },
  },
  {
    ...base,
    id: 'pay',
    type: 'pay',
    name: 'Pay',
    direction: 'in',
    amount: pounds('452.17'),
    amountCycle: [pounds('452.17'), pounds('618.46'), pounds('469.06'), pounds('592.17')],
    cycleOffset: 0,
    start: '2026-10-30',
    schedule: { kind: 'weekly', every: 1 },
    isEstimate: true,
  },
  {
    ...base,
    id: 'spending-money',
    type: 'spending-money',
    name: 'Spending money',
    direction: 'out',
    amount: pounds('54.00'),
    start: '2026-10-30',
    schedule: { kind: 'weekly', every: 1 },
  },
  {
    ...base,
    id: 'rent',
    type: 'rent',
    name: 'Rent',
    direction: 'out',
    amount: pounds('550.00'),
    start: '2026-11-01',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
  },
  {
    ...base,
    id: 'pay-in-3-165',
    debtId: 'pay-in-3',
    type: 'debt',
    name: 'Pay in 3 (£165.20 order)',
    direction: 'out',
    amount: pounds('41.30'),
    start: '2026-11-07',
    schedule: { kind: 'weekly', every: 2 },
    end: { kind: 'after', payments: 3 },
  },
  {
    ...base,
    id: 'pay-in-3-79',
    debtId: 'pay-in-3',
    type: 'debt',
    name: 'Pay in 3 (£79.99 order)',
    direction: 'out',
    amount: pounds('20.00'),
    lastAmount: pounds('19.99'),
    start: '2026-11-08',
    schedule: { kind: 'weekly', every: 2 },
    end: { kind: 'after', payments: 3 },
  },
  {
    ...base,
    id: 'laptop-loan-first',
    debtId: 'laptop-loan',
    type: 'debt',
    name: 'Laptop loan',
    direction: 'out',
    amount: pounds('150.00'),
    start: '2026-11-10',
    schedule: { kind: 'once' },
  },
  {
    ...base,
    id: 'sofa-finance-first',
    debtId: 'sofa-finance',
    type: 'debt',
    name: 'Sofa finance',
    direction: 'out',
    amount: pounds('77.00'),
    start: '2026-11-10',
    schedule: { kind: 'once' },
  },
  {
    ...base,
    id: 'to-savings',
    type: 'savings',
    toAccountId: 'savings',
    name: 'To savings',
    direction: 'transfer',
    amount: pounds('150.00'),
    start: '2026-11-13',
    schedule: { kind: 'once' },
  },
  {
    ...base,
    id: 'credit-card',
    debtId: 'credit-card',
    type: 'debt',
    name: 'Credit card',
    direction: 'out',
    amount: pounds('25.00'),
    start: '2026-11-15',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 15 } },
    isEstimate: true,
  },
  {
    ...base,
    id: 'family-loan',
    debtId: 'family-loan',
    type: 'debt',
    name: 'Family loan',
    direction: 'out',
    amount: pounds('250.00'),
    lastAmount: pounds('206.15'),
    start: '2026-11-20',
    schedule: { kind: 'weekly', every: 2 },
    end: { kind: 'after', payments: 4 },
  },
  {
    ...base,
    id: 'sofa-finance',
    debtId: 'sofa-finance',
    type: 'debt',
    name: 'Sofa finance',
    direction: 'out',
    amount: pounds('37.88'),
    lastAmount: pounds('35.85'),
    start: '2026-11-23',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 23 } },
    end: { kind: 'after', payments: 10 },
  },
  {
    ...base,
    id: 'pay-later-card-food',
    // A monthly bill for food already bought on the card, so Bills, not
    // Spending money: it doesn't count towards Left to spend (D61).
    type: 'bills',
    name: 'Pay-later card (food)',
    direction: 'out',
    amount: pounds('200.00'),
    start: '2026-11-29',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 29 } },
  },
  {
    ...base,
    id: 'back-from-savings',
    type: 'savings',
    accountId: 'savings',
    toAccountId: 'current',
    name: 'From savings',
    direction: 'transfer',
    amount: pounds('150.00'),
    start: '2026-11-30',
    schedule: { kind: 'once' },
  },
  {
    ...base,
    id: 'christmas-bonus',
    type: 'pay',
    name: 'Christmas bonus',
    direction: 'in',
    amount: 0,
    start: '2026-12-18',
    schedule: { kind: 'once' },
    isEstimate: true,
  },
  {
    ...base,
    id: 'laptop-loan',
    debtId: 'laptop-loan',
    type: 'debt',
    name: 'Laptop loan',
    direction: 'out',
    amount: pounds('150.00'),
    lastAmount: pounds('34.00'),
    start: '2026-12-20',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 20 } },
    end: { kind: 'after', payments: 3 },
  },
  {
    ...base,
    id: 'driving-test',
    type: 'other',
    name: 'Driving test',
    direction: 'out',
    amount: 0,
    start: '2027-01-26',
    schedule: { kind: 'once' },
  },
];

/**
 * The order the series were made in: the order of the brief 8.2 table. Where
 * one row of the table became two series (Laptop loan, Sofa finance and the
 * £150 to savings and back), they are next to each other, first then second.
 * So on Mon 26 Oct, Family loan goes before Driving lesson (D8, D12).
 */
const tableOrder = [
  'spending-until-payday',
  'family-loan-first',
  'driving-lessons',
  'from-savings',
  'pay-later-card-in-full',
  'pay',
  'spending-money',
  'rent',
  'pay-in-3-165',
  'pay-in-3-79',
  'laptop-loan-first',
  'laptop-loan',
  'sofa-finance-first',
  'sofa-finance',
  'to-savings',
  'back-from-savings',
  'credit-card',
  'family-loan',
  'pay-later-card-food',
  'christmas-bonus',
  'driving-test',
] as const;

/** One minute apart, from 08:31 UTC on Sun 25 Oct 2026, in table order. Each series is its own family. */
function createdAt(id: string): string {
  const position = tableOrder.indexOf(id as (typeof tableOrder)[number]);
  if (position < 0) {
    throw new Error(`Series ${id} is missing from the table order.`);
  }
  return `2026-10-25T08:${(31 + position).toString().padStart(2, '0')}:00Z`;
}

export const samSeries: readonly Series[] = samSeriesWithoutFamilies.map((one) => ({
  ...one,
  familyId: one.id,
  familyCreatedAt: createdAt(one.id),
}));

/** Sam's main pay is his weekly pay (D14). */
export const samMainPay = 'pay';

/** The first pay (overtime), the first spending money and the first rent are one-off changes. */
export const samChanges: readonly PaymentChange[] = [
  { seriesId: 'pay', originalDate: '2026-10-30', amount: pounds('603.06') },
  { seriesId: 'spending-money', originalDate: '2026-10-30', amount: pounds('45.00') },
  { seriesId: 'rent', originalDate: '2026-11-01', amount: pounds('600.00') },
];

/** Sam's whole plan, ready for workOutPlan. Any part can be swapped for a test. */
export function samPlan(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    accounts: samAccounts,
    balanceUpdates: samBalanceUpdates,
    series: samSeries,
    changes: samChanges,
    ticks: [],
    mainPayFamilyId: samMainPay,
    holidays: englandAndWales,
    today: samToday,
    to: samViewEnd,
    ...overrides,
  };
}

/**
 * Sam's debts on Sun 25 Oct 2026 (brief 8.1), with the D15 names. Each was
 * typed in with the balances, before any payment was added. Every starting
 * balance is the balance typed in, except the Family loan, which started at
 * €2,396.93. The Credit card has no interest in this test (brief 8.1).
 */
export const samDebts: readonly Debt[] = [
  {
    id: 'pay-later-card',
    name: 'Pay-later card',
    kind: 'pay-later',
    currency: 'GBP',
    balance: pounds('466.07'),
    balanceOn: '2026-10-25',
    balanceAt: '2026-10-25T08:30:00Z',
    startingBalance: pounds('466.07'),
  },
  {
    id: 'pay-in-3',
    name: 'Pay in 3',
    kind: 'pay-later',
    currency: 'GBP',
    balance: pounds('183.89'),
    balanceOn: '2026-10-25',
    balanceAt: '2026-10-25T08:30:00Z',
    startingBalance: pounds('183.89'),
  },
  {
    id: 'laptop-loan',
    name: 'Laptop loan',
    kind: 'loan',
    currency: 'GBP',
    balance: pounds('484.00'),
    balanceOn: '2026-10-25',
    balanceAt: '2026-10-25T08:30:00Z',
    startingBalance: pounds('484.00'),
  },
  {
    id: 'sofa-finance',
    name: 'Sofa finance',
    kind: 'pay-later',
    currency: 'GBP',
    balance: pounds('453.77'),
    balanceOn: '2026-10-25',
    balanceAt: '2026-10-25T08:30:00Z',
    startingBalance: pounds('453.77'),
  },
  {
    id: 'credit-card',
    name: 'Credit card',
    kind: 'credit-card',
    currency: 'GBP',
    balance: pounds('420.99'),
    balanceOn: '2026-10-25',
    balanceAt: '2026-10-25T08:30:00Z',
    startingBalance: pounds('420.99'),
  },
  {
    // Euro cents work like pence: €1,400.57 is 140057.
    id: 'family-loan',
    name: 'Family loan',
    kind: 'owed-to-a-person',
    currency: 'EUR',
    rate: '1.1612',
    balance: pounds('1400.57'),
    balanceOn: '2026-10-25',
    balanceAt: '2026-10-25T08:30:00Z',
    startingBalance: pounds('2396.93'),
  },
];

/** Sam's debts with his whole plan, ready for workOutDebts. Any part can be swapped for a test. */
export function samDebtsInput(overrides: Partial<DebtsInput> = {}): DebtsInput {
  return {
    debts: samDebts,
    series: samSeries,
    changes: samChanges,
    ticks: [],
    holidays: englandAndWales,
    today: samToday,
    to: samViewEnd,
    ...overrides,
  };
}
