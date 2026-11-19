// The 60-second tour of Home (step 4h, D597, the owner's answer: offer it,
// don't force it), at 320px and 360px wide, in light and dark, checked by
// axe: the card once after setup, under the lowest point and the help
// card; "Show me", "No thanks" and finishing; the tour itself, with Next,
// Back and End tour on every step; replaying it from More; the keyboard, a
// screen reader's names and reduced motion; and nothing recorded beyond
// what hides the card (D598).

import { mkdirSync } from 'node:fs';
import { test as fresh, type Page } from '@playwright/test';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { strings } from '../strings/en-GB.ts';
import { expect, settingScript, test } from './fixtures.ts';
import { shortThreeRunning, TIGHT_TODAY } from './money-tight-plans.ts';
import { noAxeProblems } from './setup.ts';
import { makeAPlan } from './sign-in-helpers.ts';
import { openMore } from './two-phones.ts';

const t = strings.tour;
const SCREENS = '../../docs/screens/4h';
const day = (words: string) => words.replaceAll(' ', ' ');

/** The tour's five steps on the plan setup makes in these tests: £267.54 today, nothing planned. */
const STEPS = [
  {
    target: '[data-tour="balance"]',
    title: t.balance.title,
    text: t.balance.text('Current account'),
  },
  {
    target: '[data-testid="lowest-point"]',
    title: t.lowest.title,
    text: `${t.lowest.text('£267.54', day('Sun 25 Oct'))} ${t.lowest.why}`,
  },
  { target: '[data-testid="next-due"]', title: t.nextDue.title, text: t.nextDue.text },
  { target: '[data-tour="actions"]', title: t.actions.title, text: t.actions.text },
  { target: '[data-tour="nav"]', title: t.nav.title, text: t.nav.text },
] as const;

const card = (page: Page) => page.getByTestId('tour-card');
const tour = (page: Page) => page.getByRole('dialog', { name: /^Tour of Home/ });
const button = (page: Page, name: string) => tour(page).getByRole('button', { name, exact: true });

/** What the phone keeps for PrePenny in its small stores. */
const kept = (page: Page) =>
  page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.includes('tour'))),
    session: Object.keys(sessionStorage).sort(),
  }));

/** Checks the step showing: its words, its buttons, the part of Home it's about, ringed and in view, and the panel out of its way. */
async function onStep(page: Page, index: number) {
  const step = STEPS[index] as (typeof STEPS)[number];
  const dialog = tour(page);
  await expect(dialog).toHaveAccessibleName(`Tour of Home ${t.step(index + 1, 5)} ${step.title}`);
  await expect(dialog).toHaveAccessibleDescription(step.text);
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(step.title);
  await expect(dialog.getByText(step.text, { exact: true })).toBeVisible();
  // Next (Done on the last), Back and End tour on every step; Back can't go before the first.
  await expect(button(page, t.back)).toBeVisible();
  if (index === 0) await expect(button(page, t.back)).toBeDisabled();
  else await expect(button(page, t.back)).toBeEnabled();
  await expect(button(page, index === 4 ? t.done : t.next)).toBeVisible();
  await expect(button(page, t.end)).toBeVisible();
  // The step's words have focus, so a screen reader reads them.
  await expect(dialog.locator('[tabindex="-1"]')).toBeFocused();
  // Its part of Home is ringed, and its start is on screen, clear of the panel.
  await expect(page.locator('[data-tour-here]')).toHaveCount(1);
  await expect(page.locator(step.target)).toHaveAttribute('data-tour-here', '');
  await expect
    .poll(() =>
      page.evaluate((target) => {
        const part = document.querySelector(target)?.getBoundingClientRect();
        const panel = document.querySelector('[data-testid="tour"]')?.getBoundingClientRect();
        if (part === undefined || panel === undefined) return 'missing';
        const start = { top: part.top, bottom: Math.min(part.bottom, part.top + 40) };
        if (start.top < 0 || start.bottom > window.innerHeight) return 'off screen';
        const clear = start.bottom <= panel.top || start.top >= panel.bottom;
        return clear ? 'clear' : 'under the panel';
      }, step.target),
    )
    .toBe('clear');
}

