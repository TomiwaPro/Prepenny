'use client';

// The notice on every screen of a signed-in device while someone is getting
// back into the account with its backup email (step 3e hardening): what's
// happening, when it could finish, and one plain way to stop it. It shows
// until it's stopped, finished or has run out, as the server says every
// minute (data/get-back-in-notice.ts).

import { useEffect, useState } from 'react';
import { setGetBackInNotice, useGetBackInNotice } from '../data/get-back-in-notice.ts';
import { momentWords } from '../lib/device-words.ts';
import { stopGetBackIn } from '../lib/security.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import styles from './GetBackInNotice.module.css';
import { securityWords } from './SecondStepSheet.tsx';

const t = strings.getBackInNotice;

/** True once a time has passed, by this phone's clock, looked at every minute. */
function usePassed(time: string | null): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return time !== null && now >= Date.parse(time);
}

export function GetBackInNotice() {
  const notice = useGetBackInNotice();
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ready = usePassed(notice?.readyAt ?? null);

  // A new request after one was stopped shows afresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the request changes
  useEffect(() => {
    if (notice !== null) setStopped(false);
  }, [notice?.startedAt]);

  if (stopped) {
    return (
      <div className={styles.notice} data-testid="get-back-in-stopped" role="status">
        <p>{t.stopped}</p>
        <button type="button" className={formStyles.outlined} onClick={() => setStopped(false)}>
          {t.gotIt}
        </button>
      </div>
    );
  }
  if (notice === null) return null;
  return (
    <section
      className={styles.notice}
      aria-labelledby="get-back-in-heading"
      data-testid="get-back-in-notice"
    >
      <h2 id="get-back-in-heading" className={styles.heading}>
        {t.heading}
      </h2>
      <p>{ready ? t.ready : t.waiting(momentWords(notice.readyAt))}</p>
      <p>{t.whatToDo}</p>
      <button
        type="button"
        className={formStyles.main}
        aria-disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setProblem(null);
          const done = await stopGetBackIn();
          setBusy(false);
          if (!done.ok) {
            setProblem(securityWords(done.problem));
            return;
          }
          setGetBackInNotice(null);
          setStopped(true);
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
