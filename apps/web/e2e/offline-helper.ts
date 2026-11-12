// Waiting for the offline helper (service worker) to take charge of a page,
// so it keeps working with no signal (brief Part 6).
//
// PLAN.md item 47: the tests used to give it a fixed time, 5 seconds in
// offline.spec.ts (Playwright's own limit for a repeated look) and 30 or 60
// elsewhere. Taking charge means first downloading every file of the app
// (227 files, 4.18 MB in step 3i), which on the computer step 3i was built
// on took about 2 seconds with one test running and 6 to 8.5 seconds with
// three, measured. So a fixed time measured how busy the computer was. Now
// each test waits for the helper's own signals, as the phone does: "ready",
// then "took charge of this page". A page it never takes charge of still
// fails, at the test's own time limit.

import type { Page } from '@playwright/test';

/** Waits until the offline helper has started and is in charge of this page. */
export async function helperInCharge(page: Page) {
  await page.evaluate(async () => {
    const helpers = navigator.serviceWorker;
    await helpers.ready;
    if (helpers.controller !== null) return;
    await new Promise<void>((resolve) => {
      helpers.addEventListener('controllerchange', () => resolve(), { once: true });
      // In case it took charge between the look above and listening for it.
      if (helpers.controller !== null) resolve();
    });
  });
}
