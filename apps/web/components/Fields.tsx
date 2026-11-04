'use client';

// The boxes every sheet uses (DESIGN.md, D188): a label above each box, a
// hint or the mistake explained under it in words, an amount after a "£",
// and a date written PrePenny's way under the date box, because each phone
// shows the box its own way. Every box is labelled for screen readers, and
// a mistake is linked to its box (WCAG 3.3.1).

import type { ReactNode, Ref } from 'react';
import { formatDay } from '../lib/dates.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './Form.module.css';

/** The ids of the lines under a box that describe it: its mistake first, then any hints. */
export function describedBy(
  id: string,
  error: string | undefined,
  hints: readonly (string | null | undefined)[] = [],
): string | undefined {
  const ids = [error === undefined ? null : `${id}-error`, ...hints].filter(
    (one): one is string => typeof one === 'string' && one !== '',
  );
  return ids.length === 0 ? undefined : ids.join(' ');
}

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly error?: string | undefined;
  /** A line under the box, linked to it as `${id}-hint`. */
  readonly hint?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      {hint === undefined || hint === null ? null : (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

/** An amount box: "£" in front, inside the same border. */
export function MoneyInput({
  id,
  value,
  onChange,
  invalid,
  describedBy: described,
  inputRef,
  symbol = strings.form.pound,
}: {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly invalid: boolean;
  readonly describedBy?: string | undefined;
  readonly inputRef?: Ref<HTMLInputElement> | undefined;
  /** The currency's sign in front: "£" unless it's another currency (step 2e). */
  readonly symbol?: string;
}) {
  return (
    <div className={styles.money}>
      <span className={styles.pound} aria-hidden="true">
        {symbol}
      </span>
      <input
        ref={inputRef}
        id={id}
        className={`${styles.input} num`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={invalid}
        aria-describedby={described}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** "Fri 13 Nov" for a date box, or null for a date that can't be read. */
export function dateWords(date: string, today: string): string | null {
  if (date === '') return null;
  try {
    return formatDay(date, today);
  } catch {
    return null;
  }
}

/** A date box, with the date written PrePenny's way under it. */
export function DateField({
  id,
  label,
  value,
  today,
  onChange,
  error,
  min,
  max,
  inputRef,
  extraHint,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly today: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
  readonly min?: string;
  readonly max?: string;
  readonly inputRef?: Ref<HTMLInputElement> | undefined;
  /** Another line under the box, such as "Every Friday.", with its id. */
  readonly extraHint?: { readonly id: string; readonly text: string } | null;
}) {
  const words = dateWords(value, today);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        className={styles.input}
        type="date"
        value={value}
        min={min}
        max={max}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy(id, error, [
          words === null ? null : `${id}-day`,
          extraHint?.id,
        ])}
        onChange={(event) => onChange(event.target.value)}
      />
      {words === null ? null : (
        <p id={`${id}-day`} className={styles.hint}>
          {words}
        </p>
      )}
      {extraHint === undefined || extraHint === null ? null : (
        <p id={extraHint.id} className={styles.hint}>
          {extraHint.text}
        </p>
      )}
      {error === undefined ? null : (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

/** A tick box with its words beside it; the whole row can be tapped. */
export function CheckOption({
  checked,
  onChange,
  children,
  describedBy: described,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly children: ReactNode;
  readonly describedBy?: string | undefined;
}) {
  return (
    <label className={styles.option}>
      <input
        type="checkbox"
        checked={checked}
        aria-describedby={described}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

/** A refusal or problem, shown beside what was tapped, read out at once. */
export function Problem({ text }: { readonly text: string | null }) {
  return text === null ? null : (
    <p className={styles.problem} role="alert">
      {text}
    </p>
  );
}
