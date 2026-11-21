// The note when PrePenny's server isn't answering a phone that has a signal
// (step 4k, brief 4.16, D645), against the local Supabase, at 320px and 360px
// wide, in light and dark, checked by axe:
//
// 1. Signed in, the server stops answering while the phone has a signal: a
//    change is saved on the phone, a calm note says the server isn't
//    answering and changes will be sent when it's back, with PrePenny's
//    status page; More says the change is waiting. Once the server answers
//    again, the note goes and the change is sent.
// 2. No such note when it's the phone: with no signal, the offline note
//    says so instead; and with a connection that reaches nothing, as on
//    Wi-Fi with no internet, PrePenny's own site doesn't answer either, so
//    it's only "Changes can't be sent right now", never the server's note.

import { mkdirSync } from 'node:fs';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { LOCAL_SUPABASE } from '../lib/sign-in-config.ts';
import { strings } from '../strings/en-GB.ts';
import { layoutProblems } from './coming-up.ts';
import { updateBalance } from './journeys.ts';
import { helperInCharge } from './offline-helper.ts';
import { noAxeProblems } from './setup.ts';
import { makeAPlan, newEmail } from './sign-in-helpers.ts';
import { openMore, signUpFromMore } from './two-phones.ts';

const s = strings.statusPage;
const t = strings.account;
const STATUS_PAGE = 'https://stats.uptimerobot.com/prepenny-test';
const SHOTS = '../../docs/screens/4k';

/** PrePenny's server stops answering: every request to it gets its gateway's "unavailable". */
async function serverDown(context: BrowserContext) {
  await context.route(`${LOCAL_SUPABASE.url}/**`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'name resolution failed' }),
    }),
  );
}

/** The person comes back to PrePenny, which looks at the account straight away. */
async function backOnScreen(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

/** A plan of one's own, signed up and kept in the account, with every file of the app on the phone. */
async function signedInPhone(page: Page) {
  await makeAPlan(page);
  await signUpFromMore(page, newEmail('status'));
  await expect(page.getByTestId('where-kept')).toHaveText(t.savedInAccount);
  await helperInCharge(page);
}

/** Changes the balance to £250.00, saved on the phone at once. */
async function makeAChange(page: Page) {
  await updateBalance(page, {
    account: null,
    balance: '250.00',
    expected: '£267.54',
    difference: "That's £17.54 less.",
    toTick: 0,
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`When PrePenny's server isn't answering, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      mkdirSync(SHOTS, { recursive: true });
    });

    test("1. With a signal, a calm note says the server isn't answering, with the status page, and the change waits on the phone", async ({
      page,
      context,
    }, info) => {
      test.slow();
      await signedInPhone(page);

      await serverDown(context);
      await makeAChange(page);
      const note = page.getByTestId('server-down-note');
      await expect(note).toBeVisible({ timeout: 20_000 });
      await expect(note.locator('p')).toHaveText(s.serverDown);
      const link = note.getByRole('link', { name: `${s.serverDownLink}, ${s.opensPage}` });
      await expect(link).toHaveText(s.serverDownLink);
      await expect(link).toHaveAttribute('href', STATUS_PAGE);
      await expect(link).toHaveAttribute('target', '_blank');
      expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      // Not the offline note, nor "can't be sent" as well: one note at a time (VOICE.md).
      await expect(page.getByTestId('offline-note')).toHaveCount(0);
      await expect(page.getByTestId('cant-send-note')).toHaveCount(0);
      // Screen readers hear it appear.
      await expect(page.locator('[role="status"]').filter({ has: note })).toHaveCount(1);
      // The change is saved on the phone, and Home shows it.
      await expect(page.getByTestId('balance')).toContainText('£250.00');
      await noAxeProblems(page);
      if (colorScheme === 'light' && info.project.name === 'sign-in-320') {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${SHOTS}/server-down-320-light.png` });
      }
      const big = await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      expect(await layoutProblems(page), 'the note at 200% text').toEqual([]);
      await big.evaluate((element) => (element as HTMLStyleElement).remove());

      // On every screen while it lasts, and More says the change is waiting.
      await openMore(page);
      await expect(page.getByTestId('server-down-note')).toBeVisible();
      await expect(page.getByTestId('where-kept')).toHaveText(t.unsent(1));

      // The server answers again: the note goes, and the change is sent.
      await context.unroute(`${LOCAL_SUPABASE.url}/**`);
      await backOnScreen(page);
      await expect(page.getByTestId('server-down-note')).toHaveCount(0, { timeout: 20_000 });
      await expect(page.getByTestId('where-kept')).toHaveText(t.savedInAccount, {
        timeout: 20_000,
      });
    });

    test("2. No server note when it's the phone: offline, the offline note; with a connection that reaches nothing, only that changes can't be sent", async ({
      page,
      context,
    }) => {
      test.slow();
      await signedInPhone(page);

      // No signal at all.
      await context.setOffline(true);
      await makeAChange(page);
      await expect(page.getByTestId('offline-note')).toHaveText(strings.banners.offlineSending);
      await page.waitForTimeout(3_000);
      await expect(page.getByTestId('server-down-note')).toHaveCount(0);

      // A connection that reaches nothing, as on Wi-Fi with no internet: the
      // phone says it's online, but neither PrePenny's server nor its site answers.
      await context.route('**/*', (route) => route.abort('internetdisconnected'));
      await context.setOffline(false);
      await expect(page.getByTestId('cant-send-note')).toHaveText(strings.banners.cantSend, {
        timeout: 20_000,
      });
      await page.waitForTimeout(3_000);
      await expect(page.getByTestId('server-down-note')).toHaveCount(0);
      await expect(page.getByTestId('offline-note')).toHaveCount(0);
      await noAxeProblems(page);

      // Connected again: the change goes, and no note is left.
      await context.unroute('**/*');
      await backOnScreen(page);
      await expect(page.getByTestId('cant-send-note')).toHaveCount(0, { timeout: 20_000 });
      await expect(page.getByTestId('server-down-note')).toHaveCount(0);
      await openMore(page);
      await expect(page.getByTestId('where-kept')).toHaveText(t.savedInAccount, {
        timeout: 20_000,
      });
    });
  });
}
