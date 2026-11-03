// Sam's pay for the pay calculator tests (brief 8.6, D5, D6): his job's tax
// settings, the pay lines of his four payslips as saved pay weeks, and his
// plan with the pay linked to them.

import {
  MONDAY,
  type PayLine,
  type PayProfile,
  type PaySettings,
  type PayWeek,
  type PlanInput,
  parsePounds,
} from '../../src/index.ts';
import { samPlan, samSeries } from './sam.ts';

export const pounds = (text: string) => parsePounds(text);

/** Brief 8.6: 1257L on the cumulative basis, paid weekly, 4% pension on £120 to £967 a week before tax. */
export const samSettings: PaySettings = {
  frequency: 'weekly',
  taxCode: '1257L',
  basis: 'cumulative',
  pension: { percent: '4', lower: pounds('120.00'), upper: pounds('967.00'), when: 'before-tax' },
};

export const basic = (hours: string): PayLine => ({
  name: 'Basic',
  kind: 'basic',
  hours,
  rate: '12.71',
});

export const overtime = (hours: string): PayLine => ({
  name: 'Overtime',
  kind: 'overtime',
  hours,
  rate: '19.07',
});

export const premium = (amount: string) => [{ name: 'Shift premium', amount: pounds(amount) }];

/** The pay lines of the four payslips in brief 8.6, as saved pay weeks. */
export const samPayWeeks: readonly PayWeek[] = [
  {
    id: 'week-26',
    payProfileId: 'warehouse',
    lines: [basic('34.5')],
    fixed: premium('114.69'),
  },
  {
    id: 'week-27',
    payProfileId: 'warehouse',
    lines: [basic('46')],
    fixed: premium('210.23'),
  },
  {
    id: 'week-28',
    payProfileId: 'warehouse',
    lines: [basic('34.25')],
    fixed: premium('142.29'),
  },
];

/**
 * Sam's pay profile on Sun 25 Oct 2026: the year so far from his week 29
 * payslip, paid Fri 23 Oct (D6), overtime at £19.07, a working week from
 * Monday, and pay one week behind the shifts (D5).
 */
export const samPayProfile: PayProfile = {
  ...samSettings,
  id: 'warehouse',
  soFar: {
    taxYear: '2026-27',
    period: 29,
    grossForTax: pounds('10732.73'),
    taxPaid: pounds('743.40'),
  },
  overtimeRate: '19.07',
  workWeekStarts: MONDAY,
  weeksBehind: 1,
};

/**
 * Sam's plan with his pay linked to the profile. The pattern's steps are
 * 3-shift, 4-shift, 3-shift and 4-shift weeks (D5): Fri 30 Oct is week 26's
 * lines, Fri 6 Nov week 27's, Fri 13 Nov week 28's and Fri 20 Nov week 27's again.
 */
export function samPayPlan(
  overrides: Partial<PlanInput> = {},
  cyclePayWeeks: readonly string[] = ['week-26', 'week-27', 'week-28', 'week-27'],
): PlanInput {
  return samPlan({
    series: samSeries.map((one) =>
      one.id === 'pay' ? { ...one, payProfileId: 'warehouse', cyclePayWeeks } : one,
    ),
    payProfiles: [samPayProfile],
    payWeeks: samPayWeeks,
    payAdjustments: [],
    ...overrides,
  });
}
