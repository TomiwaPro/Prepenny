// Helpers for the tests with two phones and the local Supabase (steps 3c
// and 3d): the local database as its administrator, a second phone, signing
// up from More and signing in with the link the email would have.

import { execFileSync } from 'node:child_process';
import { type Browser, expect, type Page, type TestInfo } from '@playwright/test';
import { LOCAL_SUPABASE } from '../lib/sign-in-config.ts';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { strings } from '../strings/en-GB.ts';
import { settingScript } from './fixtures.ts';
import { box } from './setup.ts';
import { askForCode, signInEmail, TODAY } from './sign-in-helpers.ts';

const t = strings.account;
const s = strings.signIn;

/** A query on the local database, as Supabase's own administrator, for setting up and checking. */
export function sql(query: string): string {
  return execFileSync('docker', [
    'exec',
    'supabase_db_prepenny',
    'psql',
    '--quiet',
    '--no-psqlrc',
    '-At',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-c',
    query,
  ])
    .toString()
    .trim();
}

export const quoted = (text: string) => `'${text.replaceAll("'", "''")}'`;

/** A second phone: a fresh browser with nothing on it, the same size and colours as the first. */
export async function secondPhone(
  browser: Browser,
  info: TestInfo,
  colorScheme: 'light' | 'dark',
  today = TODAY,
  /** How the browser describes itself, as a real phone's would (step 3e's list of signed-in devices). */
  userAgent?: string,
) {
  const use = info.project.use;
  const context = await browser.newContext({
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(use.viewport === undefined ? {} : { viewport: use.viewport }),
    ...(use.isMobile === undefined ? {} : { isMobile: use.isMobile }),
    ...(use.hasTouch === undefined ? {} : { hasTouch: use.hasTouch }),
    ...(use.deviceScaleFactor === undefined ? {} : { deviceScaleFactor: use.deviceScaleFactor }),
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    ...(use.baseURL === undefined ? {} : { baseURL: use.baseURL }),
    colorScheme,
  });
  const page = await context.newPage();
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today }] as const);
  return { context, page };
}

export async function openMore(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'More', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
}

/** Signs up from More, with the plan on this phone, and waits for it to be saved in the account. */
export async function signUpFromMore(page: Page, address: string) {
  await openMore(page);
  await page.getByTestId('account').getByRole('link', { name: 'Sign up or sign in' }).click();
  await expect(page.getByText(s.planBecomesYours)).toBeVisible();
  await askForCode(page, address);
  await box(page, '6-digit code').fill((await signInEmail(address)).code);
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/more\/$/);
  await expect(page.getByTestId('where-kept')).toHaveText(t.savedInAccount);
}

/** The local Supabase's own key for its administrator (supabase/config.toml): the same on every machine, and local only. */
export const LOCAL_SECRET_KEY = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';

/** A sign-in link from the local Supabase, for an account it makes if there isn't one yet. */
export async function signInLink(address: string): Promise<{ id: string; hashed_token: string }> {
  const response = await fetch(`${LOCAL_SUPABASE.url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: LOCAL_SECRET_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: address }),
  });
  expect(response.ok, 'the local Supabase makes a sign-in link').toBe(true);
  return (await response.json()) as { id: string; hashed_token: string };
}

/** An account for this address, as signing up makes one, and its id. */
export async function accountFor(address: string): Promise<string> {
  return (await signInLink(address)).id;
}

/**
 * Signs in on a phone with the sign-in link the email would have, made by
 * the local Supabase straight away (no email is sent), so a second phone
 * needn't wait the minute Supabase leaves between codes to one address
 * (D305). The page opens on "Finish signing in", as the email's link does (D312).
 */
export async function signIn(page: Page, address: string) {
  const { hashed_token: key } = await signInLink(address);
  await page.goto(`/sign-in/#token_hash=${key}`);
  await expect(page.getByRole('heading', { level: 1, name: s.linkHeading })).toBeVisible();
  await page.getByRole('button', { name: s.finishLink }).click();
}

/** The person's id, from the sign-in kept on the phone. */
export async function personOn(page: Page): Promise<string> {
  return page.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem('prepenny-sign-in') ?? 'null') as {
      user: { id: string };
    };
    return kept.user.id;
  });
}

/** How real phones and computers describe themselves, for the list of signed-in devices (step 3e). */
export const DEVICES = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
} as const;
