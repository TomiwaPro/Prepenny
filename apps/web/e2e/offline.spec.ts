// Offline (brief Part 6, step 2h): after PrePenny has been opened once,
// every screen opens with no signal, with the plan's own figures, and a
// change made with no signal is saved on the phone. Each screen is opened
// fresh, as from the home screen, not only by tapping inside the app.

import { type BrowserContext, expect, type Page } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { test } from './fixtures.ts';

/** Opens Home and waits until the offline helper keeps every file on the phone. */
async function openOnce(page: Page) {
  await page.goto('/app/');
  await expect(page.getByTestId('balance')).toHaveText('£267.54');
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active?.state !== 'activated') {
      await new Promise<void>((resolve) =>
        registration.active?.addEventListener('statechange', () => resolve()),
      );
    }
  });
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

async function noSignal(context: BrowserContext) {
  await context.setOffline(true);
}

const SCREENS = [
  { path: '/app/', heading: 'Home', shows: '£267.54' },
  { path: '/app/coming-up/', heading: 'Coming up', shows: 'Lowest point: £4.53' },
  { path: '/app/debts/', heading: 'Debts', shows: 'Owed now' },
  { path: '/app/debt/#id=family-loan', heading: 'Family loan', shows: '€1,400.57' },
  { path: '/app/more/', heading: 'More', shows: strings.more.purpose },
  { path: '/app/accounts/', heading: 'Accounts', shows: 'Current account' },
  { path: '/app/budgets/', heading: 'Budgets', shows: strings.budgets.purpose },
  { path: '/app/goals/', heading: 'Savings goals', shows: strings.goals.purpose },
  { path: '/app/pay/', heading: 'Pay calculator', shows: 'Start from a usual week' },
  { path: '/app/job/', heading: 'Your job', shows: 'Warehouse job' },
  { path: '/app/what-if/', heading: 'What if', shows: 'Your real plan and practice' },
  { path: '/app/what-if/?from=coming-up', heading: 'What if', shows: 'Back to Coming up' },
  { path: '/pay-calculator/', heading: 'Take-home pay calculator', shows: '1257L' },
  { path: '/sign-in/', heading: 'Sign in', shows: strings.signIn.signInPurpose },
  {
    path: '/sign-in/?to=sign-up&from=more',
    heading: 'Sign up',
    shows: strings.signIn.signUpPurpose,
  },
] as const;

test('after one visit, every screen opens with no signal, with the plan in it', async ({
  page,
  context,
}) => {
  await openOnce(page);
  await noSignal(context);
  for (const screen of SCREENS) {
    await page.goto(screen.path);
    await expect(
      page.getByRole('heading', { level: 1, name: screen.heading, exact: true }),
    ).toBeAttached();
    if (screen.path === '/pay-calculator/') {
      await expect(page.getByLabel('Tax code')).toHaveValue(screen.shows);
    } else {
      await expect(page.getByText(screen.shows).first()).toBeVisible();
    }
    // The app's own screens say it's offline (D174); the public page has no plan to keep.
    if (screen.path.startsWith('/app/')) {
      await expect(page.getByTestId('offline-note')).toHaveText(
        "You're offline. PrePenny keeps working with what's on this phone.",
      );
    }
  }
});

test('with no signal, a change is saved on the phone and is still there next time', async ({
  page,
  context,
}) => {
  await openOnce(page);
  await noSignal(context);
  await page.reload();
  await page.getByRole('button', { name: 'Add a payment', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a payment' });
  await sheet.getByLabel('Name', { exact: true }).fill('Car MOT');
  await sheet.getByLabel('Amount', { exact: true }).fill('54.85');
  await sheet.getByLabel('Next payment').fill('2026-10-26');
  await sheet.getByRole('button', { name: 'Add payment' }).click();
  await expect(page.getByTestId('undo-bar')).toContainText('Car MOT added.');
  // Monday's lowest point goes down by £54.85: from £12.54 to −£42.31, under the floor.
  await page.reload();
  await expect(page.getByTestId('balance')).toHaveText('£267.54');
  await expect(page.getByTestId('lowest-point')).toContainText('£42.31 short on Mon 26 Oct.');
  // The public calculator works with no signal too.
  await page.goto('/pay-calculator/');
  await page.getByLabel('Hours', { exact: true }).fill('34.5');
  await page.getByLabel('Pay an hour', { exact: true }).fill('12.71');
  await page.getByRole('button', { name: 'Work out take-home pay' }).click();
  await expect(page.getByTestId('pay-result')).toBeVisible();
});
