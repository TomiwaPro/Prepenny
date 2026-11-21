'use client';

// Support's own account signed in on PrePenny's app (step 4j, D640). It
// never has a plan, so while it's signed in on a phone the app shows only
// "This is PrePenny support's account. Open the support dashboard instead."
// (components/SupportAccountScreen.tsx), with no setup and no plan. This
// phone remembers that it's signed in to support's account, so the line
// shows at once each time PrePenny opens; the database says so when the
// account signs in, and in every hello after (supabase/migrations, step 4j).
// Signing out forgets it.

import { useSyncExternalStore } from 'react';

const KEY = 'prepenny-support-account';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** True when this phone is signed in to support's own account. */
export function supportAccountHere(): boolean {
  return read();
}

export function setSupportAccountHere(here: boolean): void {
  if (read() === here) return;
  try {
    if (here) localStorage.setItem(KEY, 'yes');
    else localStorage.removeItem(KEY);
  } catch {
    // A browser that keeps nothing: the database says so again next time.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab signing in or out.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** Whether this phone is signed in to support's own account, kept up to date. */
export function useSupportAccountHere(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
