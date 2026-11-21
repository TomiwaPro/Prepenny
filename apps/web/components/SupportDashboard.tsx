'use client';

// The support dashboard (step 4j, D641, D642), the only page on its own
// address, admin.prepenny.co.uk, behind Cloudflare Access. Support's account
// is its own (D640) and never needs the app, so the dashboard has its own
// sign-in and its own two-step sign-in:
//
// 1. Signed out: the email address, then the 6-digit code from the email
//    (or the email's link, once "Finish signing in" is tapped, D312).
// 2. The first time: setting up two-step sign-in with an authenticator app.
//    Every time after: the app's code.
// 3. Then the dashboard's views (SupportScreen.tsx).
//
// The database decides who's support (app.support_only); this only asks.
// The sign-in is kept for this tab only, and nothing else is kept on the
// computer (lib/support-client.ts). Nothing is written to the console.

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  checkSupportCode,
  checkSupportLink,
  checkSupportSignIn,
  finishSupportTwoStep,
  type NewSupportApp,
  passSupportSecondStep,
  type SignInProblem,
  sendSupportCode,
  signOutOfSupport,
  startSupportTwoStep,
  supportTwoStep,
  useSupportSignIn,
} from '../lib/support-client.ts';
import { supportStatus } from '../lib/support-tools.ts';
import { supportStrings } from '../strings/support-en-GB.ts';
import { CodeBox, sixDigits } from './CodeBox.tsx';
import { describedBy, Field, Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import styles from './Screens.module.css';
import { SupportScreen, ViewHeader } from './SupportScreen.tsx';

const t = supportStrings.supportDashboard;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A sign-in problem in words. */
export function dashboardWords(problem: SignInProblem): string {
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
      return t.codeWrong;
    case 'email-refused':
      return t.emailRefused;
    case 'app-code-wrong':
      return t.appCodeWrong;
  }
}

/** The email's one-time key, from "#token_hash=…&type=email", or null. */
export function linkKeyOf(hash: string): string | null {
  const found = /^#token_hash=([A-Za-z0-9_-]{8,200})&type=email$/.exec(hash);
  return found?.[1] ?? null;
}

/** What the dashboard shows once someone is signed in. */
type Gate =
  | 'checking'
  | 'support'
  | 'set-up'
  | 'second-step'
  | 'not-support'
  | 'failed'
  | 'offline';

/** A card with words, and maybe a button. */
function Card({
  heading,
  purpose,
  words,
  children,
}: {
  readonly heading: string;
  readonly purpose: string;
  readonly words: string;
  readonly children?: ReactNode;
}) {
  return (
    <>
      <ViewHeader heading={heading} purpose={purpose} back={null} />
      <section className={styles.card} data-testid="dashboard-card">
        <p className={styles.line}>{words}</p>
        {children === undefined ? null : <div className={styles.actions}>{children}</div>}
      </section>
    </>
  );
}

/** "Sign out", under every signed-in view. */
function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <section className={styles.card}>
      <p className={styles.line} role="status">
        {busy ? t.signingOut : ''}
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={formStyles.outlined}
          aria-disabled={busy}
          onClick={() => {
            if (busy) return;
            setBusy(true);
            // Signed out, the dashboard shows only its sign-in, and the view
            // after the "#" goes from the address too.
            void signOutOfSupport().then(() =>
              window.history.replaceState(null, '', window.location.pathname),
            );
          }}
        >
          {t.signOut}
        </button>
      </div>
    </section>
  );
}

export function SupportDashboard() {
  const who = useSupportSignIn();
  const [gate, setGate] = useState<Gate>('checking');
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    const key = linkKeyOf(window.location.hash);
    if (key !== null) {
      // The key leaves the address at once, so it's never in the history.
      window.history.replaceState(null, '', window.location.pathname);
      setLink(key);
    }
    void checkSupportSignIn();
  }, []);

  const look = useCallback(async () => {
    setGate('checking');
    const status = await supportStatus();
    if (!status.ok) {
      setGate(status.problem === 'offline' ? 'offline' : 'failed');
      return;
    }
    if (status.value === 'support') {
      setGate('support');
      return;
    }
    if (status.value === 'no') {
      setGate('not-support');
      return;
    }
    const two = await supportTwoStep();
    if (!two.ok) {
      setGate(two.problem.kind === 'offline' ? 'offline' : 'failed');
      return;
    }
    setGate(two.value.on ? 'second-step' : 'set-up');
  }, []);

  useEffect(() => {
    if (who.status === 'signed-in') void look();
  }, [who, look]);

  if (who.status === 'off') {
    return <Card heading={t.signInHeading} purpose={t.signInPurpose} words={t.off} />;
  }
  if (who.status === 'checking') {
    return <Card heading={t.signInHeading} purpose={t.signInPurpose} words={t.checking} />;
  }
  if (who.status === 'signed-out') {
    return <SignIn link={link} onLinkGone={() => setLink(null)} />;
  }
  switch (gate) {
    case 'checking':
      return <Card heading={t.title} purpose={t.signInPurpose} words={t.checking} />;
    case 'failed':
    case 'offline':
      return (
        <>
          <Card
            heading={t.title}
            purpose={t.signInPurpose}
            words={gate === 'offline' ? t.offline : t.server}
          >
            <button type="button" className={formStyles.outlined} onClick={() => void look()}>
              {supportStrings.supportTools.tryAgain}
            </button>
          </Card>
          <SignOutButton />
        </>
      );
    case 'not-support':
      return (
        <>
          <Card heading={t.title} purpose={t.signInPurpose} words={t.notSupport} />
          <SignOutButton />
        </>
      );
    case 'set-up':
      return (
        <>
          <SetUpTwoStep onDone={() => void look()} />
          <SignOutButton />
        </>
      );
    case 'second-step':
      return (
        <>
          <SecondStep onDone={() => void look()} />
          <SignOutButton />
        </>
      );
    case 'support':
      return (
        <>
          <SupportScreen />
          <SignOutButton />
        </>
      );
  }
}

