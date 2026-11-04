// The take-home pay calculator (brief 4.15, step 2g): the owner's step 2g
// tests 3, 4 and 5 on the calculator's own figures, as well as on the
// screens. Brief 8.6's payslips, paid on Fridays 2 and 9 Oct 2026 (D6).

import { applyWrites, formatPounds, takeHomeAsEstimate } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import { runEdit, runEdits } from '../../lib/edit.ts';
import { workOutHome } from '../../lib/home.ts';
import {
  blankCalculator,
  blankPayslip,
  type CalculatorForm,
  calculatorFromPlan,
  checkPayslipForm,
  periodOf,
  saveWeekCommands,
  workOutCalculator,
} from '../../lib/pay-calculator.ts';
import { workOutPayView } from '../../lib/pay-view.ts';

const SUNDAY = '2026-10-25';
const name = (kind: string) => (kind === 'basic' ? 'Basic' : kind);
const pounds = (amount: number) => formatPounds(amount);

/** Week 26's settings and lines (brief 8.6), with the year so far from week 25's payslip. */
function week26(payDate: string): CalculatorForm {
  const blank = blankCalculator(payDate);
  return {
    ...blank,
    lines: [{ key: 'basic', kind: 'basic', hours: '34.5', rate: '12.71' }],
    extras: [{ key: 'premium', name: 'Shift premium', amount: '114.69' }],
    taxCode: '1257L',
    basis: 'cumulative',
    frequency: 'weekly',
    pension: true,
    pensionPercent: '4',
    pensionLower: '120',
    pensionUpper: '967',
    pensionWhen: 'before-tax',
    soFarPeriod: '25',
    grossSoFar: '7927.57',
    taxSoFar: '375.80',
  };
}

describe('test 3: week 26 from brief 8.6', () => {
  it('on Fri 30 Oct, the next payday: gross £553.19, tax £58.80, NI £24.89, pension £17.33, take-home £452.17', () => {
    const worked = workOutCalculator(week26('2026-10-30'), name);
    if (!worked.ok) throw new Error('It should work out.');
    const { result } = worked;
    expect(result.period).toBe(30);
    expect(
      [result.gross, result.tax, result.nationalInsurance, result.pension, result.takeHome].map(
        pounds,
      ),
    ).toEqual(['553.19', '58.80', '24.89', '17.33', '452.17']);
    // The last payslip is from week 25, so weeks 26 to 29 count as this pay (D124).
    expect([result.isEstimate, result.estimateReason]).toEqual([true, 'year-so-far-earlier']);
  });

  it('on Fri 2 Oct, tax week 26 itself, the same figures, and exact', () => {
    const worked = workOutCalculator(week26('2026-10-02'), name);
    if (!worked.ok) throw new Error('It should work out.');
    const { result } = worked;
    expect(result.period).toBe(26);
    expect(
      [result.gross, result.tax, result.nationalInsurance, result.pension, result.takeHome].map(
        pounds,
      ),
    ).toEqual(['553.19', '58.80', '24.89', '17.33', '452.17']);
    expect(result.isEstimate).toBe(false);
    // As week 26's payslip shows them after it (brief 8.6).
    expect([pounds(result.grossForTaxSoFar), pounds(result.taxPaidSoFar)]).toEqual([
      '8463.43',
      '434.60',
    ]);
  });

  it('without the year so far, says it is an estimate', () => {
    const form = { ...week26('2026-10-02'), grossSoFar: '', taxSoFar: '' };
    const worked = workOutCalculator(form, name);
    if (!worked.ok) throw new Error('It should work out.');
    expect([worked.result.isEstimate, worked.result.estimateReason]).toEqual([
      true,
      'no-year-so-far',
    ]);
  });

  it('says which box needs a change', () => {
    const form: CalculatorForm = {
      ...week26('2026-10-30'),
      taxCode: '1257Q',
      soFarPeriod: '31',
      taxSoFar: '',
      lines: [{ key: 'basic', kind: 'basic', hours: 'lots', rate: '12.71' }],
    };
    const worked = workOutCalculator(form, name);
    expect(worked.ok).toBe(false);
    expect(worked.ok === false && 'errors' in worked ? worked.errors : null).toEqual({
      taxCode: 'taxCodeError',
      'hours-basic': 'hoursError',
      taxSoFar: 'soFarBoth',
    });
    expect(periodOf('2027-04-06', 'weekly')).toBeNull();
  });
});

