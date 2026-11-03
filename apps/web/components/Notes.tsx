'use client';

// Messages that can appear on any screen (ARCHITECTURE.md 4.5): the example
// plan banner, and a small, clear note when the phone is offline (brief Part 6).

import { useSyncExternalStore } from 'react';
import { strings } from '../strings/en-GB.ts';
import styles from './Notes.module.css';

export function ExampleBanner() {
  return (
    <p className={`${styles.note} ${styles.example}`} data-testid="example-banner">
      {strings.banners.example}
    </p>
  );
}

function listen(changed: () => void) {
  window.addEventListener('online', changed);
  window.addEventListener('offline', changed);
  return () => {
    window.removeEventListener('online', changed);
    window.removeEventListener('offline', changed);
  };
}

/** True while the phone has no connection. Always false before the page is running. */
export function useOffline(): boolean {
  return useSyncExternalStore(
    listen,
    () => !navigator.onLine,
    () => false,
  );
}

/** The words of the offline note, on their own. */
export function OfflineMessage() {
  return (
    <p className={`${styles.note} ${styles.offline}`} data-testid="offline-note">
      {strings.banners.offline}
    </p>
  );
}

/** The offline note, shown only while the phone is offline. Screen readers hear it appear. */
export function OfflineNote() {
  const offline = useOffline();
  return <div role="status">{offline ? <OfflineMessage /> : null}</div>;
}
