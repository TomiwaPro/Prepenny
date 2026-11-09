'use client';

// Getting back in with the backup email (brief 4.13, step 3e), at
// /get-back-in/, outside the app's own frame, for someone who can't get into
// the address they sign in with. Since step 3e hardening it takes 24 hours:
//
// 1. The backup email address: a code is sent to it if it's someone's backup.
//    The words are the same either way, and for a locked address, so nobody
//    can find out which addresses are backups.
// 2. The code starts a 24-hour wait. Nothing on the account changes. The
//    address the account signs in with is told, with a link that stops it,
//    and every signed-in device shows a notice with "Stop it".
// 3. The wait: when it can be finished, remembered on this phone so the page
//    shows it again when it's opened again.
// 4. After 24 hours, a new code finishes it (supabase/functions/get-back-in):
//    the backup becomes the address the account signs in with, and every
//    phone and computer signed in to it is signed out. Then signing in as
//    usual, with a sign-in code sent to that address, and with the
//    authenticator app's code when two-step sign-in is on.

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { CODE_LASTS_MS, sendCode } from '../lib/account.ts';
import { momentWords } from '../lib/device-words.ts';
import { getInWithCode, sendGetInCode } from '../lib/security.ts';
import { signInConfig } from '../lib/sign-in-config.ts';
import { strings } from '../strings/en-GB.ts';
import { CodeBox, sixDigits } from './CodeBox.tsx';
import { describedBy, Field } from './Fields.tsx';
import formStyles from './Form.module.css';
import screenStyles from './Screens.module.css';
import { securityWords } from './SecondStepSheet.tsx';
import styles from './SignInScreen.module.css';

const t = strings.getBackIn;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where this phone remembers a wait it started, until it's finished. */
const WAITING_KEY = 'prepenny-get-back-in';

interface Waiting {
  readonly email: string;
  /** When it can be finished, a UTC time from the server. */
  readonly readyAt: string;
}

function rememberedWait(): Waiting | null {
  try {
    const kept = JSON.parse(localStorage.getItem(WAITING_KEY) ?? 'null') as Partial<Waiting> | null;
    return typeof kept?.email === 'string' && typeof kept.readyAt === 'string'
      ? { email: kept.email, readyAt: kept.readyAt }
      : null;
  } catch {
    return null;
  }
}

function rememberWait(waiting: Waiting | null) {
  try {
    if (waiting === null) localStorage.removeItem(WAITING_KEY);
    else localStorage.setItem(WAITING_KEY, JSON.stringify(waiting));
  } catch {
    // A phone that keeps nothing shows the wait until the page closes.
  }
}

/** True once a time has passed, by this phone's clock, looked at every 30 seconds. */
function usePassed(time: string | null): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return time !== null && now >= Date.parse(time);
}

