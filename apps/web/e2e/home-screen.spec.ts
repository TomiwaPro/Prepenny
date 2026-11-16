// Step 4d: adding PrePenny to the home screen (D546 to D551), at 320px and
// 360px, in light and dark, with axe.
//
// 1. Home suggests it on the second day someone uses their own plan, not
//    the first, never on the example, on a phone only; "Not now" ends it
//    for good, with a line saying where the steps are.
// 2. "Show me how" opens the steps, this phone's first, and ends it too.
// 3. Where the browser offers its own install, one tap asks the browser,
//    which PrePenny kept from suggesting it by itself; once added, never again.
// 4. Never while PrePenny is open from the home screen.
// 5. On an iPhone in Safari, "Make my plan" first suggests it, saying a plan
//    made in Safari stays in Safari; then never again. Not on Android, a
//    laptop, or Chrome on an iPhone.
// 6. The steps are always in More, in each phone's own button names.
// 7. A long press of the icon on Android: Update balance and I spent.
// 8. The iPhone's opening screens are in every page's head, and the offline
//    helper doesn't download them to every phone.
//
// The test phones say they're a laptop unless a test says otherwise, so
// every older test runs as before.

import { expect, type Page, test } from '@playwright/test';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { strings } from '../strings/en-GB.ts';
import { settingScript } from './fixtures.ts';
import { noSidewaysScroll } from './journeys.ts';
import {
  expectStep,
  fillAccount,
  lastForm,
  next,
  noAxeProblems,
  skip,
  startSetup,
} from './setup.ts';

const t = strings.homeScreen;
const SCREENS = '../../docs/screens/4d';

const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1';

const DAY_1 = '2026-11-16';
const DAY_2 = '2026-11-17';
const DAY_3 = '2026-11-18';

/** Opens Home of the person's own plan on another day, with the test-only today (D201). */
async function openHomeOn(page: Page, today: string) {
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today }] as const);
  await page.goto('/app/');
  await expect(page.getByTestId('lowest-point')).toBeVisible();
}

/** A plan of one's own, made on setup's screens on day 1: one account, every other screen skipped. */
async function setUpOwnPlan(page: Page) {
  await startSetup(page, DAY_1);
  await fillAccount(lastForm(page, 'account'), {
    name: 'Current account',
    balance: '410',
    warning: '20',
  });
  await next(page);
  await skipToPlan(page);
}

