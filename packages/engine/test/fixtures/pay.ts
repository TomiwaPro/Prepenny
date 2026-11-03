// Sam's pay for the pay calculator tests (brief 8.6, D5, D6): his job's tax
// settings, the pay lines of his four payslips as saved pay weeks, and his
// plan with the pay linked to them.

import {
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
    name: 'Rota week 1, 3 shifts',
    payProfileId: 'warehouse',
    lines: [basic('34.5')],
    fixed: premium('114.69'),
  },
  {
    id: 'week-27',
    name: 'Rota week 2, 4 shifts',
    payProfileId: 'warehouse',
    lines: [basic('46')],
    fixed: premium('210.23'),
  },
  {
    id: 'week-28',
    name: 'Rota week 3, 3 shifts',
    payProfileId: 'warehouse',
    lines: [basic('34.25')],
    fixed: premium('142.29'),
  },
  {
    // Week 29's usual lines. Its 11.5 hours of overtime aren't in them:
    // overtime is what "I did overtime" adds (D5, D196).
    id: 'week-29',
    name: 'Rota week 4, 4 shifts',
    payProfileId: 'warehouse',
    lines: [basic('46')],
    fixed: premium('172.01'),
  },
];

/** Each step of Sam's pay pattern linked to the pay week it's worked out from (D5, D196). */
export const SAM_CYCLE_PAY_WEEKS: readonly string[] = ['week-26', 'week-27', 'week-28', 'week-29'];

/**
 * Sam's pay profile on Sun 25 Oct 2026: the year so far from his week 29
 * payslip, paid Fri 23 Oct (D6), overtime at £19.07, and each payday
 * covering work up to 5 days before it: "Fri 6 Nov pays for work up to Sun
 * 1 Nov" (D131).
 */
export const samPayProfile: PayProfile = {
  ...samSettings,
  id: 'warehouse',
  name: 'Warehouse job',
  soFar: {
    taxYear: '2026-27',
    period: 29,
    grossForTax: pounds('10732.73'),
    taxPaid: pounds('743.40'),
  },
  overtimeRate: '19.07',
  coveredTo: { kind: 'days-before', days: 5 },
};

/**
 * Sam's plan with his pay linked to the profile. The pattern's steps are
 * 3-shift, 4-shift, 3-shift and 4-shift weeks (D5): Fri 30 Oct is week 26's
 * lines, Fri 6 Nov week 27's, Fri 13 Nov week 28's and Fri 20 Nov week 29's (D196).
 */
export function samPayPlan(
  overrides: Partial<PlanInput> = {},
  cyclePayWeeks: readonly string[] = SAM_CYCLE_PAY_WEEKS,
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
