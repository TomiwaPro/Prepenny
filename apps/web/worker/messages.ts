// What the app and the background worker send each other. Only records and
// figures cross; a refusal comes back as the engine's code alone, never its
// message, so no name or note can leak into an error report later (CLAUDE.md).

import type { PlanRecords } from '@prepenny/engine';
import type { HomeView } from '../lib/home.ts';

export interface HomeRequest {
  readonly id: number;
  readonly kind: 'home';
  readonly records: PlanRecords;
  readonly today: string;
}

export type WorkRequest = HomeRequest;

export type WorkResponse =
  | { readonly id: number; readonly ok: true; readonly home: HomeView }
  | { readonly id: number; readonly ok: false; readonly code: string };
