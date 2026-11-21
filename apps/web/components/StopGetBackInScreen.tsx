'use client';

// The page the stop link opens (step 3e hardening), at
// /stop-get-back-in/#token, from the email to the address an account signs
// in with when someone asks to get in with its backup email. Signed in or
// not, "Stop it" stops that request, once. The link can do nothing else:
// it signs nobody in or out, and says nothing about the account.
//
// The token is after "#", so it never reaches any server in the page's
// address, and it's taken out of the address bar as soon as the page opens,
// kept for this tab only until it's used, so the page still works if it's
// loaded again. Nothing happens until "Stop it" is tapped, so an email
// service that opens links to check them can't use it up (as D312).
//
// Since step 4j (D621), the same page, at /stop-two-step-off/#token, stops
// PrePenny support's 7-day wait to turn off two-step sign-in, in its own words.

import { useEffect, useRef, useState } from 'react';
import { stopTwoStepOffWithLink, stopWithLink } from '../lib/security.ts';
import { signInConfig } from '../lib/sign-in-config.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import screenStyles from './Screens.module.css';
import { securityWords } from './SecondStepSheet.tsx';
import styles from './SignInScreen.module.css';

/** Where this tab keeps each kind of link's token until it's used. */
const TOKEN_KEYS = {
  'get-back-in': 'prepenny-stop-link',
  'two-step-off': 'prepenny-stop-two-step-off',
} as const;

type StopKind = keyof typeof TOKEN_KEYS;
/** A whole token: 32 bytes, as the database makes them. */
const WHOLE = /^[A-Za-z0-9_-]{43}$/;

function keptToken(kind: StopKind): string {
  try {
    return sessionStorage.getItem(TOKEN_KEYS[kind]) ?? '';
  } catch {
    return '';
  }
}

function keepToken(kind: StopKind, token: string | null) {
  try {
    if (token === null) sessionStorage.removeItem(TOKEN_KEYS[kind]);
    else sessionStorage.setItem(TOKEN_KEYS[kind], token);
  } catch {
    // A tab that keeps nothing needs the link opened again after a reload.
  }
}

export function StopGetBackInScreen({ kind = 'get-back-in' }: { readonly kind?: StopKind }) {
  const t = kind === 'two-step-off' ? strings.stopTwoStepOff : strings.stopGetBackIn;
  const token = useRef<string>('');
  const heading = useRef<HTMLHeadingElement>(null);
  const [outcome, setOutcome] = useState<'asking' | 'stopped' | 'not-stopped' | 'no-link'>(
    'asking',
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const off = signInConfig() === null;

  useEffect(() => {
    const fromLink = window.location.hash.replace(/^#/, '');
    if (window.location.hash !== '') {
      window.history.replaceState(null, '', window.location.pathname);
    }
    token.current = WHOLE.test(fromLink) ? fromLink : keptToken(kind);
    if (WHOLE.test(token.current)) keepToken(kind, token.current);
    else setOutcome('no-link');
  }, [kind]);

  useEffect(() => {
    if (outcome !== 'asking') heading.current?.focus();
  }, [outcome]);

  async function stop() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const done =
      kind === 'two-step-off'
        ? await stopTwoStepOffWithLink(token.current)
        : await stopWithLink(token.current);
    setBusy(false);
    if (!done.ok) {
      setProblem(securityWords(done.problem));
      return;
    }
    keepToken(kind, null);
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
          <p className={screenStyles.purpose}>{outcome === 'stopped' ? null : t.purpose}</p>
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
                <p className={styles.line}>{'changeBackup' in t ? t.changeBackup : t.notYou}</p>
              </>
            ) : (
              <p className={styles.strong}>{outcome === 'no-link' ? t.noLink : t.notStopped}</p>
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