// ---------------------------------------------------------------------------
// Signing in: the email address, then the code (or the email's link).

function SignIn({
  link,
  onLinkGone,
}: {
  readonly link: string | null;
  readonly onLinkGone: () => void;
}) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [codeError, setCodeError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const emailBox = useRef<HTMLInputElement>(null);
  const codeBox = useRef<HTMLInputElement>(null);

  async function send(event: { preventDefault(): void }) {
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
    setBusy(t.sending);
    const sent = await sendSupportCode(typed);
    setBusy(null);
    if (!sent.ok) {
      if (sent.problem.kind === 'email-refused') {
        setEmailError(t.emailRefused);
        emailBox.current?.focus();
      } else {
        setProblem(dashboardWords(sent.problem));
      }
      return;
    }
    setSaid(sentTo === null ? t.sentTo(typed) : t.newCodeSentTo(typed));
    setSentTo(typed);
    setCode('');
    setCodeError(undefined);
    setTimeout(() => codeBox.current?.focus(), 0);
  }

  async function check(event: FormEvent) {
    event.preventDefault();
    if (busy !== null || sentTo === null) return;
    setProblem(null);
    const typed = sixDigits(code);
    if (typed === null) {
      setCodeError(t.codeMissing);
      codeBox.current?.focus();
      return;
    }
    setCodeError(undefined);
    setBusy(t.signingIn);
    const done = await checkSupportCode(sentTo, typed);
    setBusy(null);
    if (!done.ok) {
      if (done.problem.kind === 'code-refused') {
        setCodeError(t.codeWrong);
        codeBox.current?.focus();
      } else {
        setProblem(dashboardWords(done.problem));
      }
    }
  }

  async function finishWithLink(key: string) {
    if (busy !== null) return;
    setProblem(null);
    setBusy(t.checkingLink);
    const done = await checkSupportLink(key);
    setBusy(null);
    if (!done.ok) {
      onLinkGone();
      setProblem(
        done.problem.kind === 'code-refused' ? t.linkRanOut : dashboardWords(done.problem),
      );
    }
  }

  if (link !== null) {
    return (
      <>
        <ViewHeader heading={t.linkHeading} purpose={t.linkPurpose} back={null} />
        <p className={styles.line} role="status">
          {busy ?? ''}
        </p>
        <section className={styles.card}>
          <div className={styles.actions}>
            <button
              type="button"
              className={formStyles.main}
              aria-disabled={busy !== null}
              onClick={() => void finishWithLink(link)}
            >
              {t.finishLink}
            </button>
            <button type="button" className={formStyles.outlined} onClick={onLinkGone}>
              {t.anotherWay}
            </button>
          </div>
        </section>
        <Problem text={problem} />
      </>
    );
  }

  return (
    <>
      <ViewHeader heading={t.signInHeading} purpose={t.signInPurpose} back={null} />
      <p className={styles.line} role="status" data-testid="dashboard-said">
        {busy ?? said}
      </p>
      {sentTo === null ? (
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
      ) : (
        <>
          <form className={styles.card} onSubmit={check} noValidate>
            <h2 className={styles.cardTitle}>{t.codeHeading}</h2>
            <CodeBox
              id={`${id}-code`}
              label={t.codeLabel}
              hint={t.codeHint}
              error={codeError}
              value={code}
              onChange={setCode}
              inputRef={codeBox}
            />
            <button type="submit" className={formStyles.main} aria-disabled={busy !== null}>
              {t.signIn}
            </button>
          </form>
          <section className={styles.card}>
            <div className={styles.actions}>
              <button
                type="button"
                className={formStyles.outlined}
                onClick={(event) => void send(event)}
              >
                {t.sendNewCode}
              </button>
              <button
                type="button"
                className={formStyles.outlined}
                onClick={() => {
                  setSentTo(null);
                  setSaid('');
                  setProblem(null);
                  setTimeout(() => emailBox.current?.focus(), 0);
                }}
              >
                {t.otherEmail}
              </button>
            </div>
          </section>
        </>
      )}
      <Problem text={problem} />
    </>
  );
}

