'use client';

// "PrePenny has been updated. Tap to reload." (D202): a small note at the
// bottom as soon as PrePenny knows a newer version is live (lib/update.ts).
// PrePenny loads the new version by itself at the first safe moment, once
// it's on the phone; a tap loads it straight away. A tap before it's on the
// phone, which can take minutes on a weak signal, says it's being fetched,
// and it opens by itself once it is (step 4h, D594).

import { loadNewVersion, useUpdateState } from '../lib/update.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './UpdateNote.module.css';

/**
 * The note, inside a live region that's always there, so screen readers hear
 * it appear, and hear it change after a tap.
 */
export function UpdateNote() {
  const state = useUpdateState();
  return (
    <div role="status">
      {state === 'found' ? (
        <button
          type="button"
          className={styles.note}
          data-testid="update-note"
          data-update-note
          onClick={loadNewVersion}
        >
          {strings.banners.updated}
        </button>
      ) : state === 'getting' ? (
        <p className={styles.note} data-testid="update-note" data-update-note>
          {strings.banners.gettingNewVersion}
        </p>
      ) : null}
    </div>
  );
}