describe("test 4: added to Sam's plan as the Fri 30 Oct estimate", () => {
  it('replaces £603.06 with £452.17, so the lowest point is −£146.36 on Sun 1 Nov, Short, and Undo puts it back', () => {
    const view = workOutPayView(examplePlan, SUNDAY);
    const friday = view.paydays[0];
    expect([friday?.date, friday?.amount, friday?.isEstimate, friday?.weekId]).toEqual([
      '2026-10-30',
      60306,
      true,
      'week-26',
    ]);
    const worked = workOutCalculator(week26('2026-10-30'), name);
    if (!worked.ok || friday === undefined) throw new Error('It should work out.');
    const added = runEdit(examplePlan, SUNDAY, takeHomeAsEstimate(friday, worked.result));
    const home = workOutHome(added.records, SUNDAY);
    expect([home.lowest.balance, home.lowest.date, home.lowest.status]).toEqual([
      -14636,
      '2026-11-01',
      'short',
    ]);
    const undone = applyWrites(added.records, added.edit.undo);
    expect(workOutHome(undone, SUNDAY).lowest.balance).toBe(453);
  });

  it('starts the boxes from the plan: the warehouse job, rota week 1 and the week 29 payslip', () => {
    const view = workOutPayView(examplePlan, SUNDAY);
    const week = view.weeks.find((one) => one.id === view.paydays[0]?.weekId) ?? null;
    const form = calculatorFromPlan('2026-10-30', view.profile, week);
    expect(form.lines.map((line) => [line.kind, line.hours, line.rate])).toEqual([
      ['basic', '34.5', '12.71'],
    ]);
    expect(form.extras.map((one) => [one.name, one.amount])).toEqual([['Shift premium', '114.69']]);
    expect([form.taxCode, form.pensionPercent, form.pensionLower, form.pensionUpper]).toEqual([
      '1257L',
      '4',
      '120.00',
      '967.00',
    ]);
    expect([form.soFarPeriod, form.grossSoFar, form.taxSoFar]).toEqual([
      '29',
      '10732.73',
      '743.40',
    ]);
    expect(view.weeks.map((one) => one.name)).toEqual([
      'Rota week 1, 3 shifts',
      'Rota week 2, 4 shifts',
      'Rota week 3, 3 shifts',
      'Rota week 4, 4 shifts',
    ]);
  });

  it("Save as a pay week adds it to the warehouse job, leaving the pattern's weeks as they are", () => {
    const view = workOutPayView(examplePlan, SUNDAY);
    const worked = workOutCalculator(week26('2026-10-30'), name);
    if (!worked.ok || view.main === null) throw new Error('It should work out.');
    const commands = saveWeekCommands(worked.input, view.main, 'Short week', {
      weekId: 'short-week',
      profileId: 'unused',
    });
    expect(commands.map((one) => one.kind)).toEqual(['add-pay-week']);
    const saved = runEdits(examplePlan, SUNDAY, commands).records;
    expect(saved.payWeeks?.find((one) => one.id === 'short-week')).toMatchObject({
      name: 'Short week',
      payProfileId: 'warehouse',
      lines: [{ name: 'Basic', kind: 'basic', hours: '34.5', rate: '12.71' }],
      fixed: [{ name: 'Shift premium', amount: 11469 }],
    });
  });

  it('on pay with no tax settings, saves them too and links the week to every payday', () => {
    const plain = {
      ...examplePlan,
      payProfiles: [],
      payWeeks: [],
      series: examplePlan.series.map(
        ({ payProfileId: _profile, cyclePayWeeks: _weeks, ...one }) => one,
      ),
    };
    const view = workOutPayView(plain, SUNDAY);
    const worked = workOutCalculator(week26('2026-10-30'), name);
    if (!worked.ok || view.main === null) throw new Error('It should work out.');
    expect(view.main).toMatchObject({ payProfileId: null, steps: 4, hasPayWeeks: false });
    const commands = saveWeekCommands(worked.input, view.main, 'Usual week', {
      weekId: 'usual',
      profileId: 'job',
    });
    expect(commands.map((one) => one.kind)).toEqual([
      'add-pay-profile',
      'add-pay-week',
      'link-pay',
    ]);
    const saved = runEdits(plain, SUNDAY, commands).records;
    expect(saved.series.find((one) => one.id === 'pay')?.cyclePayWeeks).toEqual([
      'usual',
      'usual',
      'usual',
      'usual',
    ]);
    expect(saved.payProfiles?.[0]).toMatchObject({
      id: 'job',
      taxCode: '1257L',
      soFar: { taxYear: '2026-27', period: 25 },
    });
  });
});

describe("test 5: Check my payslip on week 27's payslip, with tax as £105.40 instead of £105.20", () => {
  const form: CalculatorForm = {
    ...week26('2026-10-09'),
    lines: [{ key: 'basic', kind: 'basic', hours: '46', rate: '12.71' }],
    extras: [{ key: 'premium', name: 'Shift premium', amount: '210.23' }],
    soFarPeriod: '26',
    grossSoFar: '8463.43',
    taxSoFar: '434.60',
  };

  it('lists only tax, 20p different', () => {
    const worked = workOutCalculator(form, name);
    if (!worked.ok) throw new Error('It should work out.');
    const checked = checkPayslipForm(worked.input, {
      ...blankPayslip,
      gross: '794.89',
      pension: '27.00',
      tax: '105.40',
      nationalInsurance: '44.23',
      takeHome: '618.46',
      grossForTaxSoFar: '9231.32',
      taxPaidSoFar: '539.80',
    });
    expect(checked).toEqual({
      ok: true,
      differences: [{ figure: 'tax', expected: 10520, onPayslip: 10540, difference: 20 }],
    });
  });

  it("doesn't list a 1p difference in National Insurance or take-home pay (D140)", () => {
    const worked = workOutCalculator(form, name);
    if (!worked.ok) throw new Error('It should work out.');
    const checked = checkPayslipForm(worked.input, {
      ...blankPayslip,
      nationalInsurance: '44.24',
      takeHome: '618.45',
      pension: '27.01',
    });
    expect(checked.ok && checked.differences.map((one) => one.figure)).toEqual(['pension']);
  });

  it('says which payslip box needs a change, or that nothing was typed', () => {
    const worked = workOutCalculator(form, name);
    if (!worked.ok) throw new Error('It should work out.');
    expect(checkPayslipForm(worked.input, { ...blankPayslip, tax: 'about £100' })).toEqual({
      ok: false,
      boxes: ['tax'],
    });
    expect(checkPayslipForm(worked.input, blankPayslip)).toEqual({ ok: false, none: true });
  });
});
