// Test plans for Home's "Free, confidential help is available." card (step
// 4g, D584, D585, D592), shared by the unit tests and the end-to-end tests.
//
// Like Dee's (brief Part 2): Universal Credit on the 28th, moved to the
// working day before, as her main pay, so her pay periods run Fri 27 Nov
// to Wed 23 Dec, Thu 24 Dec to Wed 27 Jan, and Thu 28 Jan to Thu 25 Feb.
// Her rent goes out on the 29th. On Wed 18 Nov 2026, with £120.00 in the
// bank, she's short on Sun 29 Nov, Tue 29 Dec and Fri 29 Jan: the owner's
// example (PLAN.md question 9).
//
//   Fri 27 Nov  £120.00 + £800.00 = £920.00
//   Sun 29 Nov  £920.00 − £950.00 = −£30.00    short
//   Thu 24 Dec  −£30.00 + £800.00 = £770.00
//   Tue 29 Dec  £770.00 − £950.00 = −£180.00   short
//   Thu 28 Jan  −£180.00 + £800.00 = £620.00
//   Fri 29 Jan  £620.00 − £950.00 = −£330.00   short

import { type PlanRecords, parsePounds as pounds, type Series } from '@prepenny/engine';

/** The day the tests open Home on: Wed 18 Nov 2026, in the pay period from Wed 28 Oct. */
export const TIGHT_TODAY = '2026-11-18';

const base = {
  accountId: 'current',
  holidayRule: 'keep',
  isEstimate: false,
  end: { kind: 'never' },
} as const satisfies Partial<Series>;

const universalCredit: Series = {
  ...base,
  id: 'universal-credit',
  familyId: 'universal-credit',
  familyCreatedAt: '2026-11-01T09:00:00Z',
  name: 'Universal Credit',
  direction: 'in',
  type: 'benefits',
  amount: pounds('800.00'),
  start: '2026-10-28',
  schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } },
  holidayRule: 'working-day-before',
  isEstimate: true,
};

const rent: Series = {
  ...base,
  id: 'rent',
  familyId: 'rent',
  familyCreatedAt: '2026-11-01T09:01:00Z',
  name: 'Rent',
  direction: 'out',
  type: 'rent',
  amount: pounds('950.00'),
  start: '2026-11-29',
  schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 29 } },
};

/** Dee: short in each of the next three pay periods, on Sun 29 Nov, Tue 29 Dec and Fri 29 Jan, though not now. */
export const shortThreeRunning: PlanRecords = {
  accounts: [
    {
      id: 'current',
      name: 'Current account',
      kind: 'current',
      overdraftLimit: 0,
      warningLevel: pounds('50.00'),
    },
  ],
  balanceUpdates: [
    {
      id: 'current-18-nov',
      accountId: 'current',
      balance: pounds('120.00'),
      checkedOn: TIGHT_TODAY,
      checkedAt: '2026-11-18T08:00:00Z',
    },
  ],
  series: [universalCredit, rent],
  changes: [],
  // October's Universal Credit came in before the bank was checked.
  ticks: [
    {
      seriesId: 'universal-credit',
      originalDate: '2026-10-28',
      tickedAt: '2026-10-28T09:00:00Z',
      paidOn: '2026-10-28',
    },
  ],
  debts: [],
  budgets: [],
  spends: [],
  goals: [],
  payProfiles: [],
  payWeeks: [],
  payAdjustments: [],
  settings: { nation: 'england-and-wales', mainPayFamilyId: 'universal-credit' },
};

/**
 * Short in only two pay periods running: £500.00 of back pay on Thu 28 Jan
 * means she isn't short on Fri 29 Jan (£620.00 + £500.00 − £950.00 =
 * £170.00), and she isn't short now, before Fri 27 Nov.
 */
export const shortTwoOfThree: PlanRecords = {
  ...shortThreeRunning,
  series: [
    ...shortThreeRunning.series,
    {
      ...base,
      id: 'back-pay',
      familyId: 'back-pay',
      familyCreatedAt: '2026-11-01T09:02:00Z',
      name: 'Back pay',
      direction: 'in',
      type: 'benefits',
      amount: pounds('500.00'),
      start: '2027-01-28',
      schedule: { kind: 'once' },
    },
  ],
};

/**
 * Jo, from the owner's example for D592: paid £1,000.00 on the 25th, so on
 * Wed 18 Nov 2026 Jo is in the pay period from Sun 25 Oct, and the next
 * ones run from Wed 25 Nov, Fri 25 Dec and Mon 25 Jan. Rent of £1,000.00
 * goes out on the 1st. With £150.00 in the bank and a £200.00 car repair on
 * Fri 20 Nov, Jo is short now and in the pay periods up to the 25 Dec and
 * 25 Jan paydays, but not in February's, as a £200.00 tax refund comes with
 * the pay on Mon 25 Jan:
 *
 *   Fri 20 Nov  £150.00 − £200.00 = −£50.00                   short
 *   Wed 25 Nov  −£50.00 + £1,000.00 = £950.00
 *   Tue 1 Dec   £950.00 − £1,000.00 = −£50.00                 short
 *   Fri 25 Dec  −£50.00 + £1,000.00 = £950.00
 *   Fri 1 Jan   £950.00 − £1,000.00 = −£50.00                 short
 *   Mon 25 Jan  −£50.00 + £1,000.00 + £200.00 = £1,150.00
 *   Mon 1 Feb   £1,150.00 − £1,000.00 = £150.00, and so to Wed 24 Feb
 *
 * Three in a row from the pay period we're in now, so the card shows;
 * counting only from the next payday, it wouldn't (D585's first reading).
 */
export const joShortFromNow: PlanRecords = {
  ...shortThreeRunning,
  balanceUpdates: [
    {
      id: 'jo-18-nov',
      accountId: 'current',
      balance: pounds('150.00'),
      checkedOn: TIGHT_TODAY,
      checkedAt: '2026-11-18T08:00:00Z',
    },
  ],
  series: [
    {
      ...base,
      id: 'jo-pay',
      familyId: 'jo-pay',
      familyCreatedAt: '2026-11-01T09:00:00Z',
      name: 'Pay',
      direction: 'in',
      type: 'pay',
      amount: pounds('1000.00'),
      start: '2026-10-25',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 25 } },
    },
    {
      ...base,
      id: 'jo-rent',
      familyId: 'jo-rent',
      familyCreatedAt: '2026-11-01T09:01:00Z',
      name: 'Rent',
      direction: 'out',
      type: 'rent',
      amount: pounds('1000.00'),
      start: '2026-12-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
    },
    {
      ...base,
      id: 'car-repair',
      familyId: 'car-repair',
      familyCreatedAt: '2026-11-01T09:02:00Z',
      name: 'Car repair',
      direction: 'out',
      type: 'other',
      amount: pounds('200.00'),
      start: '2026-11-20',
      schedule: { kind: 'once' },
    },
    {
      ...base,
      id: 'tax-refund',
      familyId: 'tax-refund',
      familyCreatedAt: '2026-11-01T09:03:00Z',
      name: 'Tax refund',
      direction: 'in',
      type: 'other',
      amount: pounds('200.00'),
      start: '2027-01-25',
      schedule: { kind: 'once' },
    },
  ],
  // October's pay came in before the bank was checked.
  ticks: [
    {
      seriesId: 'jo-pay',
      originalDate: '2026-10-25',
      tickedAt: '2026-10-25T09:00:00Z',
      paidOn: '2026-10-25',
    },
  ],
  settings: { nation: 'england-and-wales', mainPayFamilyId: 'jo-pay' },
};
