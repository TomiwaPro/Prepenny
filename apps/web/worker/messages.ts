// What the app and the background worker send each other. Only records and
// figures cross; a refusal comes back as the engine's code alone, never its
// message, so no name or note can leak into an error report later (CLAUDE.md).

import type { CardComparison, EditCommand, PlanRecords, RecordWrite } from '@prepenny/engine';
import type { ActionsView } from '../lib/actions-view.ts';
import type { ClashFacts, ReplacedAsk, SettleAsk, Settled } from '../lib/clash.ts';
import type { CompareAsk as CompareRequest, DebtsView } from '../lib/debts-view.ts';
import type { EditResult, PaymentNumbers } from '../lib/edit.ts';
import type { HomeView } from '../lib/home.ts';
import type { JobPreview, JobView } from '../lib/job-view.ts';
import type { AccountsView, BudgetsView, GoalsView } from '../lib/money-views.ts';
import type { PayCommand, PayPreview } from '../lib/pay-preview.ts';
import type { PayView } from '../lib/pay-view.ts';
import type { PaymentAt } from '../lib/payment-at.ts';
import type { PlanView, PlanViewOptions } from '../lib/plan-view.ts';
import type { SetupProgress } from '../lib/setup-progress.ts';
import type { SetupView } from '../lib/setup-view.ts';
import type { DbWrite, FromRows, MirrorRow, SyncPlan } from '../lib/sync-rows.ts';
import type { WhatIfView } from '../lib/what-if-view.ts';

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
  /** For an undo: the payment numbers its edit was made with (PLAN.md item 4). */
  readonly numbers?: PaymentNumbers;
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
  /** The payments the commands were about when first made, found again on these records ("Put mine back", step 3d). */
  readonly madeOn?: readonly PaymentAt[];
}

/** What setup shows that only the engine can work out (step 2e). */
export interface SetupAsk {
  readonly kind: 'setup';
  readonly records: PlanRecords;
  readonly today: string;
}

/** The screens under Debts and More that the worker works out (step 2f). */
export type ScreenKind = 'debts' | 'budgets' | 'goals' | 'accounts' | 'job';

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

/** What the pay calculator needs from the plan (brief 4.15, step 2g). */
export interface PayAsk {
  readonly kind: 'pay';
  readonly records: PlanRecords;
  readonly today: string;
}

/** The real plan and the practice plan side by side, for What if (brief 4.10, D135). */
export interface WhatIfAsk {
  readonly kind: 'what-if';
  readonly records: PlanRecords;
  readonly today: string;
  /** The practice changes, made in turn on a copy of the plan. */
  readonly practice: readonly EditCommand[];
}

/** What a change to a job's details would do to paydays still to come (D154, step 2h). */
export interface JobPreviewAsk {
  readonly kind: 'job-preview';
  readonly records: PlanRecords;
  readonly today: string;
  readonly profileId: string;
  readonly commands: readonly EditCommand[];
}

/**
 * What to send the server (step 3c): for one unsent change (`writes`), or for
 * a whole plan, the first time (`records`), against the rows it has.
 */
export interface SyncWritesAsk {
  readonly kind: 'sync-writes';
  readonly plan: SyncPlan;
  readonly rows: readonly MirrorRow[];
  readonly records?: PlanRecords;
  readonly writes?: readonly RecordWrite[];
  readonly setup?: SetupProgress;
}

/** The plan from the server's rows, with the changes not sent yet on top (step 3c). */
export interface SyncRecordsAsk {
  readonly kind: 'sync-records';
  readonly rows: readonly MirrorRow[];
  readonly unsent: readonly (readonly RecordWrite[])[];
  /** The person signed in on this phone, for whose pay a shared budget follows (D508). */
  readonly personId: string;
}

/** What to do with one waiting change, against the newest records (step 3d, lib/clash.ts). */
export type SettleChangeAsk = SettleAsk & { readonly kind: 'settle' };

/** The words' facts for a change of this phone's that wasn't kept (step 3d). */
export type ClashFactsAsk = ReplacedAsk & { readonly kind: 'clash-facts' };

export type Ask =
  | SettleChangeAsk
  | ClashFactsAsk
  | SyncWritesAsk
  | SyncRecordsAsk
  | HomeAsk
  | JobPreviewAsk
  | WhatIfAsk
  | PayAsk
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
  readonly 'what-if': WhatIfView;
  readonly pay: PayView;
  readonly job: JobView;
  readonly 'job-preview': JobPreview;
  readonly 'sync-writes': readonly DbWrite[];
  readonly 'sync-records': FromRows;
  readonly settle: Settled;
  readonly 'clash-facts': ClashFacts;
}

export type WorkRequest = Ask & { readonly id: number };

export type WorkResponse =
  | { readonly id: number; readonly ok: true; readonly answer: Answers[Ask['kind']] }
  | { readonly id: number; readonly ok: false; readonly code: string };
