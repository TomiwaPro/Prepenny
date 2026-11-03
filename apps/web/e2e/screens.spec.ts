// Screenshots for checking the look, at twice the pixels, as a phone shows
// them. Step 2b: Home at 360px wide in light and dark, and 320px in light.
// Step 2c: the Plan screen at 360px in light and dark, and the edit sheet
// open on Rent at 360px in light. Each page is as tall as the whole page,
// with the bottom navigation at the bottom. Run only when asked:
//
//   SCREENS=1 pnpm e2e --project phone-360 screens

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const screens = join(import.meta.dirname, '..', '..', '..', 'docs', 'screens');
const folder = join(screens, '2b');

const shots = [
  { file: 'home-360-light.png', width: 360, colorScheme: 'light' },
  { file: 'home-360-dark.png', width: 360, colorScheme: 'dark' },
  { file: 'home-320-light.png', width: 320, colorScheme: 'light' },
] as const;

test.skip(process.env.SCREENS === undefined, 'Screenshots are taken only when asked.');

for (const shot of shots) {
  test(`Home at ${shot.width}px in ${shot.colorScheme} mode`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: shot.colorScheme,
      locale: 'en-GB',
    });
    const page = await context.newPage();
    await page.goto('/app/');
    await expect(page.getByTestId('balance')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: shot.width, height });
    mkdirSync(folder, { recursive: true });
    await page.screenshot({ path: join(folder, shot.file) });
    await context.close();
  });
}

const planShots = [
  { file: 'plan-360-light.png', colorScheme: 'light', sheet: false },
  { file: 'plan-360-dark.png', colorScheme: 'dark', sheet: false },
  { file: 'edit-sheet-360-light.png', colorScheme: 'light', sheet: true },
] as const;

for (const shot of planShots) {
  test(`Step 2c: ${shot.file}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: shot.colorScheme,
      reducedMotion: 'reduce',
      locale: 'en-GB',
    });
    const page = await context.newPage();
    await page.goto('/app/plan/');
    await expect(page.getByTestId('period').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const step = join(screens, '2c');
    mkdirSync(step, { recursive: true });
    if (shot.sheet) {
      await page
        .locator('[data-testid="period"][data-start="2026-10-30"]')
        .getByRole('button', { name: /^Rent / })
        .click();
      await expect(page.getByRole('dialog', { name: 'Rent' })).toBeVisible();
      await page.screenshot({ path: join(step, shot.file) });
    } else {
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: 360, height });
      await page.screenshot({ path: join(step, shot.file) });
    }
    await context.close();
  });
}
