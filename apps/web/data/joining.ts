'use client';

// Someone let into a plan whose phone still has to bring their own plan in
// (step 3f-2, D426): the server says so in its answer to `hello`, which a
// signed-in phone asks when PrePenny opens, every minute and at every nudge
// (data/sync.ts). Allowing nudges the asker's phones, so "Finish joining"
// shows on any screen within seconds. Kept in memory only: the server is
// asked again each time.

import { useSyncExternalStore } from 'react';
import { type Joining, joiningOf } from '../lib/sharing.ts';

let joining: readonly Joining[] = [];
const listeners = new Set<() => void>();

/** What the server said: the invites this person was let in with, waiting for their plan. */
export function setJoining(next: unknown): void {
  const found = joiningOf(next);
  const same =
    found.length === joining.length && found.every((one, i) => one.invite === joining[i]?.invite);
  if (same) return;
  joining = found;
  for (const listener of listeners) listener();
}

export function useJoining(): readonly Joining[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => joining,
    () => joining,
  );
}
