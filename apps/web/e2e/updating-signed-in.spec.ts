// Updating an open PrePenny to a new version, signed in (step 4h, D594), at
// 320px and 360px wide (the sign-in-320 and sign-in-360 projects), in light
// and dark, checked by axe, against the local Supabase. Two real builds, a
// real offline helper, on an Android phone in Chrome (e2e/updating.ts), as
// the owner's phone was on 19 Nov 2026. The signed-out journey, and what was
// wrong, are in updating.spec.ts.
//
// Signed in, the old version also mustn't send anything once a newer one is
// live (D386): a change made with no signal waits on the phone, through the
// update, and the new version sends it.

import { strings } from '../strings/en-GB.ts';
import { openHome, updateBalance } from './journeys.ts';
import { helperInCharge } from './offline-helper.ts';
import { noAxeProblems } from './setup.ts';
import { makeAPlan, newEmail } from './sign-in-helpers.ts';
import { DEVICES, openMore, personOn, quoted, signUpFromMore, sql } from './two-phones.ts';
import {
  bringBack,
  countLoads,
  holdHelperDownloads,
  markTheOldPage,
  NEW_BUILD,
  NEW_NAME,
  putAway,
  stillTheOldPage,
  test,
  versionOnThePhone,
  versionOpen,
} from './updating.ts';

const { expect } = test;
const a = strings.account;
const b = strings.banners;

test.use({ userAgent: DEVICES.androidChrome });

/** Longer than the 30 seconds PrePenny used to give the offline helper before loading anyway. */
const WEAK_SIGNAL_MS = 35_000;

/** How many balance updates of £250.00 the server has from this person. */
const sent = (person: string) =>
  sql(
    `select count(*) from public.balance_updates where created_by = ${quoted(person)} and balance = 25000`,
  );

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Updating an open PrePenny, signed in, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('2. Open on More from before an update, with a change waiting: the note within seconds, the new version at the first safe moment, and the change sent', async ({
      page,
      context,
      site,
    }) => {
      test.slow();
      // The old version, signed in, with its offline helper in charge.
      await makeAPlan(page);
      await signUpFromMore(page, newEmail('owner'));
      const person = await personOn(page);
      await helperInCharge(page);

      // A change made with no signal waits on the phone.
      await context.setOffline(true);
      await updateBalance(page, {
        account: null,
        balance: '250.00',
        expected: '£267.54',
        difference: "That's £17.54 less.",
        toTick: 0,
      });
      await openMore(page);
      await expect(page.getByTestId('where-kept')).toContainText(a.unsent(1));
      expect(await versionOpen(page)).toBe('old');
      await markTheOldPage(page);
      const note = page.getByTestId('update-note');

      // PrePenny is put away. The new version goes live, on a weak signal.
      const session = await putAway(page);
      await site.serve(NEW_BUILD);
      const downloads = await holdHelperDownloads(context);

      // Back on screen with a signal: within seconds, the note.
      const loads = countLoads(page);
      await context.setOffline(false);
      await bringBack(page, session);
      await expect(note).toHaveText(b.updated, { timeout: 5000 });
      await noAxeProblems(page);

      // The old version sends nothing while the new one comes, however long
      // that takes, and isn't loaded afresh before it's on the phone.
      await expect.poll(downloads.held, { timeout: 10_000 }).toBeGreaterThan(0);
      await page.waitForTimeout(WEAK_SIGNAL_MS);
      expect(await stillTheOldPage(page)).toBe(true);
      expect(loads()).toBe(0);
      await expect(note).toHaveText(b.updated);
      await expect(page.getByTestId('where-kept')).toContainText(a.unsent(1));
      expect(sent(person)).toBe('0');

      // A sheet is open when the new version arrives: that isn't a safe moment.
      await page.getByTestId('account').getByRole('button', { name: a.signOut }).click();
      const sheet = page.getByRole('dialog', { name: a.signOut });
      await expect(sheet).toBeVisible();
      await downloads.release();
      await expect.poll(() => versionOnThePhone(page), { timeout: 60_000 }).toBe(NEW_NAME);
      await page.waitForTimeout(3000);
      expect(await stillTheOldPage(page)).toBe(true);
      await expect(sheet).toBeVisible();

      // The sheet is closed: the new version opens by itself, on More.
      await sheet.getByRole('button', { name: strings.sheet.goBack }).click();
      await expect.poll(() => versionOpen(page), { timeout: 30_000 }).toBe('new');
      await expect(page).toHaveURL(/\/app\/more\/$/);
      await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
      await expect(note).toHaveCount(0);
      expect(loads()).toBe(1);

      // It sends the change that was waiting.
      await expect(page.getByTestId('where-kept')).toHaveText(a.savedInAccount, {
        timeout: 30_000,
      });
      expect(sent(person)).toBe('1');
      await noAxeProblems(page);

      // It never loops, and the plan is the one with the change.
      await page.waitForTimeout(5000);
      expect(loads()).toBe(1);
      await openHome(page);
      await expect(page.getByTestId('balance')).toContainText('£250.00');
    });
  });
}
