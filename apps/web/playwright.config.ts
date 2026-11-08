// End-to-end tests on phone-sized screens, 320px and 360px wide (brief 7.1,
// D37). They test the built app (`pnpm build` first), served by Wrangler the
// same way Cloudflare serves it (D68).
//
// PLAYWRIGHT_CHROMIUM_PATH can point at a Chromium already on the computer;
// otherwise run `pnpm exec playwright install chromium` once.

import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
/**
 * The tests that need the local Supabase: signing in (step 3b), the plan on
 * the server (step 3c), and offline changes and clashes (step 3d).
 */
const SIGN_IN_TESTS = /(sign-in|your-plan|clashes)\.spec\.ts$/;
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
    // British English for the browser itself too, so a date box reads 25/10/2026, as on a UK phone.
    launchOptions: {
      args: ['--lang=en-GB'],
      ...(executablePath === undefined ? {} : { executablePath }),
    },
  },
  // The sign-in tests need the local Supabase (`supabase start`), so they're
  // projects of their own (step 3b). GitHub runs them in part 3, once it has
  // started.
  projects: [
    { name: 'phone-320', use: phone(320, 640), testIgnore: SIGN_IN_TESTS },
    { name: 'phone-360', use: phone(360, 780), testIgnore: SIGN_IN_TESTS },
    { name: 'sign-in-320', use: phone(320, 640), testMatch: SIGN_IN_TESTS },
    { name: 'sign-in-360', use: phone(360, 780), testMatch: SIGN_IN_TESTS },
  ],
  webServer: {
    command: `wrangler dev --port ${port} --ip 127.0.0.1 --log-level warn`,
    url: `http://127.0.0.1:${port}/app/`,
    reuseExistingServer: process.env.CI === undefined,
    env: { WRANGLER_SEND_METRICS: 'false' },
    timeout: 60_000,
  },
});
