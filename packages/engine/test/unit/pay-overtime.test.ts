// "I did overtime" and "I missed a shift" (brief 4.3 and 8.6, D5, D7, D44,
// D123 to D125): ARCHITECTURE.md tests 41 to 43, and the step 1f owner test
// for a missed shift.

import { describe, expect, it } from 'vitest';
import {
  balanceAtEndOf,
  type EditCommand,
  type EditInput,
  editPlan,
  formatDate,
  formatPounds,
  MONDAY,
  type PayAdjustment,
  type Plan,
  parseDate,
  SATURDAY,
  shiftPaidFrom,
  taxYearsOf,
  workOutPayChange,
  workOutPlan,
  workOutTakeHome,
} from '../../src/index.ts';
import { edited } from '../fixtures/edit.ts';
import { basic, overtime, pounds, premium, samPayPlan, samSettings } from '../fixtures/pay.ts';
import { accountOf } from '../fixtures/plan.ts';

const current = (plan: Plan) => accountOf(plan, 'current');
const payOn = (plan: Plan, date: string) =>
  current(plan).rows.find((row) => row.payment.seriesId === 'pay' && row.date === date);

const overtimeOn26Oct: EditCommand = {
  kind: 'overtime',
  id: 'overtime-26-oct',
  seriesId: 'pay',
  workedOn: '2026-10-26',
  hours: '11.5',
};

function adjustmentOf(after: EditInput): PayAdjustment {
  const found = after.payAdjustments?.[0];
  if (found === undefined) throw new Error('No pay adjustment was saved.');
  return found;
}

