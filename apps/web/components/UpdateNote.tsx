'use client';

// "PrePenny has been updated. Tap to reload." (D202): a small note at the
// bottom when a new version of PrePenny has arrived on the phone. The
// offline helper takes over as soon as a new version is on the phone, so
// the screen open now is the old version until it's loaded again. Tapping
// the note loads the new version straight away.

import { useSyncExternalStore } from 'react';
import { strings } from '../strings/en-GB.ts';
import styles from './UpdateNote.module.css';

let updated = false;
const listeners = new Set<() => void>();
let watching = false;

/** Listens once for a new version taking over this page, and checks for one when PrePenny comes back on screen. */
function watch() {
  if (watching || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  watching = true;
  const helpers = navigator.serviceWorker;
  // The very first offline helper takes over a page that had none: that's
  // not a new version, so only a change after that one counts.
  let hadOne = helpers.controller !== null;
  helpers.addEventListener('controllerchange', () => {
    if (hadOne && !updated) {
      updated = true;
      for (const listener of listeners) listener();
    }
    hadOne = true;
  });
  // A phone can keep PrePenny open for days, so it looks for a new version
  // each time PrePenny comes back on screen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    helpers
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {
        // No signal: it looks again next time.
      });
  });
}

function subscribe(listener: () => void) {
  watch();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True once a new version of PrePenny has taken over this page. */
export function useUpdated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => updated,
    () => false,
  );
}

/** The note, inside a live region that's always there, so screen readers hear it appear. */
export function UpdateNote() {
  const ready = useUpdated();
  return (
    <div role="status">
      {ready ? (
        <button
          type="button"
          className={styles.note}
          data-testid="update-note"
          data-update-note
          onClick={() => window.location.reload()}
        >
          {strings.banners.updated}
        </button>
      ) : null}
    </div>
  );
}
