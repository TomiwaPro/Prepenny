// The layout check measures in PrePenny's own font (step 3i, PLAN.md item 35).
//
// Item 35: the check at 200% text once found the Pay sheet from Coming up,
// and the tab bar, wider than the screen, on a busy GitHub machine, and
// passed on its second try. Holding Figtree's files back shows why: until
// they arrive the browser draws with a stand-in font, wider on Linux, and at
// 320px with 200% text the sheet and the tab bar measure wider than the
// screen. Here the files arrive 3 seconds late, as on a busy machine, and the
// check waits for them; without the wait it fails at 320px every time.

import { layoutProblems, openPeriod, period } from './coming-up.ts';
import { expect, test } from './fixtures.ts';

test('the 200% text check on the Pay sheet waits for the font, however late it arrives', async ({
  page,
}) => {
  await page.route('**/*.woff2', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.continue();
  });
  await page.goto('/app/coming-up/', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Coming up', exact: true }),
  ).toBeAttached();
  await openPeriod(page, '2026-10-30');
  await period(page, '2026-10-30')
    .getByRole('button', { name: /^Pay Fri/ })
    .click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  expect(await page.evaluate(() => document.fonts.status), 'the font is still on its way').toBe(
    'loading',
  );
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(await layoutProblems(page)).toEqual([]);
});
