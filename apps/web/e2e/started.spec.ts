// A form shows only once it works (step 3i, D487).
//
// Every page is built ahead of time, so a phone shows its words before the
// code behind them has started. On a slow phone, a form shown in that moment
// looked ready but wasn't: typing an address and tapping "Send me a code"
// made the browser send the form itself, which loaded the page again, empty.
// Found by `your-plan.spec.ts` test 9 (PLAN.md item 65), whose trace showed
// the page loaded a second time as "/sign-in/?". Here the page's code is held
// back on purpose, as on a slow phone: no form shows until it has started.

import type { Page } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { expect, test } from './fixtures.ts';

const PAGES = [
  { path: '/sign-in/', heading: strings.signIn.signInHeading, box: 'Email address' },
  { path: '/get-back-in/', heading: strings.getBackIn.heading, box: 'Backup email address' },
  { path: '/app/lock/', heading: strings.lock.heading, box: 'Choose a PIN' },
] as const;

/** Every form on the page that isn't in a closed sheet. */
const formsShown = (page: Page) => page.locator('form:not(dialog form)');

for (const shown of PAGES) {
  test(`${shown.path}: no form until the page's code has started, then the form`, async ({
    page,
  }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/_next/static/chunks/**/*.js', async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(shown.path, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: shown.heading })).toBeVisible();
    await expect(formsShown(page)).toHaveCount(0);
    await expect(page.getByLabel(shown.box, { exact: true })).toHaveCount(0);

    release();
    await expect(page.getByLabel(shown.box, { exact: true })).toBeVisible();
    await expect(formsShown(page)).toHaveCount(1);
  });
}
