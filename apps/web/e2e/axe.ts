// axe's checks, run once whatever is moving on the page has stopped, so a
// sheet part of the way through fading in isn't measured paler than it is.
// Found on one of GitHub's slower machines in step 3c (D344): the overtime sheet's
// intro measured 4.33 to 1 mid-fade; it's 7.92 to 1 once open.
// An endless animation, such as a skeleton's pulse, isn't waited for.

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

export async function axeOnceStill(page: Page): Promise<AxeBuilder> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (one) =>
          one.playState !== 'running' ||
          one.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY,
      ),
  );
  return new AxeBuilder({ page });
}