/** From "How you're paid", every screen skipped, then "Go to my plan". */
async function skipToPlan(page: Page) {
  for (const [screen, title] of [
    [2, "How you're paid"],
    [3, 'Home and bills'],
    [4, 'Debts'],
    [5, 'Spending money'],
  ] as const) {
    await expectStep(page, screen, title);
    await skip(page);
  }
  await expectStep(page, 6, "Here's your plan");
  await page.getByRole('button', { name: 'Go to my plan' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByTestId('lowest-point')).toBeVisible();
}

const suggestion = (page: Page) => page.getByTestId('home-screen-suggestion');

/** Chrome's offer to install, as Chrome sends it, with the person's answer. */
async function browserOffers(page: Page, outcome: 'accepted' | 'dismissed') {
  await page.evaluate((answer) => {
    const offer = new Event('beforeinstallprompt', { cancelable: true });
    Reflect.set(offer, 'prompt', async () => {
      Reflect.set(window, '__asked', true);
    });
    Reflect.set(offer, 'userChoice', Promise.resolve({ outcome: answer, platform: 'web' }));
    window.dispatchEvent(offer);
    Reflect.set(window, '__offerKeptBack', offer.defaultPrevented);
  }, outcome);
}

for (const colorScheme of ['light', 'dark'] as const) {
  const shoots = (width: number) => colorScheme === 'light' && width === 320;

  test.describe(`Home screen on an Android phone, ${colorScheme}`, () => {
    test.use({ userAgent: ANDROID, colorScheme });

    test('1. Home suggests it on the second day only, never on the example, and "Not now" ends it', async ({
      page,
    }) => {
      await setUpOwnPlan(page);
      // Day 1: not yet, even opened again.
      await expect(suggestion(page)).toHaveCount(0);
      await page.reload();
      await expect(page.getByTestId('lowest-point')).toBeVisible();
      await expect(suggestion(page)).toHaveCount(0);

      // Day 2: once, under the lowest point.
      await openHomeOn(page, DAY_2);
      await expect(suggestion(page)).toBeVisible();
      await expect(suggestion(page).getByRole('heading')).toHaveText(t.suggest.title);
      await expect(suggestion(page)).toContainText(t.suggest.line);
      await expect(
        suggestion(page).getByRole('button', { name: t.suggest.showMeHow }),
      ).toBeVisible();
      const lowest = await page.getByTestId('lowest-point').boundingBox();
      const card = await suggestion(page).boundingBox();
      expect((card?.y ?? 0) > (lowest?.y ?? 0)).toBe(true);
      await noSidewaysScroll(page);
      await noAxeProblems(page);
      const width = page.viewportSize()?.width ?? 0;
      if (shoots(width))
        await suggestion(page).screenshot({ path: `${SCREENS}/home-suggestion-320-light.png` });

      // Never on Sam's example, on day 2 either.
      await page.goto('/app/more/');
      await page.getByRole('button', { name: strings.more.lookAtExample }).click();
      await expect(page.getByTestId('example-banner')).toBeVisible();
      await expect(suggestion(page)).toHaveCount(0);
      await page.getByTestId('example-banner').getByRole('button').click();
      await expect(page.getByTestId('lowest-point')).toBeVisible();
      await expect(suggestion(page)).toBeVisible();

      // "Not now": gone, and a line in its place says where the steps are, with focus on it.
      await suggestion(page).getByRole('button', { name: t.suggest.notNow }).click();
      await expect(suggestion(page)).toHaveCount(0);
      await expect(page.getByTestId('home-screen-said')).toHaveText(t.suggest.inMore);
      await expect(page.getByTestId('home-screen-said')).toBeFocused();
      await noAxeProblems(page);

      // Never again: that day, or any later one.
      await page.reload();
      await expect(page.getByTestId('lowest-point')).toBeVisible();
      await expect(suggestion(page)).toHaveCount(0);
      await expect(page.getByTestId('home-screen-said')).toHaveCount(0);
      await openHomeOn(page, DAY_3);
      await expect(suggestion(page)).toHaveCount(0);
    });

    test('2. "Show me how" opens the steps, Android first, and ends the suggestion', async ({
      page,
    }) => {
      await setUpOwnPlan(page);
      await openHomeOn(page, DAY_2);
      await suggestion(page).getByRole('button', { name: t.suggest.showMeHow }).click();
      const sheet = page.getByRole('dialog', { name: t.heading });
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(t.purpose);
      const lists = sheet.locator('[data-testid^="steps-"]');
      await expect(lists).toHaveCount(2);
      await expect(lists.first()).toHaveAttribute('data-testid', 'steps-android');
      await expect(sheet.getByTestId('steps-android').getByRole('listitem')).toHaveText([
        ...t.android.steps,
      ]);
      // Numbered, as they're followed in order.
      expect(
        await sheet
          .getByTestId('steps-android')
          .getByRole('list')
          .evaluate((list) => getComputedStyle(list).listStyleType),
      ).toBe('decimal');
      // No sign-up line on Android: the plan isn't kept apart there.
      await expect(sheet.getByTestId('sign-up-first')).toHaveCount(0);
      await noAxeProblems(page);
      const width = page.viewportSize()?.width ?? 0;
      if (shoots(width))
        await page.screenshot({ path: `${SCREENS}/sheet-steps-android-320-light.png` });

      await sheet.getByRole('button', { name: strings.sheet.close }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByTestId('home-screen-said')).toHaveText(t.suggest.inMore);
      await expect(page.getByTestId('home-screen-said')).toBeFocused();
      await openHomeOn(page, DAY_3);
      await expect(suggestion(page)).toHaveCount(0);
    });

    test("3. where the browser offers its own install, one tap asks it, and once added it's never suggested again", async ({
      page,
    }) => {
      await setUpOwnPlan(page);
      await openHomeOn(page, DAY_2);
      await expect(suggestion(page)).toBeVisible();
      await browserOffers(page, 'accepted');
      // PrePenny kept Chrome from suggesting it by itself, and asks with its own button.
      expect(await page.evaluate(() => Reflect.get(window, '__offerKeptBack'))).toBe(true);
      const add = suggestion(page).getByRole('button', { name: t.addNow });
      await expect(add).toBeVisible();
      await expect(suggestion(page).getByRole('button', { name: t.suggest.showMeHow })).toHaveCount(
        0,
      );
      await noAxeProblems(page);
      await add.click();
      expect(await page.evaluate(() => Reflect.get(window, '__asked'))).toBe(true);
      await expect(page.getByTestId('home-screen-said')).toHaveText(t.added);
      await openHomeOn(page, DAY_3);
      await expect(suggestion(page)).toHaveCount(0);

      // Under More, the browser's own install is offered too, and a "no" says so.
      await page.goto('/app/home-screen/');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.heading);
      await browserOffers(page, 'dismissed');
      await page.getByRole('button', { name: t.addNow }).click();
      await expect(page.getByTestId('install-said')).toHaveText(t.notAdded);
      await noAxeProblems(page);
    });

    test('4. never while PrePenny is open from the home screen, and More says so', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const real = window.matchMedia.bind(window);
        window.matchMedia = (query: string) =>
          query.includes('display-mode: standalone')
            ? ({ ...real(query), matches: true, media: query } as MediaQueryList)
            : real(query);
      });
      await setUpOwnPlan(page);
      await openHomeOn(page, DAY_2);
      await expect(suggestion(page)).toHaveCount(0);
      await page.goto('/app/more/');
      await expect(page.getByTestId('home-screen')).toContainText(t.more.lineAdded);
      await page.getByRole('link', { name: new RegExp(`^${t.more.link}`) }).click();
      await expect(page.getByTestId('on-home-screen')).toHaveText(t.usingApp);
      await noAxeProblems(page);
    });

    test('7. a long press of the icon offers Update balance and I spent, each opening its sheet', async ({
      page,
    }) => {
      const details = await (await page.request.get('/manifest.webmanifest')).json();
      expect(
        details.shortcuts.map((one: { name: string; url: string }) => [one.name, one.url]),
      ).toEqual([
        [strings.actions.updateBalance, '/app/#update-balance'],
        [strings.actions.spent, '/app/#i-spent'],
      ]);
      await setUpOwnPlan(page);
      await page.goto('/app/#update-balance');
      await expect(page.getByRole('dialog', { name: strings.actions.updateBalance })).toBeVisible();
      // The address loses it, so opening PrePenny again doesn't open it a second time.
      await expect(page).toHaveURL(/\/app\/$/);
      await noAxeProblems(page);
      await page.goto('/app/#i-spent');
      await expect(page.getByRole('dialog', { name: strings.actions.spent })).toBeVisible();
      await expect(page).toHaveURL(/\/app\/$/);
    });
  });

  test.describe(`Home screen on an iPhone in Safari, ${colorScheme}`, () => {
    test.use({ userAgent: IPHONE_SAFARI, colorScheme });

    test('5. "Make my plan" suggests it first, saying a plan made in Safari stays in Safari; then never again', async ({
      page,
    }) => {
      await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today: DAY_1 }] as const);
      await page.goto('/setup/');
      const make = page.getByRole('button', { name: 'Make my plan' });
      await make.click();
      const sheet = page.getByRole('dialog', { name: t.before.title });
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(t.before.intro);
      await noAxeProblems(page);
      const width = page.viewportSize()?.width ?? 0;
      if (shoots(width))
        await page.screenshot({ path: `${SCREENS}/before-setup-iphone-320-light.png` });

      // Closed without an answer: setup hasn't started, and it's asked again.
      await sheet.getByRole('button', { name: strings.sheet.close }).click();
      await expect(sheet).toBeHidden();
      await expect(page).toHaveURL(/\/setup\/$/);
      await make.click();
      await expect(sheet).toBeVisible();

      // "Show me how": the steps, the iPhone's first, with Apple's own button names.
      await sheet.getByRole('button', { name: t.before.showMeHow }).click();
      await expect(sheet.getByTestId('install-before-setup-steps')).toBeFocused();
      const lists = sheet.locator('[data-testid^="steps-"]');
      await expect(lists.first()).toHaveAttribute('data-testid', 'steps-iphone');
      await expect(sheet.getByTestId('steps-iphone').getByRole('listitem')).toHaveText([
        ...t.iphone.steps,
      ]);
      await noAxeProblems(page);
      if (shoots(width))
        await page.screenshot({ path: `${SCREENS}/sheet-steps-iphone-320-light.png` });

      // Or setup here in Safari.
      await sheet.getByRole('button', { name: t.before.makeHere }).click();
      await expectStep(page, 1, 'Your account');

      // Answered: never again, before setup or on Home on the second day.
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.getByRole('button', { name: 'Carry on making my plan' }).click();
      await expectStep(page, 1, 'Your account');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await fillAccount(lastForm(page, 'account'), {
        name: 'Current account',
        balance: '410',
        warning: '20',
      });
      await next(page);
      await skipToPlan(page);
      await openHomeOn(page, DAY_2);
      await expect(suggestion(page)).toHaveCount(0);
    });

    test('6. the steps under More, the iPhone first, with "sign up first" for a plan only in Safari', async ({
      page,
    }) => {
      await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today: DAY_1 }] as const);
      await page.goto('/setup/');
      await page.getByRole('button', { name: 'Make my plan' }).click();
      await page.getByRole('button', { name: t.before.makeHere }).click();
      await expectStep(page, 1, 'Your account');
      await fillAccount(lastForm(page, 'account'), {
        name: 'Current account',
        balance: '410',
        warning: '20',
      });
      await next(page);
      await skipToPlan(page);

      await page.goto('/app/more/');
      const card = page.getByTestId('home-screen');
      await expect(card.getByRole('heading')).toHaveText(t.more.heading);
      await expect(card).toContainText(t.more.line);
      await card.getByRole('link').click();
      await expect(page).toHaveURL(/\/app\/home-screen\/$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.heading);
      await expect(page.getByText(t.purpose, { exact: true })).toBeVisible();
      const lists = page.locator('[data-testid^="steps-"]');
      await expect(lists.first()).toHaveAttribute('data-testid', 'steps-iphone');
      await expect(page.getByTestId('steps-iphone')).toContainText(t.iphone.notes[1] ?? '');
      // A plan only in Safari: sign up first, so it comes along.
      const signUp = page.getByTestId('sign-up-first');
      await expect(signUp).toContainText(t.iphone.signUpFirst);
      await expect(signUp.getByRole('link', { name: t.iphone.signUp })).toHaveAttribute(
        'href',
        '/sign-in/?to=sign-up&from=more',
      );
      await noSidewaysScroll(page);
      await noAxeProblems(page);
      const width = page.viewportSize()?.width ?? 0;
      if (shoots(width)) {
        await page
          .getByTestId('home-screen-steps')
          .screenshot({ path: `${SCREENS}/more-steps-iphone-320-light.png` });
      }
    });
  });

  test.describe(`No suggestion before setup elsewhere, ${colorScheme}`, () => {
    test.use({ colorScheme });

    for (const [phone, userAgent] of [
      ['an Android phone', ANDROID],
      ['Chrome on an iPhone', IPHONE_CHROME],
      ['a laptop', undefined],
    ] as const) {
      test(`5. on ${phone}, "Make my plan" starts setup straight away`, async ({ browser }) => {
        const context = await browser.newContext({
          ...(userAgent === undefined ? {} : { userAgent }),
          colorScheme,
          viewport: { width: 360, height: 780 },
        });
        const page = await context.newPage();
        await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today: DAY_1 }] as const);
        await page.goto('/setup/');
        await page.getByRole('button', { name: 'Make my plan' }).click();
        await expectStep(page, 1, 'Your account');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await context.close();
      });
    }

    test('1. a laptop is never asked on Home either', async ({ page }) => {
      await setUpOwnPlan(page);
      await openHomeOn(page, DAY_2);
      await expect(suggestion(page)).toHaveCount(0);
      // The steps are still in More, Android first.
      await page.goto('/app/home-screen/');
      await expect(page.locator('[data-testid^="steps-"]').first()).toHaveAttribute(
        'data-testid',
        'steps-android',
      );
      await expect(page.getByTestId('sign-up-first')).toHaveCount(0);
      await noAxeProblems(page);
    });
  });
}

test.describe('8. the opening screens on an iPhone', () => {
  test("are in every page's head, and the offline helper doesn't download them to every phone", async ({
    page,
  }) => {
    await page.goto('/setup/');
    const links = page.locator('link[rel="apple-touch-startup-image"]');
    await expect(links).toHaveCount(26);
    const first = await links.first().getAttribute('href');
    expect(first).toBe('/splash/iphone-1320x2868-light.png');
    const picture = await page.request.get(first ?? '');
    expect(picture.status()).toBe(200);
    expect(picture.headers()['content-type']).toBe('image/png');
    const helper = await (await page.request.get('/sw.js')).text();
    expect(helper).not.toContain('splash/');
  });
});
