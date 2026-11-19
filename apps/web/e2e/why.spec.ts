// The "?" beside what can confuse people (step 4h, brief 4.16, D596), at
// 320px and 360px wide, in light and dark, checked by axe: Home's lowest
// point, Coming up's "Not ticked yet" and Update balance's ticking step.
// Each opens a short sheet titled with a statement, in the person's own
// figures, with a link to its help article; never moves Home's lowest point
// (D442); is named for screen readers by its sheet's title; works with the
// keyboard; and records nothing (D598).

import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { strings } from '../strings/en-GB.ts';
import { expect, settingScript, test } from './fixtures.ts';
import { openAction } from './journeys.ts';
import { shortThreeRunning, TIGHT_TODAY } from './money-tight-plans.ts';
import { helperInCharge } from './offline-helper.ts';
import { noAxeProblems } from './setup.ts';

const w = strings.why;
const SCREENS = '../../docs/screens/4h';
/** Dates as PrePenny writes them, kept on one line. */
const day = (words: string) => words.replaceAll(' ', ' ');
const BALANCE_ARTICLE = {
  href: '/app/help/how-the-balance-works/',
  title: "Every payment shows what you'll have left after it",
};
const UPDATING_ARTICLE = {
  href: '/app/help/updating-your-balance/',
  title: 'Updating your balance keeps your plan true to your bank',
};

/** Checks a sheet's title, sentence under it, lines and link, word for word. */
async function sheetSays(
  page: Page,
  sheet: Locator,
  words: {
    readonly intro: string;
    readonly lines: readonly string[];
    readonly article: { readonly href: string; readonly title: string };
  },
) {
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAccessibleDescription(words.intro);
  await expect(sheet.getByTestId('why-sheet').locator('> p')).toHaveText([
    ...words.lines,
    `${w.readMore} ${words.article.title}`,
  ]);
  const link = sheet.getByRole('link', { name: words.article.title });
  await expect(link).toHaveAttribute('href', words.article.href);
  const box = await link.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await noAxeProblems(page);
}

/** What the phone keeps, and every request it sends, from now on. */
async function watchWhatIsKept(page: Page) {
  const kept = () =>
    page.evaluate(() => ({
      local: Object.keys(localStorage).sort(),
      session: Object.keys(sessionStorage).sort(),
    }));
  const before = await kept();
  const sent: string[] = [];
  const origin = new URL(page.url()).origin;
  page.on('request', (request) => {
    const url = new URL(request.url());
    // PrePenny's own files, which Next.js also fetches ahead by itself, its
    // look for a new version and its weekly bank holiday list: nothing
    // about the person, and nothing about the "?".
    const ownFile =
      ['GET', 'HEAD'].includes(request.method()) &&
      url.origin === origin &&
      (url.pathname.startsWith('/app/') ||
        url.pathname.startsWith('/_next/') ||
        ['/version.json', '/offline-version.json', '/bank-holidays.json'].includes(url.pathname));
    if (!ownFile) sent.push(`${request.method()} ${request.url()}`);
  });
  return async () => {
    expect(await kept()).toEqual(before);
    return sent;
  };
}

