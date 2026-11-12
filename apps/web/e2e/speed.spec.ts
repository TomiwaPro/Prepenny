// Speed (brief Part 3 principle 9, Part 6, step 2h): with the phone's
// processor slowed to a quarter of this computer's (CPU 4 times slower, as
// Chrome's own setting for a mid-range phone), Home shows the plan's real
// figures quickly and never a spinner: a skeleton while the engine works,
// then the figures. The times are written to the test's notes and to
// test-results/speed.json, and the middle of five runs is checked.

import { writeFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { test } from './fixtures.ts';
import { helperInCharge } from './offline-helper.ts';

const SLOWER = 4;
const RUNS = 5;

/** Watches the page from its very first moment for anything that spins or says "loading". */
const WATCH_FOR_SPINNERS = () => {
  const seen: string[] = [];
  Reflect.set(window, '__spinners', seen);
  Reflect.set(window, '__skeleton', false);
  new MutationObserver(() => {
    if (document.querySelector('[data-testid="home-skeleton"]') !== null) {
      Reflect.set(window, '__skeleton', true);
    }
    for (const element of document.querySelectorAll(
      // The skeleton tells screen readers it's busy (aria-busy); that's a skeleton, not a spinner.
      '[role="progressbar"], [class*="spin" i], [class*="loader" i]',
    )) {
      seen.push(element.outerHTML.slice(0, 80));
    }
  }).observe(document, { childList: true, subtree: true, attributes: true });
};

async function slowDown(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOWER });
}

/** Milliseconds from asking for Home until its balance and lowest point are on screen. */
async function timeHome(page: Page, open: () => Promise<unknown>): Promise<number> {
  const started = Date.now();
  await open();
  await expect(page.getByTestId('balance')).toHaveText('£267.54');
  await expect(page.getByTestId('lowest-point')).toContainText('£4.53');
  return Date.now() - started;
}

const middle = (times: readonly number[]) =>
  [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0;

test('Home shows its real figures quickly on a phone 4 times slower, and never a spinner', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone-360', 'Timed once, at 360px.');
  await page.addInitScript(WATCH_FOR_SPINNERS);
  await slowDown(page);

  // The first visit: nothing on the phone yet but the example plan.
  const first = await timeHome(page, () => page.goto('/app/'));
  await helperInCharge(page);

  // Opening it again, as from the home screen: its files come from the phone.
  const again: number[] = [];
  for (let run = 0; run < RUNS; run += 1) again.push(await timeHome(page, () => page.reload()));

  // A change: Mark as paid on a payment in Next due, until Home shows the new figures.
  const change: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const due = page.getByTestId('next-due').getByRole('button', { name: /^Family loan/ });
    const started = Date.now();
    await due.click();
    await page
      .getByRole('dialog', { name: 'Family loan' })
      .getByRole('button', { name: 'Mark as paid' })
      .click();
    await expect(page.getByTestId('undo-bar')).toContainText('Family loan marked as paid.');
    await expect(page.getByTestId('next-due')).not.toContainText('Family loan');
    change.push(Date.now() - started);
    await page.getByTestId('undo-bar').getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('next-due')).toContainText('Family loan');
  }

  const spinners = (await page.evaluate(() => Reflect.get(window, '__spinners'))) as string[];
  expect(spinners).toEqual([]);

  const report = {
    cpuSlower: SLOWER,
    firstVisitMs: first,
    openAgainMs: again,
    openAgainMiddleMs: middle(again),
    changeMs: change,
    changeMiddleMs: middle(change),
  };
  info.annotations.push({ type: 'speed', description: JSON.stringify(report) });
  writeFileSync(info.outputPath('speed.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Speed, CPU ${SLOWER} times slower: ${JSON.stringify(report)}`);

  // Bounds with room to spare on GitHub's machines, which are slower than a laptop.
  expect(first).toBeLessThan(6000);
  expect(middle(again)).toBeLessThan(3000);
  expect(middle(change)).toBeLessThan(2000);
});

test('Home shows a skeleton while the plan is worked out, never a spinner', async ({ page }) => {
  await page.addInitScript(WATCH_FOR_SPINNERS);
  await slowDown(page);
  await page.goto('/app/');
  await expect(page.getByTestId('balance')).toHaveText('£267.54');
  const spinners = (await page.evaluate(() => Reflect.get(window, '__spinners'))) as string[];
  expect(spinners).toEqual([]);
  // On a slowed-down phone the skeleton shows first, in the shape of Home's cards.
  expect(await page.evaluate(() => Reflect.get(window, '__skeleton'))).toBe(true);
});
