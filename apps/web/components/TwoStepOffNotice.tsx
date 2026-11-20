'use client';

// The notice on every screen of a signed-in device while PrePenny support's
// 7-day wait to turn off two-step sign-in runs (step 4j, D638): what's
// happening, when, and one plain way to stop it, as for getting back in
// (GetBackInNotice). Someone who asked for it can leave it; someone who
// didn't stops it here, even if their email has been taken over.

import { useEffect, useState } from 'react';
import { setTwoStepOffNotice, useTwoStepOffNotice } from '../data/two-step-off-notice.ts';
import { momentWords } from '../lib/device-words.ts';
import { stopTwoStepOff } from '../lib/security.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import styles from './GetBackInNotice.module.css';
import { securityWords } from './SecondStepSheet.tsx';

const t = strings.twoStepOffNotice;

export function TwoStepOffNotice() {
  const notice = useTwoStepOffNotice();
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState<'stopped' | 'nothing' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // A new wait after one was stopped shows afresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the wait changes
  useEffect(() => {
    if (notice !== null) setStopped(null);
  }, [notice?.startedAt]);

  if (stopped !== null) {
    return (
      <div className={styles.notice} data-testid="two-step-off-stopped" role="status">
        <p>{stopped === 'stopped' ? t.stopped : t.notStopped}</p>
        <button type="button" className={formStyles.outlined} onClick={() => setStopped(null)}>
          {t.gotIt}
        </button>
      </div>
    );
  }
  if (notice === null) return null;
  return (
    <section
      className={styles.notice}
      aria-labelledby="two-step-off-heading"
      data-testid="two-step-off-notice"
    >
      <h2 id="two-step-off-heading" className={styles.heading}>
        {t.heading}
      </h2>
      <p>{t.waiting(momentWords(notice.endsAt))}</p>
      <p>{t.whatToDo}</p>
      <button
        type="button"
        className={formStyles.main}
        aria-disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setProblem(null);
          const done = await stopTwoStepOff();
          setBusy(false);
          if (!done.ok) {
            setProblem(securityWords(done.problem));
            return;
          }
          setTwoStepOffNotice(null);
          setStopped(done.value ? 'stopped' : 'nothing');
        }}
      >
        {busy ? t.stopping : t.stop}
      </button>
      <div role="alert">
        {problem === null ? null : <p className={formStyles.problem}>{problem}</p>}
      </div>
    </section>
  );
}
