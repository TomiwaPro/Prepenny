// The app's side of the background worker: one worker for the whole app,
// with each request answered by its own promise.

import type { PlanRecords } from '@prepenny/engine';
import type { HomeView } from '../lib/home.ts';
import type { WorkResponse } from './messages.ts';

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
  resolve(home: HomeView): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, Waiting>();

/** Fails every request still waiting, and starts a fresh worker next time. */
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
    const answer = event.data;
    const request = waiting.get(answer.id);
    if (request === undefined) return;
    waiting.delete(answer.id);
    clearTimeout(request.timer);
    if (answer.ok) request.resolve(answer.home);
    else request.reject(new EngineError(answer.code));
  });
  started.addEventListener('messageerror', () => failAll('unreadable-answer'));
  started.addEventListener('error', () => failAll('worker'));
  worker = started;
  return started;
}

/** Everything Home shows, worked out in the background. */
export function workOutHomeInBackground(records: PlanRecords, today: string): Promise<HomeView> {
  return new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new EngineError('too-slow'));
    }, TIME_LIMIT_MS);
    waiting.set(id, { resolve, reject, timer });
    try {
      engineWorker().postMessage({ id, kind: 'home', records, today });
    } catch (error) {
      waiting.delete(id);
      clearTimeout(timer);
      reject(error instanceof Error ? error : new EngineError('worker'));
    }
  });
}
