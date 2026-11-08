// The app's side of the background worker: one worker for the whole app,
// with each question answered by its own promise.

import type { EditCommand, PlanRecords } from '@prepenny/engine';
import type { ActionsView } from '../lib/actions-view.ts';
import type { EditResult, PaymentNumbers } from '../lib/edit.ts';
import type { HomeView } from '../lib/home.ts';
import type { PayCommand, PayPreview } from '../lib/pay-preview.ts';
import type { PaymentAt } from '../lib/payment-at.ts';
import type { PlanView, PlanViewOptions } from '../lib/plan-view.ts';
import type { SetupView } from '../lib/setup-view.ts';
import type { Answers, Ask, WorkResponse } from './messages.ts';

/** The worker's file, named by scripts/build-worker.ts after its contents (D170). */
const WORKER_FILE = process.env.NEXT_PUBLIC_ENGINE_WORKER;

/** How long to wait for an answer before saying the plan couldn't be worked out. */
const TIME_LIMIT_MS = 20_000;

/** A refusal from the engine, or the worker failing, with a code only: never a name or an amount. */
export class EngineError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`The engine couldn't answer: ${code}.`);
    this.name = 'EngineError';
    this.code = code;
  }
}

interface Waiting {
  resolve(answer: Answers[Ask['kind']]): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, Waiting>();

/** Fails every question still waiting, and starts a fresh worker next time. */
function failAll(code: string) {
  for (const request of waiting.values()) {
    clearTimeout(request.timer);
    request.reject(new EngineError(code));
  }
  waiting.clear();
  worker?.terminate();
  worker = null;
}

function engineWorker(): Worker {
  if (worker !== null) return worker;
  if (WORKER_FILE === undefined) throw new EngineError('no-worker-file');
  const started = new Worker(WORKER_FILE);
  started.addEventListener('message', (event: MessageEvent<WorkResponse>) => {
    const response = event.data;
    const request = waiting.get(response.id);
    if (request === undefined) return;
    waiting.delete(response.id);
    clearTimeout(request.timer);
    if (response.ok) request.resolve(response.answer);
    else request.reject(new EngineError(response.code));
  });
  started.addEventListener('messageerror', () => failAll('unreadable-answer'));
  started.addEventListener('error', () => failAll('worker'));
  worker = started;
  return started;
}

/** Any question the worker answers, worked out in the background. */
export function askInBackground<K extends Ask['kind']>(
  question: Extract<Ask, { kind: K }>,
): Promise<Answers[K]> {
  return ask(question);
}

function ask<K extends Ask['kind']>(question: Extract<Ask, { kind: K }>): Promise<Answers[K]> {
  return new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new EngineError('too-slow'));
    }, TIME_LIMIT_MS);
    waiting.set(id, {
      resolve: resolve as (answer: Answers[Ask['kind']]) => void,
      reject,
      timer,
    });
    try {
      engineWorker().postMessage({ ...question, id });
    } catch (error) {
      waiting.delete(id);
      clearTimeout(timer);
      reject(error instanceof EngineError ? error : new EngineError('worker'));
    }
  });
}

/** Everything Home shows, worked out in the background. */
export function workOutHomeInBackground(records: PlanRecords, today: string): Promise<HomeView> {
  return ask({ kind: 'home', records, today });
}

/** Everything the Plan screen shows, worked out in the background. */
export function workOutPlanInBackground(
  records: PlanRecords,
  today: string,
  options: PlanViewOptions,
): Promise<PlanView> {
  return ask({ kind: 'plan', records, today, options });
}

/** One change, made by the engine in the background. Refused with an EngineError and its code. */
export function editInBackground(
  records: PlanRecords,
  today: string,
  command: EditCommand,
  numbers?: PaymentNumbers,
): Promise<EditResult> {
  return ask({
    kind: 'edit',
    records,
    today,
    command,
    ...(numbers === undefined ? {} : { numbers }),
  });
}

/** What the four actions on Home need, worked out in the background. */
export function workOutActionsInBackground(
  records: PlanRecords,
  today: string,
): Promise<ActionsView> {
  return ask({ kind: 'actions', records, today });
}

/** What overtime or a missed shift would do, worked out in the background without saving it. */
export function previewPayInBackground(
  records: PlanRecords,
  today: string,
  command: PayCommand,
): Promise<PayPreview> {
  return ask({ kind: 'pay-preview', records, today, command });
}

/**
 * Several changes made in turn by the engine, as one edit (step 2e). With
 * `madeOn`, each payment the commands name is found again on these records
 * by its family and number first, as for "Put mine back" (step 3d).
 */
export function editsInBackground(
  records: PlanRecords,
  today: string,
  commands: readonly EditCommand[],
  madeOn?: readonly PaymentAt[],
): Promise<EditResult> {
  return ask({
    kind: 'edits',
    records,
    today,
    commands,
    ...(madeOn === undefined ? {} : { madeOn }),
  });
}

/** What to do with one waiting change, against the newest records, in the background (step 3d). */
export function settleInBackground(
  question: Omit<Extract<Ask, { kind: 'settle' }>, 'kind'>,
): Promise<Answers['settle']> {
  return ask({ kind: 'settle', ...question });
}

/** The words' facts for a change of this phone's that wasn't kept, in the background (step 3d). */
export function clashFactsInBackground(
  question: Omit<Extract<Ask, { kind: 'clash-facts' }>, 'kind'>,
): Promise<Answers['clash-facts']> {
  return ask({ kind: 'clash-facts', ...question });
}

/** What setup shows that only the engine can work out, in the background (step 2e). */
export function workOutSetupInBackground(records: PlanRecords, today: string): Promise<SetupView> {
  return ask({ kind: 'setup', records, today });
}

/** What to send the server for a change, or a whole plan, worked out in the background (step 3c). */
export function syncWritesInBackground(
  question: Omit<Extract<Ask, { kind: 'sync-writes' }>, 'kind'>,
): Promise<Answers['sync-writes']> {
  return ask({ kind: 'sync-writes', ...question });
}

/** The plan from the server's rows, with the changes not sent yet on top (step 3c). */
export function syncRecordsInBackground(
  rows: Extract<Ask, { kind: 'sync-records' }>['rows'],
  unsent: Extract<Ask, { kind: 'sync-records' }>['unsent'],
): Promise<Answers['sync-records']> {
  return ask({ kind: 'sync-records', rows, unsent });
}
