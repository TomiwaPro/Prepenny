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
 * the server (step 3c), offline changes and clashes (step 3d), and signed-in
 * devices, two-step sign-in, email addresses and versions (step 3e), and
 * getting back in with a 24-hour wait (step 3e hardening).
 */
const SIGN_IN_TESTS =
  /(sign-in|your-plan|clashes|devices|two-step|emails|versions|recovery|sharing)\.spec\.ts$/;
const port = 4173;
/** The second copy, for the move from the old address (D428). */
const OLD_ADDRESS_PORT = 4174;
/**
 * A pull request's preview on Cloudflare, tried for real by the Deploy
 * workflow (step 3e-2, D408). Given, only that test runs, against it.
 */
const PREVIEW_URL = process.env.PREVIEW_URL;
const PREVIEW_TEST = /preview\.spec\.ts$/;

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
  projects:
    PREVIEW_URL === undefined
      ? [
          { name: 'phone-320', use: phone(320, 640), testIgnore: [SIGN_IN_TESTS, PREVIEW_TEST] },
          { name: 'phone-360', use: phone(360, 780), testIgnore: [SIGN_IN_TESTS, PREVIEW_TEST] },
          { name: 'sign-in-320', use: phone(320, 640), testMatch: SIGN_IN_TESTS },
          { name: 'sign-in-360', use: phone(360, 780), testMatch: SIGN_IN_TESTS },
        ]
      : [
          {
            name: 'preview',
            use: { browserName: 'chromium', baseURL: PREVIEW_URL },
            testMatch: PREVIEW_TEST,
          },
        ],
  // The preview is online already; everything else uses this computer's own copy.
  ...(PREVIEW_URL === undefined
    ? {
        webServer: [
          {
            command: `wrangler dev --port ${port} --ip 127.0.0.1 --log-level warn`,
            url: `http://127.0.0.1:${port}/app/`,
            reuseExistingServer: process.env.CI === undefined,
            env: { WRANGLER_SEND_METRICS: 'false' },
            timeout: 60_000,
          },
          // The same app as Cloudflare serves it at any address, for the move
          // from the old address (e2e/old-address.spec.ts, D428).
          {
            command: `wrangler dev --config e2e/old-address.wrangler.jsonc --port ${OLD_ADDRESS_PORT} --ip 127.0.0.1 --log-level warn`,
            url: `http://127.0.0.1:${OLD_ADDRESS_PORT}/app/`,
            reuseExistingServer: process.env.CI === undefined,
            env: { WRANGLER_SEND_METRICS: 'false' },
            timeout: 60_000,
          },
        ],
      }
    : {}),
});