// ---------------------------------------------------------------------------
// The authenticator app's code, every time support signs in.

function SecondStep({ onDone }: { readonly onDone: () => void }) {
  const id = useId();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  async function check(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setProblem(null);
    const typed = sixDigits(code);
    if (typed === null) {
      setCodeError(t.appCodeMissing);
      box.current?.focus();
      return;
    }
    setCodeError(undefined);
    setBusy(true);
    const done = await passSupportSecondStep(typed);
    setBusy(false);
    if (done.ok) {
      onDone();
      return;
    }
    if (done.problem.kind === 'app-code-wrong') {
      setCodeError(t.appCodeWrong);
      box.current?.focus();
    } else {
      setProblem(dashboardWords(done.problem));
    }
  }

  return (
    <>
      <ViewHeader heading={t.secondHeading} purpose={t.secondPurpose} back={null} />
      <p className={styles.line} role="status">
        {busy ? t.checkingCode : ''}
      </p>
      <form className={styles.card} onSubmit={check} noValidate>
        <CodeBox
          id={`${id}-app-code`}
          label={t.appCodeLabel}
          hint={t.appCodeHint}
          error={codeError}
          value={code}
          onChange={setCode}
          inputRef={box}
        />
        <button type="submit" className={formStyles.main} aria-disabled={busy}>
          {t.continue}
        </button>
      </form>
      <Problem text={problem} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Setting up two-step sign-in, the first time support signs in.

function SetUpTwoStep({ onDone }: { readonly onDone: () => void }) {
  const id = useId();
  const [app, setApp] = useState<NewSupportApp | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const box = useRef<HTMLInputElement>(null);
  const firstStep = useRef<HTMLParagraphElement>(null);

  async function start() {
    if (busy !== null) return;
    setProblem(null);
    setBusy(t.starting);
    const started = await startSupportTwoStep();
    setBusy(null);
    if (!started.ok) {
      setProblem(dashboardWords(started.problem));
      return;
    }
    setApp(started.value);
    setCode('');
    setCodeError(undefined);
    // The steps start under the heading, so a screen reader reads them in order.
    setTimeout(() => firstStep.current?.focus(), 0);
  }

  async function finish(event: FormEvent) {
    event.preventDefault();
    if (busy !== null || app === null) return;
    setProblem(null);
    const typed = sixDigits(code);
    if (typed === null) {
      setCodeError(t.appCodeMissing);
      box.current?.focus();
      return;
    }
    setCodeError(undefined);
    setBusy(t.turningOn);
    const done = await finishSupportTwoStep(app.factorId, typed);
    setBusy(null);
    if (done.ok) {
      onDone();
      return;
    }
    if (done.problem.kind === 'app-code-wrong') {
      setCodeError(t.appCodeWrong);
      box.current?.focus();
    } else {
      setProblem(dashboardWords(done.problem));
    }
  }

  return (
    <>
      <ViewHeader heading={t.setUpHeading} purpose={t.setUpPurpose} back={null} />
      <p className={styles.line} role="status">
        {busy ?? ''}
      </p>
      {app === null ? (
        <section className={styles.card}>
          <div className={styles.actions}>
            <button type="button" className={formStyles.main} onClick={() => void start()}>
              {t.setUp}
            </button>
          </div>
        </section>
      ) : (
        <form className={styles.card} onSubmit={finish} noValidate data-testid="dashboard-set-up">
          <p ref={firstStep} tabIndex={-1} className={styles.line}>
            {t.getApp}
          </p>
          <p className={styles.line}>{t.scan}</p>
          <div className={styles.qr}>
            {/* Supabase draws the picture; it holds only what the app needs to add PrePenny support. */}
            {/* biome-ignore lint/performance/noImgElement: a picture made on the server, not a file */}
            <img src={app.qrCode} alt={t.qrAlt} width={180} height={180} />
          </div>
          <p className={styles.second}>{t.orType}</p>
          <p className={`${styles.key} num`} data-testid="dashboard-key">
            {app.key}
          </p>
          <p className={styles.second}>{t.keepKey}</p>
          <p className={styles.line}>{t.typeCode}</p>
          <CodeBox
            id={`${id}-first-code`}
            label={t.appCodeLabel}
            error={codeError}
            value={code}
            onChange={setCode}
            inputRef={box}
          />
          <button type="submit" className={formStyles.main} aria-disabled={busy !== null}>
            {t.turnOn}
          </button>
        </form>
      )}
      <Problem text={problem} />
    </>
  );
}
