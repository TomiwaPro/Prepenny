// "Only this week of the pattern" (D97) and where later payments go after a
// new date for this and all later ones (D96). Both come from the owner's
// review of step 1c.

import { describe, expect, it } from 'vitest';
import {
  type EditCommand,
  type EditInput,
  EngineInputError,
  editPlan,
  formatPounds,
  type Payment,
  type Schedule,
  scheduleForNewDate,
  sumPence,
  workOutPayments,
  workOutPlan,
} from '../../src/index.ts';
import {
  canonical,
  edited,
  editedInTurn,
  halvesProblems,
  paymentsOfSeries,
} from '../fixtures/edit.ts';
import { noBankHolidays } from '../fixtures/holidays.ts';
import { account, accountOf, balanceUpdate, planInput, pounds } from '../fixtures/plan.ts';
import { samPlan, samViewEnd } from '../fixtures/sam.ts';
import { series } from '../fixtures/series.ts';

const sam = samPlan();

function refusedWith(code: string, input: EditInput, command: EditCommand): void {
  let error: unknown = null;
  try {
    editPlan(input, command);
  } catch (caught) {
    error = caught;
  }
  expect(error, `expected a refusal: ${code}`).toBeInstanceOf(EngineInputError);
  expect((error as EngineInputError).code).toBe(code);
}

/** Every payday of Sam's pay family in the view, as [date, pounds]. */
function paydays(input: EditInput): [string, string][] {
  return workOutPayments({
    series: input.series,
    changes: input.changes ?? [],
    holidays: input.holidays,
    from: '2026-10-25',
    to: samViewEnd,
  })
    .filter((p) => p.name === 'Pay')
    .map((p) => [p.date, formatPounds(p.amount)]);
}

const totalPay = (input: EditInput) =>
  formatPounds(sumPence(paydays(input).map(([, amount]) => pounds(amount))));

const sixthOfNov: EditCommand = {
  kind: 'this-and-later',
  seriesId: 'pay',
  originalDate: '2026-11-06',
  edits: { stepAmount: pounds('640.00') },
  newSeriesId: 'pay-from-6-nov',
};

describe('owner test 6 (D97): Sam changes his Fri 6 Nov pay to £640.00, only this week of the pattern', () => {
  const { edit, after } = edited(sam, sixthOfNov);
  const was = new Map(paydays(sam));

  it('makes Fri 6 Nov, 4 Dec, 1 Jan, 29 Jan and 26 Feb £640.00', () => {
    const at640 = paydays(after).filter(([, amount]) => amount === '640.00');
    expect(at640.map(([date]) => date)).toEqual([
      '2026-11-06',
      '2026-12-04',
      '2027-01-01',
      '2027-01-29',
      '2027-02-26',
    ]);
  });

  it('keeps every other payday at its amount', () => {
    const others = paydays(after).filter(([, amount]) => amount !== '640.00');
    expect(others).toHaveLength(13);
    for (const [date, amount] of others) {
      expect(amount, date).toBe(was.get(date));
    }
    expect(paydays(after).map(([date]) => date)).toEqual([...was.keys()]);
  });

  it('makes total pay in the view £9,856.66, from £9,748.96, still 18 paydays', () => {
    expect(totalPay(sam)).toBe('9748.96');
    expect(totalPay(after)).toBe('9856.66');
    expect(paydays(after)).toHaveLength(18);
  });

  it('splits the series at Fri 6 Nov and changes only step 2 of the pattern', () => {
    expect(after.series.find((one) => one.id === 'pay')?.end).toEqual({
      kind: 'on',
      date: '2026-11-05',
    });
    expect(after.series.find((one) => one.id === 'pay-from-6-nov')).toMatchObject({
      start: '2026-11-06',
      firstNumber: 1,
      familyId: 'pay',
      splitFrom: 'pay',
      amountCycle: [pounds('452.17'), pounds('640.00'), pounds('469.06'), pounds('592.17')],
      cycleOffset: 0,
      isEstimate: true,
    });
    // The first pay's £603.06 one-off change stays where it was.
    expect(after.changes?.find((c) => c.seriesId === 'pay')).toEqual({
      seriesId: 'pay',
      originalDate: '2026-10-30',
      amount: pounds('603.06'),
    });
  });

  it('raises the balance by £21.54 from each £640.00 payday on', () => {
    const before = accountOf(workOutPlan(sam));
    const now = accountOf(workOutPlan(after));
    const moved = (date: string) =>
      formatPounds(
        (now.days.find((d) => d.date === date)?.balance ?? Number.NaN) -
          (before.days.find((d) => d.date === date)?.balance ?? Number.NaN),
      );
    expect(
      ['2026-11-05', '2026-11-06', '2026-12-03', '2026-12-04', '2027-02-28'].map(moved),
    ).toEqual(['0.00', '21.54', '21.54', '43.08', '107.70']);
  });

  it('is one undo step', () => {
    const back = editPlan(after, { kind: 'undo', edit });
    expect(canonical(edited(after, { kind: 'undo', edit }).after)).toEqual(canonical(sam));
    expect(back.writes.length).toBe(edit.writes.length);
  });
});

