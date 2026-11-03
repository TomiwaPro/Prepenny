// Screenshots of Home for checking the look (step 2b): 360px wide in light
// and dark, and 320px wide in light, at twice the pixels, as a phone shows
// them. Each is as tall as the whole page, with the bottom navigation at the
// bottom. Run only when asked:
//
//   SCREENS=1 pnpm e2e --project phone-360 screens

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const folder = join(import.meta.dirname, '..', '..', '..', 'docs', 'screens', '2b');

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
