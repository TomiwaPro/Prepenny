'use client';

// The page the stop link opens (step 3e hardening), at
// /stop-get-back-in/#token, from the email to the address an account signs
// in with when someone asks to get in with its backup email. Signed in or
// not, "Stop it" stops that request, once. The link can do nothing else:
// it signs nobody in or out, and says nothing about the account.
//
// The token is after "#", so it never reaches any server in the page's
// address, and it's taken out of the address bar as soon as the page opens.
// Nothing happens until "Stop it" is tapped, so an email service that opens
// links to check them can't use it up (as D312).

import { useEffect, useRef, useState } from 'react';
import { stopWithLink } from '../lib/security.ts';
import { signInConfig } from '../lib/sign-in-config.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import screenStyles from './Screens.module.css';
import { securityWords } from './SecondStepSheet.tsx';
import styles from './SignInScreen.module.css';

const t = strings.stopGetBackIn;

export function StopGetBackInScreen() {
  const token = useRef<string>('');
  const heading = useRef<HTMLHeadingElement>(null);
  const [outcome, setOutcome] = useState<'asking' | 'stopped' | 'not-stopped'>('asking');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const off = signInConfig() === null;

  useEffect(() => {
    token.current = window.location.hash.replace(/^#/, '');
    if (window.location.hash !== '') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (outcome !== 'asking') heading.current?.focus();
  }, [outcome]);

  async function stop() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const done = await stopWithLink(token.current);
    setBusy(false);
    if (!done.ok) {
      setProblem(securityWords(done.problem));
      return;
    }
    setOutcome(done.value ? 'stopped' : 'not-stopped');
  }

  return (
    <div className={styles.page}>
      <a className={styles.wordmark} href="/">
        {strings.app.name}
      </a>
      <main className={styles.main}>
        <header className={screenStyles.header}>
          <h1 ref={heading} tabIndex={-1} className={screenStyles.heading}>
            {outcome === 'stopped' ? t.stoppedHeading : t.heading}
          </h1>
          <p className={screenStyles.purpose}>{outcome === 'asking' ? t.purpose : null}</p>
        </header>
        {off ? (
          <section className={styles.card}>
            <p>{strings.signIn.off}</p>
          </section>
        ) : outcome === 'asking' ? (
          <section className={styles.card}>
            <button
              type="button"
              className={formStyles.main}
              aria-disabled={busy}
              onClick={() => void stop()}
            >
              {t.stop}
            </button>
          </section>
        ) : (
          <section className={styles.card} data-testid="stop-outcome">
            {outcome === 'stopped' ? (
              <>
                <p className={styles.strong}>{t.stopped}</p>
                <p className={styles.line}>{t.changeBackup}</p>
              </>
            ) : (
              <p className={styles.strong}>{t.notStopped}</p>
            )}
            <a className={`${formStyles.outlined} ${styles.linkButton}`} href="/">
              {t.goToPrePenny}
            </a>
          </section>
        )}
        <p className={styles.busy} role="status">
          {busy ? t.stopping : ''}
        </p>
        <div role="alert" className={styles.alert}>
          {problem === null ? null : <p className={formStyles.problem}>{problem}</p>}
        </div>
      </main>
    </div>
  );
}
