'use client';

// "Your account" on More (brief 4.13, step 3b). Signed out: "Sign up or sign
// in". Signed in: who's signed in, and "Sign out", which takes two taps: this
// button, then "Sign out" in the sheet it opens. Signing out removes the plan
// and everything else PrePenny keeps from this phone, then opens the welcome.

import { useState } from 'react';
import { signOutAndForget, useAccount } from '../lib/account.ts';
import { strings } from '../strings/en-GB.ts';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import styles from './StartAgain.module.css';

const t = strings.account;

export function AccountCard() {
  const account = useAccount();
  const { ownPlan } = usePlanActions();
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  return (
    <section className={styles.card} aria-labelledby="account-heading" data-testid="account">
      <h2 id="account-heading" className={styles.heading}>
        {t.heading}
      </h2>
      {account.status === 'off' ? <p className={styles.line}>{t.off}</p> : null}
      {account.status === 'checking' ? <p className={styles.line}>{t.checking}</p> : null}
      {account.status === 'signed-out' ? (
        <>
          <p className={styles.line}>{t.signedOutLine}</p>
          {/* A plain link, so nothing is fetched ahead of a tap. */}
          <a className={styles.outlined} href="/sign-in/?to=sign-up&from=more">
            {t.signUp}
          </a>
        </>
      ) : null}
      {account.status === 'signed-in' ? (
        <>
          <p className={styles.who}>{t.signedInAs(account.email)}</p>
          <p className={styles.line}>{t.onPhoneOnly}</p>
          <button
            type="button"
            className={styles.outlined}
            aria-haspopup="dialog"
            onClick={() => setAsking(true)}
          >
            {t.signOut}
          </button>
        </>
      ) : null}
      <Sheet
        open={asking}
        title={t.signOut}
        intro={t.signOutIntro}
        closeLabel={strings.sheet.goBack}
        onClose={() => {
          if (!leaving) setAsking(false);
        }}
      >
        <div className={styles.ask}>
          {ownPlan === 'none' ? null : <p className={styles.warning}>{t.signOutWarning}</p>}
          <button
            type="button"
            className={styles.main}
            aria-disabled={leaving}
            onClick={async () => {
              if (leaving) return;
              setLeaving(true);
              await signOutAndForget();
              // Loaded afresh, so nothing of the person's is left in memory either.
              window.location.replace('/?signed-out');
            }}
          >
            {t.signOutConfirm}
          </button>
          <button
            type="button"
            className={styles.outlined}
            aria-disabled={leaving}
            onClick={() => {
              if (!leaving) setAsking(false);
            }}
          >
            {t.staySignedIn}
          </button>
          <p className={styles.done} role="status">
            {leaving ? t.signingOut : null}
          </p>
        </div>
      </Sheet>
    </section>
  );
}