describe('D97: how only this week of the pattern works', () => {
  it("changes the whole series' step on its first payment, with no split", () => {
    const { after } = edited(sam, { ...sixthOfNov, originalDate: '2026-10-30' });
    expect(after.series.map((one) => one.id)).toEqual(sam.series.map((one) => one.id));
    expect(after.series.find((one) => one.id === 'pay')?.amountCycle).toEqual([
      pounds('640.00'),
      pounds('618.46'),
      pounds('469.06'),
      pounds('592.17'),
    ]);
    // The £603.06 one-off is on the step that changed, so it goes (D60).
    expect(after.changes?.some((c) => c.seriesId === 'pay')).toBe(false);
    expect(
      paydays(after)
        .slice(0, 5)
        .map(([, amount]) => amount),
    ).toEqual(['640.00', '618.46', '469.06', '592.17', '640.00']);
  });

  it('uses the pattern offset to find the step', () => {
    const pay = series({
      id: 'pay',
      direction: 'in',
      type: 'pay',
      amount: 0,
      amountCycle: [100, 200, 300],
      cycleOffset: 2,
      start: '2026-11-06',
      schedule: { kind: 'weekly', every: 1 },
    });
    const input = planInput({
      today: '2026-11-01',
      to: '2027-01-31',
      balanceUpdates: [balanceUpdate('current', '0.00', '2026-11-01')],
      series: [pay],
    });
    // Payment 1 (Fri 13 Nov) is step (1 + 2) mod 3 = 0: 100.
    const { after } = edited(input, {
      kind: 'this-and-later',
      seriesId: 'pay',
      originalDate: '2026-11-13',
      edits: { stepAmount: 150 },
      newSeriesId: 'pay-2',
    });
    expect(
      paymentsOfSeries(after, 'pay', '2026-11-01', '2026-12-31')
        .concat(paymentsOfSeries(after, 'pay-2', '2026-11-01', '2026-12-31'))
        .map((p) => [p.date, p.amount]),
    ).toEqual([
      ['2026-11-06', 300],
      ['2026-11-13', 150],
      ['2026-11-20', 200],
      ['2026-11-27', 300],
      ['2026-12-04', 150],
      ['2026-12-11', 200],
      ['2026-12-18', 300],
      ['2026-12-25', 150],
    ]);
  });

  it('reaches a later series that still has the pattern (D88)', () => {
    const after = editedInTurn(sam, [
      {
        kind: 'this-and-later',
        seriesId: 'pay',
        originalDate: '2026-12-04',
        edits: { note: 'New rota' },
        newSeriesId: 'pay-from-dec',
      },
      sixthOfNov,
    ]);
    expect(totalPay(after)).toBe('9856.66');
    expect(after.series.find((one) => one.id === 'pay-from-dec')?.amountCycle?.[1]).toBe(
      pounds('640.00'),
    );
  });

  it('gives a later series with one amount a pattern: its own amount, and the new one on this step', () => {
    const after = editedInTurn(sam, [
      {
        kind: 'this-and-later',
        seriesId: 'pay',
        originalDate: '2027-01-01',
        edits: { amount: pounds('600.00') },
        newSeriesId: 'pay-from-jan',
      },
      sixthOfNov,
    ]);
    expect(after.series.find((one) => one.id === 'pay-from-jan')).toMatchObject({
      amount: pounds('600.00'),
      amountCycle: [pounds('600.00'), pounds('640.00'), pounds('600.00'), pounds('600.00')],
    });
    expect(paydays(after).filter(([date]) => date >= '2027-01-01')).toEqual([
      ['2027-01-01', '640.00'],
      ['2027-01-08', '600.00'],
      ['2027-01-15', '600.00'],
      ['2027-01-22', '600.00'],
      ['2027-01-29', '640.00'],
      ['2027-02-05', '600.00'],
      ['2027-02-12', '600.00'],
      ['2027-02-19', '600.00'],
      ['2027-02-26', '640.00'],
    ]);
  });

  it('drops one-off amounts only on payments of that step, from this one on (D60)', () => {
    const setUp = editedInTurn(sam, [
      // Step 2, after 6 Nov: replaced.
      {
        kind: 'just-this-one',
        seriesId: 'pay',
        originalDate: '2026-12-04',
        edits: { amount: pounds('700.00'), note: 'Bonus week' },
      },
      // Step 3: stays.
      {
        kind: 'just-this-one',
        seriesId: 'pay',
        originalDate: '2026-12-11',
        edits: { amount: pounds('500.00') },
      },
    ]);
    const { after } = edited(setUp, sixthOfNov);
    const byDate = new Map(paydays(after));
    expect([byDate.get('2026-12-04'), byDate.get('2026-12-11')]).toEqual(['640.00', '500.00']);
    // The note on 4 Dec isn't an amount, so it stays.
    expect(after.changes?.filter((c) => c.seriesId === 'pay-from-6-nov')).toEqual([
      { seriesId: 'pay-from-6-nov', originalDate: '2026-12-04', note: 'Bonus week' },
      { seriesId: 'pay-from-6-nov', originalDate: '2026-12-11', amount: pounds('500.00') },
    ]);
  });

  describe('a different last amount', () => {
    const instalments = series({
      id: 'loan',
      amount: 0,
      amountCycle: [1000, 2000],
      lastAmount: 500,
      start: '2026-11-02',
      schedule: { kind: 'weekly', every: 1 },
      end: { kind: 'after', payments: 5 },
    });
    const input = planInput({
      today: '2026-11-01',
      to: '2026-12-31',
      balanceUpdates: [balanceUpdate('current', '100.00', '2026-11-01')],
      series: [instalments],
    });
    const amounts = (records: EditInput) =>
      workOutPayments({
        series: records.series,
        changes: records.changes ?? [],
        holidays: noBankHolidays,
        from: '2026-11-01',
        to: '2026-12-31',
      }).map((p: Payment) => p.amount);

    it('stays when an earlier payment of the same step changes', () => {
      expect(amounts(input)).toEqual([1000, 2000, 1000, 2000, 500]);
      const { after } = edited(input, {
        kind: 'this-and-later',
        seriesId: 'loan',
        originalDate: '2026-11-09',
        edits: { stepAmount: 2500 },
        newSeriesId: 'loan-2',
      });
      expect(amounts(after)).toEqual([1000, 2500, 1000, 2500, 500]);
    });

    it('goes when the last payment is the one changed', () => {
      const { after } = edited(input, {
        kind: 'this-and-later',
        seriesId: 'loan',
        originalDate: '2026-11-30',
        edits: { stepAmount: 900 },
        newSeriesId: 'loan-2',
      });
      expect(amounts(after)).toEqual([1000, 2000, 1000, 2000, 900]);
    });
  });

  it('keeps both halves of a private transfer in step (D94)', () => {
    const monthly: Schedule = { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } };
    const pattern = {
      amount: 0,
      amountCycle: [30000, 60000],
      start: '2026-10-28',
      schedule: monthly,
    };
    const input = planInput({
      today: '2026-10-26',
      to: '2027-03-31',
      accounts: [account('jess'), account('joint', { kind: 'joint' })],
      balanceUpdates: [
        balanceUpdate('jess', '310.00', '2026-10-26'),
        balanceUpdate('joint', '95.00', '2026-10-26'),
      ],
      series: [
        series({ ...pattern, id: 'to-joint', accountId: 'jess', name: 'To the joint account' }),
        series({
          ...pattern,
          id: 'from-jess',
          accountId: 'joint',
          name: 'From Jess',
          direction: 'in',
          mirrorOf: 'to-joint',
        }),
      ],
    });
    const { after } = edited(input, {
      kind: 'this-and-later',
      seriesId: 'from-jess',
      originalDate: '2026-12-28',
      edits: { stepAmount: 45000 },
      newSeriesId: 'from-jess-2',
      newOtherHalfSeriesId: 'to-joint-2',
    });
    expect(halvesProblems(after, '2026-10-01', '2027-12-31')).toEqual([]);
    expect(
      paymentsOfSeries(after, 'to-joint-2', '2026-12-01', '2027-04-30').map((p) => p.amount),
    ).toEqual([45000, 60000, 45000, 60000, 45000]);
  });

  it('refuses a series with no pattern, both kinds of new amount at once, and patterns of different lengths', () => {
    refusedWith('no-pattern', sam, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2027-01-01',
      edits: { stepAmount: pounds('560.00') },
      newSeriesId: 'rent-2',
    });
    refusedWith('bad-command', sam, {
      ...sixthOfNov,
      edits: { amount: pounds('640.00'), stepAmount: pounds('640.00') },
    } as EditCommand);
    // Records made outside the engine, with a later series on a 3-step pattern.
    const odd = editedInTurn(sam, [
      {
        kind: 'this-and-later',
        seriesId: 'pay',
        originalDate: '2027-01-01',
        edits: { note: 'Split' },
        newSeriesId: 'pay-from-jan',
      },
    ]);
    const changed = {
      ...odd,
      series: odd.series.map((one) =>
        one.id === 'pay-from-jan' ? { ...one, amountCycle: [100, 200, 300] } : one,
      ),
    };
    refusedWith('patterns-differ', changed, sixthOfNov);
  });
});

