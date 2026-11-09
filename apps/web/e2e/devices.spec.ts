// Signed-in devices (step 3e, brief 4.13, D21), at 320px and 360px wide
// (the sign-in-320 and sign-in-360 projects), in light and dark, checked by
// axe, against the local Supabase. Start it first (README.md, "Checks").
//
// The owner's tests:
// 1. The device list shows two devices; "Sign out of this device" on one
//    ends only that one.
// 2. "Sign out everywhere": the other device stops within a minute and
//    removes the plan, and a device with a change not sent yet keeps it, as
//    D348 says, and sends it once signed in again (PLAN.md item 29, end to end).

import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { noSidewaysScroll, openHome, updateBalance } from './journeys.ts';
import { noAxeProblems } from './setup.ts';
import { makeAPlan, newEmail } from './sign-in-helpers.ts';
import {
  DEVICES,
  openMore,
  personOn,
  quoted,
  secondPhone,
  signIn,
  signUpFromMore,
  sql,
} from './two-phones.ts';

const t = strings.devices;
const a = strings.account;
const SCREENS = '../../docs/screens/3e';
/** D21: a signed-out device stops within a minute. */
const A_MINUTE = 60_000;

/** True for the one run that saves the screenshots: 360px, light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  colorScheme === 'light' && info.project.name === 'sign-in-360';

/** This phone describes itself as Chrome on an Android phone, as a real one would. */
test.use({ userAgent: DEVICES.androidChrome });

/** Opens Signed-in devices from More, and waits for the list. */
async function openDevices(page: Page, count: number) {
  await openMore(page);
  await page
    .getByTestId('security')
    .getByRole('link', { name: /Signed-in devices/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: t.heading })).toBeVisible();
  await expect(page.getByTestId('device')).toHaveCount(count);
}