describe('test 3 (D5, D7): 11.5 hours at £19.07 worked Mon 26 Oct 2026, pay one week behind', () => {
  const plan = samPayPlan();
  const { after } = edited(plan, overtimeOn26Oct);
  const saved = adjustmentOf(after);

  it('lands on Fri 6 Nov 2026', () => {
    // Mon 26 Oct is in the working week from Mon 26 Oct. One week behind,
    // it's paid from Mon 2 Nov, on the first payday then: Fri 6 Nov.
    expect(formatDate(shiftPaidFrom(parseDate('2026-10-26'), MONDAY, 1))).toBe('2026-11-02');
    // The same with a working week from Saturday: from Sat 31 Oct, so Fri 6 Nov again.
    expect(formatDate(shiftPaidFrom(parseDate('2026-10-26'), SATURDAY, 1))).toBe('2026-10-31');
    // Fri 6 Nov is the pay series' payment 1 (Fri 30 Oct is payment 0).
    expect([saved.familyId, saved.number, saved.kind, saved.rate]).toEqual([
      'pay',
      1,
      'overtime',
      '19.07',
    ]);
  });

  it('raises that payday by £155.23, within £1, on week 27’s lines', () => {
    // Worked by hand from the GOV.UK figures (D124): Fri 6 Nov is tax week
    // 31. The last payslip is week 29 (£10,732.73 and £743.40), so week 30
    // counts as paid week 27's pay for tax, £794.89 − £27.00 = £767.89:
    //   week 30: £11,500.62 − 30 × £241.92 = £4,243.02, so £4,243 at 20% = £848.60 tax so far
    //   week 31 without: £12,268.51 − 31 × £241.92 = £4,768.99, so £4,768 → £953.60, tax £105.00
    //   week 31 with: + 11.5 × £19.07 = £219.31 (219.305, rounded once, D9). Pension
    //   4% × (£967 − £120) = £33.88, so pay for tax £1,014.20 − £33.88 = £980.32;
    //   £12,480.94 − £7,499.52 = £4,981.42, so £4,981 → £996.20, tax £147.60
    //   National Insurance: without (£794.89 − £242) × 8% = £44.2312 → £44.23;
    //   with (£967 − £242) × 8% = £58.00 plus (£1,014.20 − £967) × 2% = £0.944 → £0.94
    //   Change: £219.31 − £6.88 pension − £42.60 tax − £14.71 NI = £155.12
    expect(formatPounds(saved.change)).toBe('155.12');
    expect(Math.abs(saved.change - pounds('155.23'))).toBeLessThanOrEqual(100);
  });

  it('adds it to Fri 6 Nov in the plan, and every balance from then on rises by the same', () => {
    const before = workOutPlan(plan);
    const later = workOutPlan(after as typeof plan);
    expect(formatPounds(payOn(later, '2026-11-06')?.change ?? 0)).toBe(
      formatPounds(pounds('618.46') + saved.change),
    );
    expect(payOn(later, '2026-11-06')?.payment.payAdjustment).toBe(saved.change);
    for (const date of ['2026-11-05', '2026-11-06', '2026-12-31', '2027-02-28']) {
      const rise = balanceAtEndOf(current(later), date) - balanceAtEndOf(current(before), date);
      expect([date, rise]).toEqual([date, date < '2026-11-06' ? 0 : saved.change]);
    }
  });

  it('gives £150.89, within £1, on week 26’s lines, which is how Fri 30 Oct became £603.06', () => {
    // On the week 26 payslip itself, with the year so far to week 25
    // (£7,927.57 and £375.80, from the brief's columns):
    //   with: £553.19 + £219.31 = £772.50; pension 4% × £652.50 = £26.10;
    //   £7,927.57 + £746.40 = £8,673.97 − 26 × £241.92 = £2,384.05, so £2,384 → £476.80, tax £101.00
    //   NI (£772.50 − £242) × 8% = £42.44, against £24.89 without
    //   take-home £772.50 − £26.10 − £101.00 − £42.44 = £602.96, against £452.17: £150.79
    const change = workOutPayChange(
      {
        settings: samSettings,
        soFar: {
          taxYear: '2026-27',
          period: 25,
          grossForTax: pounds('7927.57'),
          taxPaid: pounds('375.80'),
        },
        payDate: '2026-10-02',
        lines: [basic('34.5')],
        fixed: premium('114.69'),
        earlier: [],
        change: overtime('11.5'),
      },
      taxYearsOf(),
    );
    expect(formatPounds(change.without.takeHome)).toBe('452.17');
    expect(formatPounds(change.change)).toBe('150.79');
    expect(Math.abs(change.change - pounds('150.89'))).toBeLessThanOrEqual(100);
  });

  it('gives the same on Sam’s plan when Fri 6 Nov is linked to week 26’s lines instead', () => {
    const linked26 = samPayPlan({}, ['week-26', 'week-26', 'week-28', 'week-27']);
    const change = adjustmentOf(edited(linked26, overtimeOn26Oct).after).change;
    // Week 30 counts as week 26's pay for tax (£535.86), and week 31 has the
    // overtime on week 26's lines: the change is again within £1 of £150.89.
    expect(Math.abs(change - pounds('150.89'))).toBeLessThanOrEqual(100);
  });

  it('is one undo step', () => {
    const edit = editPlan(plan, overtimeOn26Oct);
    const { after: undone } = edited(after, { kind: 'undo', edit });
    expect(undone.payAdjustments).toEqual([]);
  });

  it('is removed by Remove, and the payday goes back to £618.46', () => {
    const { after: removed } = edited(after, { kind: 'remove-pay-adjustment', id: saved.id });
    expect(payOn(workOutPlan(removed as typeof plan), '2026-11-06')?.change).toBe(pounds('618.46'));
  });

  it('counts a second shift on the same payday on top of the first, adding up exactly', () => {
    const both = edited(after, {
      ...overtimeOn26Oct,
      id: 'overtime-27-oct',
      workedOn: '2026-10-27',
    }).after;
    const second = both.payAdjustments?.find((one) => one.id === 'overtime-27-oct');
    expect(second?.number).toBe(1);
    // Both shifts worked out at once, with the weeks in between counted as
    // week 27's own pay (D124), change Fri 6 Nov by the two saved changes added up.
    const soFar = {
      taxYear: '2026-27',
      period: 29,
      grossForTax: pounds('10732.73'),
      taxPaid: pounds('743.40'),
    };
    const usual = workOutTakeHome({
      settings: samSettings,
      soFar,
      payDate: '2026-11-06',
      lines: [basic('46')],
      fixed: premium('210.23'),
    });
    const withBoth = workOutTakeHome({
      settings: samSettings,
      soFar,
      payDate: '2026-11-06',
      lines: [basic('46'), overtime('11.5'), overtime('11.5')],
      fixed: premium('210.23'),
      assumedPayBetween: usual.payForTax,
    });
    expect(saved.change + (second?.change ?? 0)).toBe(withBoth.takeHome - usual.takeHome);
    const later = workOutPlan(both as typeof plan);
    expect(payOn(later, '2026-11-06')?.change).toBe(
      withBoth.takeHome - usual.takeHome + pounds('618.46'),
    );
  });
});

