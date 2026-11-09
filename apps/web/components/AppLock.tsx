'use client';

// The lock screen, "Open with your PIN" (brief 4.13, D35, step 3e), over
// every screen that can show the plan: the app and setup. It covers the
// whole screen and nothing under it can be reached, by touch, keyboard or
// screen reader, until the PIN is typed. While PrePenny is away with the
// lock on, a plain cover hides the plan from the phone's app switcher.
// "Forgot your PIN?" says what to do: sign out, and the plan comes back
// from the account, or, with a plan on this phone only, remove everything.

import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { forgetEverything } from '../data/forget.ts';
import { useAccount } from '../lib/account.ts';
import { checkPin, PIN, useLockState } from '../lib/app-lock.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './AppLock.module.css';
import { ConfirmSheet } from './ConfirmSheet.tsx';
import { describedBy, Field } from './Fields.tsx';
import formStyles from './Form.module.css';
import type { OwnPlan } from './PlanProvider.tsx';
import { SignOutSheet } from './SignOutSheet.tsx';

const t = strings.lock;

export function AppLock({ ownPlan }: { readonly ownPlan: OwnPlan }) {
  const lock = useLockState();
  if (lock === 'open') return null;
  if (lock === 'covered') {
    return (
      <div className={styles.cover} data-testid="app-cover">
        <p className={styles.wordmark}>{strings.app.name}</p>
        <p className={styles.coverLine}>{t.covered}</p>
      </div>
    );
  }
  return <LockScreen ownPlan={ownPlan} />;
}

function LockScreen({ ownPlan }: { readonly ownPlan: OwnPlan }) {
  const id = useId();
  const account = useAccount();
  const dialog = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) element.showModal();
    box.current?.focus();
  }, []);

  async function open(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!PIN.test(pin)) {
      setError(t.pinMissing);
      box.current?.focus();
      return;
    }
    setBusy(true);
    const checked = await checkPin(pin);
    setBusy(false);
    if (checked === 'right') return;
    setPin('');
    setError(checked === 'wrong' ? t.wrong : t.waitTries(checked.wait));
    box.current?.focus();
  }

  return (
    <dialog
      ref={dialog}
      className={styles.lock}
      aria-labelledby={`${id}-heading`}
      aria-describedby={`${id}-purpose`}
      data-testid="app-lock"
      // Escape doesn't close it: only the PIN does.
      onCancel={(event) => event.preventDefault()}
    >
      <div className={styles.inner}>
        <p className={styles.wordmark}>{strings.app.name}</p>
        <h1 id={`${id}-heading`} className={styles.heading}>
          {t.screenHeading}
        </h1>
        <p id={`${id}-purpose`} className={styles.purpose}>
          {t.screenPurpose}
        </p>
        <form className={styles.card} onSubmit={open} noValidate>
          <Field id={`${id}-pin`} label={t.screenLabel} error={error}>
            <input
              ref={box}
              id={`${id}-pin`}
              className={`${formStyles.input} num`}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              aria-invalid={error !== undefined}
              aria-describedby={describedBy(`${id}-pin`, error)}
            />
          </Field>
          <button type="submit" className={formStyles.main} aria-disabled={busy}>
            {t.open}
          </button>
        </form>
        <button
          type="button"
          className={styles.forgot}
          aria-expanded={forgot}
          aria-controls={`${id}-forgot`}
          onClick={() => setForgot(!forgot)}
        >
          {t.forgot}
        </button>
        <div id={`${id}-forgot`} hidden={!forgot} className={styles.card}>
          {account.status === 'signed-in' ? (
            <>
              <p className={styles.line}>{t.forgotSignedIn}</p>
              <button
                type="button"
                className={formStyles.outlined}
                aria-haspopup="dialog"
                onClick={() => setSigningOut(true)}
              >
                {strings.account.signOut}
              </button>
            </>
          ) : (
            <>
              <p className={styles.line}>{t.forgotLocal}</p>
              <button
                type="button"
                className={formStyles.outlined}
                aria-haspopup="dialog"
                onClick={() => setRemoving(true)}
              >
                {t.removeEverything}
              </button>
            </>
          )}
        </div>
      </div>
      <SignOutSheet open={signingOut} ownPlan={ownPlan} onClose={() => setSigningOut(false)} />
      <ConfirmSheet
        open={removing}
        title={t.removeTitle}
        intro={t.removeIntro}
        confirm={t.removeYes}
        keep={t.removeNo}
        onConfirm={async () => {
          await forgetEverything();
          return { ok: true, version: 0 };
        }}
        onClose={(changed) => {
          setRemoving(false);
          if (changed) window.location.replace('/');
        }}
      />
    </dialog>
  );
}
