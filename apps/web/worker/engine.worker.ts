// The background worker that runs the engine (ARCHITECTURE.md 2.8 point 7),
// so working out the plan never makes the screen stutter on a cheap phone.

import { EngineInputError } from '@prepenny/engine';
import { workOutActionsView } from '../lib/actions-view.ts';
import { runEdit, runEdits } from '../lib/edit.ts';
import { workOutHome } from '../lib/home.ts';
import { previewPayChange } from '../lib/pay-preview.ts';
import { workOutPlanView } from '../lib/plan-view.ts';
import { workOutSetupView } from '../lib/setup-view.ts';
import type { Answers, Ask, WorkRequest, WorkResponse } from './messages.ts';

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkRequest>) => void): void;
  postMessage(message: WorkResponse): void;
}

const scope = self as unknown as WorkerScope;

function answer(ask: Ask): Answers[Ask['kind']] {
  switch (ask.kind) {
    case 'home':
      return workOutHome(ask.records, ask.today);
    case 'plan':
      return workOutPlanView(ask.records, ask.today, ask.options);
    case 'edit':
      return runEdit(ask.records, ask.today, ask.command);
    case 'actions':
      return workOutActionsView(ask.records, ask.today);
    case 'pay-preview':
      return previewPayChange(ask.records, ask.today, ask.command);
    case 'edits':
      return runEdits(ask.records, ask.today, ask.commands);
    case 'setup':
      return workOutSetupView(ask.records, ask.today);
    default:
      throw new EngineInputError('bad-request', 'The worker was asked something it does not know.');
  }
}

scope.addEventListener('message', (event) => {
  const request = event.data;
  try {
    scope.postMessage({ id: request.id, ok: true, answer: answer(request) });
  } catch (error) {
    const code = error instanceof EngineInputError ? error.code : 'unexpected';
    scope.postMessage({ id: request.id, ok: false, code });
  }
});
