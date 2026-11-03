// The app's side of the background worker: one worker for the whole app,
// with each question answered by its own promise.

import type { EditCommand, PlanRecords } from '@prepenny/engine';
import type { EditResult } from '../lib/edit.ts';
import type { HomeView } from '../lib/home.ts';
import type { PlanView, PlanViewOptions } from '../lib/plan-view.ts';
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
): Promise<EditResult> {
  return ask({ kind: 'edit', records, today, command });
}
