'use client';

// Email addresses, under More (brief 4.13, step 3e).
//
// - The sign-in email, and changing it: Supabase emails a code to the
//   address now and another to the new one, and both are typed here, so
//   neither address alone can change it. With two-step sign-in on, a code
//   from the authenticator app comes first.
// - A backup email, to get back in if the person can't get into their sign-in
//   address: added with a code sent to it, and, with two-step sign-in on, a
//   code from the authenticator app. The sign-in address is told when one is
//   added. Removing it needs the authenticator app's code too.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  addBackupEmail,
  backupEmail,
  confirmBackupEmail,
  finishEmailChange,
  passSecondStep,
  removeBackupEmail,
  type SecurityProblem,
  signInEmail,
  startEmailChange,
  twoStep,
} from '../lib/security.ts';
import { strings } from '../strings/en-GB.ts';
import { CodeBox, sixDigits } from './CodeBox.tsx';
import { describedBy, Field, Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { SecondStepSheet, securityWords } from './SecondStepSheet.tsx';

const t = strings.emails;
const s = strings.security;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Loaded {
  readonly signIn: string;
  readonly backup: string | null;
  readonly twoStepOn: boolean;
}

/** Checks the authenticator app's code when two-step sign-in is on: null when all's well, or what to say. */
async function secondStepFirst(
  on: boolean,
  typed: string,
): Promise<{ readonly box?: string; readonly problem?: string } | null> {
  if (!on) return null;
  const code = sixDigits(typed);
  if (code === null) return { box: s.appCodeMissing };
  const passed = await passSecondStep(code);
  if (passed.ok) return null;
  return passed.problem === 'code-wrong'
    ? { box: s.appCodeWrong }
    : { problem: securityWords(passed.problem) };
}

export function EmailsScreen() {
  const [loaded, setLoaded] = useState<Loaded | 'loading' | 'failed'>('loading');
  const [said, setSaid] = useState('');
  const load = useCallback(async () => {
    const [email, backup, state] = await Promise.all([signInEmail(), backupEmail(), twoStep()]);
    if (email === null || !backup.ok || !state.ok) {
      setLoaded('failed');
      return;
    }
    setLoaded({ signIn: email, backup: backup.value, twoStepOn: state.value.on });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <ScreenHeader
        heading={t.heading}
        purpose={t.purpose}
        back={{ label: s.backToMore, href: '/app/more/' }}
      />
      <p className={styles.line} role="status" data-testid="emails-said">
        {said}
      </p>
      {loaded === 'loading' ? null : loaded === 'failed' ? (
        <section className={styles.card}>
          <p className={styles.line}>{t.couldNotLoad}</p>
        </section>
      ) : (
        <>
          <SignInEmail
            loaded={loaded}
            onChanged={async (email) => {
              setSaid(t.changed(email));
              await load();
            }}
          />
          <BackupEmail
            loaded={loaded}
            onChanged={async (words) => {
              setSaid(words);
              await load();
            }}
          />
        </>
      )}
    </>
  );
}

function SignInEmail({
  loaded,
  onChanged,
}: {
  readonly loaded: Loaded;
  readonly onChanged: (email: string) => Promise<void>;
}) {
  const id = useId();
  const [step, setStep] = useState<'shown' | 'new' | 'codes'>('shown');
  const [next, setNext] = useState('');
  const [appCode, setAppCode] = useState('');
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextBox = useRef<HTMLInputElement>(null);

  function wordsFor(problemFound: SecurityProblem): string {
    if (problemFound === 'in-use') return t.inUse;
    if (problemFound === 'bad-email') return t.newMissing;
    return securityWords(problemFound);
  }

  return (
    <section className={styles.card} aria-labelledby={`${id}-heading`} data-testid="sign-in-email">
      <h2 id={`${id}-heading`} className={styles.cardTitle}>
        {t.signInHeading}
      </h2>
      <p className={styles.line}>{t.signInIs(loaded.signIn)}</p>
      {step === 'shown' ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={formStyles.outlined}
            onClick={() => {
              setStep('new');
              setNext('');
              setAppCode('');
              setErrors({});
              setProblem(null);
              setTimeout(() => nextBox.current?.focus(), 0);
            }}
          >
            {t.change}
          </button>
        </div>
      ) : step === 'new' ? (
        <form
          className={formStyles.form}
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setProblem(null);
            const typed = next.trim().toLowerCase();
            if (!EMAIL.test(typed)) {
              setErrors({ next: t.newMissing });
              nextBox.current?.focus();
              return;
            }
            if (typed === loaded.signIn.toLowerCase()) {
              setErrors({ next: t.sameAsNow });
              nextBox.current?.focus();
              return;
            }
            setErrors({});
            setBusy(true);
            const first = await secondStepFirst(loaded.twoStepOn, appCode);
            if (first !== null) {
              setBusy(false);
              setErrors({ app: first.box });
              setProblem(first.problem ?? null);
              return;
            }
            const started = await startEmailChange(typed);
            setBusy(false);
            if (!started.ok) {
              if (started.problem === 'in-use' || started.problem === 'bad-email') {
                setErrors({ next: wordsFor(started.problem) });
                nextBox.current?.focus();
              } else if (started.problem === 'second-step-needed') {
                setErrors({ app: s.appCodeWrong });
              } else {
                setProblem(wordsFor(started.problem));
              }
              return;
            }
            setNext(typed);
            setCurrentCode('');
            setNewCode('');
            setStep('codes');
          }}
        >
          <Field id={`${id}-next`} label={t.newLabel} error={errors.next} hint={t.newHint}>
            <input
              ref={nextBox}
              id={`${id}-next`}
              className={formStyles.input}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={next}
              onChange={(event) => setNext(event.target.value)}
              aria-invalid={errors.next !== undefined}
              aria-describedby={describedBy(`${id}-next`, errors.next, [`${id}-next-hint`])}
            />
          </Field>
          {loaded.twoStepOn ? (
            <CodeBox
              id={`${id}-app`}
              label={s.appCodeLabel}
              hint={s.appCodeHint}
              error={errors.app}
              value={appCode}
              onChange={setAppCode}
            />
          ) : null}
          <button type="submit" className={formStyles.main} aria-disabled={busy}>
            {t.sendCodes}
          </button>
          <button type="button" className={formStyles.quiet} onClick={() => setStep('shown')}>
            {t.cancel}
          </button>
          <p className={styles.line} role="status">
            {busy ? t.sending : ''}
          </p>
        </form>
      ) : (
        <form
          className={formStyles.form}
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setProblem(null);
            const current = sixDigits(currentCode);
            const fresh = sixDigits(newCode);
            const found: Record<string, string | undefined> = {
              current: current === null ? s.emailCodeMissing : undefined,
              fresh: fresh === null ? s.emailCodeMissing : undefined,
            };
            setErrors(found);
            if (current === null || fresh === null) {
              document.getElementById(current === null ? `${id}-current` : `${id}-fresh`)?.focus();
              return;
            }
            setBusy(true);
            const done = await finishEmailChange(
              { email: loaded.signIn, code: current },
              { email: next, code: fresh },
            );
            setBusy(false);
            if (!done.ok) {
              if (done.problem === 'code-wrong') setProblem(s.emailCodeWrong);
              else setProblem(wordsFor(done.problem));
              return;
            }
            setStep('shown');
            await onChanged(next);
          }}
        >
          <p className={styles.line}>{t.codesSent(loaded.signIn, next)}</p>
          <CodeBox
            id={`${id}-current`}
            label={t.currentCodeLabel(loaded.signIn)}
            error={errors.current}
            value={currentCode}
            onChange={setCurrentCode}
          />
          <CodeBox
            id={`${id}-fresh`}
            label={t.newCodeLabel(next)}
            error={errors.fresh}
            value={newCode}
            onChange={setNewCode}
          />
          <button type="submit" className={formStyles.main} aria-disabled={busy}>
            {t.finishChange}
          </button>
          <button type="button" className={formStyles.quiet} onClick={() => setStep('shown')}>
            {t.cancel}
          </button>
          <p className={styles.line} role="status">
            {busy ? t.changing : ''}
          </p>
        </form>
      )}
      <Problem text={problem} />
    </section>
  );
}

