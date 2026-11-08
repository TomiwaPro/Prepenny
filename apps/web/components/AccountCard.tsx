'use client';

// "Your account" on More (brief 4.13, steps 3b and 3c). Signed out: "Sign up
// or sign in". Signed in: who's signed in, where the plan is kept, and "Sign
// out", which takes two taps: this button, then "Sign out" in the sheet it
// opens. Signing out removes the plan, and everything else PrePenny keeps,
// from this phone only: it's saved in the account, and comes back at the
// next sign-in (step 3c). When something hasn't been sent yet, the sheet says
// so plainly first, and offers to stay signed in until it has gone.

import { useEffect, useRef, useState } from 'react';
import { allSent, type SyncState, useSync } from '../data/sync.ts';
import { signOutAndForget, useAccount } from '../lib/account.ts';
import { strings } from '../strings/en-GB.ts';
import { useOffline } from './Notes.tsx';
import { type OwnPlan, usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import styles from './StartAgain.module.css';

const t = strings.account;

/** What hasn't reached the account yet: the whole plan, some changes, or nothing. */
type Unsent =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'plan' }
  | { readonly kind: 'changes'; readonly count: number };

function unsentOf(ownPlan: OwnPlan, sync: SyncState): Unsent {
  if (ownPlan === 'none') return { kind: 'nothing' };
  if (!sync.kept) return { kind: 'plan' };
  return sync.unsent > 0 ? { kind: 'changes', count: sync.unsent } : { kind: 'nothing' };
}

/** Where the plan is kept, under "Signed in as". */
function whereKept(ownPlan: OwnPlan, sync: SyncState): string | null {
  if (ownPlan === 'none') return null;
  if (!sync.kept) return t.notSavedYet;
  if (sync.refused) return t.refused;
  if (sync.unsent > 0) return t.unsent(sync.unsent);
  return t.savedInAccount;
}

/** How long to wait before trying to send again while waiting to sign out. */
const TRY_AGAIN_MS = 5000;

export function AccountCard() {
  const account = useAccount();
  const sync = useSync();
  const offline = useOffline();
  const { ownPlan } = usePlanActions();
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const stopWaiting = useRef(false);
  const unsent = unsentOf(ownPlan, sync);
  const one = unsent.kind === 'plan' || (unsent.kind === 'changes' && unsent.count === 1);

  async function signOut() {
    if (leaving) return;
    setLeaving(true);
    await signOutAndForget();
    // Loaded afresh, so nothing of the person's is left in memory either.
    window.location.replace('/?signed-out');
  }

  // Waits for everything to be sent, then signs out. "Stay signed in" stops waiting.
  async function signOutOnceSent() {
    if (waiting) return;
    stopWaiting.current = false;
    setWaiting(true);
    while (!stopWaiting.current) {
      if (await allSent()) {
        if (!stopWaiting.current) await signOut();
        return;
      }
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, TRY_AGAIN_MS);
        window.addEventListener(
          'online',
          () => {
            clearTimeout(timer);
            resolve(undefined);
          },
          { once: true },
        );
      });
    }
  }

  function stay() {
    if (leaving) return;
    stopWaiting.current = true;
    setWaiting(false);
    setAsking(false);
  }

  useEffect(
    () => () => {
      stopWaiting.current = true;
    },
    [],
  );

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
      <Sheet
        open={asking}
        title={t.signOut}
        intro={t.signOutIntro}
        closeLabel={strings.sheet.goBack}
        onClose={stay}
      >
        <div className={styles.ask}>
          {unsent.kind === 'nothing' ? (
            <button type="button" className={styles.main} aria-disabled={leaving} onClick={signOut}>
              {t.signOutConfirm}
            </button>
          ) : (
            <>
              <p className={styles.warning} data-testid="unsent-warning">
                {unsent.kind === 'plan' ? t.signOutNotSaved : t.signOutUnsent(unsent.count)}
              </p>
              <button
                type="button"
                className={styles.main}
                aria-disabled={leaving || waiting}
                aria-describedby="sign-out-when-sent-hint"
                onClick={signOutOnceSent}
              >
                {t.signOutWhenSent(one)}
              </button>
              <p id="sign-out-when-sent-hint" className={styles.line}>
                {t.signOutWhenSentHint(one)}
              </p>
              <button
                type="button"
                className={styles.outlined}
                aria-disabled={leaving}
                onClick={signOut}
              >
                {t.signOutAnyway(one)}
              </button>
            </>
          )}
          <button type="button" className={styles.outlined} aria-disabled={leaving} onClick={stay}>
            {t.staySignedIn}
          </button>
          <p className={styles.done} role="status">
            {leaving
              ? t.signingOut
              : waiting
                ? offline
                  ? t.waitingForSignal
                  : t.waitingToSend
                : null}
          </p>
        </div>
      </Sheet>
    </section>
  );
}
