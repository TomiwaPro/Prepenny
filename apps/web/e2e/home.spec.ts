// Home with Sam's example plan, on Sun 25 Oct 2026 (D133), at 320px and 360px
// wide (D37): every figure from brief 4.9 and the Home sketch in
// ARCHITECTURE.md 4.6, no sideways scrolling, text at 200%, reduced motion,
// and WCAG 2.2 AA checked by axe in light and dark.

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const MINUS = '−';

async function openHome(page: Page) {
  await page.goto('/app/');
  await expect(page.getByTestId('balance')).toBeVisible();
}

/** Nothing wider than the screen: no sideways scrolling. */
async function sidewaysScroll(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return { scrollWidth: root.scrollWidth, width: root.clientWidth };
  });
}

/** Every element that sticks out past either side of the screen. */
async function outsideTheScreen(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const found: string[] = [];
    for (const element of document.body.querySelectorAll('*')) {
      if (element.closest('.visually-hidden, dialog:not([open])')) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (box.left < -1 || box.right > width + 1) {
        found.push(
          `${element.tagName.toLowerCase()} "${element.textContent?.trim().slice(0, 30)}"`,
        );
      }
    }
    return found;
  });
}

/** Text cut off inside its own box. */
async function clippedText(page: Page) {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const element of document.body.querySelectorAll(
      'p, h1, h2, h3, span, a, button, dt, dd',
    )) {
      if (element.closest('.visually-hidden, dialog:not([open]), svg')) continue;
      const style = getComputedStyle(element);
      const hides = style.overflowX !== 'visible' || style.textOverflow === 'ellipsis';
      if (hides && element.scrollWidth > element.clientWidth + 1) {
        found.push(element.textContent?.trim().slice(0, 30) ?? '');
      }
    }
    return found;
  });
}

