// PrePenny's status page is linked from Help, Contact us and the website's
// help pages (step 4k, brief 4.16, D643), at 320px and 360px wide, in light
// and dark, checked by axe. The page is at UptimeRobot, so it keeps working
// when PrePenny doesn't: each link opens it on its own, as links to other
// websites do (step 4g), and screen readers hear where it goes. Nothing is
// fetched from it: a link is all PrePenny has of it. The builds for these
// tests have a made-up status page address (package.json, build:local).

import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { HELP_ROUTES } from '../lib/help-routes.ts';
import { strings } from '../strings/en-GB.ts';
import { expect, test } from './fixtures.ts';
import { noAxeProblems } from './setup.ts';

const s = strings.statusPage;
const STATUS_PAGE = 'https://stats.uptimerobot.com/prepenny-test';
const SHOTS = '../../docs/screens/4k';
const NAME = `${s.link}, ${s.opensPage}`;

/** A link to the status page: its address, opening on its own, never telling it where from, 44px to tap. */
async function statusLink(link: Locator) {
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', STATUS_PAGE);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noreferrer/);
  const box = await link.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
}

/** Words as they are, in a pattern. */
const escaped = (words: string) => words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every request a page makes, so a test can check nothing went to the status page. */
function watchRequests(page: Page): string[] {
  const sent: string[] = [];
  page.on('request', (request) => sent.push(request.url()));
  return sent;
}

for (const colorScheme of ['light', 'dark'] as const) {
  const shoots = (page: Page) => colorScheme === 'light' && page.viewportSize()?.width === 320;

  test.describe(`PrePenny's status page, linked, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      mkdirSync(SHOTS, { recursive: true });
    });

    test("1. More, Help has PrePenny's status, saying what it shows", async ({ page }) => {
      const sent = watchRequests(page);
      await page.goto('/app/more/');
      await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
      const help = page.getByRole('navigation', { name: strings.help.moreHeading });
      const link = help.locator('a[data-status-link]');
      await statusLink(link);
      // Screen readers hear what's seen, then where it goes.
      await expect(link).toHaveAccessibleName(
        new RegExp(`^${escaped(s.link)}\\s*${escaped(s.moreLine)}\\s*, ${escaped(s.opensPage)}$`),
      );
      await expect(link).toContainText(s.link);
      await expect(link).toContainText(s.moreLine);
      // Last in Help, after Contact us and Suggest a feature.
      await expect(help.getByRole('listitem').last()).toContainText(s.link);
      await noAxeProblems(page);
      if (shoots(page)) {
        await link.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SHOTS}/more-status-320-light.png` });
      }
      expect(sent.filter((url) => url.startsWith('https://stats.uptimerobot.com'))).toEqual([]);
    });

    test('2. Contact us says, before the form, that the status page says whether PrePenny is down for everyone', async ({
      page,
    }) => {
      const sent = watchRequests(page);
      for (const path of ['/app/contact/', '/contact/']) {
        await page.goto(path);
        await expect(
          page.getByRole('heading', { level: 1, name: strings.support.contact.heading }),
        ).toBeVisible();
        const line = page.getByTestId('contact-status');
        await expect(line.getByText(s.contactLine)).toBeVisible();
        await statusLink(line.getByRole('link', { name: NAME }));
        // Above the form, so someone writing because PrePenny isn't working sees it first.
        const words = page.getByLabel(strings.support.contact.wordsLabel);
        const lineBox = await line.boundingBox();
        const wordsBox = await words.boundingBox();
        expect((lineBox?.y ?? 0) + (lineBox?.height ?? 0)).toBeLessThanOrEqual(wordsBox?.y ?? 0);
        await noAxeProblems(page);
        if (shoots(page) && path === '/app/contact/') {
          await page.screenshot({ path: `${SHOTS}/contact-status-320-light.png` });
        }
      }
      expect(sent.filter((url) => url.startsWith('https://stats.uptimerobot.com'))).toEqual([]);
    });

    test("3. The website's help pages end with Contact us and PrePenny's status", async ({
      page,
    }) => {
      for (const path of [HELP_ROUTES.site.index, HELP_ROUTES.site.article('sign-in-problems')]) {
        await page.goto(path);
        const footer = page.locator('footer');
        await expect(footer.getByRole('link')).toHaveText([
          strings.support.contact.cantSignIn,
          s.link,
        ]);
        await statusLink(footer.getByRole('link', { name: NAME }));
        await noAxeProblems(page);
        if (shoots(page) && path === HELP_ROUTES.site.index) {
          await footer.scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${SHOTS}/help-site-status-320-light.png` });
        }
      }
    });
  });
}
