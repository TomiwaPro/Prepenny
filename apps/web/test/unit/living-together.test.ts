// Step 3g: "Changed by Tom" (D459), Activity's words (D456), and what each
// person has put into a shared goal (D465). The database tests prove what
// each person is given; these prove what the phone says about it.

import { describe, expect, it } from 'vitest';
import {
  type ActivityContext,
  type ActivityEdit,
  activityWords,
} from '../../lib/activity-words.ts';
import { agoWords, type ChangeMark, lastChange, rowLine } from '../../lib/changed-by.ts';
import { putInLines } from '../../lib/put-in.ts';

const JESS = 'jess-id';
const TOM = 'tom-id';
const names = { [JESS]: 'Jess', [TOM]: 'Tom' };
const now = Date.parse('2026-11-12T15:00:00Z');
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();

describe('"Changed by" (brief 4.14, D459)', () => {
  const marks = new Map<string, ChangeMark>([
    ['series|rent', { by: JESS, at: hoursAgo(30), kind: 'add-payment' }],
    ['change|rent|2026-12-01', { by: TOM, at: hoursAgo(2), kind: 'just-this-one' }],
    ['tick|rent|2026-11-01', { by: JESS, at: hoursAgo(1), kind: 'tick' }],
  ]);

  it("takes the newest of the payment's series, one-off change and tick", () => {
    expect(lastChange(marks, 'rent', '2026-12-01', 1)?.by).toBe(TOM);
    expect(lastChange(marks, 'rent', '2026-11-01', 1)?.kind).toBe('tick');
    expect(lastChange(marks, 'rent', '2027-01-01', 1)?.kind).toBe('add-payment');
  });

  it('shows on the row only for the other person, in their own words', () => {
    const tom = lastChange(marks, 'rent', '2026-12-01', 1);
    expect(rowLine(tom, JESS, names, now)).toBe('Changed by Tom, 2 hours ago');
    expect(rowLine(tom, TOM, names, now)).toBeNull();
    expect(rowLine(tom, JESS, {}, now)).toBe('Changed by your partner, 2 hours ago');
    const added = lastChange(marks, 'rent', '2027-01-01', 1);
    expect(rowLine(added, TOM, names, now)).toBe('Added by Jess, yesterday');
  });

  it('not after a week, and never for sharing an account', () => {
    const old: ChangeMark = { by: TOM, at: hoursAgo(24 * 8), kind: 'just-this-one' };
    expect(rowLine(old, JESS, names, now)).toBeNull();
    const sharing: ChangeMark = { by: TOM, at: hoursAgo(1), kind: 'share-accounts' };
    expect(rowLine(sharing, JESS, names, now)).toBeNull();
  });

  it('a series only ended by "this and all later ones" leaves its earlier payments alone', () => {
    const split = new Map<string, ChangeMark>([
      ['series|rent', { by: TOM, at: hoursAgo(1), kind: 'this-and-later' }],
    ]);
    expect(lastChange(split, 'rent', '2026-11-01', 4)).toBeNull();
    expect(lastChange(split, 'rent', '2027-01-01', 1)?.by).toBe(TOM);
  });

  it('says when in plain words', () => {
    expect(agoWords(new Date(now - 20 * 1000).toISOString(), now)).toBe('just now');
    expect(agoWords(new Date(now - 60 * 1000).toISOString(), now)).toBe('1 minute ago');
    expect(agoWords(new Date(now - 5 * 60 * 1000).toISOString(), now)).toBe('5 minutes ago');
    expect(agoWords(hoursAgo(1), now)).toBe('1 hour ago');
  });
});