describe('test 5 (D44): "I missed a shift"', () => {
  const plan = samPayPlan();
  const missed: EditCommand = {
    kind: 'missed-shift',
    id: 'missed-3-nov',
    seriesId: 'pay',
    workedOn: '2026-11-03',
    hours: '11.5',
  };
  const { after } = edited(plan, missed);
  const saved = adjustmentOf(after);

  it('takes the shift’s pay off the right payday: Tue 3 Nov is paid on Fri 13 Nov', () => {
    // Working week from Mon 2 Nov, one week behind: from Mon 9 Nov, so Fri 13 Nov, payment 2.
    // At week 28's basic rate, £12.71, the pay week's first basic line.
    expect([saved.number, saved.kind, saved.rate]).toEqual([2, 'missed-shift', '12.71']);
    // Worked by hand (D124, D125): Fri 13 Nov is tax week 32, linked to week 28's lines:
    //   without: 34.25 h × £12.71 = £435.3175 → £435.32, + £142.29 = £577.61; pension £18.30
    //   with: minus 11.5 h × £12.71 = −£146.165 → −£146.17, so £431.44; pension
    //   4% × (£431.44 − £120) = £12.4576 → £12.46
    //   weeks 30 and 31 count as paid £577.61 − £18.30 = £559.31 for tax:
    //   week 30: £11,292.04 − £7,257.60 = £4,034.44 → £4,034 → £806.80 so far
    //   week 31: £11,851.35 − £7,499.52 = £4,351.83 → £4,351 → £870.20 so far
    //   week 32 without: £12,410.66 − 32 × £241.92 (£7,741.44) = £4,669.22 → £933.80, tax £63.60
    //   week 32 with: £11,851.35 + £418.98 = £12,270.33 − £7,741.44 = £4,528.89 → £905.60, tax £35.40
    //   NI without (£577.61 − £242) × 8% = £26.8488 → £26.85; with (£431.44 − £242) × 8%
    //   = £15.1552 → £15.15 (third decimal 5 rounds down)
    //   take-home without £577.61 − £18.30 − £63.60 − £26.85 = £468.86
    //   take-home with £431.44 − £12.46 − £35.40 − £15.15 = £368.43
    //   change −£100.43
    expect(formatPounds(saved.change)).toBe('-100.43');
    const later = workOutPlan(after as typeof plan);
    expect(formatPounds(payOn(later, '2026-11-13')?.change ?? 0)).toBe('368.63');
    // The paydays either side keep their amounts.
    expect([payOn(later, '2026-11-06')?.change, payOn(later, '2026-11-20')?.change]).toEqual([
      pounds('618.46'),
      pounds('592.17'),
    ]);
  });

  it('does nothing once that payday’s real amount has been typed in', () => {
    const real = edited(after, {
      kind: 'just-this-one',
      seriesId: 'pay',
      originalDate: '2026-11-13',
      edits: { amount: pounds('470.00'), isEstimate: false },
    }).after;
    const later = workOutPlan(real as typeof plan);
    // The real amount stands, and the saved missed shift no longer counts (D44).
    expect(payOn(later, '2026-11-13')?.change).toBe(pounds('470.00'));
    expect(payOn(later, '2026-11-13')?.payment.payAdjustment).toBeUndefined();
    // A new missed shift for that payday is refused.
    expect(() => editPlan(real, { ...missed, id: 'missed-4-nov', workedOn: '2026-11-04' })).toThrow(
      expect.objectContaining({ code: 'payday-not-estimate' }),
    );
  });

  it('is refused when the payday has no saved pay week, or the pay has no profile', () => {
    const unlinked = samPayPlan({}, ['week-26', 'week-27', 'week-28', 'week-27']);
    const noWeeks = {
      ...unlinked,
      series: unlinked.series.map((one) =>
        one.id === 'pay' ? { ...one, cyclePayWeeks: undefined } : one,
      ),
    };
    expect(() => editPlan(noWeeks as EditInput, missed)).toThrow(
      expect.objectContaining({ code: 'no-pay-week' }),
    );
    const noProfile = {
      ...noWeeks,
      series: noWeeks.series.map((one) =>
        one.id === 'pay' ? { ...one, payProfileId: undefined } : one,
      ),
    };
    expect(() => editPlan(noProfile as EditInput, missed)).toThrow(
      expect.objectContaining({ code: 'no-pay-profile' }),
    );
  });
});
