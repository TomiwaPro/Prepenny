// The support dashboard is its own site, and only there (step 4j, D641,
// D642), at 320px and 360px wide, in light and dark, checked by axe:
//
// 1. The app has no support pages at all: /app/support/ is "This page isn't
//    here", and none of the dashboard's code or words are in anything the
//    app's build serves. The same build is the one Cloudflare serves at
//    prepenny.co.uk, its workers.dev address and every preview.
// 2. The dashboard's site has only the dashboard: its sign-in, with its own
//    security policy, never shown to a search engine, and nothing kept on
//    the computer: no offline helper, no home-screen app details, nothing
//    stored until someone signs in, and then only for the tab.
//
// The dashboard's own few lines on Cloudflare, which serve nothing but at
// admin.prepenny.co.uk through Cloudflare Access, are proved by
// test/unit/admin-worker.test.ts, and its settings (no workers.dev address,
// no preview links) by scripts/support-dashboard.test.ts. Signing in and
// every support step are in e2e/support-tools.spec.ts.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { supportStrings } from '../strings/support-en-GB.ts';
import { layoutProblems } from './coming-up.ts';
import { DASHBOARD } from './dashboard.ts';
import { noAxeProblems } from './setup.ts';

const d = supportStrings.supportDashboard;

/** Every file a build serves, with its text. */
function filesIn(folder: string): { readonly file: string; readonly text: string }[] {
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(html|js|txt|json|css)$/.test(entry.name))
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return { file: path, text: readFileSync(path, 'utf8') };
    });
}

/** Things only the dashboard has: its steps' names and its own words. */
const DASHBOARD_ONLY = [
  'support_inbox',
  'support_send_backup_link',
  'support_start_two_step_wait',
  'prepenny-support-sign-in',
  d.signInHeading,
  supportStrings.supportTools.backupLinkTitle,
];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`The support dashboard is its own site, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('1. The app has no support pages: /app/support/ is not here, and the app has none of the dashboard', async ({
      page,
    }) => {
      const answer = await page.goto('/app/support/');
      expect(answer?.status()).toBe(404);
      await expect(
        page.getByRole('heading', { level: 1, name: strings.notFound.heading }),
      ).toBeVisible();
      await expect(page.getByText(d.signInHeading)).toHaveCount(0);
      // The dashboard's sign-in link opens nothing in the app either.
      await page.goto('/app/support/#message=00000000-0000-0000-0000-000000000000');
      await expect(
        page.getByRole('heading', { level: 1, name: strings.notFound.heading }),
      ).toBeVisible();

      // Nothing the app's build serves holds the dashboard's code or words.
      const app = filesIn(join(import.meta.dirname, '..', 'out'));
      expect(app.length).toBeGreaterThan(100);
      for (const only of DASHBOARD_ONLY) {
        expect(
          app.filter((one) => one.text.includes(only)).map((one) => one.file),
          `the app has nothing with "${only}"`,
        ).toEqual([]);
      }
      // While the dashboard's build has them all, so the check above can find them.
      const dashboard = filesIn(join(import.meta.dirname, '..', 'admin', 'out'));
      for (const only of DASHBOARD_ONLY) {
        expect(
          dashboard.some((one) => one.text.includes(only)),
          `the dashboard has "${only}"`,
        ).toBe(true);
      }
    });

    test('2. The dashboard site has only the dashboard, its own policy, and keeps nothing on the computer', async ({
      page,
    }) => {
      const answer = await page.goto(`${DASHBOARD}/`);
      expect(answer?.status()).toBe(200);
      const headers = answer?.headers() ?? {};
      expect(headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(headers['cache-control']).toBe('no-store');
      // One policy, the page's own: only its own scripts, and connections to
      // its own address and the Supabase project, nothing else.
      const policy = headers['content-security-policy'] ?? '';
      expect(policy).not.toContain(',');
      expect(policy).toContain("script-src 'self' 'sha256-");
      expect(policy).toContain("connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321;");
      expect(policy).toContain("worker-src 'none'");
      expect(policy).toContain("manifest-src 'none'");

      await expect(page.getByRole('heading', { level: 1, name: d.signInHeading })).toBeVisible();
      await expect(page.getByText(d.signInPurpose)).toBeVisible();
      await noAxeProblems(page);

      // A mistake says what to do.
      await page.getByRole('button', { name: d.sendCode }).click();
      await expect(page.getByLabel(d.emailLabel)).toHaveAccessibleDescription(
        new RegExp(d.emailMissing.replace('.', '\\.')),
      );
      await noAxeProblems(page);

      // With text at 200%, nothing outside the screen or cut off.
      const style = await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      expect(await layoutProblems(page)).toEqual([]);
      await style.evaluate((element) => (element as HTMLStyleElement).remove());
      if (colorScheme === 'light' && page.viewportSize()?.width === 320) {
        await page.screenshot({
          path: '../../docs/screens/4j/dashboard-sign-in-320-light.png',
          fullPage: true,
        });
      }

      // Nothing kept on the computer: no offline helper, no home-screen app
      // details, and nothing stored at all before signing in.
      const kept = await page.evaluate(async () => ({
        helpers: (await navigator.serviceWorker?.getRegistrations())?.length ?? 0,
        manifest: document.querySelectorAll('link[rel="manifest"]').length,
        stored: localStorage.length + sessionStorage.length,
        cookies: document.cookie,
      }));
      expect(kept).toEqual({ helpers: 0, manifest: 0, stored: 0, cookies: '' });
      for (const file of ['sw.js', 'manifest.webmanifest', 'version.json', 'app/']) {
        const other = await page.request.get(`${DASHBOARD}/${file}`);
        expect(other.status(), `${file} isn't on the dashboard's site`).toBe(404);
      }

      // Any other address there is "This page isn't here", with the way back.
      await page.goto(`${DASHBOARD}/app/support/`);
      await expect(page.getByRole('heading', { level: 1, name: d.notFound })).toBeVisible();
      await expect(page.getByRole('link', { name: d.toDashboard })).toHaveAttribute('href', '/');
      await noAxeProblems(page);
    });
  });
}
