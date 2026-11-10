'use client';

// Sign up and sign in (brief 4.13, D20, step 3b), at /sign-in/, outside the
// app's own frame, so it works for someone with no plan on this phone too.
//
// 1. The email address, or "Continue with Google".
// 2. "We've sent a 6-digit code to sam@example.com. It lasts 10 minutes."
//    Typing it signs the person in. The email's link does the same, opening
//    this page with its one-time key after a "#" (supabase/templates), but
//    only once "Finish signing in" is tapped: some email services open links
//    by themselves to check them, which mustn't use the key up (D312).
// 3. Then back to More, or to their plan. The plan made on this phone
//    becomes theirs, and goes up to their account as its first copy, or
//    their saved plan comes down (brief 4.13 "Try first", step 3c). When the
//    phone has a plan of its own and the account another, they choose which
//    to keep, and a confirm says the other will be removed (D324).
//
// With two-step sign-in on, the authenticator app's code comes after the
// email's (step 3e): the account's plan data stays out of reach until then.
// "Can't get into your email?" opens the backup email page (/get-back-in/).
//
// Every mistake says what to do (VOICE.md). Nothing about money is sent,
// and nothing is written to the console (PLAN.md item 20).

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { openDb, ownPlanOnPhone } from '../data/db.ts';
import { forgetEverything, planSafelyKept } from '../data/forget.ts';
import { type Connection, connectPlan, keepPhonePlan, keepSavedPlan } from '../data/sync.ts';
import {
  CODE_LASTS_MS,
  checkCode,
  checkLink,
  codeSent,
  finishGoogle,
  forgetCodeSent,
  type Outcome,
  type Problem,
  sendCode,
  startGoogle,
} from '../lib/account.ts';
import { formatDay } from '../lib/dates.ts';
import { passSecondStep, twoStep } from '../lib/security.ts';
import { signInConfig } from '../lib/sign-in-config.ts';
import { localToday } from '../lib/today.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { CodeBox, sixDigits } from './CodeBox.tsx';
import { ConfirmSheet } from './ConfirmSheet.tsx';
import { describedBy, Field } from './Fields.tsx';
import formStyles from './Form.module.css';
import screenStyles from './Screens.module.css';
import { SignedInLine } from './SignedInLine.tsx';
import styles from './SignInScreen.module.css';

const t = strings.signIn;

type Mode = 'sign-in' | 'sign-up';
/** Where the sign-in page was opened from: More, an invite link (step 3f), or the welcome. */
type From = 'more' | 'join' | 'welcome';
type Busy =
  | 'sending'
  | 'checking'
  | 'google'
  | 'link'
  | 'saving'
  | 'keeping'
  | 'second-step'
  | null;

/** What's happening while the person waits, read out as it changes. */
const BUSY_WORDS: Record<Exclude<Busy, null>, string> = {
  sending: t.sending,
  checking: t.checking,
  link: t.checkingLink,
  google: t.openingGoogle,
  saving: t.saving,
  keeping: t.keeping,
  'second-step': strings.secondStep.checking,
};

type Choice = Extract<Connection, { kind: 'choose' }>;

