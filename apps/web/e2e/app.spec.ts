// The app's foundations: the bottom navigation, Light and Dark on this phone,
// the plan saved in the phone's own database, the offline note, and opening
// with no signal once the app has been opened before.

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

async function openHome(page: Page) {
  await page.goto('/app/');
  await expect(page.getByTestId('balance')).toBeVisible();
}

test('the bottom navigation goes to Home, Coming up, Debts and More', async ({ page }) => {
  await openHome(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link')).toHaveText(['Home', 'Coming up', 'Debts', 'More']);
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  for (const name of ['Coming up', 'Debts', 'More']) {
    await nav.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('example-banner')).toBeVisible();
  }
  await nav.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByTestId('balance')).toHaveText('£267.54');
});

/** Every link, button and choice on screen smaller than 44 by 44 pixels. */
async function smallTargets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('a, button, input, label')]
      // A radio button's whole row is its label, so the row is what's tapped.
      .filter((element) => !element.closest('.visually-hidden') && !element.closest('label input'))
      .map((element) => ({
        text: element.textContent?.trim(),
        box: element.getBoundingClientRect(),
      }))
      // Leave out what isn't on screen, such as a closed sheet's buttons.
      .filter(({ box }) => box.width > 0 && box.height > 0)
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(({ text }) => text),
  );
}

test('every tap target is at least 44 by 44 pixels, on every screen and in a sheet', async ({
  page,
}) => {
  await openHome(page);
  expect(await smallTargets(page)).toEqual([]);
  await page.getByRole('button', { name: 'I spent' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await smallTargets(page)).toEqual([]);
  for (const path of ['/', '/app/coming-up/', '/app/debts/', '/app/more/', '/app/parts/']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await smallTargets(page), path).toEqual([]);
  }
});

test('Light or Dark can be picked on More, and stays picked', async ({ page }) => {
  await page.goto('/app/more/');
  const paper = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await paper()).toBe('rgb(244, 239, 230)');
  await page.getByRole('radio', { name: 'Dark' }).check();
  expect(await paper()).toBe('rgb(14, 20, 36)');
  await page.goto('/app/');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect(await paper()).toBe('rgb(14, 20, 36)');
  await page.goto('/app/more/');
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await page.getByRole('radio', { name: 'Match this phone' }).check();
  expect(await paper()).toBe('rgb(244, 239, 230)');
});

test('the example plan is saved in the phone’s own database', async ({ page }) => {
  await openHome(page);
  const saved = await page.evaluate(
    () =>
      new Promise<{ plans: number; records: number }>((resolve, reject) => {
        const open = indexedDB.open('prepenny');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction(['plans', 'records'], 'readonly');
          const plans = read.objectStore('plans').count();
          const records = read.objectStore('records').count();
          read.oncomplete = () => {
            resolve({ plans: plans.result, records: records.result });
            db.close();
          };
        };
      }),
  );
  // 2 accounts, 2 balances, 21 payments, 3 changes, 6 debts, 1 pay profile, 4 pay weeks
  // (weeks 26 to 29, D196), settings.
  expect(saved).toEqual({ plans: 1, records: 40 });
});

test('says so when the phone is offline', async ({ page, context }) => {
  await openHome(page);
  await expect(page.getByTestId('offline-note')).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByTestId('offline-note')).toHaveText(
    "You're offline. PrePenny keeps working with what's on this phone.",
  );
  await context.setOffline(false);
  await expect(page.getByTestId('offline-note')).toHaveCount(0);
});

test('opens with no signal once it has been opened before', async ({ page, context }) => {
  await openHome(page);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    // Wait until every file is kept on the phone.
    if (registration.active?.state !== 'activated') {
      await new Promise<void>((resolve) =>
        registration.active?.addEventListener('statechange', () => resolve()),
      );
    }
  });
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('balance')).toHaveText('£267.54');
  await expect(page.getByTestId('offline-note')).toBeVisible();
  await page.getByRole('link', { name: 'Debts' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Debts' })).toBeVisible();
  await page.goto('/app/more/');
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
});
