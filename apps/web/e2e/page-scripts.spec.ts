// Step 4b (PLAN.md items 10 and 31, D529): each page's security policy
// lists exactly the scripts PrePenny wrote into it, so a script slipped into
// a page can't run, and every page still works, at 320px and 360px, in light
// and dark, and with no signal.
//
// "Slipped into a page" is tried two ways, as it could happen:
// - in the page's file on its way to the phone: every page is served with
//   its real headers and three extra scripts written into it, one at the
//   top, one at the end, and one in a picture's "onerror", plus Cloudflare's
//   analytics script, exactly as Cloudflare wrote it into the live pages;
// - into the page once it's open, as a name or a note shown on screen could
//   try: a script element, a picture's "onerror", eval and a timer's text.
// The same slipped script runs with the policy from before step 4b, which
// shows the test can tell the difference.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { BrowserContext, Page, Route } from '@playwright/test';
import { inlineScripts, scriptHash, servedAt } from '../scripts/page-policies.ts';
import { expect, test } from './fixtures.ts';
import { helperInCharge } from './offline-helper.ts';

const OUT = join(import.meta.dirname, '..', 'out');

/** Every page Next.js built, with the address it's served at. */
const PAGES = readdirSync(OUT, { withFileTypes: true, recursive: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
  .map((entry) => relative(OUT, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
  .flatMap((file) => {
    const path = servedAt(file);
    return path === null ? [] : [{ file, path }];
  })
  .sort((a, b) => a.path.localeCompare(b.path));

/** The policy from before step 4b: any script written into a page could run. */
const OLD_SCRIPT_SRC = "script-src 'self' 'unsafe-inline'";

/** Exactly what Cloudflare wrote into every live page (PLAN.md item 31), token made up. */
const CLOUDFLARE_BEACON =
  '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/vce701823e78c4301a35b7e07294d87301792088814092" data-cf-beacon=\'{"version":"2024.11.0","token":"0123456789abcdef0123456789abcdef","r":1,"spa":2}\' crossorigin="anonymous"></script>';

/** Writes three scripts into a page's file, and Cloudflare's analytics script. */
function slipIn(html: string): string {
  const atTop = '<script>window.__slipped = "at the top";</script>';
  const atEnd =
    '<img alt="" src="data:," onerror="window.__slippedHandler = true"><script>window.__slipped = "at the end";</script>';
  return html
    .replace('<head>', `<head>${atTop}`)
    .replace('</body>', `${atEnd}${CLOUDFLARE_BEACON}</body>`);
}

/**
 * Serves every page the browser opens with the slipped scripts in it, and
 * its real headers, or the old policy's when asked. Nothing leaves this
 * computer: Cloudflare's script address is never fetched.
 */
async function serveSlippedIn(context: BrowserContext, { oldPolicy = false } = {}) {
  await context.route(/^https:\/\/static\.cloudflareinsights\.com\//, (route) => route.abort());
  await context.route(/^http:\/\/127\.0\.0\.1:4173\//, async (route: Route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    const headers = { ...response.headers() };
    if (oldPolicy) {
      headers['content-security-policy'] = (headers['content-security-policy'] ?? '').replace(
        /script-src [^;]*/,
        OLD_SCRIPT_SRC,
      );
    }
    return route.fulfill({ response, headers, body: slipIn(await response.text()) });
  });
}

/** Notes every load and script the policy refuses, from the page's very first moment. */
async function watchPolicy(context: BrowserContext) {
  await context.addInitScript(() => {
    const refused: string[] = [];
    Reflect.set(window, '__refused', refused);
    document.addEventListener('securitypolicyviolation', (event) => {
      refused.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
}

const refused = (page: Page) =>
  page.evaluate(() => [...((Reflect.get(window, '__refused') as string[] | undefined) ?? [])]);

/** What the slipped scripts managed to do: nothing, when they're refused. */
const slippedDid = (page: Page) =>
  page.evaluate(() => ({
    script: Reflect.get(window, '__slipped') ?? null,
    handler: Reflect.get(window, '__slippedHandler') ?? null,
  }));

/**
 * The page works: PrePenny's own scripts ran. React has taken over the page
 * (its mark is on the page's elements), and the Light or Dark script in the
 * page's head set the colours chosen in More (D173).
 */
async function expectWorking(page: Page, colours: 'light' | 'dark') {
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .slice(0, 50)
          .some((element) => Object.keys(element).some((key) => key.startsWith('__reactFiber$'))),
      ),
    )
    .toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', colours);
  await expect(page.locator('h1').first()).toBeAttached();
}

/** Chooses Light or Dark under More, as the phone keeps it (D173), before any page opens. */
async function chooseColours(context: BrowserContext, colours: 'light' | 'dark') {
  await context.addInitScript((choice) => {
    localStorage.setItem('prepenny-colours', choice);
  }, colours);
}

/** The scripts a policy allows: script-src's words. */
function scriptSrc(policy: string): string[] {
  return (/(?:^|;\s*)script-src ([^;]*)/.exec(policy)?.[1] ?? '').trim().split(/\s+/).sort();
}

/** The fingerprints of the scripts written into a page's file. */
function ownScripts(file: string): string[] {
  return [...new Set(inlineScripts(readFileSync(join(OUT, file), 'utf8')).map(scriptHash))];
}

for (const colours of ['light', 'dark'] as const) {
  test.describe(`a script slipped into a page, in ${colours} mode`, () => {
    test.use({ colorScheme: colours });

    for (const { path } of PAGES) {
      test(`${path}: a script written into the page can't run, and the page works`, async ({
        page,
        context,
      }) => {
        await chooseColours(context, colours);
        await watchPolicy(context);
        await serveSlippedIn(context);
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(path);
        await expectWorking(page, colours);
        expect(await slippedDid(page)).toEqual({ script: null, handler: null });
        // Both written-in scripts, the picture's onerror and Cloudflare's
        // script are refused, and nothing of PrePenny's own.
        const blocked = await refused(page);
        expect(blocked.filter((one) => one === 'script-src-elem inline')).toHaveLength(2);
        expect(blocked).toContain('script-src-attr inline');
        expect(
          blocked.filter((one) =>
            one.startsWith('script-src-elem https://static.cloudflareinsights.com/'),
          ),
        ).toHaveLength(1);
        expect(blocked).toHaveLength(4);
        expect(errors).toEqual([]);
      });
    }
  });
}

test('with the policy from before step 4b, the same slipped script ran: the test can tell', async ({
  page,
  context,
}) => {
  await chooseColours(context, 'light');
  await serveSlippedIn(context, { oldPolicy: true });
  await page.goto('/app/');
  await expectWorking(page, 'light');
  expect(await slippedDid(page)).toEqual({ script: 'at the end', handler: true });
});

/**
 * Tries every way a name or a note shown on screen could add a script once
 * the page is open. Each try runs as the page's own code would, a moment
 * later: Playwright's own evaluation is let through eval by the browser
 * (Chrome's allowUnsafeEvalBlockedByCSP), whatever the policy says.
 */
async function tryToAddScripts(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const ran: string[] = [];
        Reflect.set(window, '__ran', ran);
        setTimeout(() => {
          const element = document.createElement('script');
          element.textContent = 'window.__ran.push("a script element")';
          document.body.append(element);
          const holder = document.createElement('div');
          holder.innerHTML =
            '<img alt="" src="data:," onerror="window.__ran.push(\'a picture onerror\')">';
          document.body.append(holder);
          try {
            // biome-ignore lint/security/noGlobalEval: the test checks the policy refuses it.
            eval('window.__ran.push("eval")');
          } catch {}
          try {
            new Function('window.__ran.push("new Function")')();
          } catch {}
          try {
            // A timer given text to run, rather than a function.
            Reflect.apply(setTimeout, window, ['window.__ran.push("a timer")', 0]);
          } catch {}
          setTimeout(() => resolve([...ran]), 300);
        }, 0);
      }),
  );
}

test('a script added to a page once it is open can’t run: a script element, onerror, eval, new Function or a timer', async ({
  page,
}) => {
  await watchPolicy(page.context());
  await page.goto('/app/');
  await expect(page.getByTestId('balance')).toBeVisible();
  expect(await tryToAddScripts(page)).toEqual([]);
  const blocked = await refused(page);
  expect(blocked).toContain('script-src-elem inline');
  expect(blocked).toContain('script-src-attr inline');
  expect(blocked).toContain('script-src eval');
});

test('every page is sent with a policy listing exactly its own scripts, and the not-found page with its own', async ({
  request,
}) => {
  for (const { path, file } of PAGES) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(await response.text(), path).toBe(readFileSync(join(OUT, file), 'utf8'));
    const own = ownScripts(file);
    expect(own.length, path).toBeGreaterThan(0);
    expect(scriptSrc(response.headers()['content-security-policy'] ?? ''), path).toEqual(
      ["'self'", ...own].sort(),
    );
  }
  const missing = await request.get('/app/no-such-page/');
  expect(missing.status()).toBe(404);
  const notFound = [...new Set(inlineScripts(await missing.text()).map(scriptHash))];
  expect(notFound.length).toBeGreaterThan(0);
  expect(scriptSrc(missing.headers()['content-security-policy'] ?? '')).toEqual(
    ["'self'", ...notFound].sort(),
  );
  // Every other file has the general policy: no script written into a page
  // but the not-found page's.
  for (const other of [
    '/sw.js',
    '/version.json',
    '/offline-version.json',
    '/manifest.webmanifest',
  ]) {
    const response = await request.get(other);
    expect(scriptSrc(response.headers()['content-security-policy'] ?? ''), other).toEqual(
      ["'self'", ...notFound].sort(),
    );
  }
});

for (const colours of ['light', 'dark'] as const) {
  test.describe(`with no signal, in ${colours} mode`, () => {
    test.use({ colorScheme: colours });

    test('every page opens with its own policy, works, and refuses a script added to it', async ({
      page,
      context,
    }) => {
      test.setTimeout(120_000);
      await chooseColours(context, colours);
      await watchPolicy(context);
      await page.goto('/app/');
      await expect(page.getByTestId('balance')).toHaveText('£267.54');
      await helperInCharge(page);
      await context.setOffline(true);
      for (const { path, file } of PAGES) {
        const response = await page.goto(path);
        expect(response?.fromServiceWorker(), path).toBe(true);
        // The phone's kept copy came with the page's own policy.
        expect(scriptSrc(response?.headers()['content-security-policy'] ?? ''), path).toEqual(
          ["'self'", ...ownScripts(file)].sort(),
        );
        await expectWorking(page, colours);
        expect(await tryToAddScripts(page), path).toEqual([]);
        // Only the scripts the test tried to add were refused, never PrePenny's own.
        expect(
          (await refused(page)).filter(
            (one) =>
              !['script-src-elem inline', 'script-src-attr inline', 'script-src eval'].includes(
                one,
              ),
          ),
          path,
        ).toEqual([]);
      }
    });
  });
}