/** A moment as a day on this phone: "today", or "Tue 3 Nov" (VOICE.md). */
function dayOf(time: string | null): string {
  const today = localToday();
  if (time === null) return t.today;
  const day = localToday(new Date(time));
  return day === today ? t.today : formatDay(day, today);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^\d{6}$/;

/** A problem in words. A refused code ran out when it's more than 10 minutes old. */
function wordsFor(problem: Problem, sentAt: number | null): string {
  switch (problem.kind) {
    case 'offline':
      return t.offline;
    case 'server':
      return t.server;
    case 'off':
      return t.off;
    case 'wait':
      return t.wait(problem.seconds);
    case 'too-many-emails':
      return t.tooManyEmails;
    case 'too-many-tries':
      return t.tooManyTries;
    case 'code-refused':
      return sentAt !== null && Date.now() - sentAt > CODE_LASTS_MS ? t.codeRanOut : t.codeWrong;
    case 'email-refused':
      return t.emailRefused;
    case 'google-cancelled':
      return t.googleCancelled;
    case 'google-off':
      return t.googleOff;
    case 'someone-elses-plan':
      return t.someoneElsesPlan;
  }
}

/** Where to go once signed in. */
const afterSignIn = (from: From) =>
  from === 'more' ? '/app/more/' : from === 'join' ? '/join/' : '/app/';

/** This page's own address, keeping only who it's for and where it was opened from. */
function pageAddress(mode: Mode, from: From): string {
  const query = new URLSearchParams();
  if (mode === 'sign-up') query.set('to', 'sign-up');
  if (from === 'more' || from === 'join') query.set('from', from);
  const text = query.toString();
  return `/sign-in/${text === '' ? '' : `?${text}`}`;
}

/** Google's "G", drawn in Google's own colours, as Google's rules for the button ask (D307). */
function GoogleMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function SignInScreen() {
  const router = useRouter();
  const id = useId();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [from, setFrom] = useState<From>('welcome');
  const [step, setStep] = useState<'email' | 'code' | 'link' | 'choose' | 'second-step'>('email');
  const [appCode, setAppCode] = useState('');
  const [appCodeError, setAppCodeError] = useState<string | undefined>();
  const [gotBackIn, setGotBackIn] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [keep, setKeep] = useState<'saved' | 'phone' | ''>('');
  const [confirming, setConfirming] = useState(false);
  const [keepError, setKeepError] = useState<string | undefined>();
  const [otherPlan, setOtherPlan] = useState<'saved' | 'not-saved' | null>(null);
  const [removing, setRemoving] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [resent, setResent] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [codeError, setCodeError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [hasPlan, setHasPlan] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const emailBox = useRef<HTMLInputElement>(null);
  const codeBox = useRef<HTMLInputElement>(null);
  const appCodeBox = useRef<HTMLInputElement>(null);
  const firstStep = useRef(true);
  // The address is read once, even where React runs the first effect twice
  // (its development mode), so a link's one-time key is never used twice.
  const addressRead = useRef(false);
  // The email link's one-time key, kept here until "Finish signing in" is tapped.
  const linkKey = useRef<string | null>(null);
  const off = signInConfig() === null;

  // What the address says: who it's for, where it came from, and anything
  // coming back from the email's link or from Google.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the page opens
  useEffect(() => {
    if (addressRead.current) return;
    addressRead.current = true;
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const opened: Mode = search.get('to') === 'sign-up' ? 'sign-up' : 'sign-in';
    const asked = search.get('from');
    const cameFrom: From = asked === 'more' || asked === 'join' ? asked : 'welcome';
    setMode(opened);
    setFrom(cameFrom);
    const tokenHash = hash.get('token_hash');
    const googleCode = search.get('code');
    const googleError = search.get('error');
    // The one-time key or code is used once, then taken out of the address,
    // so it isn't kept in the browser's history.
    if (tokenHash !== null || googleCode !== null || googleError !== null) {
      window.history.replaceState(null, '', pageAddress(opened, cameFrom));
    }
    const finish = async (busyWith: Busy, attempt: () => Promise<Outcome>, refused: string) => {
      setBusy(busyWith);
      const outcome = await attempt();
      if (outcome.ok) {
        await signedInNow(cameFrom);
        return;
      }
      setBusy(null);
      showProblem(outcome.problem, refused);
    };
    if (off) {
      // Nothing to check: signing in is switched off in this version.
    } else if (search.has('choose')) {
      // From the app: a plan of this phone's own beside the account's (D324).
      window.history.replaceState(null, '', pageAddress(opened, cameFrom));
      void signedInNow(cameFrom);
    } else if (search.has('second-step')) {
      // From the app: two-step sign-in is on and this sign-in hasn't passed it (step 3e).
      window.history.replaceState(null, '', pageAddress(opened, cameFrom));
      setStep('second-step');
    } else if (tokenHash !== null) {
      // Used only when the person taps "Finish signing in" (D312).
      linkKey.current = tokenHash;
      setStep('link');
    } else if (googleCode !== null) {
      void finish('google', () => finishGoogle(googleCode), t.googleCancelled);
    } else if (googleError !== null) {
      setProblem(t.googleCancelled);
    } else {
      const sent = codeSent();
      if (sent !== null) {
        setEmail(sent.email);
        setSentAt(sent.at);
        setStep('code');
        // Just back in with the backup email, which is now the sign-in address (step 3e).
        if (search.has('got-back-in')) {
          setGotBackIn(true);
          window.history.replaceState(null, '', pageAddress(opened, cameFrom));
        }
      }
    }
    (async () => {
      try {
        const db = openDb();
        try {
          const own = await ownPlanOnPhone(db);
          setHasPlan(own !== undefined);
        } finally {
          db.close();
        }
      } catch {
        // No database on this phone: no plan to speak of.
      }
    })();
  }, []);

  // Coming back from Google with the Back button shows this page as it was
  // left, "Opening Google." and all: it's ready to use again (D314).
  useEffect(() => {
    const shown = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(null);
    };
    window.addEventListener('pageshow', shown);
    return () => window.removeEventListener('pageshow', shown);
  }, []);

  // A new step is announced by moving to its heading (WCAG 2.4.3).
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the step changes
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  /**
   * Once signed in: the plan goes up as the first copy, or the saved plan
   * comes down, or the person chooses which to keep (step 3c). Then on to
   * More or the plan. With no server for now, the plan stays on the phone and
   * goes up later.
   */
  async function signedInNow(cameFrom: From) {
    // Two-step sign-in on: the authenticator app's code first (step 3e).
    const state = await twoStep();
    if (state.ok && state.value.on && !state.value.passed) {
      setBusy(null);
      setAppCode('');
      setAppCodeError(undefined);
      setStep('second-step');
      return;
    }
    setBusy('saving');
    const connection = await connectPlan();
    if (connection.kind === 'choose') {
      setBusy(null);
      setChoice(connection);
      setKeep('');
      setStep('choose');
      return;
    }
    router.replace(afterSignIn(cameFrom));
  }

  /** A problem in words, with the way to remove another account's plan when that's what's in the way. */
  function showProblem(found: Problem, refused?: string) {
    setProblem(
      found.kind === 'code-refused' && refused !== undefined ? refused : wordsFor(found, sentAt),
    );
    if (found.kind === 'someone-elses-plan') {
      void planSafelyKept().then((saved) => setOtherPlan(saved ? 'saved' : 'not-saved'));
    }
  }

  async function chooseToKeep(event: FormEvent) {
    event.preventDefault();
    if (busy !== null) return;
    if (keep === '') {
      setKeepError(t.chooseFirst);
      return;
    }
    setKeepError(undefined);
    setConfirming(true);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy !== null) return;
    setProblem(null);
    const typed = email.trim();
    if (!EMAIL.test(typed)) {
      setEmailError(t.emailMissing);
      emailBox.current?.focus();
      return;
    }
    setEmailError(undefined);
    setBusy('sending');
    const outcome = await sendCode(typed);
    setBusy(null);
    if (!outcome.ok) {
      if (outcome.problem.kind === 'email-refused') {
        setEmailError(wordsFor(outcome.problem, null));
        emailBox.current?.focus();
      } else {
        setProblem(wordsFor(outcome.problem, null));
      }
      return;
    }
    setEmail(typed);
    setSentAt(Date.now());
    setResent(false);
    setCode('');
    setCodeError(undefined);
    setStep('code');
  }

  async function sendAgain() {
    if (busy !== null) return;
    setProblem(null);
    setCodeError(undefined);
    setBusy('sending');
    const outcome = await sendCode(email);
    setBusy(null);
    if (!outcome.ok) {
      setProblem(wordsFor(outcome.problem, null));
      return;
    }
    setSentAt(Date.now());
    setResent(true);
    setCode('');
    codeBox.current?.focus();
  }

  async function check(event: FormEvent) {
    event.preventDefault();
    if (busy !== null) return;
    setProblem(null);
    const typed = code.replace(/\s/g, '');
    if (!CODE.test(typed)) {
      setCodeError(t.codeMissing);
      codeBox.current?.focus();
      return;
    }
    setCodeError(undefined);
    setBusy('checking');
    const outcome = await checkCode(email, typed);
    if (outcome.ok) {
      await signedInNow(from);
      return;
    }
    setBusy(null);
    if (outcome.problem.kind === 'code-refused') {
      setCodeError(wordsFor(outcome.problem, sentAt));
      codeBox.current?.focus();
    } else {
      showProblem(outcome.problem);
    }
  }

  async function checkSecondStep(event: FormEvent) {
    event.preventDefault();
    if (busy !== null) return;
    setProblem(null);
    const typed = sixDigits(appCode);
    if (typed === null) {
      setAppCodeError(strings.security.appCodeMissing);
      appCodeBox.current?.focus();
      return;
    }
    setAppCodeError(undefined);
    setBusy('second-step');
    const passed = await passSecondStep(typed);
    if (!passed.ok) {
      setBusy(null);
      if (passed.problem === 'code-wrong') {
        setAppCodeError(strings.security.appCodeWrong);
        appCodeBox.current?.focus();
      } else {
        setProblem(passed.problem === 'offline' ? t.offline : t.server);
      }
      return;
    }
    await signedInNow(from);
  }

  async function finishLink() {
    const key = linkKey.current;
    if (busy !== null || key === null) return;
    setProblem(null);
    setBusy('link');
    const outcome = await checkLink(key);
    if (outcome.ok) {
      await signedInNow(from);
      return;
    }
    setBusy(null);
    linkKey.current = null;
    setStep('email');
    showProblem(outcome.problem, t.linkRanOut);
  }

  async function google() {
    if (busy !== null) return;
    setProblem(null);
    setBusy('google');
    const back = new URL(pageAddress(mode, from), window.location.origin).href;
    const outcome = await startGoogle(back);
    // When it works, the browser is on its way to Google.
    if (!outcome.ok) {
      setBusy(null);
      setProblem(wordsFor(outcome.problem, null));
    }
  }

  const busyWords = busy === null ? '' : BUSY_WORDS[busy];
  const signUp = mode === 'sign-up';

  return (
    <div className={styles.page}>
      {/* Plain links, so nothing is fetched ahead of a tap. */}
      <a className={styles.wordmark} href="/">
        {strings.app.name}
      </a>
      <main className={styles.main}>
        <header className={screenStyles.header}>
          {step === 'choose' || step === 'second-step' ? null : step === 'code' ? (
            <button
              type="button"
              className={`${screenStyles.back} ${styles.textButton}`}
              onClick={() => {
                forgetCodeSent();
                setStep('email');
                setProblem(null);
                setCodeError(undefined);
              }}
            >
              {t.otherEmail}
            </button>
          ) : from === 'more' && step === 'email' ? (
            <a className={screenStyles.back} href="/app/more/">
              {t.backToMore}
            </a>
          ) : null}
          <h1 ref={heading} tabIndex={-1} className={screenStyles.heading}>
            {step === 'choose'
              ? t.chooseHeading
              : step === 'second-step'
                ? strings.secondStep.heading
                : step === 'code'
                  ? t.codeHeading
                  : step === 'link'
                    ? t.linkHeading
                    : signUp
                      ? t.signUpHeading
                      : t.signInHeading}
          </h1>
          <p className={screenStyles.purpose}>
            {step === 'choose'
              ? t.choosePurpose
              : step === 'second-step'
                ? strings.secondStep.purpose
                : step === 'code'
                  ? resent
                    ? t.newCodeSentTo(email)
                    : t.sentTo(email)
                  : step === 'link'
                    ? t.linkPurpose
                    : signUp
                      ? t.signUpPurpose
                      : t.signInPurpose}
          </p>
          {step === 'email' && hasPlan ? (
            <p className={screenStyles.purpose}>{t.planBecomesYours}</p>
          ) : null}
          {step === 'code' && gotBackIn ? (
            <p className={screenStyles.purpose}>{strings.getBackIn.signInNow}</p>
          ) : null}
        </header>

        {off ? (
          <section className={styles.card}>
            <p>{t.off}</p>
          </section>
        ) : step === 'choose' && choice !== null ? (
          <form
            className={styles.card}
            onSubmit={chooseToKeep}
            noValidate
            data-testid="choose-plan"
          >
            <ChoiceList<'saved' | 'phone' | ''>
              legend={t.chooseLegend}
              name={`${id}-keep`}
              value={keep}
              invalid={keepError !== undefined}
              {...(keepError === undefined ? {} : { describedBy: `${id}-keep-error` })}
              hintsUnder
              options={[
                {
                  value: 'saved',
                  label: t.savedPlan(dayOf(choice.savedChangedAt)),
                  hint: t.savedPlanHint,
                },
                {
                  value: 'phone',
                  label: t.phonePlan(dayOf(choice.phoneStartedAt)),
                  hint: choice.phoneSetUp ? t.phonePlanHint : t.phonePlanUnfinishedHint,
                },
              ]}
              onChange={(value) => {
                setKeep(value);
                setKeepError(undefined);
              }}
            />
            {keepError === undefined ? null : (
              <p id={`${id}-keep-error`} className={formStyles.problem}>
                {keepError}
              </p>
            )}
            <button type="submit" className={formStyles.main} aria-disabled={busy !== null}>
              {t.keepThisPlan}
            </button>
          </form>
        ) : step === 'second-step' ? (
          <form
            className={styles.card}
            onSubmit={checkSecondStep}
            noValidate
            data-testid="second-step"
          >
            <CodeBox
              id={`${id}-app-code`}
              label={strings.security.appCodeLabel}
              error={appCodeError}
              value={appCode}
              onChange={setAppCode}
              inputRef={appCodeBox}
            />
            <button type="submit" className={formStyles.main} aria-disabled={busy !== null}>
              {strings.secondStep.finish}
            </button>
          </form>
        ) : step === 'link' ? (
          <section className={styles.card}>
            <button
              type="button"
              className={formStyles.main}
              aria-disabled={busy !== null}
              onClick={finishLink}
            >
              {t.finishLink}
            </button>
            <button
              type="button"
              className={formStyles.outlined}
              aria-disabled={busy !== null}
              onClick={() => {
                linkKey.current = null;
                setStep('email');
              }}
            >
              {t.anotherWay}
            </button>
          </section>
        ) : step === 'email' ? (
          <>
            <form className={styles.card} onSubmit={send} noValidate>
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
                {t.sendCode}
              </button>
            </form>
            <p className={styles.or} aria-hidden="true">
              {t.or}
            </p>
            <div className={formStyles.withHint}>
              <button
                type="button"
                className={`${formStyles.outlined} ${styles.google}`}
                aria-disabled={busy !== null}
                aria-describedby={`${id}-google-hint`}
                onClick={google}
              >
                <GoogleMark />
                <span>{t.google}</span>
              </button>
              <p id={`${id}-google-hint`} className={formStyles.hint}>
                {t.googleHint}
              </p>
            </div>
            {/* A plain link, so nothing is fetched ahead of a tap. */}
            <a className={styles.backupLink} href="/get-back-in/">
              {strings.getBackIn.link}
            </a>
          </>
        ) : (
          <form className={styles.card} onSubmit={check} noValidate>
            <Field id={`${id}-code`} label={t.codeLabel} error={codeError} hint={t.codeHint}>
              <input
                ref={codeBox}
                id={`${id}-code`}
                className={`${formStyles.input} ${styles.code} num`}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-invalid={codeError !== undefined}
                aria-describedby={describedBy(`${id}-code`, codeError, [`${id}-code-hint`])}
              />
            </Field>
            <button type="submit" className={formStyles.main} aria-disabled={busy !== null}>
              {signUp ? t.finishSignUp : t.finishSignIn}
            </button>
            <p className={styles.line}>{t.linkHint}</p>
            <button
              type="button"
              className={formStyles.outlined}
              aria-disabled={busy !== null}
              onClick={sendAgain}
            >
              {t.sendNewCode}
            </button>
          </form>
        )}

        {/* What's happening, and what went wrong, read out as it changes. */}
        <p className={styles.busy} role="status">
          {busyWords}
        </p>
        <div role="alert" className={styles.alert} data-testid="sign-in-problem">
          {problem === null ? null : <p className={formStyles.problem}>{problem}</p>}
        </div>
        {otherPlan === null ? null : (
          <button
            type="button"
            className={formStyles.outlined}
            aria-haspopup="dialog"
            onClick={() => setRemoving(true)}
          >
            {t.removeOther}
          </button>
        )}
        {/* Signing out, instead of choosing now, is always there too (D353). */}
        {(step === 'choose' && choice !== null) || step === 'second-step' ? <SignedInLine /> : null}
      </main>
      <ConfirmSheet
        open={confirming}
        title={keep === 'phone' ? t.keepPhoneTitle : t.keepSavedTitle}
        intro={keep === 'phone' ? t.keepPhoneIntro : t.keepSavedIntro}
        confirm={t.removeIt}
        keep={t.goBack}
        onConfirm={async () => {
          setBusy('keeping');
          const kept = keep === 'phone' ? await keepPhonePlan() : await keepSavedPlan();
          setBusy(null);
          if (!kept) {
            setProblem(t.couldNotKeep);
            return { ok: false, code: 'not-ready' };
          }
          return { ok: true, version: 0 };
        }}
        onClose={(changed) => {
          setConfirming(false);
          if (changed) router.replace(afterSignIn(from));
        }}
      />
      <ConfirmSheet
        open={removing}
        title={t.removeOtherTitle}
        intro={otherPlan === 'saved' ? t.removeOtherSaved : t.removeOtherNotSaved}
        confirm={t.removeIt}
        keep={t.goBack}
        onConfirm={async () => {
          await forgetEverything();
          return { ok: true, version: 0 };
        }}
        onClose={(changed) => {
          setRemoving(false);
          // Loaded afresh, with nothing of the other account's left, to sign in again.
          if (changed) window.location.replace(pageAddress(mode, from));
        }}
      />
    </div>
  );
}
