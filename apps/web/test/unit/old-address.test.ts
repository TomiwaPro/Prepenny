// The live app's old address (step 3f-2, D428): a phone whose offline helper
// serves it moves itself to prepenny.co.uk, unless it holds something that
// isn't saved in an account yet, which prepenny.co.uk couldn't reach. Those
// stay where they are, so nothing is lost by moving.

import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, savePlan } from '../../data/db.ts';
import { EXAMPLE_PLAN_ID, examplePlan } from '../../data/example-plan.ts';
import { heldOnlyHere } from '../../data/sync.ts';

afterEach(async () => {
  const db = openDb();
  await db.delete();
});

const ownPlan = { id: 'mine', isExample: false };

describe('Something kept only at the old address', () => {
  it('is nothing on a phone with no plan of its own, or only the example', async () => {
    expect(await heldOnlyHere()).toBe(false);
    const db = openDb();
    await savePlan(db, { id: EXAMPLE_PLAN_ID, isExample: true }, examplePlan);
    db.close();
    expect(await heldOnlyHere()).toBe(false);
  });

  it('is a plan of its own never saved in an account', async () => {
    const db = openDb();
    await savePlan(db, ownPlan, examplePlan);
    db.close();
    expect(await heldOnlyHere()).toBe(true);
  });

  it('is a plan still going up, but not one saved in an account with nothing waiting', async () => {
    const db = openDb();
    await savePlan(db, ownPlan, examplePlan);
    await db.links.put({ planId: 'mine', personId: 'sam', shared: 0, mine: 0, sending: true });
    db.close();
    expect(await heldOnlyHere()).toBe(true);
    const again = openDb();
    await again.links.put({ planId: 'mine', personId: 'sam', shared: 0, mine: 0 });
    again.close();
    expect(await heldOnlyHere()).toBe(false);
  });
});
