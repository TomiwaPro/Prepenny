// How far first-time setup has got (brief 4.1, D163, step 2e). It's kept
// with the person's own plan on the phone, so leaving part-way keeps what's
// done and opening PrePenny again carries on at the same step.
//
// Every record setup adds is made by the engine's commands (D149). Each thing
// added is kept here with its edit, so "Remove" can take it back as one undo
// (D87) while setup is still going.

import type { Edit } from '@prepenny/engine';

/** The steps: 0 is the welcome, 1 to 8 the steps people count. */
export type SetupStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** How many steps people count: "Step 2 of 8". */
export const SETUP_STEPS = 8;

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
  readonly noRent?: true;
  readonly noDebts?: true;
  /** "Do you ever work extra hours or miss shifts?" */
  readonly extraHours?: 'yes' | 'no';
}

export interface SetupProgress {
  /** The step showing, or done once "Go to my plan" has been tapped. */
  readonly step: SetupStep | 'done';
  readonly items: readonly SetupItem[];
  readonly answers: SetupAnswers;
}

export const NEW_SETUP: SetupProgress = { step: 1, items: [], answers: {} };

/** Setup has finished: the plan is ready to use. */
export function setupDone(progress: SetupProgress | undefined): boolean {
  return progress?.step === 'done';
}