async function expectEveryFigure(page: Page) {
  await expect(page.getByTestId('example-banner')).toHaveText(
    'This is an example plan. Nothing here is yours.',
  );

  // Current account £267.54, "Checked today, Sun 25 Oct".
  await expect(page.getByRole('heading', { name: 'Current account' })).toBeVisible();
  await expect(page.getByTestId('balance')).toHaveText('£267.54');
  await expect(page.getByText('Checked today, Sun 25 Oct', { exact: true })).toBeVisible();

  // Left to spend until Fri 30 Oct £30.00, with the D3 line.
  await expect(page.getByRole('heading', { name: 'Left to spend until Fri 30 Oct' })).toBeVisible();
  await expect(page.getByTestId('left-to-spend')).toHaveText('£30.00');
  await expect(
    page.getByText('Spend no more than £22.54 to keep at least £20 until Fri 30 Oct.', {
      exact: true,
    }),
  ).toBeVisible();

  // Lowest point ahead £4.53, Sun 1 Nov, after Rent, Tight, under £20 from Mon 26 Oct.
  const lowest = page.getByTestId('lowest-point');
  await expect(lowest.getByRole('heading')).toHaveText('Lowest point ahead');
  await expect(lowest.getByText('Tight', { exact: true })).toBeVisible();
  await expect(lowest.getByText('£4.53', { exact: true })).toBeVisible();
  await expect(lowest.getByText('Sun 1 Nov, after Rent', { exact: true })).toBeVisible();
  await expect(lowest.getByText('Under £20 from Mon 26 Oct.', { exact: true })).toBeVisible();

  // This pay has to cover: going out by Thu 29 Oct £721.07, coming in £500.00.
  const cover = page.getByTestId('this-pay');
  await expect(cover.getByRole('heading')).toHaveText('This pay has to cover');
  await expect(cover.getByRole('term')).toHaveText(['Going out by Thu 29 Oct', 'Coming in']);
  await expect(cover.getByRole('definition')).toHaveText(['£721.07', '£500.00']);

  // The next three due, with what's left after each.
  const due = page.getByTestId('next-due');
  await expect(due.getByRole('heading')).toHaveText('Next due');
  const rows = due.getByRole('listitem');
  await expect(rows).toHaveCount(3);
  const expected = [
    ['Spending money until payday', 'Sun 25 Oct', `${MINUS}£30.00`, '£237.54 left', null],
    ['Family loan', 'Mon 26 Oct', `${MINUS}£125.00`, '£112.54 left', null],
    ['Driving lesson', 'Mon 26 Oct', `${MINUS}£100.00`, '£12.54 left', 'Tight'],
  ] as const;
  for (const [index, [name, date, amount, left, status]] of expected.entries()) {
    const row = rows.nth(index);
    await expect(row.getByText(name, { exact: true })).toBeVisible();
    await expect(row.getByText(date, { exact: true })).toBeVisible();
    await expect(row.getByText(amount, { exact: true })).toBeVisible();
    await expect(row.getByText(left, { exact: true })).toBeVisible();
    if (status === null) await expect(row.getByText('Tight', { exact: true })).toHaveCount(0);
    else await expect(row.getByText(status, { exact: true })).toBeVisible();
  }

  // The four actions.
  for (const name of ['Update balance', 'Add a payment', 'I spent', 'I did overtime']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
}

test.describe('Home, with Sam’s example plan', () => {
  test('shows every figure exactly', async ({ page }) => {
    await openHome(page);
    await expectEveryFigure(page);
    await expect(page).toHaveTitle('Home, PrePenny');
  });

  test('has no sideways scrolling, on Home or any other page', async ({ page }) => {
    for (const path of ['/', '/app/', '/app/plan/', '/app/debts/', '/app/more/', '/app/parts/']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const { scrollWidth, width } = await sidewaysScroll(page);
      expect(scrollWidth, path).toBeLessThanOrEqual(width);
      expect(await outsideTheScreen(page), path).toEqual([]);
    }
  });

  test('stays readable with text at 200%, without breaking', async ({ page }) => {
    await openHome(page);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    const size = await page
      .getByText('Lowest point ahead')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(size).toBe(28);
    await expectEveryFigure(page);
    const { scrollWidth, width } = await sidewaysScroll(page);
    expect(scrollWidth).toBeLessThanOrEqual(width);
    expect(await outsideTheScreen(page)).toEqual([]);
    expect(await clippedText(page)).toEqual([]);
  });

  test('keeps the actions 2 by 2, on a phone and on a laptop', async ({ page }) => {
    for (const width of [page.viewportSize()?.width ?? 360, 480, 1024]) {
      await page.setViewportSize({ width, height: 800 });
      await openHome(page);
      const tops = await page
        .getByRole('region', { name: 'Quick actions' })
        .getByRole('button')
        .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
      expect(tops, `${width}px`).toHaveLength(4);
      expect(new Set(tops).size, `${width}px`).toBe(2);
    }
  });

  test('each action opens its own sheet, and closes', async ({ page }) => {
    await openHome(page);
    for (const name of ['Update balance', 'Add a payment', 'I spent', 'I did overtime']) {
      await page.getByRole('button', { name, exact: true }).click();
      const sheet = page.getByRole('dialog', { name });
      await expect(sheet).toBeVisible();
      // The sheets themselves are tested in actions.spec.ts (step 2d).
      await expect(sheet.getByText('This part is still being built.')).toHaveCount(0);
      await sheet.getByRole('button', { name: 'Close' }).click();
      await expect(sheet).toBeHidden();
    }
    // Escape closes it too, and focus goes back to the button.
    await page.getByRole('button', { name: 'I spent', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'I spent' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('button', { name: 'I spent', exact: true })).toBeFocused();
  });

  test('shows the shapes of its cards, never a spinner, while the plan is worked out', async ({
    page,
  }) => {
    // A worker that never answers keeps Home waiting.
    await page.addInitScript(() => {
      class Waiting {
        postMessage() {}
        addEventListener() {}
        terminate() {}
      }
      Object.defineProperty(window, 'Worker', { value: Waiting });
    });
    await page.goto('/app/');
    await expect(page.getByTestId('home-skeleton')).toBeVisible();
    await expect(page.getByTestId('balance')).toHaveCount(0);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(1);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.getByText('Working out your plan.')).toBeAttached();
  });

  test('moves nothing when the phone asks for reduced motion', async ({ page }) => {
    const sheetAnimation = () =>
      page.getByRole('dialog').evaluate((element) => getComputedStyle(element).animationName);
    const skeletonAnimation = () =>
      page
        .getByTestId('home-skeleton')
        .locator('[aria-hidden="true"]')
        .first()
        .evaluate((element) => getComputedStyle(element).animationName);

    // With motion allowed, the sheet rises into view and the skeleton pulses:
    // proof the checks below mean something.
    await openHome(page);
    await page.getByRole('button', { name: 'Add a payment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await sheetAnimation()).not.toBe('none');
    await page.goto('/app/parts/');
    await expect(page.getByTestId('home-skeleton')).toBeVisible();
    expect(await skeletonAnimation()).not.toBe('none');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHome(page);
    await page.getByRole('button', { name: 'Add a payment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await sheetAnimation()).toBe('none');
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await page.goto('/app/parts/');
    await expect(page.getByTestId('home-skeleton')).toBeVisible();
    expect(await skeletonAnimation()).toBe('none');
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test('uses tabular figures and the self-hosted font, and asks nothing of any other site', async ({
    page,
  }) => {
    const others: string[] = [];
    const fonts: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:4173/')) others.push(request.url());
      if (request.url().endsWith('.woff2')) fonts.push(request.url());
    });
    await openHome(page);
    await page.evaluate(() => document.fonts.ready);
    expect(others).toEqual([]);
    expect(fonts.length).toBeGreaterThan(0);
    const balance = page.getByTestId('balance');
    expect(await balance.evaluate((element) => getComputedStyle(element).fontVariantNumeric)).toBe(
      'lining-nums tabular-nums',
    );
    // The balance's font is Figtree, and Figtree's bold face has really loaded.
    const family = await balance.evaluate((element) => getComputedStyle(element).fontFamily);
    expect(family.toLowerCase()).toContain('figtree');
    const loaded = await page.evaluate(() =>
      [...document.fonts]
        .filter((face) => /figtree/i.test(face.family) && face.status === 'loaded')
        .map((face) => face.weight),
    );
    expect(loaded).toContain('700');
  });
});

test.describe('Accessibility: WCAG 2.2 AA with axe', () => {
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`Home has no problems in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openHome(page);
      expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
      await page.getByRole('button', { name: 'Update balance' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
    });

    test(`every other page has no problems in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      for (const path of ['/', '/app/plan/', '/app/debts/', '/app/more/', '/app/parts/']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const results = await new AxeBuilder({ page }).withTags(tags).analyze();
        expect(results.violations, path).toEqual([]);
      }
    });
  }
});
