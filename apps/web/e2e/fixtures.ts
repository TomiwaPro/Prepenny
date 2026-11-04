// The end-to-end tests from before setup (steps 2b to 2d-2) open PrePenny on
// Sam's example plan. Since step 2e, a phone with nothing on it opens on the
// welcome instead, so these tests turn on the test-only "open on the
// example" setting (D201) for every page. The setup tests use Playwright's
// own `test`, and start from the welcome like a new phone.

import { type BrowserContext, test as base } from '@playwright/test';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';

/** Opens every page of a browser context on the example, keeping any other test setting. */
export async function openOnExample(context: BrowserContext) {
  await context.addInitScript((key) => {
    const now = Reflect.get(window, key);
    Reflect.set(window, key, {
      ...(typeof now === 'object' && now !== null ? now : {}),
      example: true,
    });
  }, TEST_SETTING_KEY);
}

/**
 * Puts the test-only setting on a page before PrePenny starts (D201), on top
 * of "open on the example".
 */
export function settingScript([key, value]: readonly [string, object]) {
  const now = Reflect.get(window, key);
  Reflect.set(window, key, { ...(typeof now === 'object' && now !== null ? now : {}), ...value });
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await openOnExample(context);
    await use(context);
  },
});

export { expect } from '@playwright/test';