export function GetBackInScreen() {
  const router = useRouter();
  const id = useId();
  const [step, setStep] = useState<'email' | 'code' | 'waiting'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [readyAt, setReadyAt] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [codeError, setCodeError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const emailBox = useRef<HTMLInputElement>(null);
  const codeBox = useRef<HTMLInputElement>(null);
  const firstStep = useRef(true);
  const off = signInConfig() === null;
  const ready = usePassed(readyAt);

  // A wait started on this phone shows again when the page is opened again.
  useEffect(() => {
    const waiting = rememberedWait();
    if (waiting === null) return;
    setEmail(waiting.email);
    setReadyAt(waiting.readyAt);
    setStep('waiting');
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the step changes
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    if (busy !== null) return;
    setProblem(null);
    const typed = email.trim().toLowerCase();
    if (!EMAIL.test(typed)) {
      setEmailError(t.emailMissing);
      emailBox.current?.focus();
      return;
    }
    setEmailError(undefined);
    // Once a minute, as the server allows: it says nothing either way, so the phone keeps count.
    if (sentAt !== null && step === 'code' && Date.now() - sentAt < 60_000) {
      setProblem(strings.security.wait(Math.ceil((60_000 - (Date.now() - sentAt)) / 1000)));
      return;
    }
    setBusy(t.sending);
    const sent = await sendGetInCode(typed);
    setBusy(null);
    if (!sent.ok) {
      if (sent.problem === 'bad-email') {
        setEmailError(t.emailMissing);
        emailBox.current?.focus();
      } else {
        setProblem(securityWords(sent.problem));
      }
      return;
    }
    setEmail(typed);
    setSentAt(Date.now());
    setCode('');
    setCodeError(undefined);
    setStep('code');
  }

  async function check(event: FormEvent) {
    event.preventDefault();
    if (busy !== null) return;
    setProblem(null);
    const typed = sixDigits(code);
    if (typed === null) {
      setCodeError(strings.security.emailCodeMissing);
      codeBox.current?.focus();
      return;
    }
    setCodeError(undefined);
    setBusy(t.checking);
    const done = await getInWithCode(email, typed);
    if (!done.ok) {
      setBusy(null);
      if (done.problem === 'code-wrong') {
        setCodeError(
          sentAt !== null && Date.now() - sentAt > CODE_LASTS_MS ? t.codeRanOut : t.codeWrong,
        );
        codeBox.current?.focus();
      } else {
        setProblem(done.problem === 'in-use' ? t.inUse : securityWords(done.problem));
      }
      return;
    }
    const answer = done.value;
    if (answer.state === 'waiting') {
      setBusy(null);
      rememberWait({ email, readyAt: answer.readyAt });
      setReadyAt(answer.readyAt);
      setStep('waiting');
      return;
    }
    if (answer.state === 'new-code') {
      setBusy(null);
      setProblem(t.newCodeNeeded);
      return;
    }
    if (answer.state === 'in-use') {
      setBusy(null);
      setProblem(t.inUse);
      return;
    }
    // Finished: the backup is now the sign-in address. Sign in with it as usual.
    rememberWait(null);
    const signIn = await sendCode(email);
    setBusy(null);
    router.replace(signIn.ok ? '/sign-in/?got-back-in' : '/sign-in/');
  }

  const otherEmail = () => {
    rememberWait(null);
    setReadyAt(null);
    setStep('email');
    setProblem(null);
    setCodeError(undefined);
  };

  return (
    <div className={styles.page}>
      <a className={styles.wordmark} href="/">
        {strings.app.name}
      </a>
      <main className={styles.main}>
        <header className={screenStyles.header}>
          {step === 'email' ? (
            <a className={screenStyles.back} href="/sign-in/">
              {t.backToSignIn}
            </a>
          ) : (
            <button
              type="button"
              className={`${screenStyles.back} ${styles.textButton}`}
              onClick={otherEmail}
            >
              {t.otherEmail}
            </button>
          )}
          <h1 ref={heading} tabIndex={-1} className={screenStyles.heading}>
            {step === 'waiting' ? t.waitingHeading : t.heading}
          </h1>
          <p className={screenStyles.purpose}>
            {step === 'code' ? t.sent(email) : step === 'waiting' ? t.waitingPurpose : t.purpose}
          </p>
        </header>
        {off ? (
          <section className={styles.card}>
            <p>{strings.signIn.off}</p>
          </section>
        ) : step === 'email' ? (
          <>
            <form className={styles.card} onSubmit={ask} noValidate>
              <Field id={`${id}-email`} label={t.emailLabel} error={emailError} hint={t.emailHint}>
                <input
                  ref={emailBox}
                  id={`${id}-email`}
                  className={formStyles.input}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={emailError !== undefined}
                  aria-describedby={describedBy(`${id}-email`, emailError, [`${id}-email-hint`])}
                />
              </Field>
              <button type="submit" className={formStyles.main} aria-disabled={busy !== null}>
                {t.send}
              </button>
            </form>
            <p className={styles.line}>{t.noBackup}</p>
          </>
        ) : step === 'code' ? (
          <form className={styles.card} onSubmit={check} noValidate>
            <CodeBox
              id={`${id}-code`}
              label={t.codeLabel}
              hint={t.codeHint}
              error={codeError}
              value={code}
              onChange={setCode}
              inputRef={codeBox}
            />
            <p className={styles.line}>{t.whatHappens}</p>
            <button type="submit" className={formStyles.main} aria-disabled={busy !== null}>
              {t.useCode}
            </button>
            <button
              type="button"
              className={formStyles.outlined}
              aria-disabled={busy !== null}
              onClick={() => void ask()}
            >
              {t.sendNew}
            </button>
          </form>
        ) : (
          <section className={styles.card} data-testid="get-back-in-waiting">
            <p className={styles.strong}>
              {ready || readyAt === null ? t.finishNow : t.finishFrom(momentWords(readyAt))}
            </p>
            <p className={styles.line}>{t.thenWhat(email)}</p>
            <p className={styles.line}>{t.told}</p>
            {ready ? (
              <button
                type="button"
                className={formStyles.main}
                aria-disabled={busy !== null}
                onClick={() => void ask()}
              >
                {t.sendFinishCode}
              </button>
            ) : (
              <a className={`${formStyles.outlined} ${styles.linkButton}`} href="/sign-in/">
                {t.backToSignIn}
              </a>
            )}
          </section>
        )}
        <p className={styles.busy} role="status">
          {busy ?? ''}
        </p>
        <div role="alert" className={styles.alert}>
          {problem === null ? null : <p className={formStyles.problem}>{problem}</p>}
        </div>
      </main>
    </div>
  );
}
