'use client';

// "Start again with the example" on More (D182): Sam's example can be
// changed to try things out, and this puts it back exactly as it is in the
// app. It asks once more first, because the changes go.

import { useState } from 'react';
import { strings } from '../strings/en-GB.ts';
import { usePlan, usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import styles from './StartAgain.module.css';

const t = strings.more;

export function StartAgain() {
  const state = usePlan();
  const { startAgainWithExample } = usePlanActions();
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState(false);
  if (state.plan?.isExample !== true) return null;
  return (
    <section className={styles.card} aria-labelledby="example-plan-heading">
      <h2 id="example-plan-heading" className={styles.heading}>
        {t.example}
      </h2>
      <p className={styles.line}>{t.exampleLine}</p>
      <button
        type="button"
        className={styles.outlined}
        aria-haspopup="dialog"
        onClick={() => {
          setDone(false);
          setAsking(true);
        }}
      >
        {t.startAgain}
      </button>
      <p className={styles.done} role="status">
        {done ? t.startedAgain : null}
      </p>
      <Sheet open={asking} title={t.startAgain} onClose={() => setAsking(false)}>
        <div className={styles.ask}>
          <p>{t.startAgainCheck}</p>
          <button
            type="button"
            className={styles.main}
            onClick={async () => {
              const outcome = await startAgainWithExample();
              setAsking(false);
              setDone(outcome.ok);
            }}
          >
            {t.startAgainConfirm}
          </button>
          <button type="button" className={styles.outlined} onClick={() => setAsking(false)}>
            {t.keepChanges}
          </button>
        </div>
      </Sheet>
    </section>
  );
}
