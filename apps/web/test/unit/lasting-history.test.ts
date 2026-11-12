// Step 3g, the owner's answers: a lasting record (D469). Activity says what a
// change changed from and to, and each payment's sheet has a History list:
// "Tom changed it from £550.00 to £560.00, Tue 10 Nov, 2:05pm". And leaving
// (D468): "Tom left the plan." The database tests prove what each person is
// given; these prove what the phone says about it. Dates keep their parts
// together with no-break spaces, as the app writes them.

import { describe, expect, it } from 'vitest';
import {
  type ActivityContext,
  type ActivityEdit,
  activityPeopleFrom,
  activityWords,
  paymentAmountOf,
} from '../../lib/activity-words.ts';
import { formatTime } from '../../lib/dates.ts';
import { historyLines, whatItDidToIt } from '../../lib/payment-history.ts';

const JESS = 'jess-id';
const TOM = 'tom-id';

const context: ActivityContext = {
  me: JESS,
  nicknames: { [JESS]: 'Jess', [TOM]: 'Tom' },
  today: '2026-11-12',
  nameOf: (table, id) => (table === 'series' && id === 'rent' ? 'Rent' : null),
  comesIn: () => false,
};

const edit = (over: Partial<ActivityEdit>): ActivityEdit => ({
  id: 'e1',
  by: TOM,
  madeAt: '2026-11-10T14:05:00Z',
  kind: 'just-this-one',
  mine: false,
  undone: false,
  undoes: null,
  canUndo: false,
  summary: null,
  records: [],
  ...over,
});

/** Rent as the history keeps a copy of it: £550.00 on the 1st of each month from Sun 1 Nov. */
const rent = (over: Record<string, unknown> = {}) => ({
  id: 'rent',
  account_id: 'joint',
  to_account_id: null,
  name: 'Rent',
  direction: 'out',
  type: 'rent',
  amount: 55000,
  amount_cycle: null,
  cycle_offset: null,
  start_date: '2026-11-01',
  schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
  end_rule: { kind: 'never' },
  last_amount: null,
  holiday_rule: 'keep',
  is_estimate: false,
  family_id: 'rent',
  family_created_at: '2026-10-25T08:31:00Z',
  first_number: null,
  split_from: null,
  deleted: false,
  version: 3,
  ...over,
});

/** Rent's payment on Tue 1 Dec: its second, number 1. */
const december = { familyId: 'rent', originalDate: '2026-12-01', number: 1, comesIn: false };

describe('What a payment came to, from a copy of its series (D469)', () => {
  it("is the engine's own answer: the amount, a pattern, or the last amount", () => {
    expect(paymentAmountOf(rent(), 1)).toBe(55000);
    expect(paymentAmountOf(rent({ amount_cycle: [55000, 60000] }), 1)).toBe(60000);
    expect(
      paymentAmountOf(rent({ end_rule: { kind: 'after', payments: 2 }, last_amount: 20000 }), 1),
    ).toBe(20000);
  });

  it('is nothing when the copy has no such payment, or was removed', () => {
    expect(paymentAmountOf(rent({ start_date: '2027-01-01' }), -1)).toBeNull();
    expect(paymentAmountOf(rent({ deleted: true }), 1)).toBeNull();
    expect(paymentAmountOf(null, 1)).toBeNull();
    expect(paymentAmountOf(rent(), 'one')).toBeNull();
  });
});

describe('Activity says from what to what (D469)', () => {
  const oneOff = (before: Record<string, unknown> | null, amount: number) =>
    activityWords(
      edit({
        records: [
          {
            table: 'payment_changes',
            id: 'c1',
            before,
            after: { series_id: 'rent', original_date: '2026-12-01', payment_number: 1, amount },
            context: rent(),
          },
        ],
      }),
      context,
    );

  it("just this one: from the series' amount for that payment, or its earlier one-off amount", () => {
    expect(oneOff(null, 56000)).toBe('Tom changed Rent on Tue 1 Dec from £550.00 to £560.00.');
    expect(oneOff({ series_id: 'rent', original_date: '2026-12-01', amount: 57000 }, 56000)).toBe(
      'Tom changed Rent on Tue 1 Dec from £570.00 to £560.00.',
    );
  });

  it('this and all later ones: from what it was to what it is, from the day it starts', () => {
    expect(
      activityWords(
        edit({
          kind: 'this-and-later',
          records: [
            {
              table: 'series',
              id: 'rent',
              before: rent(),
              after: rent({ end_rule: { kind: 'after', payments: 1 }, version: 4 }),
            },
            {
              table: 'series',
              id: 'rent-2',
              before: null,
              after: rent({
                id: 'rent-2',
                amount: 56000,
                start_date: '2026-12-01',
                first_number: 1,
                split_from: 'rent',
              }),
            },
          ],
        }),
        context,
      ),
    ).toBe('Tom changed Rent from £550.00 to £560.00, starting Tue 1 Dec.');
    expect(
      activityWords(
        edit({
          kind: 'this-and-later',
          records: [
            { table: 'series', id: 'rent', before: rent(), after: rent({ amount: 56000 }) },
          ],
        }),
        context,
      ),
    ).toBe('Tom changed Rent from £550.00 to £560.00.');
  });

  it('a spend and a budget', () => {
    expect(
      activityWords(
        edit({
          kind: 'change-spend',
          records: [
            {
              table: 'spends',
              id: 'p1',
              before: { budget_id: 'food', amount: 1250 },
              after: { budget_id: 'food', amount: 1500 },
            },
          ],
        }),
        { ...context, nameOf: () => 'Food' },
      ),
    ).toBe('Tom changed a spend on Food from £12.50 to £15.00.');
    expect(
      activityWords(
        edit({
          kind: 'change-budget',
          records: [
            {
              table: 'budgets',
              id: 'food',
              before: { name: 'Food', amount: 20000 },
              after: { name: 'Food', amount: 25000 },
            },
          ],
        }),
        context,
      ),
    ).toBe('Tom changed the budget Food from £200.00 to £250.00.');
  });

  it("leaving: in the plan left, and in the leaver's own new plan", () => {
    expect(activityWords(edit({ kind: 'leave', summary: { person: TOM } }), context)).toBe(
      'Tom left the plan.',
    );
    const own = { ...context, me: TOM };
    expect(activityWords(edit({ kind: 'leave', mine: true, summary: { copied: true } }), own)).toBe(
      'You left the shared plan, and took a copy of the shared accounts.',
    );
    expect(
      activityWords(edit({ kind: 'leave', mine: true, summary: { copied: false } }), own),
    ).toBe('You left the shared plan.');
  });

  it('someone who has left still has their name, from the server', () => {
    expect(activityPeopleFrom({ people: { [TOM]: 'Tom', bad: 3 } })).toEqual({ [TOM]: 'Tom' });
    expect(activityPeopleFrom(null)).toEqual({});
  });
});

