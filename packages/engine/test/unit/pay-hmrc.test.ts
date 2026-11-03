// Test 4 (brief 8.6, ARCHITECTURE.md tests 35 to 40): a Scottish tax code,
// student loan Plan 2, a BR code, an emergency code on week 1/month 1, a
// monthly salary and a pension taken after tax.
//
// Where HMRC has an official worked example, it's used: HMRC's "Software
// developers: payroll test data 2026 to 2027" (the PAYE tax, National
// Insurance and Student Loan files), HMRC's National Insurance guidance for
// software developers 2026 to 2027 and CWG2 2026 to 2027, all saved in
// sources/gov-uk. HMRC says results within £0.01 of its test data are
// acceptable; these match to the penny. Where there's no official example,
// the answer is worked out by hand from the GOV.UK figures, with the working
// in a comment, and without the engine's own code.

import { describe, expect, it } from 'vitest';
import {
  employeeNationalInsurance,
  formatPounds,
  type PayFrequency,
  type PaySettings,
  parseDate,
  parseTaxCode,
  payPeriodOf,
  type StudentLoanPlan,
  studentLoanDeduction,
  studentLoanThreshold,
  type TaxTable,
  taxForPeriod,
  taxYearFor,
  taxYearsOf,
  workOutTakeHome,
} from '../../src/index.ts';
import { basic, overtime, pounds, premium } from '../fixtures/pay.ts';

const years = taxYearsOf();
const year = taxYearFor(parseDate('2026-10-25'), years);

/** One row of HMRC's tax test data: gross pay, code, week 1/month 1, period, tax due, tax due to date. */
type TaxRow = readonly [string, string, boolean, number, string, string];

/** Runs HMRC's rows in order, carrying pay and tax to date for cumulative codes. */
function runTaxRows(table: TaxTable, rows: readonly TaxRow[]) {
  let payToDate = 0;
  let taxToDate = 0;
  return rows.map(([gross, code, weekOne, period, ,]) => {
    const result = taxForPeriod({
      code: parseTaxCode(code),
      year,
      table,
      period,
      nonCumulative: weekOne,
      pay: pounds(gross),
      payToDateBefore: payToDate,
      taxToDateBefore: taxToDate,
    });
    payToDate = result.payToDate;
    taxToDate = result.taxToDate;
    return [formatPounds(result.tax), formatPounds(weekOne ? result.tax : result.taxToDate)];
  });
}

const expected = (rows: readonly TaxRow[]) => rows.map((row) => [row[4], row[5]]);

