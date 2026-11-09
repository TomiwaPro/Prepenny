// A pull request's preview, tried for real (step 3e-2, D408): run only by the
// Deploy workflow, against the preview it has just put online on Cloudflare,
// which uses the preview Supabase project (README.md, "The preview
// database"). Never against the live app or the real database, and never on
// this computer's own copy.
//
// The owner's test: the preview signs in, saves a plan and keeps it in step
// on two phones, on the preview project; and the live app and the real
// database don't change. Two phones, one 320px wide in light and one 360px
// wide in dark. Signing in uses a link the preview project makes with its
// own secret key, so no email is sent. The Deploy workflow removes the
// test's account and its plan afterwards, by its address.
//
// Needs: PREVIEW_URL (the preview, "https://pr-31-prepenny.prepenny.workers.dev"),
// PREVIEW_SUPABASE_URL and PREVIEW_SECRET_KEY (the preview project's),
// REAL_SUPABASE_URL (the real project's address, which is public) and
// LIVE_SITE ("https://prepenny.co.uk").

import { randomUUID } from 'node:crypto';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { strings } from '../strings/en-GB.ts';
import { settingScript } from './fixtures.ts';
import { updateBalance } from './journeys.ts';
import { noAxeProblems } from './setup.ts';
import { makeAPlan, TODAY } from './sign-in-helpers.ts';
import { openMore } from './two-phones.ts';

const PREVIEW_SUPABASE = process.env.PREVIEW_SUPABASE_URL ?? '';
const SECRET = process.env.PREVIEW_SECRET_KEY ?? '';
const REAL_SUPABASE = process.env.REAL_SUPABASE_URL ?? '';
const LIVE_SITE = process.env.LIVE_SITE ?? 'https://prepenny.co.uk';

/** The version the live app says it is, from its own site, never a kept copy. */
async function liveVersion(): Promise<string> {
  const answer = await fetch(`${LIVE_SITE}/version.json`, { cache: 'no-store' });
  expect(answer.ok, 'the live app answers').toBe(true);
  return answer.text();
}

/** The preview project's admin route, with its secret key. */
function admin(path: string, init: RequestInit = {}) {
  return fetch(`${PREVIEW_SUPABASE}/auth/v1/admin${path}`, {
    ...init,
    headers: { apikey: SECRET, 'Content-Type': 'application/json', ...init.headers },
  });
}

/** Signs a phone in with a sign-in link the preview project makes, as the email's link does. */
async function signInWithLink(page: Page, address: string): Promise<void> {
  const made = await admin('/generate_link', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', email: address }),
  });
  expect(made.ok, 'the preview project makes a sign-in link').toBe(true);
  const { hashed_token: key } = (await made.json()) as { hashed_token: string };
  await page.goto(`/sign-in/#token_hash=${key}`);
  await expect(
    page.getByRole('heading', { level: 1, name: strings.signIn.linkHeading }),
  ).toBeVisible();
  await page.getByRole('button', { name: strings.signIn.finishLink }).click();
  await expect(page).toHaveURL(/\/app\/$/, { timeout: 60_000 });
}

/** A phone: a fresh browser of its own, as a person's would be, with every address it asks noted. */
async function phone(
  browser: Browser,
  width: number,
  height: number,
  colorScheme: 'light' | 'dark',
) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme,
  });
  const asked = new Set<string>();
  context.on('request', (request) => asked.add(new URL(request.url()).origin));
  const page = await context.newPage();
  // Both phones on the same day, the tests' own (D201), as two real phones would be.
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today: TODAY }] as const);
  return { context, page, asked };
}

test('a preview signs in, saves a plan and keeps it in step on two phones, on the preview project only; the live app and the real database are untouched', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  expect(PREVIEW_SUPABASE, 'the preview project is set').not.toBe('');
  expect(PREVIEW_SUPABASE).not.toBe(REAL_SUPABASE);
  const liveBefore = await liveVersion();
  const address = `preview-check-${randomUUID().slice(0, 12)}@example.com`;
  const first = await phone(browser, 320, 640, 'light');
  const second = await phone(browser, 360, 780, 'dark');
  try {
    // The first phone makes a plan, and says on every page it's a test version.
    await makeAPlan(first.page);
    await expect(first.page.getByTestId('preview-line')).toHaveText(strings.preview.line);

    // It signs in: the plan goes up to the preview project.
    await signInWithLink(first.page, address);
    await openMore(first.page);
    await expect(first.page.getByTestId('where-kept')).toHaveText(strings.account.savedInAccount, {
      timeout: 60_000,
    });
    await expect(first.page.getByTestId('preview-line')).toBeVisible();

    // The second phone signs in, and the plan comes down.
    await signInWithLink(second.page, address);
    await expect(second.page.getByTestId('balance')).toContainText('£267.54');
    await expect(second.page.getByTestId('preview-line')).toBeVisible();
    await noAxeProblems(second.page);

    // A change on the second phone reaches the first, left open on Home.
    await first.page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Home', exact: true })
      .click();
    await expect(first.page.getByTestId('balance')).toContainText('£267.54');
    await updateBalance(second.page, {
      account: null,
      balance: '301.25',
      expected: '£267.54',
      difference: "That's £33.71 more.",
      toTick: 0,
    });
    await expect(first.page.getByTestId('balance')).toContainText('£301.25', { timeout: 70_000 });
    await noAxeProblems(first.page);

    // Neither phone asked anything of the real project: only the preview's.
    const preview = new URL(PREVIEW_SUPABASE).origin;
    for (const asked of [first.asked, second.asked]) {
      expect(
        [...asked].filter((origin) => origin === preview || origin.endsWith('.supabase.co')),
      ).toEqual([preview]);
      if (REAL_SUPABASE !== '') expect(asked.has(new URL(REAL_SUPABASE).origin)).toBe(false);
    }
    // And the live app is the same version as before.
    expect(await liveVersion()).toBe(liveBefore);
  } finally {
    await first.context.close();
    await second.context.close();
  }
});
