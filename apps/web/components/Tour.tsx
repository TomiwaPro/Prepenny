'use client';

// The 60-second tour of Home (step 4h, D597): a few short steps, each about
// one part of Home itself, with Next, Back and End tour on every step.
//
// - Each step rings its part of Home, brings it into view and puts the
//   panel out of its way, above the bottom navigation or at the top.
// - The panel is a dialog: focus stays in it, the step's words take focus
//   at each step so a screen reader reads them, Tab moves between Back, Next
//   and End tour, and Escape ends it.
// - With reduced motion, nothing moves: no rise as it opens, and each part
//   is brought into view at once.
// - Done, on the last step, finishes it, which takes Home's card away for
//   good (lib/tour.ts); End tour, or Escape, leaves the card.
// - Nothing records that it was taken (D598).

import { useEffect, useId, useRef, useState } from 'react';
import { useLockState } from '../lib/app-lock.ts';
import { TOUR_HASH } from '../lib/help-routes.ts';
import type { HomeView } from '../lib/home.ts';
import { closeTour, keepTourCardGone, startTour, useTourOpen } from '../lib/tour.ts';
import { NAV_TARGET, tourSteps } from '../lib/tour-steps.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './Tour.module.css';

const t = strings.tour;
/** Room left above a part brought into view. */
const ABOVE = 16;
/** Home's heading, which takes focus when the tour ends with nothing else to go back to. */
export const HOME_HEADING_ID = 'home-heading';

/** Resolves once a smooth scroll has stopped, or after a moment at most. */
function scrolled(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('scrollend', done);
      resolve();
    };
    window.addEventListener('scrollend', done, { once: true });
    setTimeout(done, 700);
  });
}

/** Above the navigation, unless that would cover the start of the part it's about. */
function placeFor(target: Element | null, panel: HTMLElement | null, nav: boolean) {
  if (nav) return 'top';
  if (target === null || panel === null) return 'bottom';
  const navBar = document.querySelector(NAV_TARGET)?.getBoundingClientRect().height ?? 0;
  const room = window.innerHeight - navBar - panel.getBoundingClientRect().height - ABOVE;
  return target.getBoundingClientRect().top + ABOVE * 2 > room ? 'top' : 'bottom';
}

export function Tour({ home }: { readonly home: HomeView }) {
  const open = useTourOpen();
  const unlocked = useLockState() === 'open';
  const steps = tourSteps(home);
  const [index, setIndex] = useState(0);
  const [place, setPlace] = useState<'top' | 'bottom'>('bottom');
  const dialog = useRef<HTMLDialogElement>(null);
  const words = useRef<HTMLDivElement>(null);
  const nameId = useId();
  const countId = useId();
  const titleId = useId();
  const textId = useId();

  // From More, "#tour" in the address starts it, once Home is ready and the
  // app lock is open. The address then loses it, so going back doesn't start
  // it again.
  useEffect(() => {
    if (!unlocked) return;
    const fromAddress = () => {
      if (window.location.hash !== TOUR_HASH) return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      startTour();
    };
    fromAddress();
    window.addEventListener('hashchange', fromAddress);
    return () => window.removeEventListener('hashchange', fromAddress);
  }, [unlocked]);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.open) {
      setIndex(0);
      element.showModal();
    }
    if (!open && element.open) element.close();
  }, [open]);

  const step = steps[Math.min(index, steps.length - 1)];

  // Each step: its part of Home is ringed and brought into view, the panel
  // moves out of its way, and the step's words take focus.
  // biome-ignore lint/correctness/useExhaustiveDependencies: it runs for each step, when the tour is open
  useEffect(() => {
    if (!open || step === undefined) return;
    const target = document.querySelector<HTMLElement>(step.target);
    const nav = step.target === NAV_TARGET;
    target?.setAttribute('data-tour-here', '');
    let stopped = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Where focus is as the step starts: the step's words take it once the
    // part is in view, but only if it's still there, so a quick Tab or
    // Shift+Tab made meanwhile is never pulled back (D616).
    const from = document.activeElement;
    void (async () => {
      if (target !== null && !nav) {
        const top = target.getBoundingClientRect().top + window.scrollY - ABOVE;
        window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
        if (!reduced) await scrolled();
      }
      if (stopped) return;
      setPlace(placeFor(target, dialog.current, nav));
      const now = document.activeElement;
      if (now === from || now === null || now === document.body) words.current?.focus();
    })();
    return () => {
      stopped = true;
      target?.removeAttribute('data-tour-here');
    };
  }, [open, index]);

  if (step === undefined) return null;
  const last = index === steps.length - 1;
  return (
    <dialog
      ref={dialog}
      className={styles.tour}
      data-place={place}
      data-testid="tour"
      aria-labelledby={`${nameId} ${countId} ${titleId}`}
      aria-describedby={textId}
      onClose={(event) => {
        // A close that arrives once it's open again is an earlier one, late (D616).
        if (event.target !== event.currentTarget || event.currentTarget.open) return;
        closeTour();
        // Back to where it was started from; when that has gone, as Home's
        // card goes once the tour is finished, or it started from More, to
        // Home's heading, so focus isn't lost (WCAG 2.4.3).
        const panel = event.currentTarget;
        requestAnimationFrame(() => {
          const now = document.activeElement;
          if (now === null || now === document.body || !now.isConnected || panel.contains(now)) {
            document.getElementById(HOME_HEADING_ID)?.focus();
          }
        });
      }}
    >
      <div ref={words} className={styles.step} tabIndex={-1}>
        <span id={nameId} className="visually-hidden">
          {t.name}
        </span>
        <p id={countId} className={styles.count}>
          {t.step(index + 1, steps.length)}
        </p>
        <h2 id={titleId} className={styles.title}>
          {step.title}
        </h2>
        <p id={textId} className={styles.text}>
          {step.text}
        </p>
      </div>
      <div className={styles.buttons}>
        <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          {t.back}
        </button>
        {last ? (
          <button
            type="button"
            className={styles.main}
            onClick={() => {
              keepTourCardGone();
              closeTour();
            }}
          >
            {t.done}
          </button>
        ) : (
          <button type="button" className={styles.main} onClick={() => setIndex(index + 1)}>
            {t.next}
          </button>
        )}
        <button type="button" onClick={closeTour}>
          {t.end}
        </button>
      </div>
    </dialog>
  );
}
