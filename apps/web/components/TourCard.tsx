'use client';

// "New to PrePenny? Take a 60-second tour." (step 4h, D597, the owner's
// words): a small card on Home after setup, under the lowest point and under
// the card offering free help when money is tight, never above them, so a
// 320 by 568 phone still shows the account and the lowest point first
// (D442). Calm, as the home-screen suggestion (D547): the sunk colour, the
// line, then "Show me" and "No thanks". "No thanks", or finishing the tour,
// takes it away for good on this phone, with a line in its place saying
// where the tour is, which takes focus so it isn't lost (WCAG 2.4.3). Never
// on Sam's example, which isn't a plan of one's own.

import { useEffect, useId, useRef, useState } from 'react';
import { keepTourCardGone, startTour, useTourCardGone } from '../lib/tour.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './Install.module.css';
import { isSamsExample, usePlan } from './PlanProvider.tsx';

const t = strings.tour;

export function TourCard() {
  const state = usePlan();
  const example = state.plan !== null && isSamsExample(state.plan);
  const gone = useTourCardGone();
  const titleId = useId();
  // Shown on this visit to Home, so going for good puts the line in its place.
  const [shown, setShown] = useState(false);
  const [said, setSaid] = useState(false);
  const saidRef = useRef<HTMLParagraphElement>(null);
  const visible = !example && gone === false;

  useEffect(() => {
    if (visible) setShown(true);
    else if (shown && gone === true) setSaid(true);
  }, [visible, shown, gone]);

  useEffect(() => {
    if (said) saidRef.current?.focus();
  }, [said]);

  if (said) {
    return (
      <p ref={saidRef} className={styles.said} tabIndex={-1} data-testid="tour-card-said">
        {t.inMore}
      </p>
    );
  }
  if (!visible) return null;
  return (
    <section className={styles.suggestion} aria-labelledby={titleId} data-testid="tour-card">
      <h2 id={titleId} className={styles.title}>
        {t.card}
      </h2>
      <div className={`${styles.buttons} ${styles.short}`}>
        <button type="button" aria-haspopup="dialog" onClick={startTour}>
          {t.showMe}
        </button>
        <button type="button" onClick={keepTourCardGone}>
          {t.noThanks}
        </button>
      </div>
    </section>
  );
}
