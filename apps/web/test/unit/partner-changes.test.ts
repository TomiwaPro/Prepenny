// A partner's changes, as notifications (step 4f, D575 to D580): the words
// for one change and for changes close together, with amounts and without,
// when they're due, and that a person's own changes are never in them. The
// database tests prove which changes each person is given (Activity's rule,
// D458); these prove what the notification says about them.

import { describe, expect, it } from 'vitest';
import type { ActivityContext, ActivityEdit, ActivityRecord } from '../../lib/activity-words.ts';
import {
  dueGroup,
  exactMoment,
  PARTNER_WAIT,
  partnerWords,
  waitingChanges,
  withoutUndone,
} from '../../lib/partner-changes.ts';

const JESS = 'jess-id';
const TOM = 'tom-id';
const SAM = 'sam-id';

/** Dates keep their parts together with non-breaking spaces; plain spaces here, for reading. */
const plain = (text: string | null) => text?.replaceAll(' ', ' ') ?? null;

const context: ActivityContext = {
  me: JESS,
  nicknames: { [JESS]: 'Jess', [TOM]: 'Tom', [SAM]: 'Sam' },
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

let counter = 0;
const edit = (over: Partial<ActivityEdit>): ActivityEdit => {
  counter += 1;
  return {
    id: `e${counter}`,
    by: TOM,
    madeAt: '2026-11-12T10:00:00.000000Z',
    savedAt: '2026-11-12T10:00:00.000000Z',
    kind: 'just-this-one',
    mine: false,
    undone: false,
    undoes: null,
    canUndo: false,
    summary: null,
    records: [],
    ...over,
  };
};

const record = (over: Partial<ActivityRecord>): ActivityRecord => ({
  table: 'series',
  id: 's1',
  before: null,
  after: null,
  ...over,
});

const carMot = (over: Partial<ActivityEdit> = {}) =>
  edit({
    kind: 'add-payment',
    records: [
      record({
        id: 'mot',
        after: {
          name: 'Car MOT',
          amount: 5485,
          direction: 'out',
          start_date: '2026-11-13',
          schedule: { kind: 'once', date: '2026-11-13' },
        },
      }),
    ],
    ...over,
  });

const rentTo560 = (over: Partial<ActivityEdit> = {}) =>
  edit({
    records: [
      record({
        table: 'payment_changes',
        id: 'c1',
        after: { series_id: 'rent', original_date: '2026-12-01', amount: 56000 },
      }),
    ],
    ...over,
  });

const rentTicked = (over: Partial<ActivityEdit> = {}) =>
  edit({
    kind: 'tick',
    records: [
      record({
        table: 'ticks',
        id: 't1',
        after: { series_id: 'rent', original_date: '2026-11-01' },
      }),
    ],
    ...over,
  });

const foodSpend = (over: Partial<ActivityEdit> = {}) =>
  edit({
    kind: 'spend',
    records: [record({ table: 'spends', id: 'p1', after: { budget_id: 'food', amount: 1250 } })],
    ...over,
  });

describe("one change: Activity's own sentence (D579)", () => {
  it('"Tom added Car MOT, −£54.85 on Fri 13 Nov."', () => {
    expect(plain(partnerWords([carMot()], context, false))).toBe(
      'Tom added Car MOT, −£54.85 on Fri 13 Nov.',
    );
  });

  it('with amounts hidden, the same with no amount (D561)', () => {
    expect(plain(partnerWords([carMot()], context, true))).toBe('Tom added Car MOT on Fri 13 Nov.');
  });

  it('every kind of change with an amount says it without one, once hidden', () => {
    const hidden = (one: ActivityEdit) => plain(partnerWords([one], context, true));
    expect(hidden(rentTo560())).toBe('Tom changed Rent on Tue 1 Dec.');
    expect(plain(partnerWords([rentTo560()], context, false))).toBe(
      'Tom changed Rent on Tue 1 Dec to £560.00.',
    );
    expect(hidden(foodSpend())).toBe('Tom added a spend on Food.');
    expect(hidden(foodSpend({ kind: 'change-spend' }))).toBe('Tom changed a spend on Food.');
    expect(
      hidden(
        edit({
          kind: 'remove-spend',
          records: [
            record({
              table: 'spends',
              id: 'p1',
              before: { budget_id: 'food', amount: 1250 },
              after: { budget_id: 'food', amount: 1250, deleted: true },
            }),
          ],
        }),
      ),
    ).toBe('Tom removed a spend on Food.');
    expect(
      hidden(
        edit({
          kind: 'update-balance',
          records: [
            record({
              table: 'balance_updates',
              id: 'b1',
              after: { account_id: 'joint', balance: 123456 },
            }),
            record({ table: 'ticks', id: 't9', after: { series_id: 'rent' } }),
          ],
        }),
      ),
    ).toBe('Tom updated the Joint balance, and ticked 1 payment.');
    expect(
      hidden(
        edit({
          kind: 'change-budget',
          records: [
            record({
              table: 'budgets',
              id: 'food',
              before: { name: 'Food', amount: 20000 },
              after: { name: 'Food', amount: 25000 },
            }),
          ],
        }),
      ),
    ).toBe('Tom changed the budget Food.');
    expect(
      hidden(
        edit({
          kind: 'this-and-later',
          records: [
            record({
              id: 'rent',
              before: {
                name: 'Rent',
                amount: 55000,
                direction: 'out',
                start_date: '2026-11-01',
                first_number: 0,
                schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
                end_rule: { kind: 'never' },
                holiday_rule: 'keep',
              },
              after: {
                name: 'Rent',
                amount: 56000,
                direction: 'out',
                start_date: '2026-11-01',
                first_number: 0,
                schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
                end_rule: { kind: 'never' },
                holiday_rule: 'keep',
              },
            }),
          ],
        }),
      ),
    ).toBe('Tom changed Rent.');
  });

  it('a change with no amount reads the same either way', () => {
    for (const hide of [false, true]) {
      expect(plain(partnerWords([rentTicked()], context, hide))).toBe(
        'Tom marked Rent on Sun 1 Nov as paid.',
      );
      expect(
        partnerWords(
          [edit({ kind: 'make-private', summary: { made_private: 'account' } })],
          context,
          hide,
        ),
      ).toBe('Tom made a shared account private, so you no longer see it.');
    }
  });

  it('no partner name yet: "Your partner"', () => {
    expect(plain(partnerWords([carMot()], { ...context, nicknames: {} }, false))).toBe(
      'Your partner added Car MOT, −£54.85 on Fri 13 Nov.',
    );
  });
});

describe('changes close together come as one (D579)', () => {
  it('"Tom made 3 changes, including Car MOT, −£54.85.", naming the biggest amount', () => {
    const group = [rentTicked(), carMot(), foodSpend()];
    expect(partnerWords(group, context, false)).toBe(
      'Tom made 3 changes, including Car MOT, −£54.85.',
    );
    expect(partnerWords(group, context, true)).toBe('Tom made 3 changes, including Car MOT.');
  });

  it('the biggest wins whatever its kind, and the newest of two the same', () => {
    expect(partnerWords([foodSpend(), rentTo560(), carMot()], context, false)).toBe(
      'Tom made 3 changes, including Rent, −£560.00.',
    );
    const otherMot = carMot({
      records: [
        record({
          id: 'mot2',
          after: {
            name: 'Van MOT',
            amount: 5485,
            direction: 'out',
            start_date: '2026-11-20',
            schedule: { kind: 'once', date: '2026-11-20' },
          },
        }),
      ],
    });
    // Newest first, as Activity gives them.
    expect(partnerWords([otherMot, carMot()], context, false)).toBe(
      'Tom made 2 changes, including Van MOT, −£54.85.',
    );
  });

  it('money coming in has its plus sign', () => {
    const pay = edit({
      records: [
        record({
          table: 'payment_changes',
          id: 'c2',
          after: { series_id: 'pay', original_date: '2026-11-27', amount: 64000 },
        }),
      ],
    });
    expect(partnerWords([pay, rentTicked()], context, false)).toBe(
      'Tom made 2 changes, including Pay, +£640.00.',
    );
  });

  it('with no amount anywhere, the newest payment it names; with none, just the count', () => {
    expect(partnerWords([rentTicked(), edit({ kind: 'change-role' })], context, false)).toBe(
      'Tom made 2 changes, including Rent.',
    );
    expect(
      partnerWords(
        [
          edit({ kind: 'make-private', summary: { made_private: 'account' } }),
          edit({ kind: 'change-role', summary: { person: JESS, role: 'viewer' } }),
        ],
        context,
        false,
      ),
    ).toBe('Tom made 2 changes.');
  });

  it('more people, once plans have more than two', () => {
    expect(partnerWords([carMot(), foodSpend({ by: SAM })], context, false)).toBe(
      'Tom and Sam made 2 changes, including Car MOT, −£54.85.',
    );
  });
});

describe('only what someone else changed, since the person was last told (D576)', () => {
  it("never the person's own changes", () => {
    const mine = carMot({ by: JESS, mine: true, savedAt: '2026-11-12T10:05:00.000000Z' });
    const his = rentTicked({ savedAt: '2026-11-12T10:06:00.000000Z' });
    expect(waitingChanges([his, mine], '2026-11-12T10:00:00.000000Z')).toEqual([his]);
  });

  it('only those saved after, to the microsecond', () => {
    const at = rentTicked({ savedAt: '2026-11-12T10:00:00.000001Z' });
    const before = carMot({ savedAt: '2026-11-12T10:00:00.000000Z' });
    expect(waitingChanges([at, before], '2026-11-12T10:00:00Z')).toEqual([at]);
    expect(exactMoment('2026-11-12T10:00:00.5Z')).toBe('2026-11-12T10:00:00.500000Z');
    expect(() => exactMoment('yesterday')).toThrow(RangeError);
  });

  it('a change and its undo, both in Activity, cancel out; an undo of an older one stays', () => {
    const change = rentTo560();
    const undo = edit({ kind: 'undo', undoes: change.id });
    const older = edit({ kind: 'undo', undoes: 'from-yesterday' });
    expect(withoutUndone([undo, change, older])).toEqual([older]);
    // Someone else's undo of it isn't Tom taking it back.
    expect(
      withoutUndone([edit({ kind: 'undo', by: SAM, undoes: change.id }), change]),
    ).toHaveLength(2);
  });
});

describe('when they come (D576)', () => {
  const at = (minutes: number, seconds = 0) =>
    new Date(Date.parse('2026-11-12T10:00:00Z') + minutes * 60_000 + seconds * 1000)
      .toISOString()
      .replace(/\.\d+Z$/, '.000000Z');
  const tom = (minutes: number, seconds = 0) => rentTicked({ savedAt: at(minutes, seconds) });

  it('2 minutes after the last change, not before', () => {
    expect(PARTNER_WAIT).toEqual({ quietFor: 120_000, atMost: 600_000, settled: 60_000 });
    const waiting = [tom(3), tom(1), tom(0)];
    expect(dueGroup(waiting, at(4, 59)).due).toBe(false);
    const due = dueGroup(waiting, at(5));
    expect(due.due).toBe(true);
    expect(due.group).toHaveLength(3);
    expect(due.through).toBe(at(3));
  });

  it('10 minutes after the first at most, while they are still going, with what was saved a minute ago', () => {
    const waiting = [tom(9, 30), tom(8), tom(5), tom(0)];
    expect(dueGroup(waiting, at(9, 59)).due).toBe(false);
    const due = dueGroup(waiting, at(10));
    expect(due.due).toBe(true);
    // Saved 30 seconds ago: it comes with the next one.
    expect(due.group).toHaveLength(3);
    expect(due.through).toBe(at(8));
  });

  it('nothing at all waiting is never due', () => {
    expect(dueGroup([], at(30))).toEqual({ due: false, group: [], through: null });
  });
});
