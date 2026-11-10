'use client';

// Someone asking to join the person's plan (step 3f): the server says so in
// its answer to `hello`, which a signed-in phone asks when PrePenny opens,
// every minute and at every nudge (data/sync.ts). Asking nudges the owner's
// phones, so "Jess wants to join your plan" shows within seconds. Kept in
// memory only: the server is asked again each time.

import { useSyncExternalStore } from 'react';
import { type JoinRequest, requestsOf } from '../lib/sharing.ts';

let requests: readonly JoinRequest[] = [];
/** Requests answered on this phone, left out until the server stops sending them. */
const answered = new Set<string>();
const listeners = new Set<() => void>();

function tell() {
  for (const listener of listeners) listener();
}

/** What the server said: the requests waiting for this person's answer. */
export function setJoinRequests(next: unknown): void {
  const found = requestsOf(next).filter((one) => !answered.has(one.invite));
  const same =
    found.length === requests.length && found.every((one, i) => one.invite === requests[i]?.invite);
  if (same) return;
  requests = found;
  tell();
}

/** Once answered here, a request goes at once, without waiting for the server's next answer. */
export function answeredHere(invite: string): void {
  answered.add(invite);
  requests = requests.filter((one) => one.invite !== invite);
  tell();
}

export function useJoinRequests(): readonly JoinRequest[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => requests,
    () => requests,
  );
}
