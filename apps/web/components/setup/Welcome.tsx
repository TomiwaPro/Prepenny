'use client';

// The welcome (brief 4.1, Part 6, step 2e): the name, the tagline, one
// sentence on what PrePenny does, then "Make my plan" and "Look at an example
// plan". Someone part-way through setup carries on from it; someone with a
// plan goes to it. Then "Already have an account? Sign in", or who's signed
// in with "Sign out" (step 3b, D353).

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAccount } from '../../lib/account.ts';
import { forgetPayDraft } from '../../lib/pay-draft.ts';
import { strings } from '../../strings/en-GB.ts';
import formStyles from '../Form.module.css';
import { SignedInLine } from '../SignedInLine.tsx';
import styles from './Setup.module.css';
import { useSetup } from './SetupProvider.tsx';

export function Welcome({ inSetup }: { readonly inSetup: boolean }) {
  const { state, start, show } = useSetup();
  const router = useRouter();
  const account = useAccount();
  const [signedOut, setSignedOut] = useState<string | null>(null);
  useEffect(() => {
    // Just signed out from More (step 3b), or a sign-in that ended by itself
    // (step 3c): say so once, then tidy the address.
    const search = new URLSearchParams(window.location.search);
    const words = search.has('signed-out')
      ? strings.account.signedOut
      : search.has('sign-in-ended')
        ? strings.account.signInEnded
        : null;
    if (words !== null) {
      setSignedOut(words);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);
  const ready = state.status === 'ready';
  const progress = ready ? state.progress : null;
  const own = ready ? state.plan : null;
  const done = progress?.step === 'done';
  const make =
    own === null
      ? strings.welcome.makeMyPlan
      : done
        ? strings.welcome.goToMyPlan
        : strings.welcome.carryOn;
  return (
    <main className={`${styles.page} ${styles.welcome}`}>
      <p className={styles.signedOut} role="status">
        {signedOut}
      </p>
      <h1 className={styles.name}>{strings.app.name}</h1>
      <p className={styles.tagline}>{strings.app.tagline}</p>
      <p className={styles.description}>{strings.app.description}</p>
      <button
        type="button"
        className={formStyles.main}
        aria-disabled={!ready}
        onClick={async () => {
          if (!ready) return;
          if (done) {
            await show('own');
            router.push('/app/');
            return;
          }
          await start();
          if (!inSetup) router.push('/setup/');
        }}
      >
        {make}
      </button>
      <button
        type="button"
        className={formStyles.outlined}
        aria-disabled={!ready}
        onClick={async () => {
          if (!ready) return;
          // Looking at the example never touches the person's own plan, and
          // pay kept from the public calculator isn't wanted any more (step 2h).
          forgetPayDraft();
          await show('example');
          router.push('/app/');
        }}
      >
        {strings.welcome.lookAtExample}
      </button>
      {account.status === 'signed-out' ? (
        // A plain link, so nothing is fetched ahead of a tap.
        <a className={`${formStyles.quiet} ${styles.signInLink}`} href="/sign-in/">
          {strings.account.haveAccount} {strings.account.signIn}
        </a>
      ) : null}
      {/* Who's signed in, with "Sign out", since the welcome can't reach More (D353). */}
      <SignedInLine />
    </main>
  );
}
