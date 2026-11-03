// The app's side of the background worker: one worker for the whole app,
// with each request answered by its own promise.

import type { PlanRecords } from '@prepenny/engine';
import type { HomeView } from '../lib/home.ts';
import type { WorkResponse } from './messages.ts';

/** A refusal from the engine, with its code only. */
export class EngineError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`The engine refused: ${code}.`);
    this.name = 'EngineError';
    this.code = code;
  }
}

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve(home: HomeView): void; reject(error: Error): void }>();

function engineWorker(): Worker {
  if (worker !== null) return worker;
  worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<WorkResponse>) => {
    const answer = event.data;
    const promise = waiting.get(answer.id);
    if (promise === undefined) return;
    waiting.delete(answer.id);
    if (answer.ok) promise.resolve(answer.home);
    else promise.reject(new EngineError(answer.code));
  });
  worker.addEventListener('error', () => {
    for (const promise of waiting.values()) promise.reject(new EngineError('worker'));
    waiting.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

/** Everything Home shows, worked out in the background. */
export function workOutHomeInBackground(records: PlanRecords, today: string): Promise<HomeView> {
  return new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    waiting.set(id, { resolve, reject });
    engineWorker().postMessage({ id, kind: 'home', records, today });
  });
}
