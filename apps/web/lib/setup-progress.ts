// How far first-time setup has got (brief 4.1, D163, step 2e). It's kept
// with the person's own plan on the phone, and in their account once they're
// signed in, so leaving part-way keeps what's done and opening PrePenny again
// carries on at the same screen.
//
// Every record setup adds is made by the engine's commands (D149). Each thing
// added is kept here with its edit, so "Remove" can take it back as one undo
// (D87) while setup is still going.
//
// Setup is 6 screens in 3 parts (D356). Before that it was 8 steps, and
// progress saved then is read as the matching new screen (`upgradeSetup`).

import type { Edit } from '@prepenny/engine';

/** The screens: 0 is the welcome, 1 to 6 the screens of the three parts. */
export type SetupStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** How many screens setup has, after the welcome. */
export const SETUP_SCREENS = 6;

/** The three parts, in order, and the screens in each (D356). */
export const SETUP_PARTS = [
  { key: 'money-in', screens: [1, 2] },
  { key: 'money-out', screens: [3, 4, 5] },
  { key: 'your-plan', screens: [6] },
] as const satisfies readonly { key: string; screens: readonly SetupStep[] }[];

export type SetupPartKey = (typeof SETUP_PARTS)[number]['key'];

/** Which part a screen is in, counting from 1, and how far through that part it is. */
export function partOf(step: SetupStep): {
  readonly part: number;
  readonly key: SetupPartKey;
  /** How much of each part is done, this screen included, from 0 to 1. */
  readonly filled: readonly number[];
} {
  const index = Math.max(
    0,
    SETUP_PARTS.findIndex((part) => (part.screens as readonly number[]).includes(step)),
  );
  const filled = SETUP_PARTS.map((part, at) => {
    if (at < index) return 1;
    if (at > index) return 0;
    const screens = part.screens as readonly number[];
    return (screens.indexOf(step) + 1) / screens.length;
  });
  return { part: index + 1, key: SETUP_PARTS[index]?.key ?? 'money-in', filled };
}

/** The bills on the checklist (brief 4.1), in the brief's order. */
export const BILLS = [
  'council-tax',
  'energy',
  'water',
  'phone',
  'broadband',
  'tv-licence',
  'insurance',
  'subscriptions',
] as const;

export type BillKey = (typeof BILLS)[number];

export type SetupItemKind =
  | 'account'
  | 'income'
  | 'pay-details'
  | 'rent'
  | 'bill'
  | 'debt'
  | 'budget'
  | 'goal';

/** One thing setup added, such as an account, a bill or a debt with its payments. */
export interface SetupItem {
  /** Its own id: the id of its main record. */
  readonly id: string;
  readonly step: SetupStep;
  readonly kind: SetupItemKind;
  /** For a bill from the checklist: which one, so the checklist leaves it out. */
  readonly bill?: BillKey;
  /** Every record it added, as one edit, so Remove undoes all of it at once. */
  readonly edit: Edit;
}

/** Answers that add no record, kept so going back shows them. */
export interface SetupAnswers {
  /** "I don't pay rent or a mortgage". True once chosen, false once rent is added after all. */
  readonly noRent?: boolean;
  readonly noDebts?: true;
  /** "Do you ever work extra hours or miss shifts?" */
  readonly extraHours?: 'yes' | 'no';
}

/** The shape of saved progress: 2 is 6 screens in 3 parts (D356). Without it, it's the old 8 steps. */
export const SETUP_LAYOUT = 2;

export interface SetupProgress {
  readonly layout: typeof SETUP_LAYOUT;
  /** The screen showing, or done once "Go to my plan" has been tapped. */
  readonly step: SetupStep | 'done';
  readonly items: readonly SetupItem[];
  readonly answers: SetupAnswers;
}

export const NEW_SETUP: SetupProgress = { layout: SETUP_LAYOUT, step: 1, items: [], answers: {} };

/** Setup has finished: the plan is ready to use. */
export function setupDone(progress: { readonly step?: unknown } | undefined): boolean {
  return progress?.step === 'done';
}

/** The screen that lists each kind of thing setup adds, with its Remove. */
export const SCREEN_OF_KIND: Readonly<Record<SetupItemKind, SetupStep>> = {
  account: 1,
  income: 2,
  'pay-details': 2,
  rent: 3,
  bill: 3,
  debt: 4,
  budget: 5,
  goal: 6,
};

/**
 * The old 8 steps (step 2e) and the new screen each carries on at (D356):
 * rent and bills are one screen now, and savings has left setup, so someone
 * on it carries on at "Here's your plan", where "Add a goal" is.
 */
export const OLD_STEP_TO_SCREEN: Readonly<Record<number, SetupStep>> = {
  0: 0,
  1: 1, // Your account
  2: 2, // How you're paid
  3: 3, // Rent or mortgage, now Home and bills
  4: 3, // Bills, now Home and bills
  5: 4, // Debts
  6: 5, // Spending money
  7: 6, // Savings, now "Add a goal" on Here's your plan
  8: 6, // Here's your plan
};

/** The screen a stored step is, from either layout. Anything it can't read starts at the first screen. */
function screenOf(step: unknown, old: boolean): SetupStep | 'done' {
  if (step === 'done') return 'done';
  if (typeof step !== 'number' || !Number.isInteger(step)) return 1;
  if (old) return OLD_STEP_TO_SCREEN[step] ?? 1;
  return step >= 0 && step <= SETUP_SCREENS ? (step as SetupStep) : 1;
}

/**
 * Progress as it was saved, on this phone or in the account, read as 6
 * screens in 3 parts (D356). Progress from the old 8 steps carries on at the
 * matching screen, with everything added kept and each item moved to the
 * screen that shows it now, so Remove still works. Saving it again saves the
 * new layout.
 */
export function upgradeSetup(saved: unknown): SetupProgress | undefined {
  if (saved === undefined || saved === null || typeof saved !== 'object') return undefined;
  const stored = saved as {
    readonly layout?: unknown;
    readonly step?: unknown;
    readonly items?: unknown;
    readonly answers?: unknown;
  };
  const old = stored.layout !== SETUP_LAYOUT;
  const items = Array.isArray(stored.items) ? (stored.items as SetupItem[]) : [];
  return {
    layout: SETUP_LAYOUT,
    step: screenOf(stored.step, old),
    // Each kind of thing has one screen that lists it, in either layout.
    items: items.map((item) => {
      const kind: SetupStep | undefined = (
        SCREEN_OF_KIND as Readonly<Record<string, SetupStep | undefined>>
      )[item.kind];
      const step = kind ?? screenOf(item.step, old);
      return { ...item, step: step === 'done' ? 1 : step };
    }),
    answers:
      stored.answers !== null && typeof stored.answers === 'object'
        ? (stored.answers as SetupAnswers)
        : {},
  };
}
