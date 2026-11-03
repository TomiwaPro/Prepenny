// Sam's example plan (brief Part 8, D15): every number and date from brief
// 8.1 and 8.2, with the brand names changed. Today is always Sun 25 Oct 2026
// (D133), nothing is ticked, and every payment keeps its date. Sam's pay
// profile and pay weeks come from his payslips in brief 8.6, so "I did
// overtime" works on it from step 2d (D165).
//
// test/unit/example-plan.test.ts proves these are exactly the records of the
// engine's tested fixture (packages/engine/test/fixtures/sam.ts and pay.ts),
// so the example and the brief's tests are the same plan.
//
// The names here are text people read, so scripts/check-voice.ts checks them too.

import {
  type Debt,
  type PayProfile,
  type PayWeek,
  type PlanRecords,
  parsePounds as pounds,
  type Series,
} from '@prepenny/engine';

/** The example plan's id in the phone's database. */
export const EXAMPLE_PLAN_ID = 'example';

const base = {
  accountId: 'current',
  holidayRule: 'keep',
  isEstimate: false,
  end: { kind: 'never' },
} as const satisfies Partial<Series>;

type SeriesWithoutFamily = Omit<Series, 'familyId' | 'familyCreatedAt'>;

/** In the order they were made: the order of the brief 8.2 table (D8, D12). */
const series: readonly SeriesWithoutFamily[] = [
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
    payProfileId: 'warehouse',
    cyclePayWeeks: ['week-26', 'week-27', 'week-28', 'week-27'],
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
    // Food already bought on the card, so Bills, not Spending money (D61, D79).
    ...base,
    id: 'pay-later-card-food',
    type: 'bills',
    name: 'Pay-later card (food)',
    direction: 'out',
    amount: pounds('200.00'),
    start: '2026-11-29',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 29 } },
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
    id: 'driving-test',
    type: 'other',
    name: 'Driving test',
    direction: 'out',
    amount: 0,
    start: '2027-01-26',
    schedule: { kind: 'once' },
  },
];

/** Each series is its own family, made one minute apart from 08:31 UTC on Sun 25 Oct 2026. */
const exampleSeries: readonly Series[] = series.map((one, position) => ({
  ...one,
  familyId: one.id,
  familyCreatedAt: `2026-10-25T08:${(31 + position).toString().padStart(2, '0')}:00Z`,
}));

/** Brief 8.1, with the D15 names. The Credit card has no interest (brief 8.1). */
const debts: readonly Debt[] = [
  { id: 'pay-later-card', name: 'Pay-later card', kind: 'pay-later', amount: '466.07' },
  { id: 'pay-in-3', name: 'Pay in 3', kind: 'pay-later', amount: '183.89' },
  { id: 'laptop-loan', name: 'Laptop loan', kind: 'loan', amount: '484.00' },
  { id: 'sofa-finance', name: 'Sofa finance', kind: 'pay-later', amount: '453.77' },
  { id: 'credit-card', name: 'Credit card', kind: 'credit-card', amount: '420.99' },
].map(
  ({ id, name, kind, amount }): Debt => ({
    id,
    name,
    kind: kind as Debt['kind'],
    currency: 'GBP',
    balance: pounds(amount),
    balanceOn: '2026-10-25',
    balanceAt: '2026-10-25T08:30:00Z',
    startingBalance: pounds(amount),
  }),
);

/** Euro cents work like pence: €1,400.57 is 140057. It started at €2,396.93. */
const familyLoan: Debt = {
  id: 'family-loan',
  name: 'Family loan',
  kind: 'owed-to-a-person',
  currency: 'EUR',
  rate: '1.1612',
  balance: pounds('1400.57'),
  balanceOn: '2026-10-25',
  balanceAt: '2026-10-25T08:30:00Z',
  startingBalance: pounds('2396.93'),
};

/** Brief 8.6: 1257L on the cumulative basis, weekly, 4% pension on £120 to £967 before tax. */
const payProfile: PayProfile = {
  id: 'warehouse',
  name: 'Warehouse job',
  frequency: 'weekly',
  taxCode: '1257L',
  basis: 'cumulative',
  pension: { percent: '4', lower: pounds('120.00'), upper: pounds('967.00'), when: 'before-tax' },
  soFar: {
    taxYear: '2026-27',
    period: 29,
    grossForTax: pounds('10732.73'),
    taxPaid: pounds('743.40'),
  },
  overtimeRate: '19.07',
  coveredTo: { kind: 'days-before', days: 5 },
};

const basic = (hours: string) => ({ name: 'Basic', kind: 'basic', hours, rate: '12.71' }) as const;
const premium = (amount: string) => [{ name: 'Shift premium', amount: pounds(amount) }];

/** The pay lines of the payslips in brief 8.6, as saved pay weeks (D5). */
const payWeeks: readonly PayWeek[] = [
  {
    id: 'week-26',
    name: '3-shift week',
    payProfileId: 'warehouse',
    lines: [basic('34.5')],
    fixed: premium('114.69'),
  },
  {
    id: 'week-27',
    name: '4-shift week',
    payProfileId: 'warehouse',
    lines: [basic('46')],
    fixed: premium('210.23'),
  },
  {
    id: 'week-28',
    name: 'Short 3-shift week',
    payProfileId: 'warehouse',
    lines: [basic('34.25')],
    fixed: premium('142.29'),
  },
];

/** Sam's example plan, as the phone stores it. */
export const examplePlan: PlanRecords = {
  accounts: [
    {
      id: 'current',
      name: 'Current account',
      kind: 'current',
      overdraftLimit: 0,
      warningLevel: pounds('20.00'),
    },
    { id: 'savings', name: 'Savings', kind: 'savings', overdraftLimit: 0, warningLevel: 0 },
  ],
  balanceUpdates: [
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
  ],
  series: exampleSeries,
  changes: [
    { seriesId: 'pay', originalDate: '2026-10-30', amount: pounds('603.06') },
    { seriesId: 'spending-money', originalDate: '2026-10-30', amount: pounds('45.00') },
    { seriesId: 'rent', originalDate: '2026-11-01', amount: pounds('600.00') },
  ],
  ticks: [],
  debts: [...debts, familyLoan],
  budgets: [],
  spends: [],
  goals: [],
  payProfiles: [payProfile],
  payWeeks,
  payAdjustments: [],
  settings: { nation: 'england-and-wales', mainPayFamilyId: 'pay' },
};

/** A short fingerprint of some records: any change to them changes it. */
export function fingerprint(records: PlanRecords): string {
  // FNV-1a over the records as text. Not for security: only to notice a change.
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(records)) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The example's version: a fingerprint of its records, so whenever they
 * change, every phone replaces its copy the next time the app opens.
 */
export const EXAMPLE_VERSION = fingerprint(examplePlan);
