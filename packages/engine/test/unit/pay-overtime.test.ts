// "I did overtime" and "I missed a shift" (brief 4.3 and 8.6, D5, D7, D44,
// D123, D124, D130, D131): ARCHITECTURE.md tests 41 to 43, the step 1f owner
// test for a missed shift, and the owner's step 1g tests for the last day
// of work each payday covers and for a change to the extras.

import { describe, expect, it } from 'vitest';
import {
  balanceAtEndOf,
  type EditCommand,
  type EditInput,
  editPlan,
  formatDate,
  formatPounds,
  lastDayCovered,
  type PayAdjustment,
  type PayProfile,
  type PayWeek,
  type Plan,
  type PlanInput,
  parseDate,
  type Series,
  taxYearsOf,
  workOutPayChange,
  workOutPlan,
  workOutTakeHome,
} from '../../src/index.ts';
import { edited } from '../fixtures/edit.ts';
import { englandAndWales } from '../fixtures/holidays.ts';
import {
  basic,
  overtime,
  pounds,
  premium,
  samPayPlan,
  samPayProfile,
  samPayWeeks,
  samSettings,
} from '../fixtures/pay.ts';
import { accountOf, balanceUpdate, planInput } from '../fixtures/plan.ts';
import { series } from '../fixtures/series.ts';

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

function adjustmentOf(after: EditInput, id?: string): PayAdjustment {
  const found =
    id === undefined
      ? after.payAdjustments?.[0]
      : after.payAdjustments?.find((one) => one.id === id);
  if (found === undefined) throw new Error('No pay adjustment was saved.');
  return found;
}

/** The plan with a saved pay adjustment added. */
function applyAdjustment(input: EditInput, saved: PayAdjustment): PlanInput {
  return {
    ...input,
    to: '2027-02-28',
    payAdjustments: [...(input.payAdjustments ?? []), saved],
  } as PlanInput;
}