/** How many sign-in sessions the person has on the server. */
const sessionsOf = (person: string) =>
  Number(sql(`select count(*) from auth.sessions where user_id = ${quoted(person)}`));

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Signed-in devices, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('1. the list shows two devices, and "Sign out of this device" on one ends only that one', async ({
      page,
      browser,
    }, info) => {
      test.slow();
      const address = newEmail('sam');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      const person = await personOn(page);
      const iphone = await secondPhone(browser, info, colorScheme, undefined, DEVICES.iphoneSafari);
      await signIn(iphone.page, address);
      await expect(iphone.page).toHaveURL(/\/app\/$/);
      await expect(iphone.page.getByTestId('balance')).toContainText('£267.54');
      expect(sessionsOf(person)).toBe(2);

      await openDevices(page, 2);
      const rows = page.getByTestId('device');
      // This device first, by its plain name, then the other with when it was last used.
      await expect(rows.nth(0).getByRole('heading')).toHaveText('Chrome on an Android phone');
      await expect(rows.nth(0)).toContainText(t.thisDevice);
      await expect(rows.nth(1).getByRole('heading')).toHaveText('Safari on an iPhone');
      await expect(rows.nth(1)).toContainText(t.lastUsedToday);
      // Never an IP address or a place.
      await expect(page.getByTestId('devices')).not.toContainText(/\d+\.\d+\.\d+\.\d+|London/);
      await noSidewaysScroll(page);
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/devices-360-light.png`, fullPage: true });
      }

      // Sign out the iPhone from here.
      await rows
        .nth(1)
        .getByRole('button', { name: t.signOutOfItLabel('Safari on an iPhone') })
        .click();
      const sheet = page.getByRole('dialog', { name: t.endTitle('Safari on an iPhone') });
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(t.endIntro);
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: t.endYes }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByTestId('devices-said')).toHaveText(t.ended('Safari on an iPhone'));
      await expect(rows).toHaveCount(1);
      expect(sessionsOf(person)).toBe(1);

      // The iPhone stops within a minute and removes the plan, as it was all sent.
      await expect(iphone.page.getByText(a.signInEnded)).toBeVisible({ timeout: A_MINUTE });
      await expect(
        iphone.page.getByRole('link', { name: `${a.haveAccount} ${a.signIn}` }),
      ).toBeVisible();

      // Only that one: this phone is still signed in, and still saves to the account.
      await updateBalance(page, {
        account: null,
        balance: '250.00',
        expected: '£267.54',
        difference: "That's £17.54 less.",
        toTick: 0,
      });
      await openMore(page);
      await expect(page.getByTestId('where-kept')).toHaveText(a.savedInAccount, {
        timeout: 20_000,
      });
      expect(
        Number(
          sql(
            `select count(*) from public.balance_updates where created_by = ${quoted(person)} and balance = 25000`,
          ),
        ),
      ).toBe(1);
      await iphone.context.close();
    });

    test('2. "Sign out everywhere": the other devices stop within a minute; one with everything sent removes the plan, one with a change not sent keeps it and sends it once signed in again', async ({
      page,
      browser,
    }, info) => {
      test.slow();
      const address = newEmail('sam');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      const person = await personOn(page);
      const laptop = await secondPhone(browser, info, colorScheme, undefined, DEVICES.macSafari);
      await signIn(laptop.page, address);
      await expect(laptop.page.getByTestId('balance')).toContainText('£267.54');
      const iphone = await secondPhone(browser, info, colorScheme, undefined, DEVICES.iphoneSafari);
      await signIn(iphone.page, address);
      await expect(iphone.page.getByTestId('balance')).toContainText('£267.54');
      expect(sessionsOf(person)).toBe(3);

      // The iPhone loses its signal, and a change waits on it.
      await expect
        .poll(() => iphone.page.evaluate(() => navigator.serviceWorker.controller !== null), {
          timeout: 30_000,
        })
        .toBe(true);
      await iphone.context.setOffline(true);
      await updateBalance(iphone.page, {
        account: null,
        balance: '240.00',
        expected: '£267.54',
        difference: "That's £27.54 less.",
        toTick: 0,
      });
      await openMore(iphone.page);
      await expect(iphone.page.getByTestId('where-kept')).toHaveText(a.unsent(1));

      // From this phone: Sign out everywhere, this one too.
      await openDevices(page, 3);
      await page.getByRole('button', { name: t.everywhere, exact: true }).click();
      const sheet = page.getByRole('dialog', { name: t.everywhereTitle });
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(t.everywhereIntro);
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: t.everywhereYes }).click();
      // The welcome, with nothing of Sam's left on this phone.
      await expect(page.getByText(a.signedOut)).toBeVisible();
      expect(sessionsOf(person)).toBe(0);

      // The laptop, with everything sent, stops within a minute and removes the plan.
      await expect(laptop.page.getByText(a.signInEnded)).toBeVisible({ timeout: A_MINUTE });

      // The iPhone gets its signal back: it stops within a minute too, but
      // keeps the plan with the change not sent yet, and says so (D348).
      await iphone.context.setOffline(false);
      await expect(iphone.page.getByTestId('where-kept')).toHaveText(a.endedUnsent(1), {
        timeout: A_MINUTE,
      });
      await expect(iphone.page.getByTestId('account')).toContainText(a.signUp);
      await noAxeProblems(iphone.page);
      await openHome(iphone.page);
      await expect(iphone.page.getByTestId('balance')).toContainText('£240.00');
      // Nothing of it reached the account while it was signed out.
      expect(
        Number(
          sql(
            `select count(*) from public.balance_updates where balance = 24000 and created_by = ${quoted(person)}`,
          ),
        ),
      ).toBe(0);

      // Signed in again, the change goes up.
      await signIn(iphone.page, address);
      await expect(iphone.page).toHaveURL(/\/app\/$/);
      await openMore(iphone.page);
      await expect(iphone.page.getByTestId('where-kept')).toHaveText(a.savedInAccount, {
        timeout: 20_000,
      });
      expect(
        Number(
          sql(
            `select count(*) from public.balance_updates where balance = 24000 and created_by = ${quoted(person)}`,
          ),
        ),
      ).toBe(1);
      await laptop.context.close();
      await iphone.context.close();
    });
  });
}