describe('HMRC’s 2026 to 2027 PAYE test data: rest of the UK', () => {
  it('cumulative, monthly, with 1257L, then BR and NT (sheet Gen_cumul-mthly)', () => {
    const rows: TaxRow[] = [
      ['1156.25', '1257L', false, 1, '21.40', '21.40'],
      ['1156.26', '1257L', false, 2, '21.60', '43.00'],
      ['31123.26', '1257L', false, 3, '10188.00', '10231.00'],
      ['14465.71', '1257L', false, 4, '4838.60', '15069.60'],
      ['52681.25', '1257L', false, 5, '22085.10', '37154.70'],
      ['50000.00', '1257L', false, 6, '20878.65', '58033.35'],
      ['15000.00', '1257L', false, 7, '5128.20', '63161.55'],
      ['14000.55', '1257L', false, 8, '4679.10', '67840.65'],
      ['12590.45', 'BR', false, 9, '-29406.05', '38434.60'],
      ['11245.05', 'NT', false, 10, '-38434.60', '0.00'],
    ];
    expect(runTaxRows('month', rows)).toEqual(expected(rows));
  });

  it('cumulative, weekly, with 1257L, then BR and NT (sheet Gen_cumul-wkly)', () => {
    const rows: TaxRow[] = [
      ['267.07', '1257L', false, 1, '5.00', '5.00'],
      ['266.08', '1257L', false, 2, '4.80', '9.80'],
      ['853.05', '1257L', false, 3, '122.20', '132.00'],
      ['2021.09', '1257L', false, 4, '355.80', '487.80'],
      ['9834.16', '1257L', false, 5, '3599.60', '4087.40'],
      ['15000.00', '1257L', false, 6, '6375.68', '10463.08'],
      ['242.84', '1257L', false, 7, '-264.87', '10198.21'],
      ['243.83', '1257L', false, 8, '-264.43', '9933.78'],
      ['632.84', 'BR', false, 9, '-4061.78', '5872.00'],
      ['2893.83', 'NT', false, 10, '-5872.00', '0.00'],
    ];
    expect(runTaxRows('week', rows)).toEqual(expected(rows));
  });

  it('week 1/month 1, monthly: 45L, BR, D0 and D1 (sheet Gen_W1M1_mthly)', () => {
    const rows: TaxRow[] = [
      ['39.24', '45L', true, 1, '0.00', '0.00'],
      ['39.25', '45L', true, 1, '0.20', '0.20'],
      ['3164.24', '45L', true, 1, '625.00', '625.00'],
      ['3164.25', '45L', true, 1, '625.20', '625.20'],
      ['10450.24', '45L', true, 1, '3536.06', '3536.06'],
      ['10500.78', '45L', true, 1, '3558.15', '3558.15'],
      ['12539.24', '45L', true, 1, '4475.25', '4475.25'],
      ['12539.25', '45L', true, 1, '4475.70', '4475.70'],
      ['99.99', 'BR', true, 1, '19.80', '19.80'],
      ['99.99', 'D0', true, 1, '39.60', '39.60'],
      ['99.99', 'D1', true, 1, '44.55', '44.55'],
    ];
    expect(runTaxRows('month', rows)).toEqual(expected(rows));
  });

  it('week 1/month 1, weekly: 145L, BR, D0 and D1 (sheet Gen_W1M1_wkly)', () => {
    const rows: TaxRow[] = [
      ['29.05', '145L', true, 1, '0.00', '0.00'],
      ['29.06', '145L', true, 1, '0.20', '0.20'],
      ['750.06', '145L', true, 1, '144.40', '144.40'],
      ['750.07', '145L', true, 1, '144.40', '144.40'],
      ['2913.06', '145L', true, 1, '1032.92', '1032.92'],
      ['2913.07', '145L', true, 1, '1032.92', '1032.92'],
      ['101.99', 'BR', true, 1, '20.20', '20.20'],
      ['101.99', 'D0', true, 1, '40.40', '40.40'],
      ['101.99', 'D1', true, 1, '45.45', '45.45'],
    ];
    expect(runTaxRows('week', rows)).toEqual(expected(rows));
  });

  it('a BR code, cumulative, monthly and weekly (sheets BR_monthly and BR_weekly)', () => {
    const monthly: TaxRow[] = [
      ['2870.55', 'BR', false, 1, '574.00', '574.00'],
      ['3500.95', 'BR', false, 2, '700.20', '1274.20'],
      ['32000.00', 'BR', false, 3, '6400.00', '7674.20'],
    ];
    const weekly: TaxRow[] = [
      ['650.15', 'BR', false, 1, '130.00', '130.00'],
      ['995.55', 'BR', false, 2, '199.00', '329.00'],
      ['7100.35', 'BR', false, 3, '1420.20', '1749.20'],
    ];
    expect(runTaxRows('month', monthly)).toEqual(expected(monthly));
    expect(runTaxRows('week', weekly)).toEqual(expected(weekly));
  });

  it('K codes, cumulative and week 1/month 1 (sheets K_cumul and K_W1M1)', () => {
    const cumulativeMonthly: TaxRow[] = [
      ['895.00', 'K585', false, 1, '276.60', '276.60'],
      ['1250.00', 'K585', false, 2, '347.60', '624.20'],
      ['765.00', 'K585', false, 3, '250.60', '874.80'],
    ];
    const cumulativeWeekly: TaxRow[] = [
      ['150.00', 'K630', false, 1, '54.20', '54.20'],
      ['300.00', 'K630', false, 2, '84.20', '138.40'],
      ['245.00', 'K630', false, 3, '73.40', '211.80'],
    ];
    const weekOneMonthly: TaxRow[] = [
      ['950.00', 'K45', true, 1, '197.60', '197.60'],
      ['1120.00', 'K285', true, 1, '271.60', '271.60'],
      ['885.00', 'K401', true, 1, '243.80', '243.80'],
    ];
    const weekOneWeekly: TaxRow[] = [
      ['560.00', 'K27', true, 1, '113.00', '113.00'],
      ['432.00', 'K159', true, 1, '92.40', '92.40'],
      ['810.00', 'K306', true, 1, '202.60', '202.60'],
    ];
    expect(runTaxRows('month', cumulativeMonthly)).toEqual(expected(cumulativeMonthly));
    expect(runTaxRows('week', cumulativeWeekly)).toEqual(expected(cumulativeWeekly));
    expect(runTaxRows('month', weekOneMonthly)).toEqual(expected(weekOneMonthly));
    expect(runTaxRows('week', weekOneWeekly)).toEqual(expected(weekOneWeekly));
  });

  it('codes either side of 1000, monthly and weekly (sheets Large_code)', () => {
    // Each is the first payday of the year on its own code.
    const monthly: [string, string, string][] = [
      ['2500.00', '999L', '333.20'],
      ['3000.00', '1000L', '433.00'],
      ['5000.00', '1001L', '1037.66'],
    ];
    const weekly: [string, string, string][] = [
      ['750.00', '999L', '111.40'],
      ['900.00', '1000L', '141.40'],
      ['1500.00', '1001L', '377.80'],
    ];
    for (const [table, rows] of [
      ['month', monthly],
      ['week', weekly],
    ] as const) {
      expect(
        rows.map(([gross, code]) =>
          formatPounds(
            taxForPeriod({
              code: parseTaxCode(code),
              year,
              table,
              period: 1,
              nonCumulative: false,
              pay: pounds(gross),
              payToDateBefore: 0,
              taxToDateBefore: 0,
            }).tax,
          ),
        ),
      ).toEqual(rows.map((row) => row[2]));
    }
  });
});

