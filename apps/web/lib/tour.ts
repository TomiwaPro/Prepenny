'use client';

// The 60-second tour of Home (step 4h, D597, the owner's answer: offer it,
// don't force it). A card on Home offers it once after setup; "No thanks"
// or finishing the tour takes the card away for good; More, under Help,
// starts it any time, with "#tour" in Home's address, which the offline
// helper serves with no signal.
//
// What's kept, on this phone only, like the home-screen suggestion (D547):
// that the card has gone, the same whether the tour was taken or not, so
// nothing says which (D598). Nothing is sent anywhere, and signing out
// removes it with everything else (D308).

import { useSyncExternalStore } from 'react';

const KEY = 'prepenny-tour';
const GONE = 'card-gone';

let open = false;
/** Gone for good, also on a phone that can't keep it, for as long as PrePenny is open. */
let goneHere = false;
const listeners = new Set<() => void>();

function tell() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True once the card has gone for good on this phone. Read on the phone only. */
export function tourCardGone(): boolean {
  if (goneHere) return true;
  try {
    return localStorage.getItem(KEY) === GONE;
  } catch {
    return false;
  }
}

/** "No thanks", or the tour finished: the card goes for good. */
export function keepTourCardGone(): void {
  goneHere = true;
  try {
    localStorage.setItem(KEY, GONE);
  } catch {
    // Kept for as long as PrePenny is open.
  }
  tell();
}

/** True once the card has gone for good, as it changes. Undefined until it's read on the phone. */
export function useTourCardGone(): boolean | undefined {
  return useSyncExternalStore(subscribe, tourCardGone, () => undefined);
}

export function startTour(): void {
  if (open) return;
  open = true;
  tell();
}

export function closeTour(): void {
  if (!open) return;
  open = false;
  tell();
}

/** True while the tour is open. */
export function useTourOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}