describe('test 3 (D5, D7): 11.5 hours at £19.07 worked Mon 26 Oct 2026, each payday covering work up to 5 days before', () => {
  const plan = samPayPlan();
  const { after } = edited(plan, overtimeOn26Oct);
  const saved = adjustmentOf(after);

  it('lands on Fri 6 Nov 2026', () => {
    // Fri 30 Oct pays for work up to Sun 25 Oct, the day before the shift.
    // Fri 6 Nov pays for work up to Sun 1 Nov, so it's the first payday
    // whose last day covered is on or after Mon 26 Oct (D131).
    const coveredTo = { kind: 'days-before', days: 5 } as const;
    expect(formatDate(lastDayCovered(coveredTo, parseDate('2026-10-30')))).toBe('2026-10-25');
    expect(formatDate(lastDayCovered(coveredTo, parseDate('2026-11-06')))).toBe('2026-11-01');
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
    // Fri 6 Nov pays for work up to Sun 1 Nov, before the shift. Fri 13 Nov
    // pays for work up to Sun 8 Nov, so it's the payday (D131), payment 2.
    // At week 28's basic rate, £12.71, the pay week's first basic line.
    expect([saved.number, saved.kind, saved.rate]).toEqual([2, 'missed-shift', '12.71']);
    // Worked by hand (D124): Fri 13 Nov is tax week 32, linked to week 28's lines:
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

describe('D131: the payday a shift is paid on, from the last day of work each payday covers', () => {
  const job = (coveredTo: PayProfile['coveredTo'], frequency: PayProfile['frequency']) =>
    ({
      id: 'job',
      frequency,
      taxCode: '1257L',
      basis: 'cumulative',
      overtimeRate: '18.00',
      ...(coveredTo === undefined ? {} : { coveredTo }),
    }) satisfies PayProfile;
  const usualWeek: PayWeek = { id: 'usual', payProfileId: 'job', lines: [basic('75')] };
  const plan = (pay: Series, profile: PayProfile, today: string): EditInput =>
    planInput({
      today,
      to: '2027-03-31',
      balanceUpdates: [balanceUpdate('current', '300.00', today)],
      series: [pay],
      mainPayFamilyId: pay.familyId,
      holidays: englandAndWales,
      payProfiles: [profile],
      payWeeks: [usualWeek],
      payAdjustments: [],
    });
  const shift = (workedOn: string, seriesId: string): EditCommand => ({
    kind: 'overtime',
    id: `overtime-${workedOn}`,
    seriesId,
    workedOn,
    hours: '6',
  });

  it('pay every 2 weeks on Fridays from Fri 6 Nov, covering work up to the Sunday before: Tue 3 Nov is paid on Fri 20 Nov', () => {
    const wages = series({
      id: 'wages',
      name: 'Wages',
      direction: 'in',
      amount: pounds('820.00'),
      start: '2026-11-06',
      schedule: { kind: 'weekly', every: 2 },
      type: 'pay',
      isEstimate: true,
      payProfileId: 'job',
      cyclePayWeeks: ['usual'],
    });
    const input = plan(wages, job({ kind: 'days-before', days: 5 }, 'two-weekly'), '2026-11-03');
    // Fri 6 Nov covers up to Sun 1 Nov, before the shift; Fri 20 Nov covers up to Sun 15 Nov.
    const saved = adjustmentOf(edited(input, shift('2026-11-03', 'wages')).after);
    expect(saved.number).toBe(1);
    const later = workOutPlan(applyAdjustment(input, saved));
    const wagesOn = (date: string) =>
      current(later).rows.find((row) => row.payment.seriesId === 'wages' && row.date === date);
    expect(wagesOn('2026-11-20')?.payment.payAdjustment).toBe(saved.change);
    expect(wagesOn('2026-11-06')?.payment.payAdjustment).toBeUndefined();
  });

  it('monthly pay on the last working day, covering work up to the 15th: Wed 16 Dec 2026 is paid on Fri 29 Jan 2027', () => {
    const salary = series({
      id: 'salary',
      name: 'Salary',
      direction: 'in',
      amount: pounds('2100.00'),
      start: '2026-10-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
      holidayRule: 'working-day-before',
      type: 'pay',
      isEstimate: true,
      payProfileId: 'job',
      cyclePayWeeks: ['usual'],
    });
    const coveredTo = { kind: 'day-of-month', day: 15 } as const;
    // Thu 31 Dec covers up to Tue 15 Dec, the day before the shift; Fri 29
    // Jan covers up to Fri 15 Jan.
    expect(formatDate(lastDayCovered(coveredTo, parseDate('2026-12-31')))).toBe('2026-12-15');
    expect(formatDate(lastDayCovered(coveredTo, parseDate('2027-01-29')))).toBe('2027-01-15');
    const input = plan(salary, job(coveredTo, 'monthly'), '2026-12-16');
    const saved = adjustmentOf(edited(input, shift('2026-12-16', 'salary')).after);
    // Fri 30 Oct is payment 0, so Fri 29 Jan 2027 is payment 3.
    expect(saved.number).toBe(3);
    const later = workOutPlan(applyAdjustment(input, saved));
    const salaryOn = (date: string) =>
      current(later).rows.find((row) => row.payment.seriesId === 'salary' && row.date === date);
    expect(salaryOn('2027-01-29')?.payment.payAdjustment).toBe(saved.change);
    expect(salaryOn('2026-12-31')?.payment.payAdjustment).toBeUndefined();
    // A shift on the 15th itself is still paid on Thu 31 Dec.
    expect(adjustmentOf(edited(input, shift('2026-12-15', 'salary')).after).number).toBe(2);
  });

  it('works out the last day of the month and a day the month is too short for', () => {
    expect(formatDate(lastDayCovered({ kind: 'last-day' }, parseDate('2027-01-29')))).toBe(
      '2027-01-31',
    );
    expect(
      formatDate(lastDayCovered({ kind: 'day-of-month', day: 31 }, parseDate('2027-02-26'))),
    ).toBe('2027-02-28');
    expect(
      formatDate(lastDayCovered({ kind: 'days-before', days: 0 }, parseDate('2026-11-06'))),
    ).toBe('2026-11-06');
  });

  it('uses the payday’s date from its schedule, so a payday moved for Christmas covers the same work', () => {
    // Sam's Fri 25 Dec pay lands on Thu 24 Dec with "working day before", but
    // still covers work up to Sun 20 Dec.
    const moved = samPayPlan({
      series: samPayPlan().series.map((one) =>
        one.id === 'pay' ? { ...one, holidayRule: 'working-day-before' as const } : one,
      ),
      holidays: englandAndWales,
    });
    const on20 = adjustmentOf(edited(moved, { ...overtimeOn26Oct, workedOn: '2026-12-20' }).after);
    const on21 = adjustmentOf(edited(moved, { ...overtimeOn26Oct, workedOn: '2026-12-21' }).after);
    // Fri 25 Dec is payment 8; Fri 1 Jan is payment 9.
    expect([on20.number, on21.number]).toEqual([8, 9]);
  });

  it('is refused without the last day covered, or with one that doesn’t suit the schedule', () => {
    const wages = series({
      id: 'wages',
      name: 'Wages',
      direction: 'in',
      amount: pounds('820.00'),
      start: '2026-11-06',
      schedule: { kind: 'weekly', every: 2 },
      type: 'pay',
      isEstimate: true,
      payProfileId: 'job',
      cyclePayWeeks: ['usual'],
    });
    expect(() =>
      editPlan(
        plan(wages, job(undefined, 'two-weekly'), '2026-11-03'),
        shift('2026-11-03', 'wages'),
      ),
    ).toThrow(expect.objectContaining({ code: 'no-covered-to' }));
    expect(() =>
      editPlan(
        plan(wages, job({ kind: 'day-of-month', day: 15 }, 'two-weekly'), '2026-11-03'),
        shift('2026-11-03', 'wages'),
      ),
    ).toThrow(expect.objectContaining({ code: 'covered-to-not-for-schedule' }));
  });

  it('refuses a last day covered that isn’t a day of the month or 0 to 62 days before', () => {
    for (const coveredTo of [
      { kind: 'days-before', days: 63 },
      { kind: 'days-before', days: -1 },
      { kind: 'day-of-month', day: 0 },
      { kind: 'day-of-month', day: 32 },
      { kind: 'weeks-behind', weeks: 1 },
    ]) {
      expect(() =>
        workOutPlan(
          samPayPlan({
            payProfiles: [{ ...samPayProfile, coveredTo } as unknown as PayProfile],
          }),
        ),
      ).toThrow(expect.objectContaining({ code: 'bad-pay-profile' }));
    }
  });
});

describe('D130: a change to the extras with "I missed a shift" or "I did overtime"', () => {
  const plan = samPayPlan();
  const missed: EditCommand = {
    kind: 'missed-shift',
    id: 'missed-3-nov',
    seriesId: 'pay',
    workedOn: '2026-11-03',
    hours: '11.5',
  };

  it('takes £47.43 of shift premium off Fri 13 Nov as well as the shift’s hours', () => {
    const saved = adjustmentOf(edited(plan, { ...missed, extras: pounds('47.43') }).after);
    // Worked by hand, as test 5 above, with the premium £142.29 − £47.43 = £94.86:
    //   gross £435.32 − £146.17 + £94.86 = £384.01; pension 4% × £264.01 = £10.5604 → £10.56
    //   pay for tax £373.45; week 32 so far £11,851.35 + £373.45 = £12,224.80
    //   − £7,741.44 = £4,483.36 → £4,483 → £896.60, less £870.20: tax £26.40
    //   NI (£384.01 − £242) × 8% = £11.3608 → £11.36
    //   take-home £384.01 − £10.56 − £26.40 − £11.36 = £335.69, against £468.86: −£133.17
    expect([saved.kind, saved.extras, formatPounds(saved.change)]).toEqual([
      'missed-shift',
      pounds('47.43'),
      '-133.17',
    ]);
    const later = workOutPlan(applyAdjustment(plan, saved));
    expect(formatPounds(payOn(later, '2026-11-13')?.change ?? 0)).toBe('335.89');
  });

  it('adds extras with overtime, the same as working it out with the extra premium', () => {
    const saved = adjustmentOf(edited(plan, { ...overtimeOn26Oct, extras: pounds('20.00') }).after);
    const soFar = samPayProfile.soFar;
    const usual = workOutTakeHome({
      settings: samSettings,
      ...(soFar === undefined ? {} : { soFar }),
      payDate: '2026-11-06',
      lines: [basic('46')],
      fixed: premium('210.23'),
    });
    const withBoth = workOutTakeHome({
      settings: samSettings,
      ...(soFar === undefined ? {} : { soFar }),
      payDate: '2026-11-06',
      lines: [basic('46'), overtime('11.5')],
      fixed: [...premium('210.23'), { name: 'Extra premium', amount: pounds('20.00') }],
      assumedPayBetween: usual.payForTax,
    });
    expect(saved.change).toBe(withBoth.takeHome - usual.takeHome);
    expect(saved.change).toBeGreaterThan(pounds('155.12'));
  });

  it('leaves the extras as they are when it’s left empty or £0.00', () => {
    for (const command of [missed, { ...missed, extras: 0 }]) {
      const saved = adjustmentOf(edited(plan, command).after);
      expect([saved.extras, formatPounds(saved.change)]).toEqual([undefined, '-100.43']);
    }
  });

  it('counts an earlier change to the extras on the same payday', () => {
    const first = edited(plan, { ...missed, extras: pounds('47.43') }).after;
    const second = adjustmentOf(
      edited(first, {
        ...missed,
        id: 'missed-4-nov',
        workedOn: '2026-11-04',
        extras: pounds('47.43'),
      }).after,
      'missed-4-nov',
    );
    // Both worked out at once, with the weeks in between counted as week
    // 28's own pay (D124): each shift is its own line, rounded on its own (D9).
    const soFar = samPayProfile.soFar;
    const base = {
      settings: samSettings,
      ...(soFar === undefined ? {} : { soFar }),
      payDate: '2026-11-13',
    };
    const usual = workOutTakeHome({ ...base, lines: [basic('34.25')], fixed: premium('142.29') });
    const missedLine = { ...basic('-11.5'), name: 'Missed shift' };
    const lost = { name: 'Extras with a missed shift', amount: -pounds('47.43') };
    const withBoth = workOutTakeHome({
      ...base,
      lines: [basic('34.25'), missedLine, missedLine],
      fixed: [...premium('142.29'), lost, lost],
      assumedPayBetween: usual.payForTax,
    });
    expect(adjustmentOf(first).change + second.change).toBe(withBoth.takeHome - usual.takeHome);
  });

  it('is refused for pay with no extras, and for more extras than the payday has', () => {
    const noExtras = samPayPlan({
      payWeeks: samPayWeeks.map((week) => ({ ...week, fixed: [] })),
    });
    expect(() => editPlan(noExtras, { ...missed, extras: pounds('10.00') })).toThrow(
      expect.objectContaining({ code: 'no-extras' }),
    );
    expect(() => editPlan(plan, { ...missed, extras: pounds('142.30') })).toThrow(
      expect.objectContaining({ code: 'too-much-extras' }),
    );
    expect(() => editPlan(plan, { ...missed, extras: -100 })).toThrow(
      expect.objectContaining({ code: 'negative-pence' }),
    );
  });
});

describe('D136: pay weeks after a new amount for this and all later ones', () => {
  const plan = samPayPlan();

  it('drops the pattern’s pay weeks with the pattern, so I did overtime asks for the usual hours', () => {
    // "Every payday from now" £600.00 from Fri 4 Dec (D90).
    const { after } = edited(plan, {
      kind: 'this-and-later',
      seriesId: 'pay',
      originalDate: '2026-12-04',
      edits: { amount: pounds('600.00') },
      newSeriesId: 'pay-from-december',
    });
    const fromDecember = after.series.find((one) => one.id === 'pay-from-december');
    expect([fromDecember?.amountCycle, fromDecember?.cyclePayWeeks]).toEqual([
      undefined,
      undefined,
    ]);
    // Paydays before it keep their pay weeks: Fri 6 Nov is still worked out from week 27.
    expect(adjustmentOf(edited(after, overtimeOn26Oct).after).change).toBe(pounds('155.12'));
    // From Fri 4 Dec there's no pay week to work it out from (D5).
    expect(() => editPlan(after, { ...overtimeOn26Oct, workedOn: '2026-12-01' })).toThrow(
      expect.objectContaining({ code: 'no-pay-week' }),
    );
  });

  it('keeps one pay week on every step when only this week of the pattern changes (D97)', () => {
    // Sam's pay with its pattern to Thu 3 Dec, then one amount from Fri 4 Dec
    // (payment 5) that's worked out from week 27 every payday.
    const {
      amountCycle: _pattern,
      cycleOffset: _offset,
      ...pay
    } = plan.series.find((one) => one.id === 'pay') as Series;
    const split = samPayPlan({
      series: [
        ...plan.series.map((one) =>
          one.id === 'pay' ? { ...one, end: { kind: 'on' as const, date: '2026-12-03' } } : one,
        ),
        {
          ...pay,
          id: 'pay-from-december',
          amount: pounds('600.00'),
          cyclePayWeeks: ['week-27'],
          start: '2026-12-04',
          firstNumber: 5,
          splitFrom: 'pay',
        },
      ],
    });
    // Only this week of the pattern, from Fri 6 Nov: £640.00 on its step.
    const { after } = edited(split, {
      kind: 'this-and-later',
      seriesId: 'pay',
      originalDate: '2026-11-06',
      edits: { stepAmount: pounds('640.00') },
      newSeriesId: 'pay-step',
    });
    const later = after.series.find((one) => one.id === 'pay-from-december');
    // Its one amount becomes a pattern of four, and its one pay week goes with every step.
    expect(later?.amountCycle).toHaveLength(4);
    expect(later?.cyclePayWeeks).toEqual(['week-27', 'week-27', 'week-27', 'week-27']);
    expect(() => workOutPlan(after as PlanInput)).not.toThrow();
  });
});