describe('test 4: a Scottish tax code (HMRC’s 2026 to 2027 Scottish test data)', () => {
  it('cumulative, monthly, with S1257L, then SBR and NT (sheet Gen_cumul_mthly)', () => {
    const rows: TaxRow[] = [
      ['1156.25', 'S1257L', false, 1, '20.33', '20.33'],
      ['1156.26', 'S1257L', false, 2, '20.52', '40.85'],
      ['31123.26', 'S1257L', false, 3, '11436.78', '11477.63'],
      ['14465.71', 'S1257L', false, 4, '5380.32', '16857.95'],
      ['52681.25', 'S1257L', false, 5, '23753.37', '40611.32'],
      ['50000.00', 'S1257L', false, 6, '22466.49', '63077.81'],
      ['15000.00', 'S1257L', false, 7, '5666.01', '68743.82'],
      ['14000.55', 'S1257L', false, 8, '5186.97', '73930.79'],
      ['12590.45', 'SBR', false, 9, '-35496.19', '38434.60'],
      ['11245.05', 'NT', false, 10, '-38434.60', '0.00'],
    ];
    expect(runTaxRows('month', rows)).toEqual(expected(rows));
  });

  it('cumulative, weekly, with S1257L, then SBR and NT (sheet Gen_cumul_wkly)', () => {
    const rows: TaxRow[] = [
      ['267.07', 'S1257L', false, 1, '4.75', '4.75'],
      ['266.08', 'S1257L', false, 2, '4.56', '9.31'],
      ['853.05', 'S1257L', false, 3, '120.40', '129.71'],
      ['2021.09', 'S1257L', false, 4, '376.31', '506.02'],
      ['9834.16', 'S1257L', false, 5, '4079.90', '4585.92'],
      ['15000.00', 'S1257L', false, 6, '6845.99', '11431.91'],
      ['242.84', 'S1257L', false, 7, '-237.32', '11194.59'],
      ['243.83', 'S1257L', false, 8, '-236.84', '10957.75'],
      ['632.84', 'SBR', false, 9, '-5085.75', '5872.00'],
      ['2893.83', 'NT', false, 10, '-5872.00', '0.00'],
    ];
    expect(runTaxRows('week', rows)).toEqual(expected(rows));
  });

  it('week 1/month 1, monthly: S45L, SBR and SD0 to SD3 (sheet Gen_W1M1_mthly)', () => {
    const rows: TaxRow[] = [
      ['39.24', 'S45L', true, 1, '0.00', '0.00'],
      ['39.25', 'S45L', true, 1, '0.19', '0.19'],
      ['3164.24', 'S45L', true, 1, '750.95', '750.95'],
      ['3164.25', 'S45L', true, 1, '751.37', '751.37'],
      ['10450.24', 'S45L', true, 1, '3967.32', '3967.32'],
      ['10500.78', 'S45L', true, 1, '3991.28', '3991.28'],
      ['12539.24', 'S45L', true, 1, '4969.52', '4969.52'],
      ['12539.25', 'S45L', true, 1, '4970.00', '4970.00'],
      ['99.99', 'SBR', true, 1, '19.80', '19.80'],
      ['1450.03', 'SBR', true, 1, '290.00', '290.00'],
      ['99.99', 'SD0', true, 1, '20.79', '20.79'],
      ['1450.03', 'SD0', true, 1, '304.50', '304.50'],
      ['99.99', 'SD1', true, 1, '41.58', '41.58'],
      ['1450.03', 'SD1', true, 1, '609.00', '609.00'],
      ['99.99', 'SD2', true, 1, '44.55', '44.55'],
      ['1450.03', 'SD2', true, 1, '652.50', '652.50'],
      ['5300.67', 'SD2', true, 1, '2385.00', '2385.00'],
      ['99.99', 'SD3', true, 1, '47.52', '47.52'],
      ['1450.03', 'SD3', true, 1, '696.00', '696.00'],
      ['5300.67', 'SD3', true, 1, '2544.00', '2544.00'],
    ];
    expect(runTaxRows('month', rows)).toEqual(expected(rows));
  });

  it('week 1/month 1, weekly: S145L, SBR and SD0 to SD3 (sheet Gen_W1M1_wkly)', () => {
    const rows: TaxRow[] = [
      ['29.05', 'S145L', true, 1, '0.00', '0.00'],
      ['29.06', 'S145L', true, 1, '0.19', '0.19'],
      ['750.06', 'S145L', true, 1, '173.65', '173.65'],
      ['750.07', 'S145L', true, 1, '173.65', '173.65'],
      ['2913.06', 'S145L', true, 1, '1146.99', '1146.99'],
      ['2913.07', 'S145L', true, 1, '1146.99', '1146.99'],
      ['101.99', 'SBR', true, 1, '20.20', '20.20'],
      ['324.63', 'SBR', true, 1, '64.80', '64.80'],
      ['101.99', 'SD0', true, 1, '21.21', '21.21'],
      ['324.63', 'SD0', true, 1, '68.04', '68.04'],
      ['101.99', 'SD1', true, 1, '42.42', '42.42'],
      ['324.63', 'SD1', true, 1, '136.08', '136.08'],
      ['101.99', 'SD2', true, 1, '45.45', '45.45'],
      ['324.63', 'SD2', true, 1, '145.80', '145.80'],
      ['1056.81', 'SD2', true, 1, '475.20', '475.20'],
      ['101.99', 'SD3', true, 1, '48.48', '48.48'],
      ['324.63', 'SD3', true, 1, '155.52', '155.52'],
      ['1056.81', 'SD3', true, 1, '506.88', '506.88'],
    ];
    expect(runTaxRows('week', rows)).toEqual(expected(rows));
  });

  it('Scottish K codes, cumulative (sheets K_cumul_mthly, v1.1, and K_cumul_wkly)', () => {
    const monthly: TaxRow[] = [
      ['895.00', 'SK585', false, 1, '273.29', '273.29'],
      ['1250.00', 'SK585', false, 2, '347.24', '620.53'],
      ['765.00', 'SK585', false, 3, '245.70', '866.23'],
    ];
    const weekly: TaxRow[] = [
      ['150.00', 'SK630', false, 1, '53.43', '53.43'],
      ['300.00', 'SK630', false, 2, '83.84', '137.27'],
      ['245.00', 'SK630', false, 3, '73.04', '210.31'],
    ];
    expect(runTaxRows('month', monthly)).toEqual(expected(monthly));
    expect(runTaxRows('week', weekly)).toEqual(expected(weekly));
  });
});