for (const colorScheme of ['light', 'dark'] as const) {
  const shoots = (page: Page) => colorScheme === 'light' && page.viewportSize()?.width === 320;

  fresh.describe(`The tour of Home, after setup, in ${colorScheme} mode`, () => {
    fresh.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      mkdirSync(SCREENS, { recursive: true });
    });

    fresh(
      '1. After setup, the card shows under the lowest point; "No thanks" takes it away for good',
      async ({ page }) => {
        await makeAPlan(page);
        await expect(card(page)).toBeVisible();
        await expect(card(page).getByRole('heading', { level: 2 })).toHaveText(t.card);
        await expect(card(page).getByRole('button', { name: t.showMe })).toBeVisible();
        await expect(card(page).getByRole('button', { name: t.noThanks })).toBeVisible();
        // Under the lowest point, never above it.
        const lowest = await page.getByTestId('lowest-point').boundingBox();
        const offered = await card(page).boundingBox();
        expect(offered?.y ?? 0).toBeGreaterThan((lowest?.y ?? 0) + (lowest?.height ?? 0));
        await noAxeProblems(page);
        if (shoots(page)) await page.screenshot({ path: `${SCREENS}/tour-card.png` });

        const before = await kept(page);
        await card(page).getByRole('button', { name: t.noThanks }).click();
        const said = page.getByTestId('tour-card-said');
        await expect(said).toHaveText(t.inMore);
        await expect(said).toBeFocused();
        await expect(card(page)).toHaveCount(0);
        await noAxeProblems(page);
        // Kept on this phone: only that the card has gone.
        expect(before.local).toEqual({});
        expect(await kept(page)).toEqual({
          local: { 'prepenny-tour': 'card-gone' },
          session: before.session,
        });
        // For good: not after loading Home afresh either, and the line has gone too.
        await page.reload();
        await expect(page.getByTestId('lowest-point')).toBeVisible();
        await expect(card(page)).toHaveCount(0);
        await expect(said).toHaveCount(0);
      },
    );

    fresh(
      '2. "Show me": five steps around Home, with Next, Back and End tour; End tour keeps the card, and finishing takes it away',
      async ({ page }) => {
        test.slow();
        await makeAPlan(page);
        const showMe = card(page).getByRole('button', { name: t.showMe });
        await showMe.click();
        await onStep(page, 0);
        await noAxeProblems(page);
        if (shoots(page)) await page.screenshot({ path: `${SCREENS}/tour-step-1.png` });
        await button(page, t.next).click();
        await onStep(page, 1);
        if (shoots(page)) await page.screenshot({ path: `${SCREENS}/tour-step-2.png` });
        await button(page, t.back).click();
        await onStep(page, 0);
        // End tour: it closes, the card stays, and focus goes back to "Show me".
        await button(page, t.next).click();
        await onStep(page, 1);
        await button(page, t.end).click();
        await expect(tour(page)).toHaveCount(0);
        await expect(page.locator('[data-tour-here]')).toHaveCount(0);
        await expect(showMe).toBeFocused();
        await expect(card(page)).toBeVisible();
        expect((await kept(page)).local).toEqual({});

        // Again, from the start, to the end.
        await showMe.click();
        for (let index = 0; index < 5; index += 1) {
          await onStep(page, index);
          if (index === 3 && shoots(page)) {
            await page.screenshot({ path: `${SCREENS}/tour-step-4.png` });
          }
          if (index < 4) await button(page, t.next).click();
        }
        await noAxeProblems(page);
        if (shoots(page)) await page.screenshot({ path: `${SCREENS}/tour-step-5.png` });
        await button(page, t.done).click();
        await expect(tour(page)).toHaveCount(0);
        const said = page.getByTestId('tour-card-said');
        await expect(said).toHaveText(t.inMore);
        await expect(said).toBeFocused();
        // The same is kept as for "No thanks", so nothing says the tour was taken.
        expect((await kept(page)).local).toEqual({ 'prepenny-tour': 'card-gone' });
        await page.reload();
        await expect(page.getByTestId('lowest-point')).toBeVisible();
        await expect(card(page)).toHaveCount(0);
      },
    );

    fresh(
      '3. With the keyboard and a screen reader: Enter, Tab and Escape, each step read out',
      async ({ page }) => {
        await makeAPlan(page);
        await card(page).getByRole('button', { name: t.showMe }).focus();
        await page.keyboard.press('Enter');
        await onStep(page, 0);
        // Tab goes Next, then End tour (Back can't be used on the first step).
        await page.keyboard.press('Tab');
        await expect(button(page, t.next)).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(button(page, t.end)).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Enter');
        await onStep(page, 1);
        await page.keyboard.press('Tab');
        await expect(button(page, t.back)).toBeFocused();
        await page.keyboard.press('Enter');
        await onStep(page, 0);
        // Escape ends it, and focus goes back to "Show me".
        await page.keyboard.press('Escape');
        await expect(tour(page)).toHaveCount(0);
        await expect(card(page).getByRole('button', { name: t.showMe })).toBeFocused();
        await expect(card(page)).toBeVisible();
      },
    );

    fresh(
      '4. With reduced motion, nothing moves: no rise as it opens, and each part comes into view at once',
      async ({ page }) => {
        await makeAPlan(page);
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await card(page).getByRole('button', { name: t.showMe }).click();
        await onStep(page, 0);
        expect(await tour(page).evaluate((dialog) => getComputedStyle(dialog).animationName)).toBe(
          'none',
        );
        await button(page, t.next).click();
        await button(page, t.next).click();
        // At once: in the very next frame, the part is where it stays.
        const top = () =>
          page.evaluate(
            () =>
              new Promise<number>((resolve) =>
                requestAnimationFrame(() =>
                  resolve(
                    document.querySelector('[data-tour-here]')?.getBoundingClientRect().top ?? -1,
                  ),
                ),
              ),
          );
        const first = await top();
        await page.waitForTimeout(800);
        expect(await top()).toBe(first);
        expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
        await onStep(page, 2);
      },
    );

    fresh(
      '5. Replayed any time from More, under Help, after the card has gone',
      async ({ page }) => {
        await makeAPlan(page);
        await card(page).getByRole('button', { name: t.noThanks }).click();
        await openMore(page);
        const help = page.getByRole('navigation', { name: strings.help.moreHeading });
        const link = help.getByRole('link', { name: new RegExp(`^${t.moreLabel}`) });
        await expect(link).toContainText(t.moreLine);
        await expect(link).toHaveAttribute('href', '/app/#tour');
        await noAxeProblems(page);
        await link.click();
        await onStep(page, 0);
        // The address loses "#tour", so going back or opening Home again doesn't start it again.
        await expect(page).toHaveURL(/\/app\/$/);
        for (let index = 0; index < 4; index += 1) await button(page, t.next).click();
        await button(page, t.done).click();
        await expect(tour(page)).toHaveCount(0);
        // With the card gone already, focus goes to the top of Home.
        await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeFocused();
      },
    );

    fresh(
      '5b. A quick Tab while a step comes into view is never pulled back to its words (D616)',
      async ({ page }) => {
        await makeAPlan(page);
        // The step's part of Home takes as long as it can to come into view
        // (no scroll, so the tour waits its longest), as on a slow phone.
        await page.evaluate(() => {
          window.scrollTo = () => {};
        });
        await card(page).getByRole('button', { name: t.showMe }).focus();
        await page.keyboard.press('Enter');
        await expect(tour(page)).toBeVisible();
        // Straight away, as someone who knows where they're going would.
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        const where = () =>
          page.evaluate(() => {
            const now = document.activeElement;
            return now === null ? '' : `${now.tagName} ${now.textContent ?? ''}`;
          });
        const tabbedTo = await where();
        expect(tabbedTo).toMatch(/^BUTTON /);
        // Once the tour has waited for the part to come into view, focus is
        // still where the keyboard put it.
        await page.waitForTimeout(1200);
        expect(await where()).toBe(tabbedTo);
      },
    );
  });

  test.describe(`The tour card's place, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test("6. Under the free-help card too, never above it; never on Sam's example, which can still take the tour from More", async ({
      page,
    }) => {
      await page.goto('/app/');
      await expect(page.getByTestId('lowest-point')).toBeVisible();
      await expect(page.getByText(strings.banners.example, { exact: true })).toBeVisible();
      await expect(card(page)).toHaveCount(0);
      await page.goto('/app/#tour');
      await expect(tour(page)).toBeVisible();
      await expect(tour(page).getByRole('heading', { level: 2 })).toHaveText(t.balance.title);
      await page.keyboard.press('Escape');

      // A plan short three pay periods in a row: the help card, then the tour card.
      await page.addInitScript(settingScript, [
        TEST_SETTING_KEY,
        { plan: shortThreeRunning, today: TIGHT_TODAY },
      ] as const);
      await page.goto('/app/');
      await expect(page.getByTestId('money-help')).toBeVisible();
      await expect(card(page)).toBeVisible();
      const order = await page.evaluate(() =>
        ['lowest-point', 'money-help', 'tour-card'].map(
          (id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? 0,
        ),
      );
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      await noAxeProblems(page);
    });
  });
}
