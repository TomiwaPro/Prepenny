'use client';

// Support's own account, signed in on PrePenny's app (step 4j, D640). It
// never has a plan, so the app shows only this, on every page: "This is
// PrePenny support's account. Open the support dashboard instead.", with no
// setup and no plan, and a way to sign out. There's no link to the
// dashboard: its address is never shown in the app (D641).
//
// Each time it opens, the database is asked again, so a phone whose account
// isn't support's any more goes back to the app as usual.

import { type ReactNode, useEffect, useState } from 'react';
import { setSupportAccountHere, useSupportAccountHere } from '../data/support-account.ts';
import { anyClient, checkSignIn, signOutSupportAccount, useAccount } from '../lib/account.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import styles from './Screens.module.css';
import own from './SupportAccountScreen.module.css';

const t = strings.supportAccount;

function SupportAccountScreen() {
  const account = useAccount();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void checkSignIn();
  }, []);

  useEffect(() => {
    if (account.status !== 'signed-in') return;
    void (async () => {
      try {
        const { data, error } = await (await anyClient()).rpc('support_status');
        const status = (data as { status?: unknown } | null)?.status;
        if (error === null && status === 'no') setSupportAccountHere(false);
      } catch {
        // No answer: it stays as it is, and is asked again next time.
      }
    })();
  }, [account.status]);

  return (
    <main className={own.alone} data-testid="support-account">
      <header className={styles.header}>
        <h1 className={styles.heading}>{t.heading}</h1>
        <p className={styles.purpose}>{t.line}</p>
      </header>
      <p className={styles.line} role="status">
        {busy ? t.signingOut : ''}
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={formStyles.outlined}
          aria-disabled={busy}
          onClick={() => {
            if (busy) return;
            setBusy(true);
            void signOutSupportAccount().then(() => window.location.replace('/'));
          }}
        >
          {t.signOut}
        </button>
      </div>
    </main>
  );
}

/** Every page of the app, unless this phone is signed in to support's own account. */
export function SupportAccountGate({ children }: { readonly children: ReactNode }) {
  return useSupportAccountHere() ? <SupportAccountScreen /> : children;
}