describe('HMRC’s 2026 to 2027 Welsh test data: C codes give the same tax as the rest of the UK', () => {
  it('cumulative, monthly and weekly, with C1257L, then CBR and NT', () => {
    const monthly: TaxRow[] = [
      ['1156.25', 'C1257L', false, 1, '21.40', '21.40'],
      ['1156.26', 'C1257L', false, 2, '21.60', '43.00'],
      ['31123.26', 'C1257L', false, 3, '10188.00', '10231.00'],
      ['14465.71', 'C1257L', false, 4, '4838.60', '15069.60'],
      ['52681.25', 'C1257L', false, 5, '22085.10', '37154.70'],
      ['50000.00', 'C1257L', false, 6, '20878.65', '58033.35'],
      ['15000.00', 'C1257L', false, 7, '5128.20', '63161.55'],
      ['14000.55', 'C1257L', false, 8, '4679.10', '67840.65'],
      ['12590.45', 'CBR', false, 9, '-29406.05', '38434.60'],
      ['11245.05', 'NT', false, 10, '-38434.60', '0.00'],
    ];
    const weekly: TaxRow[] = [
      ['267.07', 'C1257L', false, 1, '5.00', '5.00'],
      ['266.08', 'C1257L', false, 2, '4.80', '9.80'],
      ['853.05', 'C1257L', false, 3, '122.20', '132.00'],
      ['2021.09', 'C1257L', false, 4, '355.80', '487.80'],
      ['9834.16', 'C1257L', false, 5, '3599.60', '4087.40'],
      ['15000.00', 'C1257L', false, 6, '6375.68', '10463.08'],
      ['242.84', 'C1257L', false, 7, '-264.87', '10198.21'],
      ['243.83', 'C1257L', false, 8, '-264.43', '9933.78'],
      ['632.84', 'CBR', false, 9, '-4061.78', '5872.00'],
      ['2893.83', 'NT', false, 10, '-5872.00', '0.00'],
    ];
    expect(runTaxRows('month', monthly)).toEqual(expected(monthly));
    expect(runTaxRows('week', weekly)).toEqual(expected(weekly));
  });

  it('week 1/month 1: C45L, C145L, CBR, CD0 and CD1', () => {
    const monthly: TaxRow[] = [
      ['39.25', 'C45L', true, 1, '0.20', '0.20'],
      ['3164.25', 'C45L', true, 1, '625.20', '625.20'],
      ['10500.78', 'C45L', true, 1, '3558.15', '3558.15'],
      ['12539.25', 'C45L', true, 1, '4475.70', '4475.70'],
      ['99.99', 'CBR', true, 1, '19.80', '19.80'],
      ['99.99', 'CD0', true, 1, '39.60', '39.60'],
      ['99.99', 'CD1', true, 1, '44.55', '44.55'],
    ];
    const weekly: TaxRow[] = [
      ['29.06', 'C145L', true, 1, '0.20', '0.20'],
      ['750.06', 'C145L', true, 1, '144.40', '144.40'],
      ['2913.07', 'C145L', true, 1, '1032.92', '1032.92'],
      ['101.99', 'CBR', true, 1, '20.20', '20.20'],
      ['101.99', 'CD0', true, 1, '40.40', '40.40'],
      ['101.99', 'CD1', true, 1, '45.45', '45.45'],
    ];
    expect(runTaxRows('month', monthly)).toEqual(expected(monthly));
    expect(runTaxRows('week', weekly)).toEqual(expected(weekly));
  });
});

