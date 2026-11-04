// What the app and the background worker send each other. Only records and
// figures cross; a refusal comes back as the engine's code alone, never its
// message, so no name or note can leak into an error report later (CLAUDE.md).

import type { CardComparison, EditCommand, PlanRecords } from '@prepenny/engine';
import type { ActionsView } from '../lib/actions-view.ts';
import type { CompareAsk as CompareRequest, DebtsView } from '../lib/debts-view.ts';
import type { EditResult } from '../lib/edit.ts';
import type { HomeView } from '../lib/home.ts';
import type { AccountsView, BudgetsView, GoalsView } from '../lib/money-views.ts';
import type { PayCommand, PayPreview } from '../lib/pay-preview.ts';
import type { PlanView, PlanViewOptions } from '../lib/plan-view.ts';
import type { SetupView } from '../lib/setup-view.ts';

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

/** What the four actions on Home need (D197 to D200). */
export interface ActionsAsk {
  readonly kind: 'actions';
  readonly records: PlanRecords;
  readonly today: string;
}

/** What "I did overtime" or "I missed a shift" would do, without saving it (D200). */
export interface PayPreviewAsk {
  readonly kind: 'pay-preview';
  readonly records: PlanRecords;
  readonly today: string;
  readonly command: PayCommand;
}

/** Several changes made in turn, as one edit, for setup (step 2e). */
export interface EditsAsk {
  readonly kind: 'edits';
  readonly records: PlanRecords;
  readonly today: string;
  readonly commands: readonly EditCommand[];
}

/** What setup shows that only the engine can work out (step 2e). */
export interface SetupAsk {
  readonly kind: 'setup';
  readonly records: PlanRecords;
  readonly today: string;
}

/** The screens under Debts and More that the worker works out (step 2f). */
export type ScreenKind = 'debts' | 'budgets' | 'goals' | 'accounts';

/** What one of the screens under Debts or More shows (step 2f). */
export type ScreenAsk = {
  readonly [K in ScreenKind]: {
    readonly kind: K;
    readonly records: PlanRecords;
    readonly today: string;
  };
}[ScreenKind];

/** Comparing ways to pay a credit card (brief 4.6, D102). */
export interface CompareAsk {
  readonly kind: 'compare';
  readonly records: PlanRecords;
  readonly today: string;
  readonly compare: CompareRequest;
}

export type Ask =
  | HomeAsk
  | PlanAsk
  | EditAsk
  | ActionsAsk
  | PayPreviewAsk
  | EditsAsk
  | SetupAsk
  | ScreenAsk
  | CompareAsk;

/** What each kind of question is answered with. */
export interface Answers {
  readonly home: HomeView;
  readonly plan: PlanView;
  readonly edit: EditResult;
  readonly actions: ActionsView;
  readonly 'pay-preview': PayPreview;
  readonly edits: EditResult;
  readonly setup: SetupView;
  readonly debts: DebtsView;
  readonly budgets: BudgetsView;
  readonly goals: GoalsView;
  readonly accounts: AccountsView;
  readonly compare: CardComparison;
}

export type WorkRequest = Ask & { readonly id: number };

export type WorkResponse =
  | { readonly id: number; readonly ok: true; readonly answer: Answers[Ask['kind']] }
  | { readonly id: number; readonly ok: false; readonly code: string };
