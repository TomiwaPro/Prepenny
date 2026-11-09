// The optional app lock, "Open with your PIN" (step 3e, brief 4.13, D35),
// at 320px and 360px wide, in light and dark, checked by axe. It's for this
// phone only, so it needs no Supabase.
//
// The owner's test 6: locking and opening with the PIN. Also: it's asked
// for when PrePenny opens and after 5 minutes away, not after a moment
// away; the plan is covered while away; and turning it off needs the PIN.

import type { Page, TestInfo } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { expect, test } from './fixtures.ts';
import { noSidewaysScroll } from './journeys.ts';
import { box, noAxeProblems } from './setup.ts';

const t = strings.lock;
const SCREENS = '../../docs/screens/3e';

/** True for the one run that saves the screenshots: 360px, light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  colorScheme === 'light' && info.project.name === 'phone-360';

/** The phone leaves PrePenny for another app, or comes back to it. */
async function away(page: Page, hidden: boolean) {
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (isHidden ? 'hidden' : 'visible'),
    });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** Moves the phone's clock on, as if that long had passed. */
async function later(page: Page, ms: number) {
  await page.evaluate((by) => {
    const real = Date.now.bind(Date);
    Date.now = () => real() + by;
  }, ms);
}

const lockScreen = (page: Page) => page.getByRole('dialog', { name: t.screenHeading });

async function openLockSettings(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'More', exact: true })
    .click();
  await page.getByTestId('security').getByRole('link', { name: /App lock/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: t.heading })).toBeVisible();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`App lock, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('6. locking and opening with the PIN', async ({ page }, info) => {
      await page.goto('/app/');
      await expect(page.getByTestId('balance')).toContainText('£267.54');
      await openLockSettings(page);
      const settings = page.getByTestId('lock-settings');
      await expect(settings).toContainText(t.isOff);
      await expect(settings).toContainText(t.preview);
      await noAxeProblems(page);

      // Too short, then two that don't match, then the same PIN twice.
      await box(settings, t.pinLabel).fill('25');
      await settings.getByRole('button', { name: t.turnOn }).click();
      await expect(settings.getByText(t.pinMissing)).toBeVisible();
      await box(settings, t.pinLabel).fill('2580');
      await box(settings, t.againLabel).fill('2581');
      await settings.getByRole('button', { name: t.turnOn }).click();
      await expect(settings.getByText(t.pinsDiffer)).toBeVisible();
      await box(settings, t.againLabel).fill('2580');
      await settings.getByRole('button', { name: t.turnOn }).click();
      await expect(page.getByTestId('lock-said')).toHaveText(t.turnedOn);
      await expect(page.getByTestId('lock-settings')).toContainText(t.isOn);
      // Only scrambled on the phone: the PIN itself is nowhere.
      const kept = await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('prepenny');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const value = await new Promise<unknown>((resolve) => {
          const request = db.transaction('device').objectStore('device').get('app-lock');
          request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return JSON.stringify({ value, small: { ...localStorage } });
      });
      expect(kept).not.toContain('2580');
      expect(kept).toContain('"hash"');

      // PrePenny opens again: the lock screen, over everything.
      await page.reload();
      const lock = lockScreen(page);
      await expect(lock).toBeVisible();
      await expect(lock).toContainText(t.screenPurpose);
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/pin-screen-360-light.png`, fullPage: true });
      }
      // Nothing behind it can be reached: not even the keyboard can get to the navigation.
      expect(
        await page.evaluate(() => {
          const link = document.querySelector<HTMLAnchorElement>('nav a[href="/app/more/"]');
          link?.focus();
          return link !== null && document.activeElement === link;
        }),
      ).toBe(false);

      // A wrong PIN, then "Forgot your PIN?", then the right one.
      await box(lock, t.screenLabel).fill('1111');
      await lock.getByRole('button', { name: t.open }).click();
      await expect(lock.getByText(t.wrong)).toBeVisible();
      await lock.getByRole('button', { name: t.forgot }).click();
      await expect(lock.getByRole('button', { name: t.forgot })).toHaveAttribute('aria-expanded', 'true');
      await expect(lock.getByText(t.forgotLocal)).toBeVisible();
      await box(lock, t.screenLabel).fill('2580');
      await lock.getByRole('button', { name: t.open }).click();
      await expect(lock).toBeHidden();
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
      await expect(page.getByTestId('balance')).toContainText('£267.54');

      // Away for a moment: covered while away, open again on coming back.
      await away(page, true);
      await expect(page.getByTestId('app-cover')).toBeVisible();
      await away(page, false);
      await expect(page.getByTestId('app-cover')).toBeHidden();
      await expect(lockScreen(page)).toBeHidden();
      await expect(page.getByTestId('balance')).toBeVisible();

      // Away for 5 minutes: the PIN again.
      await away(page, true);
      await later(page, 5 * 60 * 1000 + 1000);
      await away(page, false);
      await expect(lockScreen(page)).toBeVisible();
      await box(lockScreen(page), t.screenLabel).fill('2580');
      await lockScreen(page).getByRole('button', { name: t.open }).click();
      await expect(lockScreen(page)).toBeHidden();

      // Turning it off needs the PIN.
      await openLockSettings(page);
      await page.getByRole('button', { name: t.turnOff }).click();
      const sheet = page.getByRole('dialog', { name: t.turnOffTitle });
      await expect(sheet).toBeVisible();
      await noAxeProblems(page);
      await box(sheet, t.screenLabel).fill('0000');
      await sheet.getByRole('button', { name: t.turnOffConfirm }).click();
      await expect(sheet.getByText(t.wrong)).toBeVisible();
      await box(sheet, t.screenLabel).fill('2580');
      await sheet.getByRole('button', { name: t.turnOffConfirm }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByTestId('lock-said')).toHaveText(t.turnedOff);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: t.heading })).toBeVisible();
      await expect(lockScreen(page)).toHaveCount(0);
    });
  });
}