for (const colorScheme of ['light', 'dark'] as const) {
  const shoots = (page: Page) => colorScheme === 'light' && page.viewportSize()?.width === 320;

  test.describe(`The "?" beside what can confuse, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      mkdirSync(SCREENS, { recursive: true });
    });

    test("1. Home's lowest point: a \"?\" beside it that moves nothing, opening why it's on Sun 1 Nov in Sam's own figures", async ({
      page,
    }) => {
      await page.goto('/app/');
      const card = page.getByTestId('lowest-point');
      await expect(card).toContainText('£4.53');
      const title = w.lowest.title(day('Sun 1 Nov'));
      // Named by what it opens, not just "?"; it shows the mark and "Why" (D216).
      const button = card.getByRole('button', { name: title });
      await expect(button).toHaveText(`${w.mark}${w.button}`);
      await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
      const box = await button.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      // It never pushes the lowest point down (D442): without it, everything
      // in the card is exactly where it is with it.
      const where = () =>
        card.evaluate((element) =>
          [...element.querySelectorAll('h2, p')].map((one) => one.getBoundingClientRect().top),
        );
      const withIt = await where();
      const shown = (display: string) =>
        card.getByTestId('lowest-why').evaluate((element, value) => {
          (element as HTMLElement).style.display = value;
        }, display);
      await shown('none');
      expect(await where()).toEqual(withIt);
      await shown('');
      await noAxeProblems(page);
      if (shoots(page)) await page.screenshot({ path: `${SCREENS}/why-on-home.png` });

      const kept = await watchWhatIsKept(page);
      await button.click();
      const sheet = page.getByRole('dialog', { name: title });
      await sheetSays(page, sheet, {
        intro: w.lowest.intro('Current account'),
        lines: [
          w.lowest.on(day('Sun 1 Nov'), 'Rent', '£4.53'),
          w.lowest.payAfter(day('Fri 6 Nov')),
          w.lowest.tight('£20'),
          w.lowest.raise,
        ],
        article: BALANCE_ARTICLE,
      });
      if (shoots(page)) await page.screenshot({ path: `${SCREENS}/why-lowest-sheet.png` });
      // Closing puts focus back on the "?" (WCAG 2.4.3).
      await sheet.getByRole('button', { name: strings.sheet.close }).click();
      await expect(sheet).toBeHidden();
      await expect(button).toBeFocused();
      // With the keyboard: Enter opens it, Escape closes it.
      await page.keyboard.press('Enter');
      await expect(sheet).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await expect(button).toBeFocused();
      // Nothing is kept on the phone or sent anywhere for opening it (D598).
      expect(await kept()).toEqual([]);

      // Its link opens the article.
      await button.click();
      await sheet.getByRole('link', { name: BALANCE_ARTICLE.title }).click();
      await expect(page).toHaveURL(new RegExp(`${BALANCE_ARTICLE.href}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_ARTICLE.title);
    });

    test('2. When the lowest point is Short, the sheet says why it says Short', async ({
      page,
    }) => {
      await page.addInitScript(settingScript, [
        TEST_SETTING_KEY,
        { plan: shortThreeRunning, today: TIGHT_TODAY },
      ] as const);
      await page.goto('/app/');
      const card = page.getByTestId('lowest-point');
      await expect(card).toContainText('Short');
      await card.getByRole('button', { name: /^Why your lowest point is on / }).click();
      const sheet = page.getByRole('dialog', { name: /^Why your lowest point is on / });
      await expect(sheet.getByText(w.lowest.short, { exact: true })).toBeVisible();
      await expect(sheet.getByText(/^It says Tight/)).toHaveCount(0);
      await noAxeProblems(page);
    });

    test('3. Coming up\'s "Not ticked yet": why they still count, with this account\'s figures', async ({
      page,
    }) => {
      // Fri 30 Oct, five days after the example's balance check, with nothing ticked since.
      await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today: '2026-10-30' }] as const);
      await page.goto('/app/coming-up/');
      const section = page.getByTestId('not-ticked-yet');
      await expect(section.locator('[data-row-key]')).toHaveCount(5);
      // Settled, with the offline helper in charge, so what Coming up fetches
      // ahead by itself is done before the watch starts.
      await helperInCharge(page);
      await page.waitForLoadState('networkidle');
      const button = section.getByRole('button', { name: w.notTicked.title });
      await expect(button).toHaveText(`${w.mark}${w.button}`);
      await noAxeProblems(page);
      const kept = await watchWhatIsKept(page);
      await button.click();
      const sheet = page.getByRole('dialog', { name: w.notTicked.title });
      await sheetSays(page, sheet, {
        intro: w.notTicked.intro,
        lines: [
          w.notTicked.count('Current account', 5),
          w.notTicked.before(day('Sun 25 Oct')),
          w.notTicked.howToTick,
        ],
        article: BALANCE_ARTICLE,
      });
      if (shoots(page)) await page.screenshot({ path: `${SCREENS}/why-not-ticked-sheet.png` });
      await page.keyboard.press('Escape');
      await expect(button).toBeFocused();
      expect(await kept()).toEqual([]);
    });

    test("4. Update balance's ticking step: why you tick what's gone, in a sheet over the sheet", async ({
      page,
    }) => {
      await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today: '2026-10-30' }] as const);
      await page.goto('/app/');
      await expect(page.getByTestId('lowest-point')).toContainText('£4.53');
      const update = await openAction(page, 'Update balance');
      await update.getByLabel('Type what your bank shows now').fill('600');
      await update.getByRole('button', { name: 'Next' }).click();
      await update.getByRole('button', { name: 'Next' }).click();
      await expect(update.getByText('Step 3 of 3')).toBeVisible();
      const first = update.getByTestId('to-tick').getByRole('checkbox').first();
      await expect(first).toBeVisible();
      const button = update.getByRole('button', { name: w.ticking.title });
      await expect(button).toHaveText(`${w.mark}${w.button}`);
      await button.click();
      const sheet = page.getByRole('dialog', { name: w.ticking.title });
      await sheetSays(page, sheet, {
        intro: w.ticking.intro,
        lines: [
          w.ticking.typed('£600.00', 'Current account'),
          w.ticking.out('Spending money until payday', '£30.00'),
        ],
        article: UPDATING_ARTICLE,
      });
      if (shoots(page)) await page.screenshot({ path: `${SCREENS}/why-ticking-sheet.png` });
      // Escape closes only the sheet on top: Update balance is still on step 3.
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await expect(update).toBeVisible();
      await expect(update.getByText('Step 3 of 3')).toBeVisible();
      await expect(button).toBeFocused();
      // So does its Close button, and nothing typed or ticked is lost.
      await first.check();
      await button.click();
      await sheet.getByRole('button', { name: strings.sheet.close }).click();
      await expect(sheet).toBeHidden();
      await expect(update).toBeVisible();
      await expect(first).toBeChecked();
    });

    test('5. A sheet opened again the moment it closed stays open (D616)', async ({ page }) => {
      await page.goto('/app/');
      const card = page.getByTestId('lowest-point');
      await expect(card).toContainText('£4.53');
      const title = w.lowest.title(day('Sun 1 Nov'));
      const button = card.getByRole('button', { name: title });
      const sheet = page.getByRole('dialog', { name: title });
      await button.click();
      await expect(sheet).toBeVisible();
      // Close, then open again before the browser has said it closed: its
      // "close" comes a moment after it does.
      await page.evaluate(
        async ({ close, title }) => {
          const open = document.querySelector('dialog[open]');
          const closeButton = [...(open?.querySelectorAll('button') ?? [])].find(
            (one) => one.textContent === close,
          );
          closeButton?.click();
          // React draws the change and the dialog closes; its "close" is still to come.
          for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
          document.querySelector<HTMLButtonElement>(`button[aria-label="${title}"]`)?.click();
          for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
        },
        { close: strings.sheet.close, title },
      );
      await page.waitForTimeout(500);
      await expect(sheet).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    });
  });
}
