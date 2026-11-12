// Someone who deleted their account in a shared plan (D482, the owner's
// choice B): their changes stay in the other person's Activity, History and
// "Changed by", made by "Someone who has left", and nothing names them.

import { describe, expect, it } from 'vitest';
import {
  type ActivityContext,
  activityEditsFrom,
  activityWords,
  SOMEONE_WHO_LEFT,
} from '../../lib/activity-words.ts';
import { changedByWords, rowLine } from '../../lib/changed-by.ts';
import { mirrorRowOf } from '../../lib/sync-rows.ts';

const JESS = '01900000-0000-7000-8000-00000000000a';

const context: ActivityContext = {
  me: JESS,
  nicknames: { [JESS]: 'Jess' },
  today: '2026-11-12',
  nameOf: (table) => (table === 'series' ? 'Rent' : null),
  comesIn: () => false,
};

/** plan_activity's answer with one change, made by nobody now. */
function answer(edit: Record<string, unknown>) {
  return {
    edits: [
      {
        id: 'e1',
        by: null,
        made_at: '2026-11-10T14:05:00Z',
        mine: false,
        undone: false,
        can_undo: false,
        summary: null,
        records: [],
        ...edit,
      },
    ],
    people: { [JESS]: 'Jess' },
  };
}

describe('A change by someone whose account was deleted', () => {
  it('is still in Activity, made by "Someone who has left"', () => {
    const [edit] = activityEditsFrom(
      answer({
        kind: 'this-and-later',
        records: [
          {
            table: 'series',
            id: 's1',
            before: { name: 'Rent', amount: 55000 },
            after: { name: 'Rent', amount: 56000 },
          },
        ],
      }),
    );
    expect(edit?.by).toBe(SOMEONE_WHO_LEFT);
    expect(edit === undefined ? '' : activityWords(edit, context)).toMatch(
      /^Someone who has left /,
    );
  });

  it('their leaving says "Someone left the plan."', () => {
    const [edit] = activityEditsFrom(answer({ kind: 'leave', summary: { person: null } }));
    expect(edit === undefined ? '' : activityWords(edit, context)).toBe('Someone left the plan.');
  });

  it('a role they were given names nobody', () => {
    const [edit] = activityEditsFrom(
      answer({
        kind: 'change-role',
        by: JESS,
        mine: true,
        summary: { person: null, role: 'viewer' },
      }),
    );
    expect(edit === undefined ? '' : activityWords(edit, context)).toBe(
      'You changed what someone who has left can do to Can view only.',
    );
  });

  it('"Changed by" on the payment says "someone who has left"', () => {
    const now = Date.parse('2026-11-12T12:00:00Z');
    const mark = { by: '', at: '2026-11-12T10:00:00Z', kind: 'this-and-later' };
    expect(changedByWords(mark, JESS, {}, now).words).toBe(
      'Changed by someone who has left, 2 hours ago',
    );
    expect(rowLine(mark, JESS, {}, now)).toBe('Changed by someone who has left, 2 hours ago');
  });

  it('a row brought down from the server keeps its change, by nobody', () => {
    const row = mirrorRowOf(
      'series',
      { id: 's1', version: 3, seq: 9, private_to: null, deleted: false, name: 'Rent' },
      { madeAt: '2026-11-10T14:05:00Z', by: null, kind: 'this-and-later' },
    );
    expect(row.editBy).toBe('');
    // A row no change has saved names nobody, and isn't a change at all.
    expect(
      mirrorRowOf('series', { id: 's2', version: 1, seq: 1, private_to: null, deleted: false }, {})
        .editBy,
    ).toBeUndefined();
  });
});
