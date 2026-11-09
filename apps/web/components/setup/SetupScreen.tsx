'use client';

// First-time setup (brief 4.1, step 2e, D356): the welcome, then 6 screens
// in 3 parts: money in (your account, how you're paid), money out (home and
// bills, debts, spending money) and your plan. Where the person got to is kept on the phone, so opening
// PrePenny again carries on from there. Once "Go to my plan" is tapped, the
// app shows their plan.

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { forgetPayDraft } from '../../lib/pay-draft.ts';
import { strings } from '../../strings/en-GB.ts';
import { AppLock } from '../AppLock.tsx';
import { Problem } from '../Fields.tsx';
import { KeepInStep } from '../KeepInStep.tsx';
import { UpdateNote } from '../UpdateNote.tsx';
import styles from './Setup.module.css';
import { SetupProvider, useSetup } from './SetupProvider.tsx';
import { StepAccounts } from './StepAccounts.tsx';
import { StepDebts } from './StepDebts.tsx';
import { StepHomeBills } from './StepHomeBills.tsx';
import { StepPay } from './StepPay.tsx';
import { StepPlan } from './StepPlan.tsx';
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
        return <StepHomeBills />;
      case 4:
        return <StepDebts />;
      case 5:
        return <StepSpending />;
      case 6:
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

// Signed in, setup and the welcome look at the account too, as every screen
// does (D351): the saved plan comes down, or the person chooses which to keep.
export function SetupScreen() {
  return (
    <SetupProvider>
      {/* The app lock over setup too, which shows the plan as it's made (step 3e). */}
      <AppLock ownPlan="setting-up" />
      <KeepInStep />
      <Steps />
    </SetupProvider>
  );
}

/** The website's first page: the welcome on its own (step 2e). */
export function WelcomeScreen() {
  return (
    <SetupProvider>
      <KeepInStep />
      <Welcome inSetup={false} />
    </SetupProvider>
  );
}