function BackupEmail({
  loaded,
  onChanged,
}: {
  readonly loaded: Loaded;
  readonly onChanged: (words: string) => Promise<void>;
}) {
  const id = useId();
  const [step, setStep] = useState<'shown' | 'address' | 'code'>('shown');
  const [address, setAddress] = useState('');
  const [appCode, setAppCode] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const addressBox = useRef<HTMLInputElement>(null);
  const codeBox = useRef<HTMLInputElement>(null);

  function wordsFor(found: SecurityProblem, wait?: number): string {
    if (found === 'in-use') return t.backupInUse;
    if (found === 'same-as-sign-in') return t.backupSameAsSignIn;
    if (found === 'bad-email') return t.backupMissing;
    return securityWords(found, wait);
  }

  return (
    <section className={styles.card} aria-labelledby={`${id}-heading`} data-testid="backup-email">
      <h2 id={`${id}-heading`} className={styles.cardTitle}>
        {t.backupHeading}
      </h2>
      <p className={styles.line}>
        {loaded.backup === null ? t.backupNone : t.backupIs(loaded.backup)}
      </p>
      {step === 'shown' ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={formStyles.outlined}
            onClick={() => {
              setStep('address');
              setAddress('');
              setAppCode('');
              setErrors({});
              setProblem(null);
              setTimeout(() => addressBox.current?.focus(), 0);
            }}
          >
            {loaded.backup === null ? t.backupAdd : t.backupChange}
          </button>
          {loaded.backup === null ? null : (
            <button
              type="button"
              className={formStyles.outlined}
              aria-haspopup="dialog"
              onClick={() => setRemoving(true)}
            >
              {t.backupRemove}
            </button>
          )}
        </div>
      ) : step === 'address' ? (
        <form
          className={formStyles.form}
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setProblem(null);
            const typed = address.trim().toLowerCase();
            if (!EMAIL.test(typed)) {
              setErrors({ address: t.backupMissing });
              addressBox.current?.focus();
              return;
            }
            if (typed === loaded.signIn.toLowerCase()) {
              setErrors({ address: t.backupSameAsSignIn });
              addressBox.current?.focus();
              return;
            }
            setErrors({});
            setBusy(true);
            const first = await secondStepFirst(loaded.twoStepOn, appCode);
            if (first !== null) {
              setBusy(false);
              setErrors({ app: first.box });
              setProblem(first.problem ?? null);
              return;
            }
            const sent = await addBackupEmail(typed);
            setBusy(false);
            if (!sent.ok) {
              if (sent.problem === 'bad-email' || sent.problem === 'same-as-sign-in') {
                setErrors({ address: wordsFor(sent.problem) });
                addressBox.current?.focus();
              } else if (sent.problem === 'second-step-needed') {
                setErrors({ app: s.appCodeWrong });
              } else {
                setProblem(wordsFor(sent.problem, sent.wait));
              }
              return;
            }
            setAddress(typed);
            setCode('');
            setStep('code');
            setTimeout(() => codeBox.current?.focus(), 0);
          }}
        >
          <Field
            id={`${id}-address`}
            label={t.backupLabel}
            error={errors.address}
            hint={t.backupHint}
          >
            <input
              ref={addressBox}
              id={`${id}-address`}
              className={formStyles.input}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              aria-invalid={errors.address !== undefined}
              aria-describedby={describedBy(`${id}-address`, errors.address, [
                `${id}-address-hint`,
              ])}
            />
          </Field>
          {loaded.twoStepOn ? (
            <CodeBox
              id={`${id}-app`}
              label={s.appCodeLabel}
              hint={s.appCodeHint}
              error={errors.app}
              value={appCode}
              onChange={setAppCode}
            />
          ) : null}
          <button type="submit" className={formStyles.main} aria-disabled={busy}>
            {t.backupSend}
          </button>
          <button type="button" className={formStyles.quiet} onClick={() => setStep('shown')}>
            {strings.sheet.goBack}
          </button>
          <p className={styles.line} role="status">
            {busy ? t.backupSending : ''}
          </p>
        </form>
      ) : (
        <form
          className={formStyles.form}
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setProblem(null);
            const typed = sixDigits(code);
            if (typed === null) {
              setErrors({ code: s.emailCodeMissing });
              codeBox.current?.focus();
              return;
            }
            setErrors({});
            setBusy(true);
            const done = await confirmBackupEmail(address, typed);
            setBusy(false);
            if (!done.ok) {
              if (done.problem === 'code-wrong' || done.problem === 'code-ran-out') {
                setErrors({ code: wordsFor(done.problem) });
                codeBox.current?.focus();
              } else {
                setProblem(wordsFor(done.problem));
              }
              return;
            }
            setStep('shown');
            await onChanged(t.backupAdded(address));
          }}
        >
          <p className={styles.line}>{t.backupSent(address)}</p>
          <CodeBox
            id={`${id}-code`}
            label={t.backupCodeLabel}
            hint={strings.signIn.codeHint}
            error={errors.code}
            value={code}
            onChange={setCode}
            inputRef={codeBox}
          />
          <button type="submit" className={formStyles.main} aria-disabled={busy}>
            {t.backupFinish}
          </button>
          <button type="button" className={formStyles.quiet} onClick={() => setStep('shown')}>
            {strings.sheet.goBack}
          </button>
          <p className={styles.line} role="status">
            {busy ? t.backupAdding : ''}
          </p>
        </form>
      )}
      <Problem text={problem} />
      <SecondStepSheet
        open={removing}
        title={t.backupRemoveTitle}
        intro={t.backupRemoveIntro}
        codeIntro={t.backupRemoveCodeIntro}
        needsCode={loaded.twoStepOn}
        confirm={t.backupRemoveYes}
        keep={t.backupRemoveNo}
        onConfirm={removeBackupEmail}
        onClose={async (done) => {
          setRemoving(false);
          if (done) await onChanged(t.backupRemoved);
        }}
      />
    </section>
  );
}
