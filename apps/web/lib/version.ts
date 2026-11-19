// Which version of PrePenny this is (step 3e), so a phone never quietly
// keeps a different plan after an update.
//
// - `database`: the newest migration in supabase/migrations when the app was
//   built. Every request to the Data API names it (x-prepenny-version, in
//   lib/account.ts), and the database gives plan data only to the version it
//   is. A phone built for an older database is told "update-needed", and
//   one built for a newer database, in the minutes after an update while
//   the database is still being changed, "server-behind".
// - `build`: the commit it was built from. The live site says which build
//   is live in /version.json, fetched fresh, so a phone also knows when an
//   update changed only the app. The same is written to
//   /offline-version.json, which the offline helper keeps with the pages, so
//   a phone knows when the new version is on it (step 4h, D594).
//
// Both are written into the app when it's built (scripts/build-worker.ts).

import { testSetting } from './test-setting.ts';
import { fetchWithTimeLimit } from './time-limit.ts';

export interface Version {
  readonly database: string;
  readonly build: string;
}

/** This copy of PrePenny's version. */
export function appVersion(): Version {
  const playing = testSetting()?.version;
  if (playing !== undefined) return playing;
  return {
    // Written out in full, so Next.js puts the values into the app when it builds it.
    database: process.env.NEXT_PUBLIC_DATABASE_VERSION ?? '',
    build: process.env.NEXT_PUBLIC_APP_BUILD ?? '',
  };
}

/** Reads a version file, or null when it isn't one. */
async function readVersion(response: Response): Promise<Version | null> {
  if (!response.ok) return null;
  const value = (await response.json()) as { database?: unknown; build?: unknown };
  if (typeof value.database !== 'string' || typeof value.build !== 'string') return null;
  return { database: value.database, build: value.build };
}

/** How long one answer about the live version is shared between looks, so two made together ask once. */
const SHARED_FOR_MS = 5_000;
let asking: { readonly at: number; readonly answer: Promise<Version | null> } | null = null;

/**
 * The version live on PrePenny's site now, or null when it can't be asked,
 * as with no signal. Never from the browser's or the offline helper's copy.
 * Looks made within a few seconds of each other, as when PrePenny comes back
 * on screen and both the update check and a signed-in phone's look at the
 * account ask, share one request and its answer (step 4h). No answer is
 * never shared once it's known: the next look, as when the signal comes back
 * a moment later, asks afresh.
 */
export function liveVersion(now = Date.now()): Promise<Version | null> {
  if (asking !== null && now - asking.at < SHARED_FOR_MS && asking.at <= now) return asking.answer;
  const ask = { at: now, answer: askLiveVersion() };
  asking = ask;
  // No answer isn't shared once it's known.
  void ask.answer.then((live) => {
    if (live === null && asking === ask) asking = null;
  });
  return ask.answer;
}

async function askLiveVersion(): Promise<Version | null> {
  try {
    return await readVersion(await fetchWithTimeLimit()('/version.json', { cache: 'no-store' }));
  } catch {
    // No signal, or no answer in time.
    return null;
  }
}

/** When the live version was last asked for, or 0 if never. */
export function lastAskedAt(): number {
  return asking?.at ?? 0;
}

/**
 * The version loading this page afresh would give (step 4h, D594): the one
 * the offline helper in charge of this page keeps on the phone, which it
 * answers /offline-version.json with from its own copy, written with every
 * page of the same build. With no helper in charge, the live site's, as a
 * fresh load then comes from the site. Null when it can't be told: with no
 * signal and no helper, or with a helper on the phone that isn't in charge of
 * this page yet, as a fresh load would come from that helper.
 */
export async function versionOnReload(): Promise<Version | null> {
  // A test phone playing an older version (D201) has that version on it
  // too, until it has asked its helper for the new one.
  const playing = testSetting()?.version;
  if (playing !== undefined && !askedForNewVersion) return playing;
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const helpers = navigator.serviceWorker;
      if (helpers.controller === null && (await helpers.getRegistration())?.active) return null;
    }
    return await readVersion(
      await fetchWithTimeLimit()('/offline-version.json', { cache: 'no-store' }),
    );
  } catch {
    return null;
  }
}

let askedForNewVersion = false;

/** Notes that this phone has asked its offline helper for the new version. */
export function noteAskedForNewVersion(): void {
  askedForNewVersion = true;
}

/** Forgets the shared answer, for tests. */
export function forgetLiveVersion(): void {
  asking = null;
}

/** True when the live site has a different version of PrePenny from this one. */
export function differs(live: Version, own: Version = appVersion()): boolean {
  return live.build !== own.build || live.database !== own.database;
}
