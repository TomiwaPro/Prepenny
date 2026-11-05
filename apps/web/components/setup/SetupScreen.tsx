'use client';

// First-time setup (brief 4.1, step 2e): the welcome, then eight steps, one
// screen each. Where the person got to is kept on the phone, so opening
// PrePenny again carries on from there. Once "Go to my plan" is tapped, the
// app shows their plan.

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { forgetPayDraft } from '../../lib/pay-draft.ts';
import { strings } from '../../strings/en-GB.ts';
import { Problem } from '../Fields.tsx';
import { UpdateNote } from '../UpdateNote.tsx';
import styles from './Setup.module.css';
import { SetupProvider, useSetup } from './SetupProvider.tsx';
import { StepAccounts } from './StepAccounts.tsx';
import { StepBills } from './StepBills.tsx';
import { StepDebts } from './StepDebts.tsx';
import { StepPay } from './StepPay.tsx';
import { StepPlan } from './StepPlan.tsx';
import { StepRent } from './StepRent.tsx';
import { StepSavings } from './StepSavings.tsx';
import { StepSpending } from './StepSpending.tsx';
import { Welcome } from './Welcome.tsx';

function Steps() {
  const { state, notSaved } = useSetup();
  const router = useRouter();
  const step = state.status === 'ready' ? state.progress.step : null;
  const hasPlan = state.status === 'ready' && state.plan !== null;

  useEffect(() => {
    if (step !== 'done') return;
    // The plan is set up, so pay kept from the public calculator has no step to go in.
    forgetPayDraft();
    router.replace('/app/');
  }, [step, router]);

  if (state.status === 'loading' || step === 'done') {
    return (
      <main className={styles.page} aria-busy="true">
        <p className={styles.intro}>{strings.welcome.loading}</p>
      </main>
    );
  }
  const screen = (() => {
    if (!hasPlan || step === 0 || step === null) return <Welcome inSetup />;
    switch (step) {
      case 1:
        return <StepAccounts />;
      case 2:
        return <StepPay />;
      case 3:
        return <StepRent />;
      case 4:
        return <StepBills />;
      case 5:
        return <StepDebts />;
      case 6:
        return <StepSpending />;
      case 7:
        return <StepSavings />;
      case 8:
        return <StepPlan />;
    }
  })();
  return (
    <>
      {/* "PrePenny has been updated. Tap to reload." (D202), here too. */}
      <div className={`${styles.notice} ${styles.update}`}>
        <UpdateNote />
      </div>
      {notSaved ? (
        <div className={styles.notice}>
          <Problem text={strings.setup.notSaved} />
        </div>
      ) : null}
      {/* A fresh screen for each step, so its boxes start afresh. */}
      <div key={String(step)}>{screen}</div>
    </>
  );
}

export function SetupScreen() {
  return (
    <SetupProvider>
      <Steps />
    </SetupProvider>
  );
}

/** The website's first page: the welcome on its own (step 2e). */
export function WelcomeScreen() {
  return (
    <SetupProvider>
      <Welcome inSetup={false} />
    </SetupProvider>
  );
}
