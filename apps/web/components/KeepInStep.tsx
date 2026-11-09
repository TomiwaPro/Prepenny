'use client';

// On every screen of PrePenny: the welcome, setup and the app (D351).
//
// - Renews this phone's sign-in when PrePenny opens, if it has one, so it
//   lasts until the person signs out, or 90 days without opening PrePenny
//   (D19). A phone that has never signed in loads and sends nothing (step 3b).
// - Signed in, it looks at the account and keeps the plan in step with it
//   while PrePenny is open (step 3c): when it opens, comes back on screen or
//   gets a signal, and every minute.
// - A plan of the phone's own beside the account's, finished or not, goes to
//   the sign-in page to choose which to keep (D324). When the account's plan
//   comes down in place of what was showing, the screens start afresh with it.
// - Since step 3e: a sign-in that needs the second step of two-step sign-in
//   goes to the sign-in page for the code; what's typed is noted, so an
//   update waits until it's sent (lib/update.ts); and the difference from
//   the server's clock is loaded for the times written inside the plan (D378).

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { loadClock } from '../data/clock.ts';
import { keepInStep, onAccountNews } from '../data/sync.ts';
import { checkSignIn, followSignOutInOtherTabs, useAccount } from '../lib/account.ts';
import { noteTyping } from '../lib/update.ts';

export function KeepInStep() {
  const account = useAccount();
  const router = useRouter();
  useEffect(() => {
    noteTyping();
    void loadClock();
    void checkSignIn();
    return followSignOutInOtherTabs();
  }, []);
  useEffect(() => {
    if (account.status !== 'signed-in') return;
    const stopNews = onAccountNews((news) => {
      // In place of this screen, so Back doesn't come straight back to the question.
      if (news === 'choose') router.replace('/sign-in/?choose');
      // Two-step sign-in is on and this sign-in hasn't passed it (step 3e).
      else if (news === 'second-step') router.replace('/sign-in/?second-step');
      // Loaded afresh, so no screen keeps the plan that was showing in memory.
      else window.location.replace('/app/');
    });
    const stop = keepInStep();
    return () => {
      stop();
      stopNews();
    };
  }, [account.status, router]);
  return null;
}
