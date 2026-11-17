// The front page on the live site (PLAN.md item 89, D559), at 320px and 360px
// wide, in light and dark, with axe.
//
// The live site applies the front page's own rule before the general one, so
// "/" was sent two security policies: its own, then the general one, and a
// browser applies both. Its own data, listed only in its own, was refused,
// so the welcome's buttons couldn't work. Wrangler on this computer keeps
// the rules file's order, so the main copy can't show it: port 4175 serves
// the same build with "/"'s rule moved to the top (e2e/live-order.ts), and
// the same few lines in front of the files (cloudflare/worker.ts).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { inlineScripts, scriptHash } from '../scripts/page-policies.ts';
import { noAxeProblems } from './setup.ts';

const LIVE_ORDER = 'http://127.0.0.1:4175';
const OUT = join(import.meta.dirname, '..', 'out');

/** The policy written for "/" in the built rules: the one the front page should get. */
function frontPagePolicy(): string {
  const lines = readFileSync(join(OUT, '_headers'), 'utf8').split('\n');
  const rule = lines.indexOf('/');
  for (const line of lines.slice(rule + 1)) {
    if (!/^\s/.test(line)) break;
    const found = /^\s+Content-Security-Policy: (.*)$/.exec(line);
    if (found?.[1] !== undefined) return found[1];
  }
  throw new Error('out/_headers has no policy for "/".');
}

/** The scripts a policy allows: script-src's words. */
function scriptSrc(policy: string): string[] {
  return (/(?:^|;\s*)script-src ([^;]*)/.exec(policy)?.[1] ?? '').trim().split(/\s+/).sort();
}

/** Notes every script the policy refuses, from the page's very first moment. */
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

test('the copy applies the front page’s rule before the general one, as the live site does', () => {
  const lines = readFileSync(join(import.meta.dirname, '.live-order', '_headers'), 'utf8').split(
    '\n',
  );
  expect(lines.indexOf('/')).toBeGreaterThan(-1);
  expect(lines.indexOf('/')).toBeLessThan(lines.indexOf('/*'));
});

for (const colours of ['light', 'dark'] as const) {
  test.describe(`the front page with the live site's order, in ${colours} mode`, () => {
    test.use({ colorScheme: colours });

    test('is sent exactly its own policy, runs every script of its own, and its buttons work', async ({
      page,
      context,
    }) => {
      await context.addInitScript((choice) => {
        localStorage.setItem('prepenny-colours', choice);
      }, colours);
      await watchPolicy(context);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      const response = await page.goto(`${LIVE_ORDER}/`);
      expect(response?.status()).toBe(200);
      const policies = (await response?.headersArray())?.filter(
        (header) => header.name.toLowerCase() === 'content-security-policy',
      );
      expect(policies?.map((header) => header.value)).toEqual([frontPagePolicy()]);
      const own = [
        ...new Set(inlineScripts(readFileSync(join(OUT, 'index.html'), 'utf8')).map(scriptHash)),
      ];
      expect(scriptSrc(policies?.[0]?.value ?? '')).toEqual(["'self'", ...own].sort());

      // React has taken over the welcome, and the Light or Dark script ran.
      await expect
        .poll(() =>
          page.evaluate(() =>
            [...document.querySelectorAll('body *')]
              .slice(0, 50)
              .some((element) =>
                Object.keys(element).some((key) => key.startsWith('__reactFiber$')),
              ),
          ),
        )
        .toBe(true);
      await expect(page.locator('html')).toHaveAttribute('data-theme', colours);
      await expect(page.getByRole('button', { name: 'Make my plan' })).toBeVisible();
      await noAxeProblems(page);

      // The welcome's button works: it needs PrePenny's own code to run.
      await page.getByRole('button', { name: 'Look at an example plan' }).click();
      await expect(page).toHaveURL(`${LIVE_ORDER}/app/`);
      await expect(page.getByTestId('balance')).toContainText('£267.54');
      expect(await refused(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
