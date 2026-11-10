'use client';

// Someone getting back into this account with its backup email (step 3e
// hardening): the server says so in its answer to `hello`, which a
// signed-in phone asks when PrePenny opens and every minute (data/sync.ts),
// and every screen shows the notice with "Stop it" until it's stopped,
// finished or run out.

import { useSyncExternalStore } from 'react';

export interface GetBackInNotice {
  /** When it was asked for, a UTC time. */
  readonly startedAt: string;
  /** When it can be finished, 24 hours on, a UTC time. */
  readonly readyAt: string;
}

let notice: GetBackInNotice | null = null;
/** How many times the notice has changed, so an answer asked for before a change can be left out (D404). */
let changes = 0;
const listeners = new Set<() => void>();

/** How many times the notice has changed since PrePenny opened. */
export function getBackInNoticeChanges(): number {
  return changes;
}

/** What the server said about it: the request, or null when there's none. */
export function setGetBackInNotice(next: unknown): void {
  const found =
    next !== null &&
    typeof next === 'object' &&
    typeof (next as { started_at?: unknown }).started_at === 'string' &&
    typeof (next as { ready_at?: unknown }).ready_at === 'string'
      ? {
          startedAt: (next as { started_at: string }).started_at,
          readyAt: (next as { ready_at: string }).ready_at,
        }
      : null;
  if (found?.startedAt === notice?.startedAt && found?.readyAt === notice?.readyAt) return;
  notice = found;
  changes += 1;
  for (const listener of listeners) listener();
}

/** The request to show the notice for, or null, kept up to date. */
export function useGetBackInNotice(): GetBackInNotice | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => notice,
    () => null,
  );
}