describe('National Insurance by the exact percentage method (HMRC’s test data, category A)', () => {
  // HMRC's "NIC test data v1.0", sheet Cat_A: gross pay and the employee's National Insurance.
  const rows: Record<PayFrequency, [string, string][]> = {
    weekly: [
      ['96.04', '0.00'],
      ['129.01', '0.00'],
      ['242.07', '0.00'],
      ['242.08', '0.01'],
      ['242.31', '0.02'],
      ['242.32', '0.02'],
      ['481.03', '19.12'],
      ['481.04', '19.12'],
      ['966.64', '57.97'],
      ['966.65', '57.97'],
      ['967.04', '58.00'],
      ['967.05', '58.00'],
    ],
    'two-weekly': [
      ['258.01', '0.00'],
      ['484.07', '0.00'],
      ['484.08', '0.01'],
      ['484.31', '0.02'],
      ['484.32', '0.02'],
      ['962.03', '38.24'],
      ['962.04', '38.24'],
      ['1933.72', '115.98'],
      ['1933.73', '115.98'],
      ['1934.04', '116.00'],
      ['1934.05', '116.00'],
    ],
    'four-weekly': [
      ['516.01', '0.00'],
      ['967.07', '0.00'],
      ['967.08', '0.01'],
      ['967.31', '0.02'],
      ['967.32', '0.02'],
      ['1924.04', '76.56'],
      ['1924.05', '76.56'],
      ['3866.68', '231.97'],
      ['3866.69', '231.97'],
      ['3867.04', '232.00'],
      ['3867.05', '232.00'],
    ],
    monthly: [
      ['559.01', '0.00'],
      ['1048.07', '0.00'],
      ['1048.08', '0.01'],
      ['1048.31', '0.02'],
      ['1048.32', '0.02'],
      ['2083.05', '82.80'],
      ['2083.06', '82.80'],
      ['4188.53', '251.24'],
      ['4188.54', '251.24'],
      ['4189.04', '251.28'],
      ['4189.05', '251.28'],
    ],
  };
  for (const [frequency, cases] of Object.entries(rows) as [PayFrequency, [string, string][]][]) {
    it(`matches every ${frequency} row`, () => {
      expect(
        cases.map(([gross]) =>
          formatPounds(employeeNationalInsurance(pounds(gross), frequency, 'A', year)),
        ),
      ).toEqual(cases.map((row) => row[1]));
    });
  }

  it('matches the worked examples in HMRC’s guidance and CWG2', () => {
    // NI guidance for software developers 2026 to 2027, examples 1 to 3.
    expect(formatPounds(employeeNationalInsurance(pounds('129.53'), 'weekly', 'A', year))).toBe(
      '0.00',
    );
    expect(formatPounds(employeeNationalInsurance(pounds('1000.00'), 'weekly', 'A', year))).toBe(
      '58.66',
    );
    expect(formatPounds(employeeNationalInsurance(pounds('508.00'), 'two-weekly', 'B', year))).toBe(
      '0.44',
    );
    // CWG2 2026 to 2027, Jason, category M: £300 a week is £4.64, and £2,300 is £84.66.
    expect(formatPounds(employeeNationalInsurance(pounds('300.00'), 'weekly', 'M', year))).toBe(
      '4.64',
    );
    expect(formatPounds(employeeNationalInsurance(pounds('2300.00'), 'weekly', 'M', year))).toBe(
      '84.66',
    );
  });
});

