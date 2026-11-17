'use client';

// On an iPhone in Safari, before setup starts (step 4d, D546, D549): "Make
// my plan" first suggests adding PrePenny to the Home Screen, saying
// plainly that a plan made in Safari stays in Safari unless they sign in.
// "Show me how" shows the steps; "Make my plan here in Safari" starts setup
// here. Either answers it, so it's never suggested again. A sheet, rather
// than a card on the welcome, so nothing on the welcome moves as the page
// loads (D362), and it's read before setup starts.

import { useEffect, useRef, useState } from 'react';
import { answerSuggestion } from '../../lib/install.ts';
import { strings } from '../../strings/en-GB.ts';
import formStyles from '../Form.module.css';
import { InstallSteps } from '../InstallSteps.tsx';
import { Sheet } from '../Sheet.tsx';

const t = strings.homeScreen.before;

export function InstallBeforeSetup({
  open,
  onClose,
  onMakeHere,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Setup starts here, in Safari. */
  readonly onMakeHere: () => void;
}) {
  const [steps, setSteps] = useState(false);
  const stepsRef = useRef<HTMLDivElement>(null);
  // "Show me how" goes once the steps show, so focus goes to them (WCAG 2.4.3).
  useEffect(() => {
    if (steps) stepsRef.current?.focus();
  }, [steps]);
  return (
    <Sheet
      open={open}
      title={t.title}
      intro={t.intro}
      onClose={() => {
        setSteps(false);
        onClose();
      }}
    >
      {steps ? (
        <div ref={stepsRef} tabIndex={-1} data-testid="install-before-setup-steps">
          <InstallSteps level={3} signUpFirst={false} />
        </div>
      ) : null}
      <div className={formStyles.actions}>
        {steps ? null : (
          <button
            type="button"
            className={formStyles.main}
            onClick={() => {
              answerSuggestion();
              setSteps(true);
            }}
          >
            {t.showMeHow}
          </button>
        )}
        <button
          type="button"
          className={formStyles.outlined}
          onClick={() => {
            answerSuggestion();
            setSteps(false);
            onMakeHere();
          }}
        >
          {t.makeHere}
        </button>
      </div>
    </Sheet>
  );
}
