// The phone's database (ARCHITECTURE.md 3.8): a plan saved and read back is
// exactly the same plan, and an edit's writes save as the engine's own
// applyWrites would (D87).

import 'fake-indexeddb/auto';
import { applyWrites, editPlan, type PlanRecords } from '@prepenny/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allRecords } from '../../../../packages/engine/test/fixtures/from-empty.ts';
import { englandAndWales } from '../../../../packages/engine/test/fixtures/holidays.ts';
import {
  exampleNeedsReplacing,
  loadRecords,
  openDb,
  type PrePennyDb,
  recordsOf,
  rowsOf,
  saveChange,
  savePlan,
  saveWrites,
} from '../../data/db.ts';
import { EXAMPLE_PLAN_ID, EXAMPLE_VERSION, examplePlan } from '../../data/example-plan.ts';
import { workOutHome } from '../../lib/home.ts';

let db: PrePennyDb;
let count = 0;

beforeEach(async () => {
  count += 1;
  db = openDb(`test-${count}`);
  await db.open();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

const examplePlanRecord = { id: EXAMPLE_PLAN_ID, isExample: true, exampleVersion: EXAMPLE_VERSION };

function editInput(records: PlanRecords, today: string) {
  return {
    ...records,
    mainPayFamilyId: records.settings?.mainPayFamilyId ?? null,
    holidays: englandAndWales,
    today,
  };
}

describe('the phone’s database', () => {
  it('turns records into rows and back without changing anything, order included', () => {
    expect(recordsOf(rowsOf('p', examplePlan))).toEqual(examplePlan);
  });

  it('keeps accounts in the order they were added, whatever their ids', async () => {
    const plan: PlanRecords = {
      accounts: [
        {
          id: 'zz-first',
          name: 'Current account',
          kind: 'current',
          overdraftLimit: 0,
          warningLevel: 0,
        },
        { id: 'aa-second', name: 'Joint', kind: 'joint', overdraftLimit: 0, warningLevel: 0 },
      ],
      balanceUpdates: [],
      series: [],
    };
    await savePlan(db, { id: 'p', isExample: false }, plan);
    await saveWrites(db, 'p', [
      {
        kind: 'account',
        id: '00-third',
        value: {
          id: '00-third',
          name: 'Savings',
          kind: 'savings',
          overdraftLimit: 0,
          warningLevel: 0,
        },
      },
      {
        kind: 'account',
        id: 'zz-first',
        value: {
          id: 'zz-first',
          name: 'Main',
          kind: 'current',
          overdraftLimit: 0,
          warningLevel: 0,
        },
      },
    ]);
    const loaded = await loadRecords(db, 'p');
    expect(loaded.accounts.map((one) => [one.id, one.name])).toEqual([
      ['zz-first', 'Main'],
      ['aa-second', 'Joint'],
      ['00-third', 'Savings'],
    ]);
  });

  it('saves the example plan and reads back exactly the same records', async () => {
    await savePlan(db, examplePlanRecord, examplePlan);
    expect(await db.plans.get(EXAMPLE_PLAN_ID)).toEqual(examplePlanRecord);
    const loaded = await loadRecords(db, EXAMPLE_PLAN_ID);
    expect(loaded).toEqual(examplePlan);
    expect(workOutHome(loaded, '2026-10-25')).toEqual(workOutHome(examplePlan, '2026-10-25'));
  });

  it('keeps each plan’s records apart', async () => {
    await savePlan(db, examplePlanRecord, examplePlan);
    await savePlan(
      db,
      { id: 'other', isExample: false },
      { accounts: [], balanceUpdates: [], series: [] },
    );
    expect((await loadRecords(db, 'other')).series).toEqual([]);
    expect((await loadRecords(db, EXAMPLE_PLAN_ID)).series).toHaveLength(examplePlan.series.length);
  });

  it('saves an edit’s writes as the engine applies them, and its undo puts them back', async () => {
    await savePlan(db, examplePlanRecord, examplePlan);
    const today = '2026-10-25';
    // Brief 8.4 test 1: rent £560 from Fri 1 Jan 2027, this and all later ones.
    const edit = editPlan(editInput(examplePlan, today), {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2027-01-01',
      edits: { amount: 56000 },
      newSeriesId: 'rent-from-jan',
    });
    await saveWrites(db, EXAMPLE_PLAN_ID, edit.writes);
    const saved = await loadRecords(db, EXAMPLE_PLAN_ID);
    const expected = applyWrites(examplePlan, edit.writes);
    expect(allRecords(saved)).toEqual(allRecords(expected));
    expect(saved.series.find((one) => one.id === 'rent-from-jan')?.amount).toBe(56000);

    await saveWrites(db, EXAMPLE_PLAN_ID, edit.undo);
    expect(allRecords(await loadRecords(db, EXAMPLE_PLAN_ID))).toEqual(allRecords(examplePlan));
  });

  it('saves and removes a tick, found by its series and date', async () => {
    await savePlan(db, examplePlanRecord, examplePlan);
    const edit = editPlan(editInput(examplePlan, '2026-10-25'), {
      kind: 'tick',
      seriesId: 'spending-until-payday',
      originalDate: '2026-10-25',
      tickedAt: '2026-10-25T10:00:00Z',
    });
    await saveWrites(db, EXAMPLE_PLAN_ID, edit.writes);
    expect((await loadRecords(db, EXAMPLE_PLAN_ID)).ticks).toHaveLength(1);
    await saveWrites(db, EXAMPLE_PLAN_ID, edit.undo);
    expect((await loadRecords(db, EXAMPLE_PLAN_ID)).ticks).toEqual([]);
  });
});

describe('Changing the example on this phone (D182)', () => {
  it('saves a change with its writes, and marks the example as changed', async () => {
    await savePlan(db, examplePlanRecord, examplePlan);
    const edit = editPlan(editInput(examplePlan, '2026-10-25'), {
      kind: 'remove-this-one',
      seriesId: 'driving-lessons',
      originalDate: '2026-10-26',
    });
    const saved = await saveChange(db, examplePlanRecord, edit.writes);
    expect(saved.edited).toBe(true);
    expect(await db.plans.get(EXAMPLE_PLAN_ID)).toEqual({ ...examplePlanRecord, edited: true });
    expect(await loadRecords(db, EXAMPLE_PLAN_ID)).toEqual(applyWrites(examplePlan, edit.writes));
  });

  it('replaces an unchanged older example, and keeps a changed one', () => {
    expect(exampleNeedsReplacing(undefined, EXAMPLE_VERSION)).toBe(true);
    expect(exampleNeedsReplacing(examplePlanRecord, EXAMPLE_VERSION)).toBe(false);
    const older = { ...examplePlanRecord, exampleVersion: 'older' };
    expect(exampleNeedsReplacing(older, EXAMPLE_VERSION)).toBe(true);
    expect(exampleNeedsReplacing({ ...older, edited: true }, EXAMPLE_VERSION)).toBe(false);
  });
});
