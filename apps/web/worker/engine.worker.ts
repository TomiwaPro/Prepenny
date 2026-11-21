// The background worker that runs the engine (ARCHITECTURE.md 2.8 point 7),
// so working out the plan never makes the screen stutter on a cheap phone.

import { EngineInputError } from '@prepenny/engine';
import { workOutActionsView } from '../lib/actions-view.ts';
import { replacedFacts, settleChange } from '../lib/clash.ts';
import { compareWaysToPay, workOutDebtsView } from '../lib/debts-view.ts';
import { runEdit, runEdits } from '../lib/edit.ts';
import { workOutHome } from '../lib/home.ts';
import { previewJobChange, workOutJobView } from '../lib/job-view.ts';
import { workOutAccountsView, workOutBudgetsView, workOutGoalsView } from '../lib/money-views.ts';
import { previewPayChange } from '../lib/pay-preview.ts';
import { workOutPayView } from '../lib/pay-view.ts';
import { preparePicture } from '../lib/picture.ts';
import { workOutPlanView } from '../lib/plan-view.ts';
import { workOutSetupView } from '../lib/setup-view.ts';
import { syncRecords, syncWrites } from '../lib/sync-work.ts';
import { workOutWhatIfView } from '../lib/what-if-view.ts';
import type { Answers, Ask, WorkRequest, WorkResponse } from './messages.ts';

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkRequest>) => void): void;
  postMessage(message: WorkResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

function answer(ask: Exclude<Ask, { kind: 'picture' }>): Answers[Ask['kind']] {
  switch (ask.kind) {
    case 'home':
      return workOutHome(ask.records, ask.today);
    case 'plan':
      return workOutPlanView(ask.records, ask.today, ask.options);
    case 'edit':
      return runEdit(ask.records, ask.today, ask.command, ask.numbers);
    case 'actions':
      return workOutActionsView(ask.records, ask.today);
    case 'pay-preview':
      return previewPayChange(ask.records, ask.today, ask.command);
    case 'edits':
      return runEdits(ask.records, ask.today, ask.commands, ask.madeOn);
    case 'setup':
      return workOutSetupView(ask.records, ask.today);
    case 'debts':
      return workOutDebtsView(ask.records, ask.today);
    case 'budgets':
      return workOutBudgetsView(ask.records, ask.today);
    case 'goals':
      return workOutGoalsView(ask.records, ask.today);
    case 'accounts':
      return workOutAccountsView(ask.records, ask.today);
    case 'compare':
      return compareWaysToPay(ask.records, ask.today, ask.compare);
    case 'pay':
      return workOutPayView(ask.records, ask.today);
    case 'job':
      return workOutJobView(ask.records, ask.today);
    case 'job-preview':
      return previewJobChange(ask.records, ask.today, ask.profileId, ask.commands);
    case 'sync-writes':
      return syncWrites(ask);
    case 'sync-records':
      return syncRecords(ask.rows, ask.unsent, ask.personId);
    case 'settle':
      return settleChange(ask);
    case 'clash-facts':
      return replacedFacts(ask);
    case 'what-if':
      return workOutWhatIfView(ask.records, ask.today, ask.practice);
    default:
      throw new EngineInputError('bad-request', 'The worker was asked something it does not know.');
  }
}

scope.addEventListener('message', (event) => {
  const request = event.data;
  if (request.kind === 'picture') {
    // A picture is drawn and saved here, off the screen, so it never waits for
    // the screen to be idle (step 4k). The engine's questions are answered
    // meanwhile; the picture's bytes are handed over, not copied. A browser
    // that can't draw in a worker is told so, and the screen does it instead.
    if (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') {
      scope.postMessage({ id: request.id, ok: false, code: 'no-drawing-here' });
      return;
    }
    void preparePicture(request.file).then((ready) =>
      scope.postMessage(
        { id: request.id, ok: true, answer: ready },
        ready.ok ? [ready.file.bytes.buffer as ArrayBuffer] : [],
      ),
    );
    return;
  }
  try {
    scope.postMessage({ id: request.id, ok: true, answer: answer(request) });
  } catch (error) {
    const code = error instanceof EngineInputError ? error.code : 'unexpected';
    scope.postMessage({ id: request.id, ok: false, code });
  }
});
