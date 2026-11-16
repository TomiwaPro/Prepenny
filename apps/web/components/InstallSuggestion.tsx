'use client';

// On Home, once, on the second day someone uses their own plan: "Add
// PrePenny to your home screen.", with "Show me how" (or the browser's own
// "Add to home screen" where it offers one) and "Not now" (step 4d, D546,
// D547, the owner's answer to PLAN.md question 5). Never on Sam's example,
// and never again once answered or PrePenny is on the home screen. It sits
// under the lowest point, like the bank holiday note, so a 320 by 568
// phone still shows the account and the lowest point first (D442, D451).
// Once answered, one line in its place says where the steps are.

import { useEffect, useId, useRef, useState } from 'react';
import { useAccount } from '../lib/account.ts';
import {
  answerSuggestion,
  installWithBrowser,
  noteOwnPlanDay,
  suggestOnHome,
  useHomeScreen,
} from '../lib/install.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './Install.module.css';
import { InstallSheet } from './InstallSteps.tsx';
import { usePlan } from './PlanProvider.tsx';

const t = strings.homeScreen;

export function InstallSuggestion({ today }: { readonly today: string }) {
  const state = usePlan();
  const own = state.plan !== null && !state.plan.isExample;
  const home = useHomeScreen();
  const account = useAccount();
  const titleId = useId();
  const [steps, setSteps] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const saidRef = useRef<HTMLParagraphElement>(null);

  // The first day Home shows the person's own plan is kept (D547).
  useEffect(() => {
    if (own) noteOwnPlanDay(today);
  }, [own, today]);

  // Once answered, focus goes to the line in its place, so it isn't lost (WCAG 2.4.3).
  useEffect(() => {
    if (said !== null && !steps) saidRef.current?.focus();
  }, [said, steps]);

  const show = own && suggestOnHome(home, today);
  if (!show && said === null && !steps) return null;
  return (
    <>
      {show ? (
        <section
          className={styles.suggestion}
          aria-labelledby={titleId}
          data-testid="home-screen-suggestion"
        >
          <h2 id={titleId} className={styles.title}>
            {t.suggest.title}
          </h2>
          <p className={styles.line}>{t.suggest.line}</p>
          <div className={styles.buttons}>
            {home.canInstall ? (
              <button
                type="button"
                onClick={async () => {
                  answerSuggestion();
                  const outcome = await installWithBrowser();
                  setSaid(outcome === 'accepted' ? t.added : t.suggest.inMore);
                }}
              >
                {t.addNow}
              </button>
            ) : (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => {
                  answerSuggestion();
                  setSteps(true);
                }}
              >
                {t.suggest.showMeHow}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                answerSuggestion();
                setSaid(t.suggest.inMore);
              }}
            >
              {t.suggest.notNow}
            </button>
          </div>
        </section>
      ) : said !== null ? (
        <p ref={saidRef} className={styles.said} tabIndex={-1} data-testid="home-screen-said">
          {said}
        </p>
      ) : null}
      <InstallSheet
        open={steps}
        signUpFirst={own && account.status === 'signed-out'}
        onClose={() => {
          setSteps(false);
          setSaid(t.suggest.inMore);
        }}
      />
    </>
  );
}
