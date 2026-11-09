'use client';

// Two-step sign-in, under More (brief 4.13, step 3e): with it on, signing in
// needs a code from an authenticator app as well as the code by email, and
// the database gives nothing to a sign-in that hasn't passed it. It's
// Supabase's own, which is free. Turning it on takes three steps: get an
// app, add PrePenny to it (a link on this phone, a picture to scan from
// another, or a key to type), then type its first code. Turning it off needs
// a code from the app typed just then.

import { useEffect, useId, useRef, useState } from 'react';
import {
  finishTwoStep,
  type NewAuthenticator,
  startTwoStep,
  turnOffTwoStep,
  twoStep,
} from '../lib/security.ts';
import { strings } from '../strings/en-GB.ts';
import { CodeBox, sixDigits } from './CodeBox.tsx';
import { Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { SecondStepSheet, securityWords } from './SecondStepSheet.tsx';

const t = strings.twoStep;
const s = strings.security;

type State =
  | { readonly kind: 'checking' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'off' }
  | { readonly kind: 'adding'; readonly app: NewAuthenticator }
  | { readonly kind: 'on' };

export function TwoStepScreen() {
  const id = useId();
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [turningOff, setTurningOff] = useState(false);
  const codeBox = useRef<HTMLInputElement>(null);
  const firstStep = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    void twoStep().then((found) =>
      setState(found.ok ? { kind: found.value.on ? 'on' : 'off' } : { kind: 'failed' }),
    );
  }, []);

  async function start() {
    if (busy !== null) return;
    setProblem(null);
    setBusy(t.starting);
    const started = await startTwoStep();
    setBusy(null);
    if (!started.ok) {
      setProblem(securityWords(started.problem));
      return;
    }
    setCode('');
    setCodeError(undefined);
    setState({ kind: 'adding', app: started.value });
    // The steps start under the heading, so a screen reader reads them in order.
    setTimeout(() => firstStep.current?.focus(), 0);
  }

  async function finish(app: NewAuthenticator) {
    if (busy !== null) return;
    setProblem(null);
    const typed = sixDigits(code);
    if (typed === null) {
      setCodeError(s.appCodeMissing);
      codeBox.current?.focus();
      return;
    }
    setCodeError(undefined);
    setBusy(t.turningOn);
    const done = await finishTwoStep(app.factorId, typed);
    setBusy(null);
    if (!done.ok) {
      if (done.problem === 'code-wrong') {
        setCodeError(s.appCodeWrong);
        codeBox.current?.focus();
      } else {
        setProblem(securityWords(done.problem));
      }
      return;
    }
    setSaid(t.turnedOn);
    setState({ kind: 'on' });
  }

  return (
    <>
      <ScreenHeader
        heading={t.heading}
        purpose={t.purpose}
        back={{ label: s.backToMore, href: '/app/more/' }}
      />
      <p className={styles.line} role="status">
        {busy ?? said}
      </p>
      {state.kind === 'checking' ? (
        <section className={styles.card}>
          <p className={styles.line}>{t.checking}</p>
        </section>
      ) : state.kind === 'failed' ? (
        <section className={styles.card}>
          <p className={styles.line}>{s.server}</p>
        </section>
      ) : state.kind === 'on' ? (
        <section className={styles.card} data-testid="two-step">
          <p className={styles.line}>{t.isOn}</p>
          <p className={styles.second}>{t.lostApp}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={formStyles.outlined}
              aria-haspopup="dialog"
              onClick={() => setTurningOff(true)}
            >
              {t.turnOff}
            </button>
          </div>
        </section>
      ) : state.kind === 'off' ? (
        <section className={styles.card} data-testid="two-step">
          <p className={styles.line}>{t.isOff}</p>
          <div className={styles.actions}>
            <button type="button" className={formStyles.main} onClick={() => void start()}>
              {t.turnOn}
            </button>
          </div>
        </section>
      ) : (
        <form
          className={styles.card}
          noValidate
          data-testid="two-step-adding"
          onSubmit={(event) => {
            event.preventDefault();
            void finish(state.app);
          }}
        >
          <p ref={firstStep} tabIndex={-1} className={styles.line}>
            {t.getApp}
          </p>
          <p className={styles.line}>{t.addToApp}</p>
          <div className={formStyles.withHint}>
            <a
              className={formStyles.outlined}
              href={state.app.link}
              aria-describedby={`${id}-open-hint`}
            >
              {t.openApp}
            </a>
            <p id={`${id}-open-hint`} className={formStyles.hint}>
              {t.openAppHint}
            </p>
          </div>
          <p className={styles.second}>{t.orScan}</p>
          <div className={styles.qr}>
            {/* Supabase draws the picture; it holds only what the app needs to add PrePenny. */}
            {/* biome-ignore lint/performance/noImgElement: a picture made on the server, not a file */}
            <img src={state.app.qrCode} alt={t.qrAlt} width={180} height={180} />
          </div>
          <p className={styles.second}>{t.orType}</p>
          <p className={`${styles.key} num`} data-testid="two-step-key">
            {state.app.key}
          </p>
          <p className={styles.line}>{t.typeCode}</p>
          <CodeBox
            id={`${id}-code`}
            label={s.appCodeLabel}
            error={codeError}
            value={code}
            onChange={setCode}
            inputRef={codeBox}
          />
          <p className={styles.second}>{t.otherDevices}</p>
          <button type="submit" className={formStyles.main} aria-disabled={busy !== null}>
            {t.finish}
          </button>
        </form>
      )}
      <Problem text={problem} />
      <SecondStepSheet
        open={turningOff}
        title={t.turnOffTitle}
        intro={t.turnOffIntro}
        codeIntro={t.turnOffIntro}
        needsCode
        confirm={t.turnOffConfirm}
        keep={t.turnOffKeep}
        onConfirm={turnOffTwoStep}
        onClose={(done) => {
          setTurningOff(false);
          if (done) {
            setSaid(t.turnedOff);
            setState({ kind: 'off' });
          }
        }}
      />
    </>
  );
}
