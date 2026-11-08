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

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { keepInStep, onAccountNews } from '../data/sync.ts';
import { checkSignIn, followSignOutInOtherTabs, useAccount } from '../lib/account.ts';

export function KeepInStep() {
  const account = useAccount();
  const router = useRouter();
  useEffect(() => {
    void checkSignIn();
    return followSignOutInOtherTabs();
  }, []);
  useEffect(() => {
    if (account.status !== 'signed-in') return;
    const stopNews = onAccountNews((news) => {
      // In place of this screen, so Back doesn't come straight back to the question.
      if (news === 'choose') router.replace('/sign-in/?choose');
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
