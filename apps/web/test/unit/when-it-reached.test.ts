// Step 3i, D492: a phone can say it made a change at any earlier time, so
// Activity, History and "Changed by" go by when the change reached the
// account, by the server's own clock. The time the phone gave is kept only
// for settling clashes (D365, D366). The database test is
// supabase/tests/database/31-phase-3-review.test.sql.

import { describe, expect, it } from 'vitest';
import { activityEditsFrom, shownAt } from '../../lib/activity-words.ts';
import { mirrorRowOf } from '../../lib/sync-rows.ts';

describe('when a change is shown as made (D492)', () => {
  const answer = {
    edits: [
      {
        id: 'edit-1',
        by: 'tom-id',
        made_at: '2001-01-01T00:00:00Z',
        saved_at: '2026-11-12T22:40:05.123456Z',
        kind: 'just-this-one',
        mine: false,
        records: [],
      },
    ],
  };

  it("Activity and History show when it reached the account, not the time Tom's phone gave", () => {
    const [edit] = activityEditsFrom(answer);
    expect(edit?.madeAt).toBe('2001-01-01T00:00:00Z');
    expect(edit === undefined ? null : shownAt(edit)).toBe('2026-11-12T22:40:05.123456Z');
  });

  it('an answer from a server before step 3i still shows the time the phone gave', () => {
    const [edit] = activityEditsFrom({ edits: [{ ...answer.edits[0], saved_at: undefined }] });
    expect(edit === undefined ? null : shownAt(edit)).toBe('2001-01-01T00:00:00Z');
  });

  it('a record brought down keeps both: when it reached the account for "Changed by", the phone\'s time for clashes', () => {
    const row = mirrorRowOf(
      'series',
      { id: 'rent', version: 2, seq: 7, private_to: null, deleted: false, name: 'Rent' },
      {
        madeAt: '2001-01-01T00:00:00Z',
        savedAt: '2026-11-12T22:40:05.123456Z',
        by: 'tom-id',
        kind: 'edit',
      },
    );
    expect(row.editMadeAt).toBe('2001-01-01T00:00:00Z');
    expect(row.editSavedAt).toBe('2026-11-12T22:40:05.123456Z');
  });
});
