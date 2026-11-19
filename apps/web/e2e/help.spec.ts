// Step 4g: the help centre (brief 4.16, 7.1, D587 to D589) and Home's card
// offering free help when money is tight (D584 to D586, D592), at 320px
// and 360px, in light and dark, with axe.
//
// 1. More has Help; the help centre lists every article, and each opens,
//    reads, and goes back.
// 2. Searching finds the articles with every word, says how many, and
//    "Clear search" shows them all again; nothing is sent, kept or put in
//    the address while searching.
// 3. Searching and reading work with no signal.
// 4. The website's help is for anyone, with no plan: its links to other
//    organisations open beside PrePenny, and its phone numbers can be tapped.
// 5. Home shows the card under the lowest point when three pay periods in a
//    row are short, from the next one (Dee), calm, never pushing the lowest
//    point down, and "See where to get help" opens Help when money is tight.
// 6. "Not now" hides it for 30 days, on this phone.
// 7. It shows when the three start with the pay period we're in now (Jo).
// 8. It never shows when only two pay periods running are short,
// 9. nor on Sam's example.

import { expect, type Page } from '@playwright/test';
import { helpArticles } from '../lib/help-articles.ts';
import { MONEY_TIGHT_SLUG } from '../lib/help-routes.ts';
import { searchEntries, searchHelp } from '../lib/help-search.ts';
import { MONEY_HELP_KEY } from '../lib/money-tight.ts';
import { TEST_SETTING_KEY, type TestSetting } from '../lib/test-setting.ts';
import { strings } from '../strings/en-GB.ts';
import { settingScript, test } from './fixtures.ts';
import { noSidewaysScroll } from './journeys.ts';
import {
  joShortFromNow,
  shortThreeRunning,
  shortTwoOfThree,
  TIGHT_TODAY,
} from './money-tight-plans.ts';
import { helperInCharge } from './offline-helper.ts';
import { noAxeProblems } from './setup.ts';

const t = strings.help;
const SCREENS = '../../docs/screens/4g';
const articles = helpArticles();
const entries = searchEntries(articles);

const search = (page: Page) => page.getByRole('searchbox', { name: t.search });
const list = (page: Page) => page.getByTestId('help-list').getByRole('link');
const found = (page: Page) => page.getByTestId('help-found');
const card = (page: Page) => page.getByTestId('money-help');

async function putSetting(page: Page, setting: TestSetting) {
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, setting] as const);
}

/** Opens Home with a test plan and today, and waits for its figures. */
async function openHome(page: Page, setting: TestSetting) {
  await putSetting(page, setting);
  await page.goto('/app/');
  await expect(page.getByTestId('lowest-point')).toBeVisible();
  await settled(page);
}

/** Two frames after Home's figures, so what the phone keeps has been read and drawn. */
async function settled(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))),
      ),
  );
}

/** Where something is on the page, wherever the screen has scrolled to. */
async function onPage(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top + window.scrollY, left: box.left, height: box.height };
  });
}

/** Everything this phone keeps for PrePenny's site: its small stores and its databases' names. */
async function keptOnPhone(page: Page) {
  return page.evaluate(async () => ({
    local: Object.keys(localStorage).sort(),
    session: Object.keys(sessionStorage).sort(),
    databases: (await indexedDB.databases()).map((one) => one.name).sort(),
  }));
}

