// The live app's old address, prepenny.prepenny.workers.dev, sends people to
// the same page on prepenny.co.uk, while a pull request's preview keeps its
// own (step 3f-2, D428), at 320px and 360px wide, in light and dark, with axe.
//
// The app is served on port 4174 by Wrangler exactly as Cloudflare serves it,
// with the few lines in front of its files (cloudflare/worker.ts), over https
// with Wrangler's own test certificate, and the browser is told the old
// address and a preview's are this computer. Every address is https, as on
// Cloudflare: Chrome only ever opens an address ending .dev over https, and
// newer versions turn an http one into https before asking (step 3f-2's
// first ready run failed on GitHub that way, D439).
// prepenny.co.uk itself is never reached: the browser is told it doesn't
// exist, so the tests never touch the live site from any computer. The test
// answers for it where it can, and where a browser follows a move from the
// server, which a test can't answer for, it checks the browser asked for
// the right page there. (GitHub's computers can reach the live site: before
// this, the browser opened it there, and the live app's own next page was
// taken for the move, D439.)
// A browser keeps what follows a "#" across such a move, by the web's own
// rules; the app's own move keeps it too (test/unit/sharing.test.ts).

import { request as ask } from 'node:https';
import { expect, type Page, test } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { noSidewaysScroll } from './journeys.ts';
import { noAxeProblems } from './setup.ts';

const OLD = 'prepenny.prepenny.workers.dev';
const LIVE = 'prepenny.co.uk';
const PREVIEW = 'pr-31-prepenny.prepenny.workers.dev';
const PORT = 4174;
const SECRET = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
/** The browser's surroundings without any proxy, so it only ever talks to this computer. */
const withoutProxy = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && !/^(https?|all)_proxy$/i.test(entry[0]),
  ),
);

test.use({
  // The local copy's certificate is Wrangler's own, for this computer only.
  ignoreHTTPSErrors: true,
  launchOptions: {
    env: withoutProxy,
    args: [
      '--lang=en-GB',
      // As above, for the browser itself: Chrome never lets a .dev address
      // open with a certificate it doesn't otherwise know.
      '--ignore-certificate-errors',
      // The old address and a preview are this computer; prepenny.co.uk
      // doesn't exist, so the live site is never opened.
      `--host-resolver-rules=MAP ${OLD} 127.0.0.1, MAP ${PREVIEW} 127.0.0.1, MAP ${LIVE} ~NOTFOUND`,
      '--no-proxy-server',
      // A page the test answers for counts as from outside this computer, so
      // Chromium would refuse it this computer's files. Only in this test.
      '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests',
    ],
    ...(executablePath === undefined ? {} : { executablePath }),
  },
});

/** Answers for prepenny.co.uk, and notes each address asked. */
async function standInForTheLiveSite(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route('https://prepenny.co.uk/**', (route) => {
    asked.push(route.request().url());
    return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en-GB"><title>PrePenny</title><main><h1>prepenny.co.uk</h1></main></html>',
    });
  });
  return asked;
}

/** One request to the second copy, as a browser at `host` would send it. */
function sendAs(host: string, path: string, mode: string) {
  return new Promise<{ status: number; location?: string; cacheControl?: string }>(
    (resolve, reject) => {
      const request = ask(
        {
          host: '127.0.0.1',
          port: PORT,
          path,
          headers: { Host: `${host}:${PORT}`, 'Sec-Fetch-Mode': mode },
          // Wrangler's own test certificate, on this computer only.
          rejectUnauthorized: false,
        },
        (response) => {
          response.resume();
          resolve({
            status: response.statusCode ?? 0,
            ...(response.headers.location === undefined
              ? {}
              : { location: response.headers.location }),
            ...(response.headers['cache-control'] === undefined
              ? {}
              : { cacheControl: response.headers['cache-control'] }),
          });
        },
      );
      request.on('error', reject);
      request.end();
    },
  );
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`the old address, ${colorScheme}`, () => {
    test('a page opened at the old address goes on to the same page on prepenny.co.uk', async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      for (const [path, hash] of [
        ['/join/', `#${SECRET}`],
        ['/app/coming-up/?from=home', ''],
        ['/', ''],
      ] as const) {
        const asked = page.waitForRequest((request) =>
          request.url().startsWith('https://prepenny.co.uk'),
        );
        // prepenny.co.uk can't be reached from this computer, so the page itself fails to open.
        await page.goto(`https://${OLD}:${PORT}${path}${hash}`).catch(() => undefined);
        const next = await asked;
        expect(next.url()).toBe(`https://prepenny.co.uk${path}`);
        // Moved by the old address's answer, with what follows the "#" never sent to either site.
        expect(next.redirectedFrom()?.url()).toBe(`https://${OLD}:${PORT}${path}`);
      }
    });

    test("a pull request's preview keeps its own address and works as before", async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      const asked = await standInForTheLiveSite(page);
      const response = await page.goto(`https://${PREVIEW}:${PORT}/`);
      expect(response?.status()).toBe(200);
      expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
      await expect(page).toHaveURL(`https://${PREVIEW}:${PORT}/`);
      await expect(page.getByRole('button', { name: strings.welcome.makeMyPlan })).toBeVisible();
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      await page.getByRole('button', { name: strings.welcome.makeMyPlan }).click();
      await expect(page).toHaveURL(`https://${PREVIEW}:${PORT}/setup/`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(asked).toEqual([]);
    });

    test('a page the offline helper serves at the old address moves itself to prepenny.co.uk', async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await standInForTheLiveSite(page);
      // As a phone that installed PrePenny at the old address: its offline
      // helper serves the page itself, so Cloudflare never moves it.
      await page.route(`https://${OLD}:${PORT}/sign-in/`, async (route) => {
        const kept = await route.fetch({ url: `https://127.0.0.1:${PORT}/sign-in/` });
        await route.fulfill({ response: kept });
      });
      await page.goto(`https://${OLD}:${PORT}/sign-in/`, { waitUntil: 'commit' });
      await expect(page).toHaveURL('https://prepenny.co.uk/sign-in/', { timeout: 15_000 });
      // An invite link too: it arrives with its secret, as the join page
      // reads it only after the move has taken the whole address.
      await page.route(`https://${OLD}:${PORT}/join/`, async (route) => {
        const kept = await route.fetch({ url: `https://127.0.0.1:${PORT}/join/` });
        await route.fulfill({ response: kept });
      });
      await page.goto(`https://${OLD}:${PORT}/join/#${SECRET}`, { waitUntil: 'commit' });
      await expect(page).toHaveURL(`https://prepenny.co.uk/join/#${SECRET}`, { timeout: 15_000 });
    });
  });
}

test("the old address's files are still served, so a phone's offline helper there can update itself", async () => {
  expect(await sendAs(OLD, '/sw.js', 'no-cors')).toEqual({ status: 200, cacheControl: 'no-cache' });
  expect((await sendAs(OLD, '/version.json', 'cors')).status).toBe(200);
  expect(await sendAs(OLD, '/app/?x=1', 'navigate')).toEqual({
    status: 301,
    location: 'https://prepenny.co.uk/app/?x=1',
  });
  expect((await sendAs(PREVIEW, '/app/', 'navigate')).status).toBe(200);
  // The app's own files never run the few lines, even asked for like a page:
  // they don't count towards Cloudflare's free allowance (D428).
  for (const path of ['/version.json', '/sw.js', '/icons/icon.svg', '/manifest.webmanifest']) {
    expect((await sendAs(OLD, path, 'navigate')).status, path).toBe(200);
  }
});
