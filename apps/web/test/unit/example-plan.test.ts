// The example plan is exactly Sam's tested plan (D15, D165): the records of
// the engine's fixture, so every figure in brief 8.3 holds for it.

import { describe, expect, it } from 'vitest';
import { allRecords } from '../../../../packages/engine/test/fixtures/from-empty.ts';
import { samPayPlan } from '../../../../packages/engine/test/fixtures/pay.ts';
import { samDebts } from '../../../../packages/engine/test/fixtures/sam.ts';
import { EXAMPLE_VERSION, examplePlan, fingerprint } from '../../data/example-plan.ts';

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
