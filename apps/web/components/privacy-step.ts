'use client';

// Runs one of the server's own steps about who sees what (step 3g): only with
// nothing on this phone waiting to be sent, as it's made on what the account
// has now (D413), then brings down what it changed.

import { allSent, syncNow } from '../data/sync.ts';
import type { Done, SharingProblem } from '../lib/sharing.ts';
import { strings } from '../strings/en-GB.ts';

/** Null when it's done, or the words for why it wasn't. */
export async function runPrivacyStep(
  step: () => Promise<Done<unknown>>,
  words: (problem: SharingProblem) => string | null,
): Promise<string | null> {
  if (!(await allSent())) return strings.together.undoWaiting;
  const done = await step();
  if (!done.ok) {
    const found = done.problem;
    return (
      words(found) ??
      (found.kind === 'offline' ? strings.together.roleOffline : strings.together.privacyProblem)
    );
  }
  await syncNow();
  return null;
}