describe("A payment's History (D469)", () => {
  const time = formatTime('2026-11-10T14:05:00Z');

  it('says who, what from and to, and when, as the owner asked', () => {
    const lines = historyLines(
      [
        edit({
          records: [
            {
              table: 'payment_changes',
              id: 'c1',
              before: null,
              after: {
                series_id: 'rent',
                original_date: '2026-12-01',
                payment_number: 1,
                amount: 56000,
              },
              context: rent(),
            },
          ],
        }),
      ],
      december,
      context,
    );
    expect(lines.map((one) => one.words)).toEqual([
      `Tom changed it from £550.00 to £560.00, Tue 10 Nov, ${time}`,
    ]);
  });

  it('moved, removed, put back, ticked, and arrived for money coming in', () => {
    const change = (
      before: Record<string, unknown> | null,
      after: Record<string, unknown>,
      payment = december,
    ) =>
      whatItDidToIt(
        edit({
          records: [
            {
              table: 'payment_changes',
              id: 'c1',
              before: before === null ? null : { original_date: '2026-12-01', ...before },
              after: { original_date: '2026-12-01', ...after },
            },
          ],
        }),
        payment,
        context,
      );
    expect(change(null, { new_date: '2026-12-04' })).toBe('moved it to Fri 4 Dec');
    expect(change(null, { skipped: true })).toBe('removed it');
    expect(change({ skipped: true }, { skipped: false })).toBe('put it back');
    expect(change(null, { name: 'Rent and bills' })).toBe('renamed it Rent and bills');
    const tick = (comesIn: boolean, deleted: boolean) =>
      whatItDidToIt(
        edit({
          kind: deleted ? 'untick' : 'tick',
          records: [
            {
              table: 'ticks',
              id: 't1',
              before: null,
              after: { original_date: '2026-12-01', deleted },
            },
          ],
        }),
        { ...december, comesIn },
        context,
      );
    expect(tick(false, false)).toBe('marked it as paid');
    expect(tick(false, true)).toBe('marked it as not paid');
    expect(tick(true, false)).toBe('marked it as arrived');
  });

  it('a change to its series only when it changed this payment, worked out by the engine', () => {
    const split = (from: string, first: number) =>
      edit({
        kind: 'this-and-later',
        records: [
          {
            table: 'series',
            id: 'rent',
            before: rent(),
            after: rent({ end_rule: { kind: 'after', payments: first }, version: 4 }),
          },
          {
            table: 'series',
            id: 'rent-2',
            before: null,
            after: rent({
              id: 'rent-2',
              amount: 56000,
              start_date: from,
              first_number: first,
              split_from: 'rent',
            }),
          },
        ],
      });
    // From Tue 1 Dec on: December's payment changed.
    expect(whatItDidToIt(split('2026-12-01', 1), december, context)).toBe(
      'changed this one and all later ones from £550.00 to £560.00',
    );
    // From Fri 1 Jan on: December's didn't, so it isn't in December's History.
    expect(whatItDidToIt(split('2027-01-01', 2), december, context)).toBeNull();
    // Sharing the account changes nothing about the payment itself, though
    // the person sees only how it was once shared.
    expect(
      whatItDidToIt(
        edit({
          kind: 'share-accounts',
          records: [{ table: 'series', id: 'rent', before: null, after: rent() }],
        }),
        december,
        context,
      ),
    ).toBeNull();
  });

  it('added it, and removed it for good', () => {
    expect(
      whatItDidToIt(
        edit({
          kind: 'add-payment',
          records: [{ table: 'series', id: 'rent', before: null, after: rent() }],
        }),
        december,
        context,
      ),
    ).toBe('added it');
    expect(
      whatItDidToIt(
        edit({
          kind: 'delete-payment',
          records: [
            { table: 'series', id: 'rent', before: rent(), after: rent({ deleted: true }) },
          ],
        }),
        december,
        context,
      ),
    ).toBe('removed it');
  });

  it('one\'s own changes say "You", and an undone one says so', () => {
    const lines = historyLines(
      [
        edit({
          by: JESS,
          mine: true,
          undone: true,
          kind: 'tick',
          records: [
            { table: 'ticks', id: 't1', before: null, after: { original_date: '2026-12-01' } },
          ],
        }),
      ],
      december,
      context,
    );
    expect(lines).toEqual([
      { id: 'e1', words: `You marked it as paid, Tue 10 Nov, ${time}`, undone: true },
    ]);
  });
});
