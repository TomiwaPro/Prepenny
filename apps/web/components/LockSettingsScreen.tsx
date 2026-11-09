'use client';

// App lock, under More (brief 4.13, D35, step 3e): "Open with your PIN".
// Turning it on asks for a PIN of 4 to 8 numbers twice; turning it off, or
// changing it, asks for the PIN now. It's for this phone only, and nothing
// about it is sent anywhere. The screen says plainly that the phone may
// still show an older picture of PrePenny when switching apps.

import { useId, useState, useSyncExternalStore } from 'react';
import { changePin, lockOn, PIN, type PinCheck, turnOffLock, turnOnLock } from '../lib/app-lock.ts';
import { strings } from '../strings/en-GB.ts';
import { describedBy, Field, Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { Sheet } from './Sheet.tsx';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.lock;

function PinBox({
  id,
  label,
  hint,
  error,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly error: string | undefined;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label} error={error} {...(hint === undefined ? {} : { hint })}>
      <input
        id={id}
        className={`${formStyles.input} num`}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        maxLength={8}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy(id, error, hint === undefined ? [] : [`${id}-hint`])}
      />
    </Field>
  );
}

const pinWords = (checked: Exclude<PinCheck, 'right'>) =>
  checked === 'wrong' ? t.wrong : t.waitTries(checked.wait);

const listeners = new Set<() => void>();
function changed() {
  for (const listener of listeners) listener();
}

export function LockSettingsScreen() {
  const id = useId();
  // Read after the page has loaded, so the page built ahead of time matches it at first.
  const on = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    lockOn,
    () => false,
  );
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'off' | 'change' | null>(null);

  return (
    <>
      <ScreenHeader
        heading={t.heading}
        purpose={t.purpose}
        back={{ label: strings.security.backToMore, href: '/app/more/' }}
      />
      <p className={styles.line} role="status" data-testid="lock-said">
        {said}
      </p>
      {on ? (
        <section className={styles.card} data-testid="lock-settings">
          <p className={styles.line}>{t.isOn}</p>
          <p className={styles.second}>{t.preview}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={formStyles.outlined}
              aria-haspopup="dialog"
              onClick={() => setSheet('change')}
            >
              {t.changePin}
            </button>
            <button
              type="button"
              className={formStyles.outlined}
              aria-haspopup="dialog"
              onClick={() => setSheet('off')}
            >
              {t.turnOff}
            </button>
          </div>
        </section>
      ) : (
        <form
          className={styles.card}
          noValidate
          data-testid="lock-settings"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const found = {
              pin: PIN.test(pin) ? undefined : t.pinMissing,
              again: PIN.test(pin) && again !== pin ? t.pinsDiffer : undefined,
            };
            setErrors(found);
            if (found.pin !== undefined || found.again !== undefined) {
              document
                .getElementById(found.pin === undefined ? `${id}-again` : `${id}-pin`)
                ?.focus();
              return;
            }
            setBusy(true);
            await turnOnLock(pin);
            setBusy(false);
            setPin('');
            setAgain('');
            setSaid(t.turnedOn);
            changed();
          }}
        >
          <p className={styles.line}>{t.isOff}</p>
          <PinBox
            id={`${id}-pin`}
            label={t.pinLabel}
            hint={t.pinHint}
            error={errors.pin}
            value={pin}
            onChange={setPin}
          />
          <PinBox
            id={`${id}-again`}
            label={t.againLabel}
            error={errors.again}
            value={again}
            onChange={setAgain}
          />
          <p className={styles.second}>{t.preview}</p>
          <button type="submit" className={formStyles.main} aria-disabled={busy}>
            {t.turnOn}
          </button>
        </form>
      )}
      <PinSheet
        open={sheet !== null}
        kind={sheet ?? 'off'}
        onClose={(done) => {
          if (done) setSaid(sheet === 'off' ? t.turnedOff : t.changed);
          setSheet(null);
          if (done) changed();
        }}
      />
    </>
  );
}

function PinSheet({
  open,
  kind,
  onClose,
}: {
  readonly open: boolean;
  readonly kind: 'off' | 'change';
  readonly onClose: (done: boolean) => void;
}) {
  const opened = useOpenCount(open);
  return (
    <Sheet
      open={open}
      title={kind === 'off' ? t.turnOffTitle : t.changeTitle}
      intro={kind === 'off' ? t.turnOffIntro : t.changeIntro}
      closeLabel={strings.sheet.goBack}
      onClose={() => onClose(false)}
    >
      <PinForm key={opened} kind={kind} onClose={onClose} />
    </Sheet>
  );
}

function PinForm({
  kind,
  onClose,
}: {
  readonly kind: 'off' | 'change';
  readonly onClose: (done: boolean) => void;
}) {
  const id = useId();
  const [now, setNow] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={formStyles.actions}
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setProblem(null);
        const found = {
          now: PIN.test(now) ? undefined : t.pinMissing,
          next: kind === 'change' && !PIN.test(next) ? t.pinMissing : undefined,
        };
        setErrors(found);
        if (found.now !== undefined || found.next !== undefined) return;
        setBusy(true);
        const checked = kind === 'off' ? await turnOffLock(now) : await changePin(now, next);
        setBusy(false);
        if (checked === 'right') {
          onClose(true);
          return;
        }
        setNow('');
        setErrors({ now: pinWords(checked) });
      }}
    >
      <PinBox
        id={`${id}-now`}
        label={kind === 'off' ? t.screenLabel : t.currentLabel}
        error={errors.now}
        value={now}
        onChange={setNow}
      />
      {kind === 'change' ? (
        <PinBox
          id={`${id}-next`}
          label={t.newLabel}
          hint={t.pinHint}
          error={errors.next}
          value={next}
          onChange={setNext}
        />
      ) : null}
      <button type="submit" className={formStyles.main} aria-disabled={busy}>
        {kind === 'off' ? t.turnOffConfirm : t.finishChange}
      </button>
      <button type="button" className={formStyles.quiet} onClick={() => onClose(false)}>
        {strings.sheet.goBack}
      </button>
      <Problem text={problem} />
    </form>
  );
}
