'use client';

// "You've left the plan" (D468), at the top of the person's new plan once
// they've left a shared one, until they tap "Got it".

import { useEffect, useState } from 'react';
import { forgetLeftNote, type LeftNote as Kept, leftNote } from '../lib/left-note.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './Notes.module.css';

const t = strings.together.leave;

export function LeftNote() {
  const [kept, setKept] = useState<Kept | null>(null);
  useEffect(() => setKept(leftNote()), []);
  if (kept === null) return null;
  const words = kept === 'copied' ? t.doneCopy : kept === 'not-copied' ? t.doneNoCopy : t.done;
  return (
    <div
      className={`${styles.note} ${styles.offline} ${styles.withButton}`}
      role="status"
      data-testid="left"
    >
      <p>{t.doneNote(words)}</p>
      <button
        type="button"
        className={styles.leave}
        onClick={() => {
          forgetLeftNote();
          setKept(null);
        }}
      >
        {t.gotIt}
      </button>
    </div>
  );
}
