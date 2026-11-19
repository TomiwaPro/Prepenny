'use client';

// PrePenny updating itself (step 3e, rebuilt in step 4h, D594).
//
// A phone can keep PrePenny open for days, so it looks for a newer version
// when PrePenny opens, each time it comes back on screen or gets a signal,
// when a new offline helper takes charge, and every minute while it's on
// screen, signed in or not. A look asks the live site which version is live
// (/version.json, a few bytes, never from a copy), and the offline helper
// which version a fresh load would give (/offline-version.json, which the
// helper answers from the copy it keeps with the pages).
//
// - **Found:** as soon as a newer version is live, the note shows: "PrePenny
//   has been updated. Tap to reload." (D202). A signed-in phone also stops
//   sending changes until then (data/sync.ts, D386): they wait on the phone.
// - **On the phone:** the offline helper fetches the new version, every
//   file of it, which can take minutes on a weak signal. Nothing is loaded
//   meanwhile: loading afresh before the helper holds the new version would
//   only show the old one again (the fault found in step 4h).
// - **Loaded:** once the helper in charge holds the version that's live,
//   the page is loaded afresh at the first safe moment: no sheet open and
//   nothing typed that hasn't been sent, such as a setup screen half filled
//   in. Every change made meanwhile is saved on the phone and waits in the
//   queue (data/db.ts), so the new version sends it.
//
// It never loops: it loads afresh only for a version the phone holds, and
// only once for each version in a tab. A tap on the note loads it straight
// away when it's on the phone, and otherwise says it's being fetched.

import { useSyncExternalStore } from 'react';
import { TAKE_CHARGE } from '../service-worker/messages.ts';
import { noteUpdatedInTest } from './test-setting.ts';
import {
  appVersion,
  differs,
  lastAskedAt,
  liveVersion,
  noteAskedForNewVersion,
  type Version,
  versionOnReload,
} from './version.ts';

/**
 * What the update note shows: nothing; that PrePenny has been updated, with
 * a tap to reload; or, after a tap before the new version is on the phone,
 * that it's being fetched.
 */
export type UpdateState = 'none' | 'found' | 'getting';

let state: UpdateState = 'none';
const listeners = new Set<() => void>();

function setState(next: UpdateState) {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  startLooking();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What the update note shows now. Starts looking for new versions on first use. */
export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => 'none',
  );
}

/** True while the update note shows. */
export function useUpdateNoteShowing(): boolean {
  return useUpdateState() !== 'none';
}

// ---------------------------------------------------------------------------
// Something typed and not saved yet.

/** The boxes typed into since their form was last sent. */
const typedInto = new Set<Element>();
let watchingTyping = false;

function watchTyping() {
  if (watchingTyping || typeof document === 'undefined') return;
  watchingTyping = true;
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
    // Gone with its screen, or in a sheet that has closed: finished with.
    if (!box.isConnected || box.closest('dialog:not([open])') !== null) typedInto.delete(box);
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

/** Starts noting what's typed, so an update waiting for a safe moment knows. Called on every screen. */
export function noteTyping(): void {
  watchTyping();
}

// ---------------------------------------------------------------------------
// Loading the new version, once it's on the phone.

/** Where the phone notes, for this tab, when it last loaded afresh to update. */
const RELOADED_KEY = 'prepenny-updated-at';
/** And which version it loaded afresh for, so it never does twice for one (no loop). */
const RELOADED_FOR_KEY = 'prepenny-updated-to';

/** True when this page was loaded afresh by an update in the last few seconds or minutes. */
export function updatedWithin(ms: number, now = Date.now()): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOADED_KEY));
    return Number.isFinite(at) && at > 0 && now - at < ms && at <= now;
  } catch {
    return false;
  }
}

/** True when this tab has already loaded afresh for this version: doing it again would loop. */
function loadedAfreshFor(build: string): boolean {
  try {
    return sessionStorage.getItem(RELOADED_FOR_KEY) === build;
  } catch {
    return false;
  }
}

/** Loads the page afresh, noting it, so the app lock and the next look know. */
function reloadFor(build: string) {
  try {
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
    sessionStorage.setItem(RELOADED_FOR_KEY, build);
  } catch {
    // Without them, the app lock asks again; a fresh load still only
    // happens once the phone holds a version other than the one open.
  }
  noteUpdatedInTest();
  window.location.reload();
}

/** The version a fresh load gives, once it's known to be the new one; null until then. */
let onThePhone: string | null = null;
let waitingForSafeMoment = false;

/** Loads the new version at the first safe moment, now that it's on the phone. */
function loadWhenSafe(build: string) {
  onThePhone = build;
  if (waitingForSafeMoment || loadedAfreshFor(build)) return;
  waitingForSafeMoment = true;
  watchTyping();
  void (async () => {
    while (!safeToReload()) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // Another version is live meanwhile: the next look decides afresh.
      if (onThePhone !== build) {
        waitingForSafeMoment = false;
        return;
      }
    }
    reloadFor(build);
  })();
}

/**
 * The note's tap: loads the new version straight away when it's on the
 * phone; otherwise says it's being fetched, and it loads by itself once it
 * is, as long as no sheet is open and nothing has been typed since the tap.
 */
