'use client';

// Error codes for the support screen's account page (step 4j, brief 4.16,
// D619): when a signed-in person meets one, the phone tells PrePenny's
// database the code alone, such as "not-allowed" or "screen-broke", with the
// screen's name and the version. Never anything typed or about money, and
// never anything written to the console. Nothing is sent from a phone that
// isn't signed in. The database keeps at most 30 a day for a person, for 30
// days (note_error_code).

import { signedInClient } from './account.ts';
import { screenName, thisVersion } from './support.ts';

const CODE = /^[a-z0-9-]{1,40}$/;
/** The same code from the same screen at most once in this long, from one phone. */
const ONCE_IN = 10 * 60 * 1000;
const lastSent = new Map<string, number>();

/** Notes an error code, if this phone is signed in. It never throws and never waits. */
export function noteErrorCode(code: string, path?: string): void {
  if (!CODE.test(code)) return;
  const screen =
    path === undefined && typeof window === 'undefined'
      ? null
      : screenName(path ?? window.location.pathname);
  const key = `${code}:${screen ?? ''}`;
  const now = Date.now();
  const before = lastSent.get(key);
  if (before !== undefined && now - before < ONCE_IN) return;
  lastSent.set(key, now);
  void (async () => {
    try {
      const made = await signedInClient();
      if (made === null) return;
      await made.rpc('note_error_code', { code, screen, app_version: thisVersion() });
    } catch {
      // A code that can't be noted is let go: it's only for support's page.
    }
  })();
}
