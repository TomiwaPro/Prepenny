// Brief 8.6: Sam's four weekly payslips from 2026-27, paid on Fridays 2, 9,
// 16 and 23 Oct 2026 (D6), and the brief's worked check for week 29
// (ARCHITECTURE.md test 34). Pension and tax must match to the penny,
// National Insurance and take-home within 1p.

import { describe, expect, it } from 'vitest';
import {
  checkPayslip,
  formatPounds,
  type PayLine,
  payAdjustmentForOne,
  type TakeHome,
  takeHomeAsEstimate,
  workOutTakeHome,
} from '../../src/index.ts';
import { basic, overtime, pounds, premium, samSettings } from '../fixtures/pay.ts';

interface Payslip {
  readonly week: number;
  readonly paid: string;
  readonly lines: readonly PayLine[];
  readonly premium: string;
  readonly gross: string;
  readonly grossSoFar: string;
  readonly taxSoFar: string;
  readonly pension: string;
  readonly tax: string;
  readonly ni: string;
  readonly takeHome: string;
}

// The brief's table. "So far" figures include that week.
const payslips: readonly Payslip[] = [
  {
    week: 26,
    paid: '2026-10-02',
    lines: [basic('34.5')],
    premium: '114.69',
    gross: '553.19',
    grossSoFar: '8463.43',
    taxSoFar: '434.60',
    pension: '17.33',
    tax: '58.80',
    ni: '24.89',
    takeHome: '452.17',
  },
  {
    week: 27,
    paid: '2026-10-09',
    lines: [basic('46')],
    premium: '210.23',
    gross: '794.89',
    grossSoFar: '9231.32',
    taxSoFar: '539.80',
    pension: '27.00',
    tax: '105.20',
    ni: '44.23',
    takeHome: '618.46',
  },
  {
    week: 28,
    paid: '2026-10-16',
    lines: [basic('34.25')],
    premium: '142.29',
    gross: '577.61',
    grossSoFar: '9790.63',
    taxSoFar: '603.20',
    pension: '18.30',
    tax: '63.40',
    ni: '26.85',
    takeHome: '469.06',
  },
  {
    week: 29,
    paid: '2026-10-23',
    lines: [basic('46'), overtime('11.5')],
    premium: '172.01',
    gross: '975.98',
    grossSoFar: '10732.73',
    taxSoFar: '743.40',
    pension: '33.88',
    tax: '140.20',
    ni: '58.18',
    takeHome: '743.72',
  },
];

/**
 * The year so far before a payslip, from the brief's own columns: the gross
 * for tax so far less this week's pay for tax (gross less the pension, taken
 * before tax), and the tax so far less this week's tax. Week 26:
 * £8,463.43 − (£553.19 − £17.33) = £7,927.57, and £434.60 − £58.80 = £375.80.
 */
function soFarBefore(slip: Payslip) {
  return {
    taxYear: '2026-27',
    period: slip.week - 1,
    grossForTax: pounds(slip.grossSoFar) - (pounds(slip.gross) - pounds(slip.pension)),
    taxPaid: pounds(slip.taxSoFar) - pounds(slip.tax),
  };
}

function workOut(slip: Payslip): TakeHome {
  return workOutTakeHome({
    settings: samSettings,
    lines: slip.lines,
    fixed: premium(slip.premium),
    payDate: slip.paid,
    soFar: soFarBefore(slip),
  });
}

const withinOnePenny = (actual: number, expected: string) =>
  expect(Math.abs(actual - pounds(expected))).toBeLessThanOrEqual(1);

describe('test 1 (brief 8.6): the four payslips, paid on Fridays 2, 9, 16 and 23 Oct 2026', () => {
  for (const slip of payslips) {
    describe(`week ${slip.week}, paid ${slip.paid}`, () => {
      const result = workOut(slip);

      it(`is tax week ${slip.week}, with gross pay £${slip.gross}`, () => {
        expect(result.period).toBe(slip.week);
        expect(formatPounds(result.gross)).toBe(slip.gross);
      });

      it(`takes pension £${slip.pension} and tax £${slip.tax}, to the penny`, () => {
        expect([formatPounds(result.pension), formatPounds(result.tax)]).toEqual([
          slip.pension,
          slip.tax,
        ]);
      });

      it(`takes National Insurance £${slip.ni} and leaves £${slip.takeHome}, within 1p`, () => {
        withinOnePenny(result.nationalInsurance, slip.ni);
        withinOnePenny(result.takeHome, slip.takeHome);
      });

      it(`makes gross for tax so far £${slip.grossSoFar} and tax paid so far £${slip.taxSoFar}`, () => {
        expect([formatPounds(result.grossForTaxSoFar), formatPounds(result.taxPaidSoFar)]).toEqual([
          slip.grossSoFar,
          slip.taxSoFar,
        ]);
        expect(result.isEstimate).toBe(false);
      });
    });
  }

  it('rounds week 26’s National Insurance down to £24.89, by HMRC’s rule for the third decimal place', () => {
    // (£553.19 − £242.00) × 8% = £24.8952. HMRC looks only at the third
    // decimal place: 5 or less rounds down (NI guidance for software
    // developers 2026 to 2027, section 4). So £24.89, as on the payslip.
    expect(formatPounds(workOut(payslips[0] as Payslip).nationalInsurance)).toBe('24.89');
  });

  it('works week 27 out exactly from the week 26 payslip alone, carrying its so-far figures on', () => {
    const week26 = workOut(payslips[0] as Payslip);
    const week27 = workOutTakeHome({
      settings: samSettings,
      lines: [basic('46')],
      fixed: premium('210.23'),
      payDate: '2026-10-09',
      soFar: {
        taxYear: '2026-27',
        period: 26,
        grossForTax: week26.grossForTaxSoFar,
        taxPaid: week26.taxPaidSoFar,
      },
    });
    expect([formatPounds(week27.tax), formatPounds(week27.takeHome)]).toEqual(['105.20', '618.46']);
  });
});