describe('test 4: student loans (HMRC’s 2026 to 2027 Student Loan test data)', () => {
  // HMRC's "2026-27 Student Loan Threshold Examples v1.0": pay and the deduction, "Exact Method".
  const cases: Record<StudentLoanPlan, Record<PayFrequency, [string, string][]>> = {
    'plan-1': {
      weekly: [
        ['528.41', '0'],
        ['528.42', '1'],
        ['661.75', '13'],
        ['2106.29', '143'],
      ],
      'two-weekly': [
        ['1045.72', '0'],
        ['1045.73', '1'],
        ['3679.06', '238'],
        ['5223.50', '377'],
      ],
      'four-weekly': [
        ['2080.34', '0'],
        ['2080.35', '1'],
        ['4035.90', '177'],
        ['8447.01', '574'],
      ],
      monthly: [
        ['2252.77', '0'],
        ['2252.78', '1'],
        ['2741.77', '45'],
        ['8586.11', '571'],
      ],
    },
    'plan-2': {
      weekly: [
        ['576.20', '0'],
        ['576.21', '1'],
        ['576.31', '1'],
        ['709.54', '13'],
        ['1831.76', '114'],
        ['2154.08', '143'],
      ],
      'two-weekly': [
        ['1141.30', '0'],
        ['1141.31', '1'],
        ['1196.86', '6'],
        ['1241.31', '10'],
        ['3774.64', '238'],
        ['5319.08', '377'],
      ],
      'four-weekly': [
        ['2271.49', '0'],
        ['2271.50', '1'],
        ['2349.27', '8'],
        ['4227.05', '177'],
        ['8638.16', '574'],
      ],
      monthly: [
        ['2459.86', '0'],
        ['2459.87', '1'],
        ['2493.20', '4'],
        ['2948.86', '45'],
        ['5137.64', '242'],
        ['8793.20', '571'],
      ],
    },
    'plan-4': {
      weekly: [
        ['661.01', '0'],
        ['661.02', '1'],
        ['794.35', '13'],
        ['2238.89', '143'],
      ],
      'two-weekly': [
        ['1310.91', '0'],
        ['1310.92', '1'],
        ['3944.25', '238'],
      ],
      'four-weekly': [
        ['2610.72', '0'],
        ['2610.73', '1'],
        ['8977.39', '574'],
      ],
      monthly: [
        ['2827.36', '0'],
        ['2827.37', '1'],
        ['9160.70', '571'],
      ],
    },
    'plan-5': {
      weekly: [
        ['491.87', '0'],
        ['491.88', '1'],
        ['625.21', '13'],
        ['2069.75', '143'],
      ],
      'two-weekly': [
        ['972.64', '0'],
        ['972.65', '1'],
        ['5150.42', '377'],
      ],
      'four-weekly': [
        ['1934.18', '0'],
        ['1934.19', '1'],
        ['8300.85', '574'],
      ],
      monthly: [
        ['2094.44', '0'],
        ['2094.45', '1'],
        ['8427.78', '571'],
      ],
    },
    postgraduate: {
      weekly: [
        ['420.50', '0'],
        ['420.51', '1'],
        ['620.51', '13'],
        ['2787.33', '143'],
      ],
      'two-weekly': [
        ['824.35', '0'],
        ['824.36', '1'],
        ['7091.03', '377'],
      ],
      'four-weekly': [
        ['1632.04', '0'],
        ['1632.05', '1'],
        ['11182.05', '574'],
      ],
      monthly: [
        ['1766.66', '0'],
        ['1766.67', '1'],
        ['11266.67', '571'],
      ],
    },
  };
  for (const [plan, byFrequency] of Object.entries(cases) as [
    StudentLoanPlan,
    Record<PayFrequency, [string, string][]>,
  ][]) {
    it(`matches every ${plan} example`, () => {
      for (const [frequency, rows] of Object.entries(byFrequency) as [
        PayFrequency,
        [string, string][],
      ][]) {
        expect(
          rows.map(([pay]) => studentLoanDeduction(plan, pounds(pay), frequency, year) / 100),
        ).toEqual(rows.map((row) => Number(row[1])));
      }
    });
  }

  it('has HMRC’s thresholds for each pay period: Plan 2 is £565.09 a week and £2,448.75 a month', () => {
    const shown = (plan: StudentLoanPlan) =>
      (['weekly', 'two-weekly', 'four-weekly', 'monthly'] as const).map((frequency) =>
        formatPounds(studentLoanThreshold(plan, frequency, year)),
      );
    expect(shown('plan-1')).toEqual(['517.30', '1034.61', '2069.23', '2241.66']);
    expect(shown('plan-2')).toEqual(['565.09', '1130.19', '2260.38', '2448.75']);
    expect(shown('plan-4')).toEqual(['649.90', '1299.80', '2599.61', '2816.25']);
    expect(shown('plan-5')).toEqual(['480.76', '961.53', '1923.07', '2083.33']);
    expect(shown('postgraduate')).toEqual(['403.84', '807.69', '1615.38', '1750.00']);
  });

  it('takes Plan 2 off take-home pay on the earnings National Insurance is due on', () => {
    // No official worked example of a whole payslip with Plan 2, so by hand:
    // Sam's week 27 lines, gross £794.89. Plan 2 weekly threshold £565.09.
    // (£794.89 − £565.09) × 9% = £20.682, rounded down to the pound: £20.00.
    // The pension before tax doesn't change it: it's worked on the gross.
    // Take-home £618.46 − £20.00 = £598.46.
    const result = workOutTakeHome({
      settings: {
        frequency: 'weekly',
        taxCode: '1257L',
        basis: 'cumulative',
        pension: {
          percent: '4',
          lower: pounds('120.00'),
          upper: pounds('967.00'),
          when: 'before-tax',
        },
        studentLoans: ['plan-2'],
      },
      lines: [basic('46')],
      fixed: premium('210.23'),
      payDate: '2026-10-09',
      soFar: {
        taxYear: '2026-27',
        period: 26,
        grossForTax: pounds('8463.43'),
        taxPaid: pounds('434.60'),
      },
    });
    expect([formatPounds(result.studentLoan), formatPounds(result.takeHome)]).toEqual([
      '20.00',
      '598.46',
    ]);
  });

  it('refuses two of Plans 1, 2, 4 and 5 at once, but takes a Postgraduate loan with one', () => {
    const settings = (studentLoans: StudentLoanPlan[]): PaySettings => ({
      frequency: 'weekly',
      taxCode: '1257L',
      basis: 'cumulative',
      studentLoans,
    });
    const run = (plans: StudentLoanPlan[]) =>
      workOutTakeHome({ settings: settings(plans), lines: [basic('80')], payDate: '2026-10-09' });
    expect(() => run(['plan-1', 'plan-2'])).toThrow(
      expect.objectContaining({ code: 'two-student-loan-plans' }),
    );
    // 80 h × £12.71 = £1,016.80. Plan 2: (£1,016.80 − £565.09) × 9% = £40.6539 → £40.
    // Postgraduate: (£1,016.80 − £403.84) × 6% = £36.7776 → £36.
    const both = run(['plan-2', 'postgraduate']);
    expect([formatPounds(both.studentLoan), formatPounds(both.postgraduateLoan)]).toEqual([
      '40.00',
      '36.00',
    ]);
  });
});

describe('test 4: an emergency code on week 1/month 1', () => {
  // GOV.UK's emergency codes from 6 April 2026 are 1257L W1, 1257L M1 and
  // 1257L X. HMRC's week 1/month 1 test data above uses 45L and 145L, so the
  // emergency code itself is worked out by hand.
  it('takes £71.60 from £600.00 paid in week 29 on 1257L W1, whatever the year so far', () => {
    // Week 1 tables on their own: tax-free pay £241.92, so £600.00 − £241.92 =
    // £358.08, rounded down to £358. The week 1 basic rate threshold is
    // £37,700 ÷ 52 = £725, so all at 20%: £71.60.
    const settings: PaySettings = { frequency: 'weekly', taxCode: '1257L W1', basis: 'cumulative' };
    const pay = (soFar?: { grossForTax: number; taxPaid: number }) =>
      workOutTakeHome({
        settings,
        lines: [{ name: 'Basic', kind: 'basic', hours: '50', rate: '12' }],
        payDate: '2026-10-23',
        ...(soFar === undefined ? {} : { soFar: { taxYear: '2026-27', period: 28, ...soFar } }),
      });
    expect(formatPounds(pay().tax)).toBe('71.60');
    expect(formatPounds(pay({ grossForTax: pounds('20000.00'), taxPaid: 0 }).tax)).toBe('71.60');
    expect([pay().isEstimate, parseTaxCode('1257L X')]).toEqual([
      false,
      {
        kind: 'suffix',
        regime: 'england-and-northern-ireland',
        number: 1257,
        letter: 'L',
        weekOne: true,
      },
    ]);
  });

  it('takes £290.20 from £2,500.00 paid in month 7 on 1257L M1', () => {
    // Month 1 tax-free pay for 1257: (257 × £10 + £9) ÷ 12 = £214.9166…,
    // rounded up to £214.92, plus 2 × £416.67 = £1,048.26. £2,500.00 −
    // £1,048.26 = £1,451.74, so £1,451, under £37,700 ÷ 12 = £3,141.67:
    // 20% is £290.20.
    const result = workOutTakeHome({
      settings: { frequency: 'monthly', taxCode: '1257L M1', basis: 'cumulative' },
      lines: [{ name: 'Salary', kind: 'basic', hours: '1', rate: '2500' }],
      payDate: '2026-10-30',
    });
    expect([result.period, formatPounds(result.tax)]).toEqual([7, '290.20']);
  });
});