export function loadNewVersion(): void {
  if (onThePhone !== null && !loadedAfreshFor(onThePhone)) {
    reloadFor(onThePhone);
    return;
  }
  // Already loaded afresh for it once, and still on the old one: a tap tries again.
  if (onThePhone !== null) {
    window.location.reload();
    return;
  }
  // Asked for it: what's typed so far doesn't hold it up. Anything typed
  // from now on, or a sheet opened, still does.
  typedInto.clear();
  setState('getting');
  void lookForUpdate();
}

// ---------------------------------------------------------------------------
// Getting the new version onto the phone.

/** Helpers already being watched, so each is listened to once. */
const watched = new WeakSet<ServiceWorker>();

/**
 * Asks the offline helper for the new version. It fetches every file of it
 * before it takes charge, however long that takes on a weak signal; once it
 * has, `controllerchange` makes the next look, which loads it. If fetching
 * fails, as when the signal drops, the next look asks again, keeping the
 * files it already has.
 */
async function fetchNewVersion(): Promise<'fetching' | 'here' | 'not-now'> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'not-now';
  noteAskedForNewVersion();
  try {
    const helpers = navigator.serviceWorker;
    const registration = await helpers.getRegistration();
    if (registration === undefined) return 'not-now';
    let fetching = registration.installing ?? registration.waiting;
    if (fetching === null) {
      await registration.update();
      fetching = registration.installing ?? registration.waiting;
    }
    if (fetching === null) {
      // The newest helper is on the phone already. Not in charge of this
      // page, it's asked to take charge, and the look after loads it.
      if (helpers.controller === null) {
        registration.active?.postMessage(TAKE_CHARGE);
        return 'not-now';
      }
      return 'here';
    }
    if (!watched.has(fetching)) {
      watched.add(fetching);
      const helper = fetching;
      helper.addEventListener('statechange', () => {
        if (helper.state === 'activated') void lookForUpdate();
      });
    }
    return 'fetching';
  } catch {
    // No signal for now: the next look asks again.
    return 'not-now';
  }
}

// ---------------------------------------------------------------------------
// Looking.

/** Decides what to do from the live version and the one a fresh load gives. */
export function whatToDo(
  own: Version,
  live: Version | null,
  onReload: Version | null,
): 'nothing' | 'catch-up' | 'fetch' | 'load' {
  if (live !== null) {
    if (!differs(live, own)) {
      // This screen is the live version. A helper holding another one, as
      // after a version was taken back, quietly catches up.
      return onReload !== null && differs(onReload, own) ? 'catch-up' : 'nothing';
    }
    return onReload !== null && !differs(onReload, live) ? 'load' : 'fetch';
  }
  // No signal: what the phone holds is all there is to go by.
  return onReload !== null && differs(onReload, own) ? 'load' : 'nothing';
}

let looking: Promise<void> | null = null;
let lookAgain = false;

/** What a look did: `again` when the newest helper turned out to be here already, so one more look says what it holds. */
async function lookOnce(): Promise<'done' | 'again'> {
  const own = appVersion();
  const [live, onReload] = await Promise.all([liveVersion(), versionOnReload()]);
  const todo = whatToDo(own, live, onReload);
  if (todo === 'nothing' || todo === 'catch-up') {
    // The live version is this one after all, as when an update was taken
    // back: nothing to load, and no note.
    if (live !== null) {
      onThePhone = null;
      setState('none');
    }
    if (todo === 'catch-up') await fetchNewVersion();
    return 'done';
  }
  if (state === 'none') setState('found');
  if (todo === 'load' && onReload !== null) {
    loadWhenSafe(onReload.build);
    return 'done';
  }
  return (await fetchNewVersion()) === 'here' ? 'again' : 'done';
}

/**
 * Looks for a newer version now. Asked again while it looks, it looks once
 * more straight after. Signed in or not, on every screen of the app and setup.
 */
export function lookForUpdate(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (looking !== null) {
    lookAgain = true;
    return looking;
  }
  looking = (async () => {
    try {
      // One more look when the newest helper was here already, and only one,
      // so a site that says it's newer than anything it serves can't loop.
      let rounds = 0;
      do {
        lookAgain = false;
        rounds += 1;
        if ((await lookOnce()) === 'again' && rounds < 2) lookAgain = true;
      } while (lookAgain);
    } catch {
      // The next look tries again.
    } finally {
      looking = null;
    }
  })();
  return looking;
}

/**
 * A signed-in phone's look at the account found a newer version live
 * (data/sync.ts): it sends nothing until it has loaded it.
 */
export function updateWhenSafe(): void {
  void lookForUpdate();
}

/** How often an open PrePenny on screen looks for a newer version. */
const LOOK_EVERY_MS = 60_000;
let started = false;

/** Starts looking for new versions, once, when the update note first shows on a screen. */
function startLooking() {
  if (started || typeof window === 'undefined') return;
  started = true;
  watchTyping();
  const look = () => {
    if (document.visibilityState === 'visible') void lookForUpdate();
  };
  document.addEventListener('visibilitychange', look);
  window.addEventListener('online', look);
  // A signed-in phone's look at the account asks the live version every
  // minute too, and starts this look when it's newer: it isn't asked twice.
  setInterval(() => {
    if (Date.now() - lastAskedAt() >= LOOK_EVERY_MS - 5_000) look();
  }, LOOK_EVERY_MS);
  if ('serviceWorker' in navigator) {
    // A helper taking charge: the very first one on this phone, or a new
    // version. Either way the next look says which a fresh load would give.
    navigator.serviceWorker.addEventListener('controllerchange', () => void lookForUpdate());
  }
  look();
}
