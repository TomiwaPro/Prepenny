'use client';

// One step of setup (brief 4.1, D163, D213, step 2e): "Step 2 of 8", Skip
// this step (except on step 1), the step's title with one plain sentence
// saying what it's for, the step itself, then Next and Back. The title takes
// focus when the step opens, so a screen reader starts there.

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { SETUP_STEPS } from '../../lib/setup-progress.ts';
import { strings } from '../../strings/en-GB.ts';
import { Problem } from '../Fields.tsx';
import formStyles from '../Form.module.css';
import styles from './Setup.module.css';

const t = strings.setup;

export function StepFrame({
  step,
  title,
  intro,
  onSkip,
  onNext,
  onBack,
  nextLabel = t.next,
  busy = false,
  problem = null,
  children,
}: {
  readonly step: number;
  readonly title: string;
  readonly intro: string;
  /** Left out where a step can't be skipped (D163). */
  readonly onSkip?: () => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly nextLabel?: string;
  readonly busy?: boolean;
  readonly problem?: string | null;
  readonly children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <main className={styles.page} data-step={step}>
      <div className={styles.top}>
        <p className={styles.count}>{t.stepOf(step, SETUP_STEPS)}</p>
        {onSkip === undefined ? null : (
          <button type="button" className={styles.skip} onClick={onSkip}>
            {t.skip}
          </button>
        )}
      </div>
      <header className={styles.header}>
        <h1 ref={heading} tabIndex={-1} className={styles.heading}>
          {title}
        </h1>
        <p className={styles.intro}>{intro}</p>
      </header>
      <form
        className={styles.body}
        noValidate
        aria-label={title}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onNext();
        }}
      >
        {children}
        <Problem text={problem} />
        <div className={styles.buttons}>
          <button type="submit" className={formStyles.main} aria-disabled={busy}>
            {nextLabel}
          </button>
          <button type="button" className={formStyles.outlined} onClick={onBack}>
            {t.back}
          </button>
        </div>
      </form>
    </main>
  );
}

/**
 * Focus for when a form or row has gone: the step's "Add another" button,
 * or its title if it has none, so keyboard users aren't left on nothing
 * (WCAG 2.4.3).
 */
export function focusAddAnother() {
  requestAnimationFrame(() => {
    const add = document.querySelector<HTMLElement>('main [data-add-another]');
    (add ?? document.querySelector<HTMLElement>('main h1'))?.focus();
  });
}

/** What a step has added so far, one row each with Remove (step 2e). */
export function AddedList({
  items,
}: {
  readonly items: readonly {
    readonly id: string;
    readonly name: string;
    readonly line: string;
    readonly label?: string | null;
    readonly onRemove: () => void;
    readonly problem?: string | null;
  }[];
}) {
  const list = useRef<HTMLUListElement>(null);
  // Where focus goes once a row has gone: the row that took its place, the
  // one before it, or "Add another" when none are left.
  const [focusAt, setFocusAt] = useState<{ at: number; count: number } | null>(null);
  useEffect(() => {
    if (focusAt === null || items.length >= focusAt.count) return;
    setFocusAt(null);
    const removes = list.current?.querySelectorAll<HTMLElement>('[data-remove]') ?? [];
    const next = removes[Math.min(focusAt.at, removes.length - 1)];
    if (next === undefined) focusAddAnother();
    else next.focus();
  }, [items.length, focusAt]);
  if (items.length === 0) return null;
  return (
    <section aria-label={t.added}>
      <ul ref={list} className={styles.added} data-testid="added">
        {items.map((item, at) => (
          <li key={item.id}>
            <div className={styles.item}>
              <div className={styles.itemWords}>
                <span className={styles.itemName}>{item.name}</span>
                <span className={`${styles.itemLine} num`}>{item.line}</span>
                {item.label === undefined || item.label === null ? null : (
                  <span className={styles.label}>{item.label}</span>
                )}
              </div>
              <button
                type="button"
                className={formStyles.quiet}
                aria-label={t.removeNamed(item.name)}
                data-remove
                onClick={() => {
                  setFocusAt({ at, count: items.length });
                  item.onRemove();
                }}
              >
                {t.remove}
              </button>
            </div>
            {item.problem === undefined || item.problem === null ? null : (
              <p className={formStyles.error} role="alert">
                {item.problem}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A card holding one form or group of choices. With a heading, it's a group
 * named by it, drawn inside the card rather than on its edge.
 */
export function SetupCard({
  heading,
  testId,
  children,
}: {
  readonly heading?: string | null;
  readonly testId?: string;
  readonly children: ReactNode;
}) {
  const id = useId();
  const named = heading !== undefined && heading !== null;
  return (
    <div
      className={styles.card}
      {...(named ? { role: 'group', 'aria-labelledby': id } : {})}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
    >
      {named ? (
        <h2 id={id} className={styles.cardHeading}>
          {heading}
        </h2>
      ) : null}
      {children}
    </div>
  );
}