describe('test 4: a monthly salary', () => {
  it('works out a month 7 payslip on 1257L cumulative: take-home £2,093.44 from £2,500.00', () => {
    // HMRC's monthly test data above checks the tax tables. A whole monthly
    // payslip, by hand: paid Fri 30 Oct 2026, tax month 7 (6 Oct to 5 Nov).
    // Year so far to month 6: £15,000.00, with £1,742.00 tax
    //   (£15,000.00 − 6 × £1,048.26 = £8,710.44, so £8,710 at 20%).
    // Month 7: £17,500.00 − 7 × £1,048.26 (£7,337.82) = £10,162.18, so £10,162
    // at 20% = £2,032.40 tax so far, so £290.40 this month.
    // National Insurance: (£2,500.00 − £1,048) × 8% = £116.16.
    // Take-home: £2,500.00 − £290.40 − £116.16 = £2,093.44.
    const result = workOutTakeHome({
      settings: { frequency: 'monthly', taxCode: '1257L', basis: 'cumulative' },
      lines: [{ name: 'Salary', kind: 'basic', hours: '1', rate: '2500' }],
      payDate: '2026-10-30',
      soFar: {
        taxYear: '2026-27',
        period: 6,
        grossForTax: pounds('15000.00'),
        taxPaid: pounds('1742.00'),
      },
    });
    expect({
      period: result.period,
      tax: formatPounds(result.tax),
      ni: formatPounds(result.nationalInsurance),
      takeHome: formatPounds(result.takeHome),
      isEstimate: result.isEstimate,
    }).toEqual({ period: 7, tax: '290.40', ni: '116.16', takeHome: '2093.44', isEstimate: false });
  });
});

describe('test 4: a pension taken after tax', () => {
  it('leaves the pay for tax as it is: Sam’s week 29 lines take £146.80 tax and leave £737.12', () => {
    // No official example, so by hand. Sam's week 29 lines: gross £975.98.
    // Pension 4% × (£967.00 − £120.00) = £33.88, taken after tax.
    // Year so far to week 28: £9,000.00 with £445.20 tax
    //   (£9,000.00 − 28 × £241.92 = £2,226.24, so £2,226 at 20%).
    // Week 29: £9,975.98 − 29 × £241.92 (£7,015.68) = £2,960.30, so £2,960 at
    // 20% = £592.00 so far: £146.80 this week.
    // National Insurance on the gross: (£967 − £242) × 8% = £58.00, plus
    // (£975.98 − £967) × 2% = £0.1796, so £0.18: £58.18.
    // Take-home: £975.98 − £146.80 − £58.18 − £33.88 = £737.12.
    // Taken before tax instead: £942.10 for tax, £9,942.10 − £7,015.68 =
    // £2,926.42, so £585.20 so far and £140.00 this week: £743.92.
    const pay = (when: 'before-tax' | 'after-tax') =>
      workOutTakeHome({
        settings: {
          frequency: 'weekly',
          taxCode: '1257L',
          basis: 'cumulative',
          pension: { percent: '4', lower: pounds('120.00'), upper: pounds('967.00'), when },
        },
        lines: [basic('46'), overtime('11.5')],
        fixed: premium('172.01'),
        payDate: '2026-10-23',
        soFar: {
          taxYear: '2026-27',
          period: 28,
          grossForTax: pounds('9000.00'),
          taxPaid: pounds('445.20'),
        },
      });
    const after = pay('after-tax');
    expect({
      payForTax: formatPounds(after.payForTax),
      pension: formatPounds(after.pension),
      tax: formatPounds(after.tax),
      ni: formatPounds(after.nationalInsurance),
      takeHome: formatPounds(after.takeHome),
    }).toEqual({
      payForTax: '975.98',
      pension: '33.88',
      tax: '146.80',
      ni: '58.18',
      takeHome: '737.12',
    });
    expect([formatPounds(pay('before-tax').tax), formatPounds(pay('before-tax').takeHome)]).toEqual(
      ['140.00', '743.92'],
    );
  });
});

