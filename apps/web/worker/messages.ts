// What the app and the background worker send each other. Only records and
// figures cross; a refusal comes back as the engine's code alone, never its
// message, so no name or note can leak into an error report later (CLAUDE.md).

import type { EditCommand, PlanRecords } from '@prepenny/engine';
import type { EditResult } from '../lib/edit.ts';
import type { HomeView } from '../lib/home.ts';
import type { PlanView, PlanViewOptions } from '../lib/plan-view.ts';

/** Everything Home shows. */
export interface HomeAsk {
  readonly kind: 'home';
  readonly records: PlanRecords;
  readonly today: string;
}

/** Everything the Plan screen shows. */
export interface PlanAsk {
  readonly kind: 'plan';
  readonly records: PlanRecords;
  readonly today: string;
  readonly options: PlanViewOptions;
}

/** One change, made by the engine. */
export interface EditAsk {
  readonly kind: 'edit';
  readonly records: PlanRecords;
  readonly today: string;
  readonly command: EditCommand;
}

export type Ask = HomeAsk | PlanAsk | EditAsk;

/** What each kind of question is answered with. */
export interface Answers {
  readonly home: HomeView;
  readonly plan: PlanView;
  readonly edit: EditResult;
}

export type WorkRequest = Ask & { readonly id: number };

export type WorkResponse =
  | { readonly id: number; readonly ok: true; readonly answer: Answers[Ask['kind']] }
  | { readonly id: number; readonly ok: false; readonly code: string };
