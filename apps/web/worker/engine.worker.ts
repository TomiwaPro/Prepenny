// The background worker that runs the engine (ARCHITECTURE.md 2.8 point 7),
// so working out the plan never makes the screen stutter on a cheap phone.

import { EngineInputError } from '@prepenny/engine';
import { workOutHome } from '../lib/home.ts';
import type { WorkRequest, WorkResponse } from './messages.ts';

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkRequest>) => void): void;
  postMessage(message: WorkResponse): void;
}

const scope = self as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  const request = event.data;
  try {
    scope.postMessage({
      id: request.id,
      ok: true,
      home: workOutHome(request.records, request.today),
    });
  } catch (error) {
    const code = error instanceof EngineInputError ? error.code : 'unexpected';
    scope.postMessage({ id: request.id, ok: false, code });
  }
});
