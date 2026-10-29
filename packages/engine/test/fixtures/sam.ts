// Sam's plan from brief Part 8, with the example names from D15. Today is
// Sun 25 Oct 2026, nothing is ticked, the view runs to the end of February
// 2027, and every payment keeps its date (no weekend or bank holiday moves).
//
// Step 1a uses the payments only. Balances (1b), debts (1d) and the rest come
// in later steps. Debt links from brief 8.2 are noted on each series.

import type { PaymentChange, Series } from '../../src/index.ts';
import { parsePounds as pounds } from '../../src/index.ts';

export const samToday = '2026-10-25';
export const samViewEnd = '2027-02-28';

const base = {
  accountId: 'current',
  holidayRule: 'keep',
  isEstimate: false,
  end: { kind: 'never' },
} as const satisfies Partial<Series>;

export const samSeries: readonly Series[] = [
  {
    ...base,
    id: 'spending-until-payday',
    name: 'Spending money until payday',
    direction: 'out',
    amount: pounds('30.00'),
    start: '2026-10-25',
    schedule: { kind: 'once' },
  },
  {
    // Linked to the Family loan.
    ...base,
    id: 'family-loan-first',
    name: 'Family loan',
    direction: 'out',
    amount: pounds('125.00'),
    start: '2026-10-26',
    schedule: { kind: 'dates', dates: ['2026-10-26', '2026-11-06'] },
  },
  {
    ...base,
    id: 'driving-lessons',
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
    accountId: 'savings',
    toAccountId: 'current',
    name: 'From savings',
    direction: 'transfer',
    amount: pounds('500.00'),
    start: '2026-10-28',
    schedule: { kind: 'once' },
  },
  {
    // Linked to the Pay-later card (29 Oct only).
    ...base,
    id: 'pay-later-card-in-full',
    name: 'Pay-later card',
    direction: 'out',
    amount: pounds('466.07'),
    start: '2026-10-29',
    schedule: { kind: 'once' },
  },
  {
    ...base,
    id: 'pay',
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
    name: 'Spending money',
    direction: 'out',
    amount: pounds('54.00'),
    start: '2026-10-30',
    schedule: { kind: 'weekly', every: 1 },
  },
  {
    ...base,
    id: 'rent',
    name: 'Rent',
    direction: 'out',
    amount: pounds('550.00'),
    start: '2026-11-01',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
  },
  {
    // Linked to Pay in 3.
    ...base,
    id: 'pay-in-3-165',
    name: 'Pay in 3 (£165.20 order)',
    direction: 'out',
    amount: pounds('41.30'),
    start: '2026-11-07',
    schedule: { kind: 'weekly', every: 2 },
    end: { kind: 'after', payments: 3 },
  },
  {
    // Linked to Pay in 3.
    ...base,
    id: 'pay-in-3-79',
    name: 'Pay in 3 (£79.99 order)',
    direction: 'out',
    amount: pounds('20.00'),
    lastAmount: pounds('19.99'),
    start: '2026-11-08',
    schedule: { kind: 'weekly', every: 2 },
    end: { kind: 'after', payments: 3 },
  },
  {
    // Linked to the Laptop loan.
    ...base,
    id: 'laptop-loan-first',
    name: 'Laptop loan',
    direction: 'out',
    amount: pounds('150.00'),
    start: '2026-11-10',
    schedule: { kind: 'once' },
  },
  {
    // Linked to Sofa finance.
    ...base,
    id: 'sofa-finance-first',
    name: 'Sofa finance',
    direction: 'out',
    amount: pounds('77.00'),
    start: '2026-11-10',
    schedule: { kind: 'once' },
  },
  {
    ...base,
    id: 'to-savings',
    toAccountId: 'savings',
    name: 'To savings',
    direction: 'transfer',
    amount: pounds('150.00'),
    start: '2026-11-13',
    schedule: { kind: 'once' },
  },
  {
    // Linked to the Credit card.
    ...base,
    id: 'credit-card',
    name: 'Credit card',
    direction: 'out',
    amount: pounds('25.00'),
    start: '2026-11-15',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 15 } },
    isEstimate: true,
  },
  {
    // Linked to the Family loan.
    ...base,
    id: 'family-loan',
    name: 'Family loan',
    direction: 'out',
    amount: pounds('250.00'),
    lastAmount: pounds('206.15'),
    start: '2026-11-20',
    schedule: { kind: 'weekly', every: 2 },
    end: { kind: 'after', payments: 4 },
  },
  {
    // Linked to Sofa finance.
    ...base,
    id: 'sofa-finance',
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
    name: 'Pay-later card (food)',
    direction: 'out',
    amount: pounds('200.00'),
    start: '2026-11-29',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 29 } },
  },
  {
    ...base,
    id: 'back-from-savings',
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
    name: 'Christmas bonus',
    direction: 'in',
    amount: 0,
    start: '2026-12-18',
    schedule: { kind: 'once' },
    isEstimate: true,
  },
  {
    // Linked to the Laptop loan.
    ...base,
    id: 'laptop-loan',
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
    name: 'Driving test',
    direction: 'out',
    amount: 0,
    start: '2027-01-26',
    schedule: { kind: 'once' },
  },
];

/** The first pay (overtime), the first spending money and the first rent are one-off changes. */
export const samChanges: readonly PaymentChange[] = [
  { seriesId: 'pay', originalDate: '2026-10-30', amount: pounds('603.06') },
  { seriesId: 'spending-money', originalDate: '2026-10-30', amount: pounds('45.00') },
  { seriesId: 'rent', originalDate: '2026-11-01', amount: pounds('600.00') },
];
