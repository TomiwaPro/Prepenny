'use client';

// A box for a 6-digit code, from an email or an authenticator app (step 3e),
// as the sign-in page has: numbers only, from the phone's number keys, which
// the phone can fill in from the email or the app itself.

import type { Ref } from 'react';
import { describedBy, Field } from './Fields.tsx';
import formStyles from './Form.module.css';
import styles from './SignInScreen.module.css';

export function CodeBox({
  id,
  label,
  hint,
  error,
  value,
  onChange,
  inputRef,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly error: string | undefined;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <Field id={id} label={label} error={error} {...(hint === undefined ? {} : { hint })}>
      <input
        ref={inputRef}
        id={id}
        className={`${formStyles.input} ${styles.code} num`}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy(id, error, hint === undefined ? [] : [`${id}-hint`])}
      />
    </Field>
  );
}

/** The 6 numbers typed, without spaces, or null when they aren't 6 numbers. */
export function sixDigits(typed: string): string | null {
  const code = typed.replace(/\s/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}
