// Draws the opening screens PrePenny shows on an iPhone's Home Screen while
// it starts (step 4d, D550): for each iPhone screen size in
// lib/splash-screens.ts, light and dark, the icon in the middle of the
// paper colour with the name under it in Figtree, as Android draws its own.
// Run once after changing the icon, the colours or the sizes, then commit
// the PNGs:
//
//   node scripts/make-splash-screens.ts
//
// Needs Playwright's Chromium, or PLAYWRIGHT_CHROMIUM_PATH pointing at one.

import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { IPHONE_SCREENS, splashFile } from '../lib/splash-screens.ts';
import { PAPER } from '../lib/theme.ts';

const web = join(import.meta.dirname, '..');
const folder = join(web, 'public', 'splash');
const icon = readFileSync(join(web, 'public', 'icons', 'icon.svg'), 'utf8');
const font = readFileSync(
  join(web, 'node_modules', '@fontsource', 'figtree', 'files', 'figtree-latin-700-normal.woff2'),
).toString('base64');

/** "Navy as text" in each mode (DESIGN.md), the wordmark's colour. */
const NAME = { light: '#14213d', dark: '#f2ece0' } as const;

/** The icon's size and the name's, in points, the same on every iPhone. */
const ICON = 128;
const NAME_SIZE = 28;

mkdirSync(folder, { recursive: true });
for (const file of readdirSync(folder)) rmSync(join(folder, file));

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
for (const screen of IPHONE_SCREENS) {
  const page = await browser.newPage({
    viewport: { width: screen.width, height: screen.height },
    deviceScaleFactor: screen.scale,
  });
  for (const colours of ['light', 'dark'] as const) {
    const sized = icon.replace(
      '<svg ',
      `<svg width="${ICON}" height="${ICON}" aria-hidden="true" `,
    );
    await page.setContent(`<!doctype html><html><head><style>
      @font-face { font-family: Figtree; font-weight: 700; src: url(data:font/woff2;base64,${font}) format('woff2'); }
      html, body { margin: 0; height: 100%; background: ${PAPER[colours]}; }
      body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; }
      p { margin: 0; font: 700 ${NAME_SIZE}px/1 Figtree; letter-spacing: -0.3px; color: ${NAME[colours]}; }
    </style></head><body>${sized}<p>PrePenny</p></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const file = splashFile(screen, colours);
    await page.screenshot({ path: join(web, 'public', file) });
    console.log(`Drew ${file}`);
  }
  await page.close();
}
await browser.close();
