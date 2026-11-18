// Test plans for Home's "Free, confidential help is available." card (step
// 4g, D584, D585), shared by the unit tests and the end-to-end tests.
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

/** Short in each of the next three pay periods: on Sun 29 Nov, Tue 29 Dec and Fri 29 Jan. */
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
 * Short in only two of them: £500.00 of back pay on Thu 28 Jan means she
 * isn't short on Fri 29 Jan (£620.00 + £500.00 − £950.00 = £170.00).
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
 * Short now and in the next two pay periods, but not the third: £400.00 of
 * council tax on Fri 20 Nov makes this pay period short too (−£280.00),
 * and £1,000.00 of back pay on Thu 28 Jan clears Fri 29 Jan:
 *
 *   Fri 20 Nov  £120.00 − £400.00 = −£280.00                short
 *   Sun 29 Nov  −£280.00 + £800.00 − £950.00 = −£430.00      short
 *   Tue 29 Dec  −£430.00 + £800.00 − £950.00 = −£580.00      short
 *   Fri 29 Jan  −£580.00 + £800.00 + £1,000.00 − £950.00 = £270.00
 *
 * The pay period today is in doesn't count, as it started before today
 * (D585), so it isn't three running.
 */
export const shortNowAndNextTwo: PlanRecords = {
  ...shortThreeRunning,
  series: [
    ...shortThreeRunning.series,
    {
      ...base,
      id: 'council-tax',
      familyId: 'council-tax',
      familyCreatedAt: '2026-11-01T09:02:00Z',
      name: 'Council tax',
      direction: 'out',
      type: 'bills',
      amount: pounds('400.00'),
      start: '2026-11-20',
      schedule: { kind: 'once' },
    },
    {
      ...base,
      id: 'back-pay',
      familyId: 'back-pay',
      familyCreatedAt: '2026-11-01T09:03:00Z',
      name: 'Back pay',
      direction: 'in',
      type: 'benefits',
      amount: pounds('1000.00'),
      start: '2027-01-28',
      schedule: { kind: 'once' },
    },
  ],
};