describe('more rules, worked out by hand', () => {
  it('stops a K code taking more than half the pay, and takes what it held back later', () => {
    // K1000 weekly: 999 is one 500 and 499, so the remainder is 500 and the
    // quotient 1: (500 × £10 + £9) ÷ 52 = £96.3269… → £96.33, plus £96.16,
    // so £192.49 is added to pay each week.
    // Week 1, £100.00 pay: £292.49, so £292 at 20% = £58.40, but the
    // regulatory limit is 50% of £100.00 = £50.00: £50.00 taken, £8.40 held back.
    // Week 2, £100.00 again: £200.00 + 2 × £192.49 = £584.98, so £584 → £116.80
    // due to date, less £50.00 taken: £66.80, held to £50.00 again.
    const code = parseTaxCode('K1000');
    const week1 = taxForPeriod({
      code,
      year,
      table: 'week',
      period: 1,
      nonCumulative: false,
      pay: pounds('100.00'),
      payToDateBefore: 0,
      taxToDateBefore: 0,
    });
    const week2 = taxForPeriod({
      code,
      year,
      table: 'week',
      period: 2,
      nonCumulative: false,
      pay: pounds('100.00'),
      payToDateBefore: week1.payToDate,
      taxToDateBefore: week1.taxToDate,
    });
    expect([week1.tax, week1.beforeLimit, week2.tax, week2.beforeLimit, week2.taxToDate]).toEqual([
      pounds('50.00'),
      pounds('58.40'),
      pounds('50.00'),
      pounds('66.80'),
      pounds('100.00'),
    ]);
  });

  it('works week 53 out on its own with the week 1 tables (CWG2 1.13)', () => {
    // Mon 5 Apr 2027 is the odd day at the end of the tax year: tax week 53.
    // £300.00 on 1257L: £300.00 − £241.92 = £58.08, so £58 at 20% = £11.60.
    // But if the free pay to week 52, 52 × £241.92 = £12,579.84, covers the
    // year's pay (here £12,000.00 + £300.00), no tax at all (CWG2 1.13.1).
    const settings: PaySettings = { frequency: 'weekly', taxCode: '1257L', basis: 'cumulative' };
    const lines = [{ name: 'Basic', kind: 'basic' as const, hours: '25', rate: '12' }];
    const alone = workOutTakeHome({ settings, lines, payDate: '2027-04-05' });
    expect([alone.period, formatPounds(alone.tax)]).toEqual([53, '11.60']);
    const covered = workOutTakeHome({
      settings,
      lines,
      payDate: '2027-04-05',
      soFar: { taxYear: '2026-27', period: 52, grossForTax: pounds('12000.00'), taxPaid: 0 },
    });
    expect(formatPounds(covered.tax)).toBe('0.00');
  });

  it('numbers pay every 2 and every 4 weeks as CWG2 says: week 2, 4… and week 4, 8…', () => {
    const at = (date: string, frequency: PayFrequency) =>
      payPeriodOf(parseDate(date), frequency, year).period;
    expect([at('2026-04-10', 'two-weekly'), at('2026-04-24', 'two-weekly')]).toEqual([2, 4]);
    expect([at('2026-04-19', 'two-weekly'), at('2026-04-20', 'two-weekly')]).toEqual([2, 4]);
    expect([at('2026-04-10', 'four-weekly'), at('2026-05-08', 'four-weekly')]).toEqual([4, 8]);
    expect([
      at('2026-04-06', 'monthly'),
      at('2026-05-05', 'monthly'),
      at('2026-05-06', 'monthly'),
    ]).toEqual([1, 1, 2]);
    expect([at('2027-04-05', 'monthly'), at('2027-04-05', 'weekly')]).toEqual([12, 53]);
    // £600.00 on the first payday every 2 weeks, 1257L: free pay 2 × £241.92 =
    // £483.84, so £116.16 → £116 at 20% = £23.20.
    const result = workOutTakeHome({
      settings: { frequency: 'two-weekly', taxCode: '1257L', basis: 'cumulative' },
      lines: [{ name: 'Basic', kind: 'basic', hours: '50', rate: '12' }],
      payDate: '2026-04-10',
    });
    expect([result.period, formatPounds(result.tax)]).toEqual([2, '23.20']);
  });

  it('reads tax codes as typed, and refuses ones that aren’t codes', () => {
    expect(
      ['1257L', 's1257l', 'C0T', 'BR', 'SD1', 'K475', 'NT', '1257L W1', '1257LM1'].map((text) => {
        const code = parseTaxCode(text);
        return [code.kind, code.kind === 'no-tax' ? 'uk' : code.regime, code.weekOne];
      }),
    ).toEqual([
      ['suffix', 'england-and-northern-ireland', false],
      ['suffix', 'scotland', false],
      ['suffix', 'wales', false],
      ['basic-rate', 'england-and-northern-ireland', false],
      ['d', 'scotland', false],
      ['k', 'england-and-northern-ireland', false],
      ['no-tax', 'uk', false],
      ['suffix', 'england-and-northern-ireland', true],
      ['suffix', 'england-and-northern-ireland', true],
    ]);
    for (const text of ['', 'K0', 'SNT', '1257P', 'L', 'X', '12570000L']) {
      expect(() => parseTaxCode(text)).toThrow(expect.objectContaining({ code: 'bad-tax-code' }));
    }
    // There's no D2 outside Scotland: it would be above the top rate.
    expect(() =>
      taxForPeriod({
        code: parseTaxCode('D2'),
        year,
        table: 'week',
        period: 1,
        nonCumulative: true,
        pay: pounds('100.00'),
        payToDateBefore: 0,
        taxToDateBefore: 0,
      }),
    ).toThrow(expect.objectContaining({ code: 'bad-tax-code' }));
  });
});
