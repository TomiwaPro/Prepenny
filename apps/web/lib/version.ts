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
//   update changed only the app.
//
// Both are written into the app when it's built (scripts/build-worker.ts).

import { testSetting } from './test-setting.ts';

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

/**
 * The version live on PrePenny's site now, or null when it can't be asked,
 * as with no signal. Never from the browser's or the offline helper's copy.
 */
export async function liveVersion(): Promise<Version | null> {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const value = (await response.json()) as { database?: unknown; build?: unknown };
    if (typeof value.database !== 'string' || typeof value.build !== 'string') return null;
    return { database: value.database, build: value.build };
  } catch {
    return null;
  }
}

/** True when the live site has a different version of PrePenny from this one. */
export function differs(live: Version, own: Version = appVersion()): boolean {
  return live.build !== own.build || live.database !== own.database;
}
