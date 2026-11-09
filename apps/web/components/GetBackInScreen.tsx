'use client';

// Getting back in with the backup email (brief 4.13, step 3e), at
// /get-back-in/, outside the app's own frame, for someone who can't get into
// the address they sign in with.
//
// 1. The backup email address: a code is sent to it if it's someone's backup.
//    The words are the same either way, so nobody can find out which
//    addresses are backups.
// 2. The code: the backup becomes the address the account signs in with,
//    and every phone and computer signed in to it is signed out
//    (supabase/migrations, step 3e).
// 3. Then signing in as usual, with a sign-in code sent to that address, and
//    with the authenticator app's code when two-step sign-in is on: getting
//    back in never gets past it.

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { CODE_LASTS_MS, sendCode } from '../lib/account.ts';
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

export function GetBackInScreen() {
  const router = useRouter();
  const id = useId();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [codeError, setCodeError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const emailBox = useRef<HTMLInputElement>(null);
  const codeBox = useRef<HTMLInputElement>(null);
  const firstStep = useRef(true);
  const off = signInConfig() === null;

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
        setProblem(securityWords(done.problem));
      }
      return;
    }
    // The backup is now the sign-in address: sign in with it as usual.
    const signIn = await sendCode(email);
    setBusy(null);
    router.replace(signIn.ok ? '/sign-in/?got-back-in' : '/sign-in/');
  }

  return (
    <div className={styles.page}>
      <a className={styles.wordmark} href="/">
        {strings.app.name}
      </a>
      <main className={styles.main}>
        <header className={screenStyles.header}>
          {step === 'code' ? (
            <button
              type="button"
              className={`${screenStyles.back} ${styles.textButton}`}
              onClick={() => {
                setStep('email');
                setProblem(null);
                setCodeError(undefined);
              }}
            >
              {t.otherEmail}
            </button>
          ) : (
            <a className={screenStyles.back} href="/sign-in/">
              {t.backToSignIn}
            </a>
          )}
          <h1 ref={heading} tabIndex={-1} className={screenStyles.heading}>
            {t.heading}
          </h1>
          <p className={screenStyles.purpose}>{step === 'code' ? t.sent(email) : t.purpose}</p>
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
        ) : (
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
              {t.finish}
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
