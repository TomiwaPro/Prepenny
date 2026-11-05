// The offline helper (ARCHITECTURE.md 1.1, brief Part 6): keeps every file of
// the app on the phone, so it opens with no signal. Built by Serwist's
// command-line build step after `next build`, which lists every file in the
// export in `self.__SW_MANIFEST` (serwist.config.js).
//
// It stores only the app's own files, never anything from the plan: the
// plan lives in the phone's database (data/db.ts).

import { type PrecacheEntry, Serwist } from 'serwist';

declare const self: ServiceWorkerGlobalScope & {
  readonly __SW_MANIFEST: (PrecacheEntry | string)[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    // "/app/" is served by "/app/index.html", and "/app/plan" by "/app/plan/index.html".
    directoryIndex: 'index.html',
    // A screen for one record takes its id after a question mark (ARCHITECTURE.md 5),
    // and What if says where it was opened from: each is still the same file, so
    // it opens with no signal straight from a saved link or a refresh (step 2h).
    ignoreURLParametersMatching: [/^utm_/, /^_rsc$/, /^id$/, /^from$/],
  },
  // A new version takes over straight away, so a phone never runs an old copy for long.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
});

serwist.addEventListeners();
