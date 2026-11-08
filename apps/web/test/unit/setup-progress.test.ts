// Setup as 6 screens in 3 parts (D356): progress saved during the old 8
// steps, on the phone or in the account, carries on at the matching new
// screen with nothing lost, and each screen knows its part.

import type { Edit } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import {
  NEW_SETUP,
  OLD_STEP_TO_SCREEN,
  partOf,
  SETUP_LAYOUT,
  type SetupItem,
  type SetupItemKind,
  setupDone,
  upgradeSetup,
} from '../../lib/setup-progress.ts';

const edit = (id: string): Edit => ({
  writes: [{ kind: 'account', id, value: null }],
  undo: [{ kind: 'account', id, value: null }],
});

/** One thing of each kind, with the step the old 8 steps saved it on. */
const OLD_ITEMS: readonly (Omit<SetupItem, 'step' | 'edit'> & { step: number })[] = [
  { id: 'current', kind: 'account', step: 1 },
  { id: 'pay', kind: 'income', step: 2 },
  { id: 'pay-details', kind: 'pay-details', step: 2 },
  { id: 'rent', kind: 'rent', step: 3 },
  { id: 'council-tax', kind: 'bill', step: 4, bill: 'council-tax' },
  { id: 'cloud', kind: 'bill', step: 4 },
  { id: 'sofa', kind: 'debt', step: 5 },
  { id: 'food', kind: 'budget', step: 6 },
  { id: 'holiday', kind: 'goal', step: 7 },
];

/** Progress as the old 8 steps saved it on a step: no layout, and what the steps before it added. */
function oldProgress(step: number | 'done') {
  const before = step === 'done' ? 9 : step;
  return {
    step,
    items: OLD_ITEMS.filter((item) => item.step < before).map((item) => ({
      ...item,
      edit: edit(item.id),
    })),
    answers: { noRent: true, noDebts: true, extraHours: 'no' },
  };
}

const NEW_SCREEN_OF: Readonly<Record<SetupItemKind, number>> = {
  account: 1,
  income: 2,
  'pay-details': 2,
  rent: 3,
  bill: 3,
  debt: 4,
  budget: 5,
  goal: 6,
};

describe('Progress from the old 8 steps (D356)', () => {
  const cases = [
    [0, 0, 'the welcome'],
    [1, 1, 'Your account'],
    [2, 2, "How you're paid"],
    [3, 3, 'Rent or mortgage → Home and bills'],
    [4, 3, 'Bills → Home and bills'],
    [5, 4, 'Debts'],
    [6, 5, 'Spending money'],
    [7, 6, 'Savings → Here’s your plan, where Add a goal is'],
    [8, 6, 'Here’s your plan'],
  ] as const;

  for (const [old, screen, words] of cases) {
    it(`old step ${old} opens screen ${screen} (${words}), with everything added kept`, () => {
      const saved = oldProgress(old);
      const upgraded = upgradeSetup(saved);
      expect(upgraded?.layout).toBe(SETUP_LAYOUT);
      expect(upgraded?.step).toBe(screen);
      expect(OLD_STEP_TO_SCREEN[old]).toBe(screen);
      // Nothing lost: every item, with its edit for Remove, and every answer.
      expect(upgraded?.items.map((item) => item.id)).toEqual(saved.items.map((item) => item.id));
      expect(upgraded?.items.map((item) => item.edit)).toEqual(
        saved.items.map((item) => item.edit),
      );
      expect(upgraded?.items.map((item) => item.bill)).toEqual(
        saved.items.map((item) => item.bill),
      );
      expect(upgraded?.answers).toEqual(saved.answers);
      // Each item is on the screen that lists it now, so Remove still finds it.
      for (const item of upgraded?.items ?? []) expect(item.step).toBe(NEW_SCREEN_OF[item.kind]);
    });
  }

  it('a finished plan stays finished', () => {
    const upgraded = upgradeSetup(oldProgress('done'));
    expect(upgraded?.step).toBe('done');
    expect(setupDone(upgraded)).toBe(true);
    expect(upgraded?.items).toHaveLength(OLD_ITEMS.length);
  });

  it('old progress that is already done reads as done without being upgraded', () => {
    expect(setupDone({ step: 'done' })).toBe(true);
    expect(setupDone({ step: 8 })).toBe(false);
  });

  it('progress in the new layout is kept exactly as it is', () => {
    const now = {
      layout: SETUP_LAYOUT,
      step: 4,
      items: [{ id: 'rent', kind: 'rent', step: 3, edit: edit('rent') }],
      answers: { noRent: false },
    };
    expect(upgradeSetup(now)).toEqual(now);
    // And reading it twice changes nothing.
    expect(upgradeSetup(upgradeSetup(oldProgress(5)))).toEqual(upgradeSetup(oldProgress(5)));
  });

  it('a screen it can’t read starts at the first screen, and nothing saved is nothing', () => {
    expect(upgradeSetup(undefined)).toBeUndefined();
    expect(upgradeSetup(null)).toBeUndefined();
    expect(upgradeSetup({ step: 12, items: [], answers: {} })?.step).toBe(1);
    expect(upgradeSetup({ layout: SETUP_LAYOUT, step: 9, items: [], answers: {} })?.step).toBe(1);
    // A phone still running the old 8 steps could save 7 or 8 beside the new layout: the plan.
    expect(upgradeSetup({ layout: SETUP_LAYOUT, step: 7, items: [], answers: {} })?.step).toBe(6);
    expect(upgradeSetup({ layout: SETUP_LAYOUT, step: 8, items: [], answers: {} })?.step).toBe(6);
    // Damaged items are left out, so setup still opens.
    expect(
      upgradeSetup({
        step: 2,
        items: [null, 'rent', { id: 'pay', kind: 'income', step: 2, edit: edit('pay') }],
        answers: {},
      })?.items.map((item) => item.id),
    ).toEqual(['pay']);
    expect(upgradeSetup({ step: 3 })).toEqual({
      layout: SETUP_LAYOUT,
      step: 3,
      items: [],
      answers: {},
    });
  });

  it('a new plan starts on the first screen, in the new layout', () => {
    expect(NEW_SETUP).toEqual({ layout: SETUP_LAYOUT, step: 1, items: [], answers: {} });
  });
});

describe('Each screen’s part (D356)', () => {
  it('Part 1 of 3: Money in, Part 2 of 3: Money out, Part 3 of 3: Your plan', () => {
    expect([1, 2, 3, 4, 5, 6].map((screen) => partOf(screen as 1).key)).toEqual([
      'money-in',
      'money-in',
      'money-out',
      'money-out',
      'money-out',
      'your-plan',
    ]);
    expect([1, 2, 3, 4, 5, 6].map((screen) => partOf(screen as 1).part)).toEqual([
      1, 1, 2, 2, 2, 3,
    ]);
  });

  it('the bar fills as far as the screen showing', () => {
    expect(partOf(1).filled).toEqual([0.5, 0, 0]);
    expect(partOf(2).filled).toEqual([1, 0, 0]);
    expect(partOf(3).filled).toEqual([1, 1 / 3, 0]);
    expect(partOf(4).filled).toEqual([1, 2 / 3, 0]);
    expect(partOf(5).filled).toEqual([1, 1, 0]);
    expect(partOf(6).filled).toEqual([1, 1, 1]);
  });
});