for (const colorScheme of ['light', 'dark'] as const) {
  const shoots = (page: Page) => colorScheme === 'light' && page.viewportSize()?.width === 320;

  test.describe(`The help centre, in ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('1. More has Help; the help centre lists every article, and each opens and goes back', async ({
      page,
    }) => {
      await page.goto('/app/more/');
      const help = page.getByRole('navigation', { name: t.moreHeading });
      await expect(help.getByRole('link', { name: new RegExp(`^${t.centre}`) })).toBeVisible();
      await expect(
        help.getByRole('link', { name: new RegExp(`^${t.moneyTight}`) }),
      ).toHaveAttribute('href', `/app/help/${MONEY_TIGHT_SLUG}/`);
      await help.getByRole('link', { name: new RegExp(`^${t.centre}`) }).click();

      await expect(page).toHaveURL(/\/app\/help\/$/);
      await expect(page.getByRole('heading', { level: 1, name: t.heading })).toBeVisible();
      await expect(page.getByText(t.purpose, { exact: true })).toBeVisible();
      await expect(list(page)).toHaveCount(articles.length);
      for (const [at, article] of articles.entries()) {
        await expect(list(page).nth(at)).toContainText(article.title);
        await expect(list(page).nth(at)).toContainText(article.summary);
      }
      await noSidewaysScroll(page);
      await noAxeProblems(page);
      if (shoots(page)) await page.screenshot({ path: `${SCREENS}/help-centre.png` });

      // Each article opens, with its title, its first paragraph under it and its sections.
      for (const article of articles) {
        await page.goto(`/app/help/${article.slug}/`);
        await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
        await expect(page.getByText(article.summary, { exact: true })).toBeVisible();
        for (const block of article.blocks) {
          if (block.kind === 'heading') {
            await expect(page.getByRole('heading', { level: 2, name: block.text })).toBeVisible();
          }
        }
        // Nothing from the "Checked:" notes reaches the screen.
        await expect(page.getByText('Checked:')).toHaveCount(0);
        await noSidewaysScroll(page);
      }
      await noAxeProblems(page);

      // Updating your balance: its numbered steps, and Back to Help.
      await page.goto('/app/help/updating-your-balance/');
      const steps = page.getByTestId('help-article').getByRole('list').first();
      await expect(steps.getByRole('listitem')).toHaveCount(4);
      await expect(steps.getByRole('listitem').first()).toHaveText('On Home, tap Update balance.');
      await page.getByRole('link', { name: t.backToHelp }).click();
      await expect(page).toHaveURL(/\/app\/help\/$/);
      // The bottom navigation is there, with More as the place it's under.
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    });

    test('2. Searching finds the articles with every word, and nothing is sent, kept or put in the address', async ({
      page,
    }) => {
      await page.goto('/app/help/');
      await expect(list(page)).toHaveCount(articles.length);
      const address = page.url();
      // Once the page has loaded and the offline helper has kept its files,
      // searching asks for nothing at all, apart from PrePenny's own look for
      // a new version, once a minute, and its weekly bank holiday list.
      await helperInCharge(page);
      await page.waitForLoadState('networkidle');
      const kept = await keptOnPhone(page);
      const requests: string[] = [];
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (path !== '/version.json' && path !== '/bank-holidays.json')
          requests.push(request.url());
      });
      await search(page).fill('debt');
      const debts = searchHelp(entries, 'debt');
      await expect(found(page)).toHaveText(t.found(debts.length, 'debt'));
      await expect(list(page)).toHaveCount(debts.length);
      await expect(list(page).first()).toContainText(
        articles.find((one) => one.slug === 'debts')?.title ?? '',
      );
      await noAxeProblems(page);
      if (shoots(page)) await page.screenshot({ path: `${SCREENS}/help-search.png` });

      await search(page).fill("can't sign in");
      await expect(list(page).first()).toContainText(
        articles.find((one) => one.slug === 'sign-in-problems')?.title ?? '',
      );
      await search(page).fill('zebra');
      await expect(found(page)).toHaveText(t.none('zebra'));
      await expect(page.getByTestId('help-list')).toHaveCount(0);

      await page.getByRole('button', { name: t.clear }).click();
      await expect(search(page)).toHaveValue('');
      await expect(found(page)).toHaveText('');
      await expect(list(page)).toHaveCount(articles.length);

      // The search box isn't a form, and the browser is asked not to remember what's typed.
      await expect(search(page)).toHaveAttribute('autocomplete', 'off');
      await expect(page.locator('form')).toHaveCount(0);
      expect(page.url()).toBe(address);
      expect(requests).toEqual([]);
      expect(await keptOnPhone(page)).toEqual(kept);

      // At 200% text, everything still fits.
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await search(page).fill('balance');
      await noSidewaysScroll(page);
    });

    test('3. Searching and reading work with no signal', async ({ page, context }) => {
      await page.goto('/app/help/');
      await expect(list(page)).toHaveCount(articles.length);
      await helperInCharge(page);
      await context.setOffline(true);
      await page.reload();
      await search(page).fill('backup email');
      const results = searchHelp(entries, 'backup email');
      await expect(found(page)).toHaveText(t.found(results.length, 'backup email'));
      await list(page).first().click();
      const first = articles.find((one) => one.slug === results[0]?.slug);
      await expect(page.getByRole('heading', { level: 1, name: first?.title ?? '' })).toBeVisible();
      await page.getByRole('link', { name: t.backToHelp }).click();
      await expect(list(page)).toHaveCount(articles.length);
      await page.goto(`/app/help/${MONEY_TIGHT_SLUG}/`);
      await expect(page.getByRole('heading', { level: 1, name: t.moneyTight })).toBeVisible();
      await noAxeProblems(page);
      await context.setOffline(false);
    });

    test('4. The website has the same help for anyone, with links that open beside it', async ({
      page,
    }) => {
      // The website's pages need no plan: nothing of one is read.
      await page.goto('/help/');
      await expect(page.getByRole('heading', { level: 1, name: t.heading })).toBeVisible();
      await expect(page.getByRole('link', { name: t.openApp })).toHaveAttribute('href', '/app/');
      await expect(page.getByRole('link', { name: t.backToMore })).toHaveCount(0);
      await expect(list(page)).toHaveCount(articles.length);
      await search(page).fill('stepchange');
      await expect(list(page).first()).toHaveAttribute('href', `/help/${MONEY_TIGHT_SLUG}/`);
      await noAxeProblems(page);

      await page.goto(`/help/${MONEY_TIGHT_SLUG}/`);
      const article = page.getByTestId('help-article');
      // A phone number can be tapped to call it.
      await expect(article.getByRole('link', { name: '0800 138 1111' })).toHaveAttribute(
        'href',
        'tel:08001381111',
      );
      // Another organisation's website opens beside PrePenny, without saying which page sent it.
      const stepChange = article.getByRole('link', { name: /^stepchange\.org/ });
      await expect(stepChange).toHaveAttribute(
        'href',
        'https://www.stepchange.org/setting-expectations.aspx',
      );
      await expect(stepChange).toHaveAttribute('target', '_blank');
      await expect(stepChange).toHaveAttribute('rel', 'noreferrer noopener');
      await expect(stepChange).toHaveAccessibleName(`stepchange.org, ${t.opensSite}`);
      // Every link is a 44px tap target, phone numbers in a sentence included (DESIGN.md).
      for (const link of await article.getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await noSidewaysScroll(page);
      await noAxeProblems(page);
      if (colorScheme === 'light' && page.viewportSize()?.width === 360) {
        await page.screenshot({ path: `${SCREENS}/website-article.png` });
      }

      // A link to another article stays on the website.
      await page.goto('/help/updating-your-balance/');
      await page.getByRole('link', { name: t.backToHelp }).click();
      await expect(page).toHaveURL(/\/help\/$/);
      expect(page.url()).not.toContain('/app/');
    });
  });

  test.describe(`Home's card when money is tight, in ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('5. Short in three pay periods in a row, from the next one: a calm card under the lowest point', async ({
      page,
    }) => {
      await openHome(page, { plan: shortThreeRunning, today: TIGHT_TODAY });
      await expect(card(page)).toBeVisible();
      await expect(card(page).getByRole('heading', { level: 2 })).toHaveText(
        strings.moneyHelp.title,
      );
      await expect(card(page).getByRole('link', { name: strings.moneyHelp.see })).toBeVisible();
      await expect(
        card(page).getByRole('button', { name: strings.moneyHelp.notNow }),
      ).toBeVisible();
      // Its words and nothing more: no amount, no date, no blame.
      await expect(card(page)).toHaveText(
        `${strings.moneyHelp.title}${strings.moneyHelp.see}${strings.moneyHelp.notNow}`,
      );

      // Under the lowest point, which it never pushes down.
      const lowest = await page.getByTestId('lowest-point').boundingBox();
      const box = await card(page).boundingBox();
      expect(box?.y ?? 0).toBeGreaterThan((lowest?.y ?? 0) + (lowest?.height ?? 0));

      // Calm: the sunk colour, like the bank holiday note, and never Short's red.
      const colours = await card(page).evaluate((element) => {
        const root = getComputedStyle(document.documentElement);
        const probe = document.createElement('div');
        document.body.append(probe);
        const as = (variable: string) => {
          probe.style.color = root.getPropertyValue(variable);
          return getComputedStyle(probe).color;
        };
        const found = {
          background: getComputedStyle(element).backgroundColor,
          sunk: as('--sunk'),
          shortText: as('--short-text'),
          shortBg: as('--short-bg'),
          used: [...element.querySelectorAll('*')].flatMap((one) => [
            getComputedStyle(one).color,
            getComputedStyle(one).backgroundColor,
            getComputedStyle(one).borderTopColor,
          ]),
        };
        probe.remove();
        return found;
      });
      expect(colours.background).toBe(colours.sunk);
      expect(colours.used).not.toContain(colours.shortText);
      expect(colours.used).not.toContain(colours.shortBg);

      await noSidewaysScroll(page);
      await noAxeProblems(page);
      if (shoots(page)) await page.screenshot({ path: `${SCREENS}/home-card.png` });

      // On a 320 by 568 phone, the lowest point still shows without scrolling (D442).
      await page.setViewportSize({ width: page.viewportSize()?.width ?? 320, height: 568 });
      const shown = await page.getByTestId('lowest-point').boundingBox();
      expect((shown?.y ?? 0) + (shown?.height ?? 0)).toBeLessThanOrEqual(568);
      expect(shown?.y).toBe(lowest?.y);

      // "See where to get help" opens Help when money is tight, in the app.
      await card(page).getByRole('link', { name: strings.moneyHelp.see }).click();
      await expect(page).toHaveURL(new RegExp(`/app/help/${MONEY_TIGHT_SLUG}/$`));
      await expect(page.getByRole('heading', { level: 1, name: t.moneyTight })).toBeVisible();
      await noAxeProblems(page);
    });

    test('6. "Not now" hides it for 30 days, on this phone', async ({ page }) => {
      await openHome(page, { plan: shortThreeRunning, today: TIGHT_TODAY });
      const lowest = await onPage(page, 'lowest-point');
      await card(page).getByRole('button', { name: strings.moneyHelp.notNow }).click();
      await expect(card(page)).toHaveCount(0);
      // One line in its place says where help is, with focus on it so it isn't lost.
      const said = page.getByTestId('money-help-said');
      await expect(said).toHaveText(strings.moneyHelp.inMore);
      await expect(said).toBeFocused();
      // Focus may scroll the screen to the line; the lowest point stays where it was on the page.
      expect(await onPage(page, 'lowest-point')).toEqual(lowest);
      await noAxeProblems(page);
      expect(await page.evaluate((key) => localStorage.getItem(key), MONEY_HELP_KEY)).toBe(
        JSON.stringify({ notNowOn: TIGHT_TODAY }),
      );

      // Gone the next time Home opens, and on every day up to Thu 17 Dec.
      await page.reload();
      await expect(page.getByTestId('lowest-point')).toBeVisible();
      await settled(page);
      await expect(card(page)).toHaveCount(0);
      await expect(page.getByTestId('money-help-said')).toHaveCount(0);
      await openHome(page, { today: '2026-12-17' });
      await expect(card(page)).toHaveCount(0);

      // Back on Fri 18 Dec, 30 days later, as the plan is still short three pay
      // periods in a row: now, on Tue 29 Dec and on Fri 29 Jan.
      await openHome(page, { today: '2026-12-18' });
      await expect(card(page)).toBeVisible();
    });

    test('7. Short now and in the next two pay periods: the card shows (Jo)', async ({ page }) => {
      // Short on Fri 20 Nov, now, then up to the 25 Dec and 25 Jan paydays,
      // but not in February's: three in a row from the pay period we're in (D592).
      await openHome(page, { plan: joShortFromNow, today: TIGHT_TODAY });
      await expect(page.getByTestId('lowest-point')).toContainText('£50.00 short on Fri 20 Nov.');
      await expect(card(page)).toBeVisible();
      await expect(card(page).getByRole('heading', { level: 2 })).toHaveText(
        strings.moneyHelp.title,
      );
      await noSidewaysScroll(page);
      await noAxeProblems(page);
    });

    test('8. Never when only two pay periods running are short', async ({ page }) => {
      // Short on Sun 29 Nov and Tue 29 Dec, but not now, nor in the pay period from Thu 28 Jan.
      await openHome(page, { plan: shortTwoOfThree, today: TIGHT_TODAY });
      await expect(page.getByTestId('lowest-point')).toContainText('£30.00 short on Sun 29 Nov.');
      await expect(card(page)).toHaveCount(0);
      await noAxeProblems(page);
    });

    test("9. Never on Sam's example", async ({ page }) => {
      await page.goto('/app/');
      await expect(page.getByTestId('lowest-point')).toBeVisible();
      await settled(page);
      await expect(card(page)).toHaveCount(0);
    });
  });
}
