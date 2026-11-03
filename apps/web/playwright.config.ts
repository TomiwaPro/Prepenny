// End-to-end tests on phone-sized screens, 320px and 360px wide (brief 7.1,
// D37). They test the built app (`pnpm build` first), served by Wrangler the
// same way Cloudflare serves it (D68).
//
// PLAYWRIGHT_CHROMIUM_PATH can point at a Chromium already on the computer;
// otherwise run `pnpm exec playwright install chromium` once.

import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const port = 4173;

const phone = (width: number, height: number) => ({
  browserName: 'chromium' as const,
  viewport: { width, height },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    trace: 'retain-on-failure',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  projects: [
    { name: 'phone-320', use: phone(320, 640) },
    { name: 'phone-360', use: phone(360, 780) },
  ],
  webServer: {
    command: `wrangler dev --port ${port} --ip 127.0.0.1 --log-level warn`,
    url: `http://127.0.0.1:${port}/app/`,
    reuseExistingServer: process.env.CI === undefined,
    env: { WRANGLER_SEND_METRICS: 'false' },
    timeout: 60_000,
  },
});
