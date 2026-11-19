'use client';

// On Home, when three pay periods in a row each have a short day, starting
// with the one we're in now or the next one: "Free, confidential help is
// available.", with "See where to get help" and "Not now", which hides it
// for 30 days (step 4g, D584 to D586, D592, the owner's answers to PLAN.md
// question 9 and to step 4g, brief 4.16). Calm: the sunk
// colour, like the bank holiday note, never Short's red, and no blame. It
// sits under the lowest point, so it never pushes the lowest point down
// (D442, D451). Never on Sam's example, which isn't anyone's own money.
// Once "Not now" is tapped, one line in its place says where help is kept.

import { useEffect, useId, useRef, useState } from 'react';
import { HELP_ROUTES, MONEY_TIGHT_SLUG } from '../lib/help-routes.ts';
import { hiddenByNotNow, keepNotNow, notNowOnThisPhone } from '../lib/money-tight.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './Install.module.css';
import { isSamsExample, usePlan } from './PlanProvider.tsx';

const t = strings.moneyHelp;

export function MoneyHelp({
  today,
  shortRunning,
}: {
  readonly today: string;
  readonly shortRunning: readonly string[] | null;
}) {
  const state = usePlan();
  const example = state.plan !== null && isSamsExample(state.plan);
  const titleId = useId();
  // What's kept is read once the page is on the phone, so the first
  // picture of Home is the same with or without it.
  const [notNowOn, setNotNowOn] = useState<string | null | undefined>(undefined);
  const [said, setSaid] = useState(false);
  const saidRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => setNotNowOn(notNowOnThisPhone()), []);

  // Once answered, focus goes to the line in its place, so it isn't lost (WCAG 2.4.3).
  useEffect(() => {
    if (said) saidRef.current?.focus();
  }, [said]);

  if (said) {
    return (
      <p ref={saidRef} className={styles.said} tabIndex={-1} data-testid="money-help-said">
        {t.inMore}
      </p>
    );
  }
  if (
    example ||
    shortRunning === null ||
    notNowOn === undefined ||
    hiddenByNotNow(notNowOn, today)
  ) {
    return null;
  }
  return (
    <section className={styles.suggestion} aria-labelledby={titleId} data-testid="money-help">
      <h2 id={titleId} className={styles.title}>
        {t.title}
      </h2>
      <div className={styles.buttons}>
        {/* A plain link, as every link into help is (D588). */}
        <a href={HELP_ROUTES.app.article(MONEY_TIGHT_SLUG)}>{t.see}</a>
        <button
          type="button"
          onClick={() => {
            keepNotNow(today);
            setSaid(true);
          }}
        >
          {t.notNow}
        </button>
      </div>
    </section>
  );
}