describe('D96: where later payments go after a new date for this and all later ones', () => {
  it('keeps a weekly schedule, so later payments take the new weekday', () => {
    const weekly: Schedule = { kind: 'weekly', every: 2 };
    expect(scheduleForNewDate(weekly, '2026-11-06', '2026-11-07')).toBe(weekly);
    expect(scheduleForNewDate({ kind: 'irregular' }, '2026-11-02', '2026-11-03')).toEqual({
      kind: 'irregular',
    });
    const { after } = edited(sam, {
      kind: 'this-and-later',
      seriesId: 'pay',
      originalDate: '2026-12-04',
      edits: {
        date: '2026-12-03',
        schedule: scheduleForNewDate({ kind: 'weekly', every: 1 }, '2026-12-04', '2026-12-03'),
      },
      newSeriesId: 'pay-thursdays',
    });
    expect(
      paydays(after)
        .slice(4, 8)
        .map(([date]) => date),
    ).toEqual(['2026-11-27', '2026-12-03', '2026-12-10', '2026-12-17']);
  });

  it("gives any monthly schedule the new date's day of the month, keeping months left out", () => {
    expect(
      scheduleForNewDate(
        { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
        '2026-12-31',
        '2026-12-03',
      ),
    ).toEqual({ kind: 'monthly', every: 1, on: { kind: 'day', day: 3 } });
    expect(
      scheduleForNewDate(
        {
          kind: 'monthly',
          every: 1,
          on: { kind: 'weekday', weekday: 1, position: 1 },
          leaveOut: [2, 3],
        },
        '2027-01-04',
        '2027-01-15',
      ),
    ).toEqual({ kind: 'monthly', every: 1, on: { kind: 'day', day: 15 }, leaveOut: [2, 3] });

    const { after } = edited(sam, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2027-01-01',
      edits: {
        date: '2027-01-03',
        schedule: scheduleForNewDate(
          { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
          '2027-01-01',
          '2027-01-03',
        ),
      },
      newSeriesId: 'rent-3rd',
    });
    expect(
      workOutPayments({
        series: after.series,
        holidays: noBankHolidays,
        from: '2026-11-01',
        to: '2027-03-31',
      })
        .filter((p) => p.name === 'Rent')
        .map((p) => p.date),
    ).toEqual(['2026-11-01', '2026-12-01', '2027-01-03', '2027-02-03', '2027-03-03']);
  });

  it("changes only that one date for chosen dates, like Ali's student loan", () => {
    const terms: Schedule = { kind: 'dates', dates: ['2026-09-21', '2027-01-11', '2027-04-26'] };
    const loan = series({
      id: 'student-loan',
      direction: 'in',
      type: 'other',
      amount: pounds('1500.00'),
      start: '2026-09-21',
      schedule: terms,
    });
    const input = planInput({
      today: '2026-10-25',
      to: '2027-06-30',
      balanceUpdates: [balanceUpdate('current', '800.00', '2026-10-25')],
      series: [loan],
    });
    const schedule = scheduleForNewDate(terms, '2027-01-11', '2027-01-18');
    expect(schedule).toEqual({ kind: 'dates', dates: ['2026-09-21', '2027-01-18', '2027-04-26'] });
    const { after } = edited(input, {
      kind: 'this-and-later',
      seriesId: 'student-loan',
      originalDate: '2027-01-11',
      edits: { date: '2027-01-18', schedule },
      newSeriesId: 'student-loan-2',
    });
    expect(
      workOutPayments({
        series: after.series,
        holidays: noBankHolidays,
        from: '2026-09-01',
        to: '2027-06-30',
      }).map((p) => p.date),
    ).toEqual(['2026-09-21', '2027-01-18', '2027-04-26']);
    expect(() => scheduleForNewDate(terms, '2027-01-12', '2027-01-18')).toThrow(EngineInputError);
  });

  it('keeps a payment that happens once as it is, so it simply moves', () => {
    expect(scheduleForNewDate({ kind: 'once' }, '2026-11-10', '2026-11-12')).toEqual({
      kind: 'once',
    });
  });
});
