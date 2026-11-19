// Updating an open PrePenny to a new version, signed out (step 4h, D594), at
// 320px and 360px wide, in light and dark, checked by axe. Two real builds,
// a real offline helper, on an Android phone in Chrome (e2e/updating.ts).
//
// What the owner saw on 19 Nov 2026: a PrePenny left open on More from before
// an update still showed the old version an hour later, with no note, and
// didn't load the new one by itself. The cause, found in step 4h: PrePenny
// loaded the page afresh 30 seconds after finding a new version, whether or
// not the offline helper had finished fetching it, so on a weak signal the
// old helper served the old version again, the note went, and nothing tried
// again for 2 minutes; and a phone signed out never asked which version was
// live at all. The signed-in journey is updating-signed-in.spec.ts.

import { mkdirSync } from 'node:fs';
import { strings } from '../strings/en-GB.ts';
import { openOnExample } from './fixtures.ts';
import { helperInCharge } from './offline-helper.ts';
import { noAxeProblems } from './setup.ts';
import { DEVICES, openMore } from './two-phones.ts';
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
const b = strings.banners;
const SCREENS = '../../docs/screens/4h';

test.use({ userAgent: DEVICES.androidChrome });

/** Longer than the 30 seconds PrePenny used to give the offline helper before loading anyway. */
const WEAK_SIGNAL_MS = 35_000;

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Updating an open PrePenny, signed out, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('1. Open on More from before an update: the note within seconds, and the new version by itself once it is on the phone', async ({
      page,
      context,
      site,
    }) => {
      test.slow();
      const shoots = colorScheme === 'light' && page.viewportSize()?.width === 320;
      // The old version, open on More, with its offline helper in charge.
      await openOnExample(context);
      await page.goto('/app/more/');
      await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
      await helperInCharge(page);
      expect(await versionOpen(page)).toBe('old');
      await markTheOldPage(page);
      const note = page.getByTestId('update-note');
      await expect(note).toHaveCount(0);

      // PrePenny is put away. Meanwhile the new version goes live, and the
      // signal is weak: the offline helper's downloads crawl.
      const session = await putAway(page);
      await site.serve(NEW_BUILD);
      const downloads = await holdHelperDownloads(context);

      // Back on screen with no signal: More works from the phone, and nothing changes.
      await context.setOffline(true);
      await bringBack(page, session);
      await page.waitForTimeout(3000);
      await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
      await expect(note).toHaveCount(0);
      expect(await stillTheOldPage(page)).toBe(true);

      // The signal comes back: within seconds, the note.
      const loads = countLoads(page);
      await context.setOffline(false);
      await expect(note).toHaveText(b.updated, { timeout: 5000 });
      await expect(note).toHaveRole('button');
      await noAxeProblems(page);
      if (shoots) {
        mkdirSync(SCREENS, { recursive: true });
        await page.screenshot({ path: `${SCREENS}/update-note.png` });
      }

      // A tap while the new version is still coming says so, and is read out.
      await note.click();
      await expect(page.getByRole('status').filter({ hasText: b.gettingNewVersion })).toBeVisible();
      await expect(note).toHaveText(b.gettingNewVersion);
      await noAxeProblems(page);
      if (shoots) await page.screenshot({ path: `${SCREENS}/update-getting.png` });

      // However long the helper takes, the page isn't loaded afresh before it
      // has the new version: that would only show the old one again.
      await expect.poll(downloads.held, { timeout: 10_000 }).toBeGreaterThan(0);
      await page.waitForTimeout(WEAK_SIGNAL_MS);
      expect(await stillTheOldPage(page)).toBe(true);
      expect(loads()).toBe(0);
      await expect(note).toHaveText(b.gettingNewVersion);

      // The helper gets the last of it: the new version opens by itself, on More.
      await downloads.release();
      await expect.poll(() => versionOpen(page), { timeout: 60_000 }).toBe('new');
      await expect(page).toHaveURL(/\/app\/more\/$/);
      await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
      await expect(note).toHaveCount(0);
      expect(await versionOnThePhone(page)).toBe(NEW_NAME);
      expect(loads()).toBe(1);

      // It never loops: nothing more loads, and no note comes back.
      await page.waitForTimeout(5000);
      expect(loads()).toBe(1);
      await expect(note).toHaveCount(0);
      await noAxeProblems(page);

      // With no signal, the new version opens from the phone.
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
      expect(await versionOpen(page)).toBe('new');
      await openMore(page);
      await context.setOffline(false);
    });
  });
}
