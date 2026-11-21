'use client';

// PrePenny support's 7-day wait to turn off two-step sign-in (step 4j,
// D638): the server says so in its answer to `hello`, which a signed-in
// phone asks when PrePenny opens and every minute (data/sync.ts), and every
// screen shows the notice with "Stop it" until it's stopped or done, as for
// getting back in (data/get-back-in-notice.ts).

import { useSyncExternalStore } from 'react';

export interface TwoStepOffNotice {
  /** When support started it, a UTC time. */
  readonly startedAt: string;
  /** When two-step sign-in is turned off, 7 days on, a UTC time. */
  readonly endsAt: string;
}

let notice: TwoStepOffNotice | null = null;
const listeners = new Set<() => void>();

/** What the server said about it: the wait, or null when there's none. */
export function setTwoStepOffNotice(next: unknown): void {
  const one = next as { started_at?: unknown; ends_at?: unknown } | null;
  const found =
    one !== null &&
    typeof one === 'object' &&
    typeof one.started_at === 'string' &&
    typeof one.ends_at === 'string'
      ? { startedAt: one.started_at, endsAt: one.ends_at }
      : null;
  if (found?.startedAt === notice?.startedAt && found?.endsAt === notice?.endsAt) return;
  notice = found;
  for (const listener of listeners) listener();
}

/** The wait to show the notice for, or null, kept up to date. */
export function useTwoStepOffNotice(): TwoStepOffNotice | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => notice,
    () => null,
  );
}
