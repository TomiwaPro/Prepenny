'use client';

// PrePenny updating itself (step 3e). When a newer version is live, a
// signed-in phone stops sending changes and bringing the plan down, fetches
// the new version, and loads it at a safe moment: never with a sheet open,
// and never with something typed that hasn't been saved, such as a setup
// screen half filled in. Every change made meanwhile is saved on the phone
// and waits in the queue (data/db.ts), so the new version sends it.
//
// The offline helper (service-worker/sw.ts) takes over as soon as the new
// version has arrived, but the screen already open is still the old one
// until it's loaded again: that's what the safe moment is for.

import { useSyncExternalStore } from 'react';
import { noteUpdatedInTest } from './test-setting.ts';

let wanted = false;
const listeners = new Set<() => void>();

function setWanted(next: boolean) {
  if (wanted === next) return;
  wanted = next;
  for (const listener of listeners) listener();
}

/** True while PrePenny is waiting for a safe moment to load its new version. */
export function useUpdateWanted(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => wanted,
    () => false,
  );
}

// ---------------------------------------------------------------------------
// Something typed and not saved yet.

/** The boxes typed into since their form was last sent. */
const typedInto = new Set<Element>();
let watching = false;

function watchTyping() {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  document.addEventListener(
    'input',
    (event) => {
      if (event.target instanceof Element) typedInto.add(event.target);
    },
    true,
  );
  // A form sent is saved, or says what to put right, so what's in it is
  // either kept or still there to see; either way the person has finished
  // with it for now. A box that has gone, with its sheet or its screen, is
  // finished with too (stillTyping).
  document.addEventListener(
    'submit',
    (event) => {
      for (const box of [...typedInto]) {
        if (event.target instanceof Node && event.target.contains(box)) typedInto.delete(box);
      }
    },
    true,
  );
}

/** True while a box on the screen holds something typed that hasn't been sent. */
function stillTyping(): boolean {
  for (const box of [...typedInto]) {
    if (!box.isConnected) typedInto.delete(box);
  }
  return typedInto.size > 0;
}

/**
 * True when loading the page afresh loses nothing: no sheet or dialog open,
 * and nothing typed waiting to be sent.
 */
export function safeToReload(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.querySelector('dialog[open]') !== null) return false;
  return !stillTyping();
}

// ---------------------------------------------------------------------------
// Fetching the new version, then loading it.

/** Where the phone notes, for this tab, when it last loaded afresh to update. */
const RELOADED_KEY = 'prepenny-updated-at';
/** Loaded afresh to update no more often than this, so a site still part-way through updating can't keep reloading it. */
const AT_MOST_EVERY_MS = 2 * 60 * 1000;

/** True when this page was loaded afresh by an update in the last few minutes. */
export function updatedWithin(ms: number, now = Date.now()): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOADED_KEY));
    return Number.isFinite(at) && at > 0 && now - at < ms && at <= now;
  } catch {
    return false;
  }
}

/**
 * Asks the offline helper for the new version, and waits for it to take
 * over, for half a minute at most. With no offline helper, loading the page
 * afresh fetches the new version itself.
 */
async function fetchNewVersion(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration === undefined) return;
    const changed = new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
    await registration.update();
    if (registration.installing === null && registration.waiting === null) return;
    await Promise.race([changed, new Promise((resolve) => setTimeout(resolve, 30_000))]);
  } catch {
    // No signal for now: loading afresh fetches what it can.
  }
}

/**
 * Updates PrePenny: fetches the new version, then loads it at the first
 * safe moment. Called once a signed-in phone knows a newer version is live.
 */
export function updateWhenSafe(): void {
  if (wanted || typeof window === 'undefined') return;
  if (updatedWithin(AT_MOST_EVERY_MS)) return;
  watchTyping();
  setWanted(true);
  void (async () => {
    await fetchNewVersion();
    while (!safeToReload()) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    try {
      sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
    } catch {
      // Without it, the next look may update again, no more.
    }
    noteUpdatedInTest();
    window.location.reload();
  })();
}

/** Starts noting what's typed, so an update waiting for a safe moment knows. Called on every screen. */
export function noteTyping(): void {
  watchTyping();
}
