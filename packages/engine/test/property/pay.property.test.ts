// Property tests (fast-check) for the take-home pay calculator (step 1f):
// rules that must hold for any pay lines, tax code, pension and year so far.
//
// - Take-home is gross pay less every deduction, and gross is the lines added up.
// - No payday takes more than half its pay in tax (the regulatory limit).
// - Working week by week from week 1, each payslip's so-far figures feeding
//   the next, gives the same tax as starting with no year so far when every
//   week's pay is the same (D124).
// - Overtime saved shift by shift adds up to all of it worked out at once (D5).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  formatDate,
  type PayLine,
  type PaySettings,
  parseDate,
  type StudentLoanPlan,
  taxYearsOf,
  workOutPayChange,
  workOutTakeHome,
} from '../../src/index.ts';

const years = taxYearsOf();
const firstFriday = parseDate('2026-04-10');

const hours = fc.integer({ min: 0, max: 600 }).map((tenths) => (tenths / 10).toString());
const rate = fc.integer({ min: 1000, max: 4000 }).map((pence) => (pence / 100).toFixed(2));
const line: fc.Arbitrary<PayLine> = fc.record({
  name: fc.constant('Line'),
  kind: fc.constantFrom('basic', 'overtime', 'nights', 'weekends', 'holiday'),
  hours,
  rate,
});
const settings: fc.Arbitrary<PaySettings> = fc
  .record({
    frequency: fc.constant('weekly' as const),
    taxCode: fc.oneof(
      fc.integer({ min: 0, max: 2000 }).map((n) => `${n}L`),
      fc.integer({ min: 1, max: 800 }).map((n) => `K${n}`),
      fc.constantFrom('BR', 'D0', 'D1', 'NT', 'S1257L', 'C1257L', 'SD2', '0T'),
    ),
    basis: fc.constantFrom('cumulative' as const, 'week-one' as const),
    pension: fc.oneof(
      fc.constant(undefined),
      fc.record({
        percent: fc.integer({ min: 0, max: 10 }).map(String),
        lower: fc.constant(12000),
        upper: fc.constant(96700),
        when: fc.constantFrom('before-tax' as const, 'after-tax' as const),
      }),
    ),
    studentLoans: fc.constantFrom<StudentLoanPlan[]>([], ['plan-2'], ['plan-1', 'postgraduate']),
  })
  .map((one) => {
    const { pension, ...rest } = one;
    return pension === undefined ? rest : { ...rest, pension };
  });

describe('take-home pay holds for any pay lines, code, pension and student loan', () => {
  it('is gross less every deduction, and never takes more than half a payday’s pay in tax', () => {
    fc.assert(
      fc.property(
        settings,
        fc.array(line, { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 0, max: 50 }),
        (pay, lines, week) => {
          const result = workOutTakeHome(
            { settings: pay, lines, payDate: formatDate(firstFriday + 7 * week) },
            years,
          );
          expect(result.gross).toBe(result.lines.reduce((sum, one) => sum + one.amount, 0));
          expect(result.takeHome).toBe(
            result.gross -
              result.pension -
              result.tax -
              result.nationalInsurance -
              result.studentLoan -
              result.postgraduateLoan,
          );
          if (result.tax > 0) expect(result.tax).toBeLessThanOrEqual(result.payForTax / 2);
          expect(result.nationalInsurance).toBeGreaterThanOrEqual(0);
          expect(result.studentLoan % 100).toBe(0);
        },
      ),
    );
  });

  it('gives the same tax week by week from week 1 as with no year so far, when every week pays the same', () => {
    fc.assert(
      fc.property(
        settings,
        fc.array(line, { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 1, max: 20 }),
        (pay, lines, weeks) => {
          let soFar:
            | { taxYear: string; period: number; grossForTax: number; taxPaid: number }
            | undefined;
          let last = 0;
          for (let week = 0; week < weeks; week += 1) {
            const result = workOutTakeHome(
              {
                settings: pay,
                lines,
                payDate: formatDate(firstFriday + 7 * week),
                ...(soFar === undefined ? {} : { soFar }),
              },
              years,
            );
            soFar = {
              taxYear: '2026-27',
              period: result.period,
              grossForTax: result.grossForTaxSoFar,
              taxPaid: result.taxPaidSoFar,
            };
            last = result.tax;
          }
          const alone = workOutTakeHome(
            { settings: pay, lines, payDate: formatDate(firstFriday + 7 * (weeks - 1)) },
            years,
          );
          expect(alone.tax).toBe(last);
        },
      ),
    );
  });

  it('adds overtime saved one shift at a time up to all of it at once', () => {
    fc.assert(
      fc.property(
        settings,
        fc.array(line, { minLength: 1, maxLength: 3 }),
        fc.array(hours, { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 25, max: 50 }),
        (pay, lines, shifts, week) => {
          const payDate = formatDate(firstFriday + 7 * week);
          const soFar = { taxYear: '2026-27', period: 20, grossForTax: 1200000, taxPaid: 150000 };
          const extra = shifts.map(
            (one): PayLine => ({ name: 'Overtime', kind: 'overtime', hours: one, rate: '19.07' }),
          );
          let total = 0;
          extra.forEach((change, i) => {
            total += workOutPayChange(
              { settings: pay, soFar, payDate, lines, earlier: extra.slice(0, i), change },
              years,
            ).change;
          });
          const usual = workOutTakeHome({ settings: pay, soFar, payDate, lines }, years);
          const all = workOutTakeHome(
            {
              settings: pay,
              soFar,
              payDate,
              lines: [...lines, ...extra],
              assumedPayBetween: usual.payForTax,
            },
            years,
          );
          expect(total).toBe(all.takeHome - usual.takeHome);
        },
      ),
    );
  });
});
