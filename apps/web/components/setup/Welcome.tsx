'use client';

// The welcome (brief 4.1, Part 6, step 2e): the name, the tagline, one
// sentence on what PrePenny does, how long setting it up takes (D356), then
// "Make my plan" and "Look at an example plan". Someone part-way through setup carries on from it; someone with a
// plan goes to it. Then "Already have an account? Sign in", or who's signed
// in with "Sign out" (step 3b, D353). On an iPhone in Safari, "Make my plan"
// first suggests adding PrePenny to the Home Screen (step 4d, D549).

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAccount } from '../../lib/account.ts';
import { suggestOnWelcome, useHomeScreen } from '../../lib/install.ts';
import { forgetPayDraft } from '../../lib/pay-draft.ts';
import { strings } from '../../strings/en-GB.ts';
import formStyles from '../Form.module.css';
import { SignedInLine } from '../SignedInLine.tsx';
import { InstallBeforeSetup } from './InstallBeforeSetup.tsx';
import styles from './Setup.module.css';
import { useSetup } from './SetupProvider.tsx';

export function Welcome({ inSetup }: { readonly inSetup: boolean }) {
  const { state, start, show } = useSetup();
  const router = useRouter();
  const account = useAccount();
  const home = useHomeScreen();
  const [before, setBefore] = useState(false);
  const [signedOut, setSignedOut] = useState<string | null>(null);
  useEffect(() => {
    // Just signed out from More (step 3b), a sign-in that ended by itself
    // (step 3c), or the account deleted, or the phone emptied (step 3h): say
    // so once, then tidy the address.
    const search = new URLSearchParams(window.location.search);
    const words = search.has('signed-out')
      ? strings.account.signedOut
      : search.has('sign-in-ended')
        ? strings.account.signInEnded
        : search.has('account-deleted')
          ? strings.yourData.deleted
          : search.has('account-deleted-elsewhere')
            ? strings.yourData.deletedElsewhere
            : search.has('removed')
              ? strings.yourData.removed
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
  const makeMyPlan = async () => {
    await start();
    if (!inSetup) router.push('/setup/');
  };
  return (
    <main className={`${styles.page} ${styles.welcome}`}>
      <p className={styles.signedOut} role="status">
        {signedOut}
      </p>
      <h1 className={styles.name}>{strings.app.name}</h1>
      <p className={styles.tagline}>{strings.app.tagline}</p>
      <p className={styles.description}>{strings.app.description}</p>
      {/* How long setup takes (D356), shown to everyone, so nothing moves as the page loads. */}
      <p className={styles.once}>{strings.welcome.once}</p>
      <button
        type="button"
        className={formStyles.main}
        aria-disabled={!ready}
        aria-haspopup={own === null && suggestOnWelcome(home, false) ? 'dialog' : undefined}
        onClick={async () => {
          if (!ready) return;
          if (done) {
            await show('own');
            router.push('/app/');
            return;
          }
          // Before setup starts, on an iPhone in Safari: the Home Screen first (D546, D549).
          if (own === null && suggestOnWelcome(home, false)) {
            setBefore(true);
            return;
          }
          await makeMyPlan();
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
      <InstallBeforeSetup
        open={before}
        onClose={() => setBefore(false)}
        onMakeHere={async () => {
          setBefore(false);
          await makeMyPlan();
        }}
      />
    </main>
  );
}
