// The example plan is exactly Sam's tested plan (D15, D165): the records of
// the engine's fixture, so every figure in brief 8.3 holds for it.

import { formatPounds } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { allRecords } from '../../../../packages/engine/test/fixtures/from-empty.ts';
import { samPayPlan } from '../../../../packages/engine/test/fixtures/pay.ts';
import { samDebts } from '../../../../packages/engine/test/fixtures/sam.ts';
import { EXAMPLE_VERSION, examplePlan, fingerprint } from '../../data/example-plan.ts';
import { runEdit } from '../../lib/edit.ts';
import { workOutHome } from '../../lib/home.ts';
import { planLookAhead, workOutPlanTo } from '../../lib/plan-input.ts';

describe('Sam’s example plan', () => {
  it('has exactly the records of the engine’s fixture for brief 8.1, 8.2 and 8.6', () => {
    const fixture = samPayPlan();
    const expected = {
      accounts: fixture.accounts,
      balanceUpdates: fixture.balanceUpdates,
      series: fixture.series,
      changes: fixture.changes ?? [],
      ticks: [],
      debts: samDebts,
      budgets: [],
      spends: [],
      goals: [],
      payProfiles: fixture.payProfiles ?? [],
      payWeeks: fixture.payWeeks ?? [],
      payAdjustments: [],
      settings: { nation: 'england-and-wales' as const, mainPayFamilyId: fixture.mainPayFamilyId },
    };
    expect(allRecords(examplePlan)).toEqual(allRecords(expected));
  });

  it('has a version that changes whenever any of its records changes, so phones get the new one', () => {
    expect(EXAMPLE_VERSION).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprint(examplePlan)).toBe(EXAMPLE_VERSION);
    const rentChanged = {
      ...examplePlan,
      changes: [
        ...(examplePlan.changes ?? []).slice(0, 2),
        { seriesId: 'rent', originalDate: '2026-11-01', amount: 60001 },
      ],
    };
    expect(fingerprint(rentChanged)).not.toBe(EXAMPLE_VERSION);
  });

  it('keeps every payment’s date, with no weekend or bank holiday moves (D15)', () => {
    expect(examplePlan.series.every((one) => one.holidayRule === 'keep')).toBe(true);
  });
});

describe('Sam’s pay in the example (brief 8.6, D5, D131, D196)', () => {
  const pay = examplePlan.series.find((one) => one.id === 'pay');
  const weeks = new Map((examplePlan.payWeeks ?? []).map((week) => [week.id, week]));
  const today = '2026-10-25';

  it('links each step of the pattern to its own pay week: 3, 4, 3 and 4 shifts', () => {
    const linked = (pay?.cyclePayWeeks ?? []).map((id) => weeks.get(id));
    expect(linked.map((week) => week?.name)).toEqual([
      'Rota week 1, 3 shifts',
      'Rota week 2, 4 shifts',
      'Rota week 3, 3 shifts',
      'Rota week 4, 4 shifts',
    ]);
    // Weeks 26 to 29 of brief 8.6. Week 29's overtime is what "I did overtime" adds.
    expect(
      linked.map((week) => [week?.lines.map((line) => line.hours), week?.fixed?.[0]?.amount]),
    ).toEqual([
      [['34.5'], 11469],
      [['46'], 21023],
      [['34.25'], 14229],
      [['46'], 17201],
    ]);
  });

  it('remembers the overtime rate, £19.07, and covers work up to the Sunday 5 days before payday', () => {
    const profile = examplePlan.payProfiles?.[0];
    expect([profile?.overtimeRate, profile?.coveredTo]).toEqual([
      '19.07',
      { kind: 'days-before', days: 5 },
    ]);
  });

  it('changes no figure: Home and every month end are still brief 8.3’s', () => {
    const home = workOutHome(examplePlan, today);
    expect([home.lowest.balance, home.lowest.date, home.lowest.after]).toEqual([
      453,
      '2026-11-01',
      'Rent',
    ]);
    const plan = workOutPlanTo(examplePlan, today, '2027-02-28');
    const current = plan.accounts.find((one) => one.account.id === 'current');
    const endOf = (date: string) =>
      current?.days.filter((one) => one.date <= date).at(-1)?.balance ?? null;
    expect(
      ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'].map(endOf),
    ).toEqual([60453, 73291, 102460, 223589, 330487]);
  });

  it('puts 11.5 hours of overtime on Mon 26 Oct on Fri 6 Nov, +£155.12, making it £773.58', () => {
    const { records } = runEdit(examplePlan, today, {
      kind: 'overtime',
      id: 'overtime-1',
      seriesId: 'pay',
      workedOn: '2026-10-26',
      hours: '11.5',
    });
    expect(formatPounds(records.payAdjustments?.[0]?.change ?? 0)).toBe('155.12');
    const plan = workOutPlanTo(records, today, planLookAhead(today, 3));
    const current = plan.accounts.find((one) => one.account.id === 'current');
    const payOn = current?.rows.find(
      (row) => row.payment.seriesId === 'pay' && row.date === '2026-11-06',
    );
    expect(formatPounds(payOn?.change ?? 0)).toBe('773.58');
    // Thu 12 Nov ends £155.12 higher: £155.69 + £155.12.
    expect(current?.days.find((one) => one.date === '2026-11-12')?.balance).toBe(31081);
  });

  it('takes 11.5 hours of a missed shift on Tue 3 Nov off Fri 13 Nov, −£100.43', () => {
    const { records } = runEdit(examplePlan, today, {
      kind: 'missed-shift',
      id: 'missed-1',
      seriesId: 'pay',
      workedOn: '2026-11-03',
      hours: '11.5',
    });
    const saved = records.payAdjustments?.[0];
    expect([saved?.number, saved?.rate, formatPounds(saved?.change ?? 0)]).toEqual([
      2,
      '12.71',
      '-100.43',
    ]);
  });
});
