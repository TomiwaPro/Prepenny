// More says "Your plan is saved in your account." only when nothing is waiting
// to be sent. After a change, the count of changes waiting is updated before
// the change shows on any screen, so that's never said a moment too soon
// (D510, found when a test asked the server too early, on GitHub).

import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, savePlan } from '../../data/db.ts';
import { examplePlan } from '../../data/example-plan.ts';
import { syncSoon, syncStateNow } from '../../data/sync.ts';

afterEach(async () => {
  // syncSoon also looks at the account a moment later: let that finish first.
  await new Promise((resolve) => setTimeout(resolve, 400));
  const db = openDb();
  await db.delete();
});

describe('Changes waiting to be sent', () => {
  it('are counted by the time syncSoon is done, so More never says "saved" too soon', async () => {
    const db = openDb();
    await savePlan(db, { id: 'mine', isExample: false }, examplePlan);
    await db.links.put({ planId: 'mine', personId: 'sam', shared: 0, mine: 0 });
    await db.unsent.put({
      planId: 'mine',
      n: 1,
      editId: 'edit-1',
      madeAt: '2026-10-25T10:00:00.000Z',
      kind: 'tick',
      writes: [],
    });
    db.close();
    expect(syncStateNow().unsent).toBe(0);
    await syncSoon();
    expect(syncStateNow()).toEqual({ kept: true, unsent: 1, cantSend: false });
  });
});