describe("Activity's words (brief 4.12, D456)", () => {
  const context: ActivityContext = {
    me: JESS,
    nicknames: names,
    today: '2026-11-12',
    nameOf: (table, id) =>
      table === 'series' && id === 'rent'
        ? 'Rent'
        : table === 'series' && id === 'pay'
          ? 'Pay'
          : table === 'accounts' && id === 'joint'
            ? 'Joint'
            : table === 'budgets' && id === 'food'
              ? 'Food'
              : null,
    comesIn: (id) => id === 'pay',
  };
  const edit = (over: Partial<ActivityEdit>): ActivityEdit => ({
    id: 'e1',
    by: TOM,
    madeAt: hoursAgo(1),
    kind: 'just-this-one',
    mine: false,
    undone: false,
    undoes: null,
    canUndo: false,
    summary: null,
    records: [],
    ...over,
  });

  it('a new amount for just this one', () => {
    expect(
      activityWords(
        edit({
          records: [
            {
              table: 'payment_changes',
              id: 'c1',
              before: null,
              after: { series_id: 'rent', original_date: '2026-12-01', amount: 56000 },
            },
          ],
        }),
        context,
      ),
    ).toBe('Tom changed Rent on Tue 1 Dec to £560.00.');
  });

  it('moved, removed, ticked, and arrived for money coming in', () => {
    const change = (after: Record<string, unknown>) =>
      activityWords(
        edit({
          records: [
            {
              table: 'payment_changes',
              id: 'c1',
              before: null,
              after: { series_id: 'rent', original_date: '2026-12-01', ...after },
            },
          ],
        }),
        context,
      );
    expect(change({ new_date: '2026-12-04' })).toBe('Tom moved Rent on Tue 1 Dec to Fri 4 Dec.');
    expect(change({ skipped: true })).toBe('Tom removed Rent on Tue 1 Dec.');
    const tick = (series: string) =>
      activityWords(
        edit({
          kind: 'tick',
          mine: true,
          by: JESS,
          records: [
            {
              table: 'ticks',
              id: 't1',
              before: null,
              after: { series_id: series, original_date: '2026-11-27' },
            },
          ],
        }),
        context,
      );
    expect(tick('rent')).toBe('You marked Rent on Fri 27 Nov as paid.');
    expect(tick('pay')).toBe('You marked Pay on Fri 27 Nov as arrived.');
  });

  it('added, with the money going out and its date', () => {
    expect(
      activityWords(
        edit({
          kind: 'add-payment',
          records: [
            {
              table: 'series',
              id: 's1',
              before: null,
              after: {
                name: 'Car MOT',
                amount: 5485,
                direction: 'out',
                start_date: '2026-11-13',
                schedule: { kind: 'once', date: '2026-11-13' },
              },
            },
          ],
        }),
        context,
      ),
    ).toBe('Tom added Car MOT, −£54.85 on Fri 13 Nov.');
  });

  it('a balance update, a spend, and the role the owner changed', () => {
    expect(
      activityWords(
        edit({
          kind: 'update-balance',
          records: [
            {
              table: 'balance_updates',
              id: 'b1',
              before: null,
              after: { account_id: 'joint', balance: 123456 },
            },
          ],
        }),
        context,
      ),
    ).toBe('Tom updated the Joint balance to £1,234.56.');
    expect(
      activityWords(
        edit({
          kind: 'spend',
          records: [
            { table: 'spends', id: 'p1', before: null, after: { budget_id: 'food', amount: 1250 } },
          ],
        }),
        context,
      ),
    ).toBe('Tom spent £12.50 on Food.');
    expect(
      activityWords(
        edit({
          kind: 'change-role',
          by: JESS,
          mine: true,
          summary: { person: TOM, role: 'viewer' },
        }),
        context,
      ),
    ).toBe('You changed what Tom can do to Can view only.');
    expect(
      activityWords(
        edit({ kind: 'change-role', by: TOM, summary: { person: JESS, role: 'editor' } }),
        { ...context },
      ),
    ).toBe('Tom changed what you can do to Can edit.');
  });

  it('a shared account made private by the other person names nothing', () => {
    expect(
      activityWords(edit({ kind: 'make-private', summary: { made_private: 'account' } }), context),
    ).toBe('Tom made a shared account private, so you no longer see it.');
  });

  it("with no name of its own it falls back to the records' names, or a plain change", () => {
    expect(activityWords(edit({ kind: 'changes', records: [] }), context)).toBe(
      'Tom made a change.',
    );
    expect(
      activityWords(
        edit({
          kind: 'undo',
          by: JESS,
          mine: true,
          records: [
            { table: 'series', id: 'rent', before: { name: 'Rent' }, after: { name: 'Rent' } },
          ],
        }),
        context,
      ),
    ).toBe('You undid a change to Rent.');
  });

  it('no partner name yet: "Your partner"', () => {
    expect(activityWords(edit({ kind: 'changes' }), { ...context, nicknames: {} })).toBe(
      'Your partner made a change.',
    );
  });
});

describe('What each person has put into a shared goal (D465)', () => {
  const sharing = {
    personId: JESS,
    nicknames: names,
    lockedToAnyone: new Map([
      ['from-jess', JESS],
      ['from-tom', TOM],
    ]),
    paidTo: new Map<string, string>(),
  };
  it('by person, by shared account, what was there at the start and what was taken out', () => {
    const lines = putInLines(
      {
        startingAmount: 10000,
        savedFrom: [
          { seriesId: 'from-jess', fromAccountId: null, amount: 30000 },
          { seriesId: 'from-tom', fromAccountId: null, amount: 25000 },
          { seriesId: 'joint-move', fromAccountId: 'joint', amount: 5000 },
          { seriesId: 'gift', fromAccountId: null, amount: 2000 },
          { seriesId: 'out', fromAccountId: null, amount: -1500 },
        ],
      },
      sharing,
      (id) => (id === 'joint' ? 'Joint' : ''),
    );
    expect(lines).toEqual([
      { label: 'Already saved when it was made', amount: 10000 },
      { label: 'You', amount: 30000 },
      { label: 'Tom', amount: 25000 },
      { label: 'From Joint', amount: 5000 },
      { label: 'Other money in', amount: 2000 },
      { label: 'Taken out', amount: -1500 },
    ]);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(70500);
  });
});