describe('test 2 (brief 8.6): the worked check for week 29', () => {
  it('has tax-free pay of £241.92 a week for 1257L', () => {
    // HMRC's PAYE tax table routines 4.3.1: 1257 is two 500s and 257. The 257
    // is (257 × £10 + £9) ÷ 52 = £49.5961…, rounded up to £49.60; each 500 is
    // £5,000 ÷ 52 = £96.153…, rounded up to £96.16. £49.60 + 2 × £96.16 = £241.92.
    expect(formatPounds(payAdjustmentForOne(1257, 'week'))).toBe('241.92');
  });

  it('gives £10,732.73 − 29 × £241.92 = £3,717.05, so £3,717, tax so far £743.40 and £140.20 this week', () => {
    expect(29 * pounds('241.92')).toBe(pounds('7015.68'));
    expect(pounds('10732.73') - pounds('7015.68')).toBe(pounds('3717.05'));
    const week29 = workOut(payslips[3] as Payslip);
    // £3,717 × 20% = £743.40 tax so far, less £603.20 paid by week 28.
    expect(formatPounds(week29.taxPaidSoFar)).toBe('743.40');
    expect(formatPounds(week29.tax)).toBe('140.20');
  });
});

describe('the result, ready for the plan', () => {
  it('breaks the pay down: tax £58.80, National Insurance £24.89 and pension £17.33 for week 26', () => {
    const week26 = workOut(payslips[0] as Payslip);
    expect(week26.lines.map((line) => [line.name, formatPounds(line.amount)])).toEqual([
      ['Basic', '438.50'],
    ]);
    expect(week26.fixed.map((one) => formatPounds(one.amount))).toEqual(['114.69']);
    expect({
      tax: formatPounds(week26.tax),
      ni: formatPounds(week26.nationalInsurance),
      pension: formatPounds(week26.pension),
      studentLoan: week26.studentLoan,
      postgraduateLoan: week26.postgraduateLoan,
    }).toEqual({
      tax: '58.80',
      ni: '24.89',
      pension: '17.33',
      studentLoan: 0,
      postgraduateLoan: 0,
    });
  });

  it('becomes the edit that adds it as a payday’s estimate', () => {
    const week26 = workOut(payslips[0] as Payslip);
    expect(takeHomeAsEstimate({ seriesId: 'pay', originalDate: '2026-10-30' }, week26)).toEqual({
      kind: 'just-this-one',
      seriesId: 'pay',
      originalDate: '2026-10-30',
      edits: { amount: pounds('452.17'), isEstimate: true },
    });
  });

  it('is an estimate without "Gross for tax so far" and "Tax paid so far"', () => {
    const result = workOutTakeHome({
      settings: samSettings,
      lines: [basic('34.5')],
      fixed: premium('114.69'),
      payDate: '2026-10-02',
    });
    expect([result.isEstimate, result.estimateReason]).toEqual([true, 'no-year-so-far']);
  });
});

describe('Check my payslip', () => {
  const slip = payslips[2] as Payslip;
  const input = {
    settings: samSettings,
    lines: slip.lines,
    fixed: premium(slip.premium),
    payDate: slip.paid,
    soFar: soFarBefore(slip),
  };

  it('finds nothing different on the week 28 payslip as it was', () => {
    const check = checkPayslip(input, {
      gross: pounds('577.61'),
      pension: pounds('18.30'),
      tax: pounds('63.40'),
      nationalInsurance: pounds('26.85'),
      takeHome: pounds('469.06'),
      grossForTaxSoFar: pounds('9790.63'),
      taxPaidSoFar: pounds('603.20'),
    });
    expect(check.differences).toEqual([]);
  });

  it('lists each figure that differs, and by how much', () => {
    const check = checkPayslip(input, {
      gross: pounds('577.61'),
      tax: pounds('73.40'),
      nationalInsurance: pounds('26.85'),
      takeHome: pounds('459.06'),
    });
    expect(
      check.differences.map((one) => [
        one.figure,
        formatPounds(one.expected),
        formatPounds(one.onPayslip),
        formatPounds(one.difference),
      ]),
    ).toEqual([
      ['tax', '63.40', '73.40', '10.00'],
      ['takeHome', '469.06', '459.06', '-10.00'],
    ]);
  });
});
