'use client';

// "Your account" on More (brief 4.13, steps 3b and 3c). Signed out: "Sign up
// or sign in". Signed in: who's signed in, where the plan is kept, and "Sign
// out", which takes two taps: this button, then "Sign out" in the sheet it
// opens (SignOutSheet.tsx, the same sheet as on the welcome and in setup).

import { useState } from 'react';
import { type SyncState, useSync } from '../data/sync.ts';
import { useAccount } from '../lib/account.ts';
import { strings } from '../strings/en-GB.ts';
import { type OwnPlan, usePlanActions } from './PlanProvider.tsx';
import { SignOutSheet } from './SignOutSheet.tsx';
import styles from './StartAgain.module.css';

const t = strings.account;

/** Where the plan is kept, under "Signed in as". */
function whereKept(ownPlan: OwnPlan, sync: SyncState): string | null {
  if (ownPlan === 'none') return null;
  if (!sync.kept) return t.notSavedYet;
  if (sync.refused) return t.refused;
  if (sync.unsent > 0) return t.unsent(sync.unsent);
  return t.savedInAccount;
}

export function AccountCard() {
  const account = useAccount();
  const sync = useSync();
  const { ownPlan } = usePlanActions();
  const [asking, setAsking] = useState(false);

  const kept = whereKept(ownPlan, sync);
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
          {kept === null ? null : (
            <p className={styles.line} data-testid="where-kept">
              {kept}
            </p>
          )}
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
      <SignOutSheet open={asking} ownPlan={ownPlan} onClose={() => setAsking(false)} />
    </section>
  );
}
