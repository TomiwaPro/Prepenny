// Draws the home-screen icons from public/icons/icon.svg (brief 7.1): a navy
// square with a cream penny, and a navy line that dips to its lowest point,
// marked with a brass dot (D177), and rises again. Run once after changing the drawing, then commit the PNGs:
//
//   node scripts/make-icons.ts
//
// Needs Playwright's Chromium (`pnpm exec playwright install chromium`), or
// PLAYWRIGHT_CHROMIUM_PATH pointing at a Chromium.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const folder = join(import.meta.dirname, '..', 'public', 'icons');
const svg = readFileSync(join(folder, 'icon.svg'), 'utf8');
// Square corners for the icons the phone rounds or masks itself.
const square = svg.replace(' rx="112"', '');

const icons = [
  { file: 'icon-192.png', size: 192, drawing: svg },
  { file: 'icon-512.png', size: 512, drawing: svg },
  { file: 'maskable-512.png', size: 512, drawing: square },
  { file: 'apple-touch-icon.png', size: 180, drawing: square },
];

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
const page = await browser.newPage();
for (const icon of icons) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  const sized = icon.drawing.replace('<svg ', `<svg width="${icon.size}" height="${icon.size}" `);
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${sized}</body></html>`,
  );
  await page.screenshot({ path: join(folder, icon.file), omitBackground: true });
  console.log(`Drew ${icon.file}`);
}
await browser.close();
