// The Plan screen with Sam's example plan on Sun 25 Oct 2026 (brief 4.8,
// the Plan sketch in ARCHITECTURE.md 4.6), at 320px and 360px wide, in light
// and dark: the owner's step 2c tests 1 and 2, the filters, the accounts,
// no sideways scrolling, text at 200%, and WCAG 2.2 AA checked by axe.

import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';

const MINUS = '−';
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function openPlan(page: Page) {
  await page.goto('/app/plan/');
  await expect(page.getByTestId('period').first()).toBeVisible();
}

const period = (page: Page, start: string) =>
  page.locator(`[data-testid="period"][data-start="${start}"]`);

type Row = readonly [name: string, second: string, amount: string, left: string, status?: string];

/** Each row's name, second line, amount and what's left, and Tight or Short when there is one. */
async function expectRows(where: Locator, rows: readonly Row[]) {
  const items = where.getByRole('listitem');
  await expect(items).toHaveCount(rows.length);
  for (const [index, [name, second, amount, left, status]] of rows.entries()) {
    const item = items.nth(index);
    await expect(item.getByText(name, { exact: true })).toBeVisible();
    await expect(item.getByText(second, { exact: true })).toBeVisible();
    await expect(item.getByText(amount, { exact: true })).toBeVisible();
    await expect(item.getByText(left, { exact: true })).toBeVisible();
    for (const word of ['Tight', 'Short']) {
      await expect(item.getByText(word, { exact: true })).toHaveCount(word === status ? 1 : 0);
    }
  }
}

/** "Came in" and "Left at the end" of a period. */
async function expectTotals(where: Locator, cameIn: string, leftAtEnd: string) {
  await expect(where.getByRole('term')).toHaveText(['Came in', 'Left at the end']);
  await expect(where.getByRole('definition')).toHaveText([cameIn, leftAtEnd]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`The Plan screen, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('test 1: pay periods, every row with what’s left after it', async ({ page }) => {
      await openPlan(page);
      await expect(page.getByRole('radio', { name: 'Pay periods' })).toBeChecked();
      await expect(page.getByRole('radio', { name: 'Current account' })).toBeChecked();

      const lowest = page.getByTestId('plan-lowest');
      await expect(lowest.getByRole('heading')).toHaveText('Lowest point ahead');
      await expect(lowest.getByText('Tight', { exact: true })).toBeVisible();
      await expect(
        lowest.getByText('£4.53 on Sun 1 Nov, after Rent', { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId('not-ticked-yet')).toHaveCount(0);

      const first = period(page, '2026-10-25');
      await expect(first.getByRole('heading')).toHaveText('Today to Thu 29 Oct');
      await expectRows(first, [
        ['Spending money until payday', 'Sun 25 Oct', `${MINUS}£30.00`, '£237.54 left'],
        ['Family loan', 'Mon 26 Oct', `${MINUS}£125.00`, '£112.54 left'],
        ['Driving lesson', 'Mon 26 Oct', `${MINUS}£100.00`, '£12.54 left', 'Tight'],
        ['From savings', 'Wed 28 Oct', '+£500.00', '£512.54 left'],
        ['Pay-later card', 'Thu 29 Oct', `${MINUS}£466.07`, '£46.47 left'],
      ]);
      await expectTotals(first, '£500.00', '£46.47');

      const second = period(page, '2026-10-30');
      await expect(second.getByRole('heading')).toHaveText('Fri 30 Oct to Thu 5 Nov');
      await expectRows(second, [
        ['Pay', 'Fri 30 Oct, estimate', '+£603.06', '£649.53 left'],
        ['Spending money', 'Fri 30 Oct', `${MINUS}£45.00`, '£604.53 left'],
        ['Rent', 'Sun 1 Nov', `${MINUS}£600.00`, '£4.53 left', 'Tight'],
      ]);
      await expect(
        second.getByRole('listitem').nth(2).getByText('Lowest point ahead', { exact: true }),
      ).toBeVisible();
      await expectTotals(second, '£603.06', '£4.53');

      const third = period(page, '2026-11-06');
      await expect(third.getByRole('heading')).toHaveText('Fri 6 Nov to Thu 12 Nov');
      await expectTotals(third, '£618.46', '£155.69');
    });

    test('test 2: calendar months, and Show another month', async ({ page }) => {
      await openPlan(page);
      await page.getByTestId('plan-by').getByText('Months', { exact: true }).click();
      await expect(page.getByRole('radio', { name: 'Months' })).toBeChecked();
      await expect(page.getByTestId('period')).toHaveCount(3);
      const months = [
        ['2026-10-01', 'October', '£604.53'],
        ['2026-11-01', 'November', '£732.91'],
        ['2026-12-01', 'December', '£1,024.60'],
        ['2027-01-01', 'January 2027', '£2,235.89'],
        ['2027-02-01', 'February 2027', '£3,304.87'],
      ] as const;
      for (const [start, heading, left] of months.slice(0, 3)) {
        await expect(period(page, start).getByRole('heading')).toHaveText(heading);
        await expect(period(page, start).getByRole('definition').last()).toHaveText(left);
      }
      const another = page.getByRole('button', { name: 'Show another month' });
      await another.click();
      await expect(page.getByTestId('period')).toHaveCount(4);
      await another.click();
      await expect(page.getByTestId('period')).toHaveCount(5);
      for (const [start, heading, left] of months) {
        await expect(period(page, start).getByRole('heading')).toHaveText(heading);
        await expect(period(page, start).getByRole('definition').last()).toHaveText(left);
      }
      // Months stays picked on this phone.
      await page.reload();
      await expect(page.getByRole('radio', { name: 'Months' })).toBeChecked();
    });

    test('filters hide rows without changing any figure', async ({ page }) => {
      await openPlan(page);
      await page.getByRole('button', { name: 'Filters' }).click();
      const sheet = page.getByRole('dialog', { name: 'Filters' });
      await expect(sheet).toBeVisible();
      await sheet.getByText('Debt payments', { exact: true }).click();
      await sheet.getByRole('button', { name: 'Show the plan' }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByTestId('plan-filtered')).toHaveText('Showing only: Debt payments.');
      await expect(page.getByRole('button', { name: 'Filters: 1 on' })).toBeVisible();
      const first = period(page, '2026-10-25');
      await expectRows(first, [
        ['Family loan', 'Mon 26 Oct', `${MINUS}£125.00`, '£112.54 left'],
        ['Pay-later card', 'Thu 29 Oct', `${MINUS}£466.07`, '£46.47 left'],
      ]);
      await expectTotals(first, '£500.00', '£46.47');

      await page.getByRole('button', { name: 'Filters: 1 on' }).click();
      await sheet.getByText('Money in', { exact: true }).click();
      await sheet.getByText('Other', { exact: true }).click();
      await sheet.getByRole('button', { name: 'Show the plan' }).click();
      await expect(page.getByTestId('plan-filtered')).toHaveText('Showing only: Money in, Other.');
      await expect(first.getByText('Nothing here matches the filters.')).toBeVisible();

      await page.getByRole('button', { name: 'Clear filters' }).click();
      await expect(page.getByTestId('plan-filtered')).toHaveCount(0);
      await expect(first.getByRole('listitem')).toHaveCount(5);
    });

    test('shows one account at a time, with a switch between them', async ({ page }) => {
      await openPlan(page);
      await page.getByTestId('plan-account').getByText('Savings', { exact: true }).click();
      await expect(page.getByRole('radio', { name: 'Savings' })).toBeChecked();
      const first = period(page, '2026-10-25');
      await expectRows(first, [['From savings', 'Wed 28 Oct', `${MINUS}£500.00`, '£0.00 left']]);
      await expectTotals(first, '£0.00', '£0.00');
      await page.getByTestId('plan-account').getByText('Current account', { exact: true }).click();
      await expect(first.getByRole('listitem')).toHaveCount(5);
    });

    test('has no problems for axe, and no sideways scrolling', async ({ page }) => {
      await openPlan(page);
      expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
      const { scrollWidth, width } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        width: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(width);
      await page.getByRole('button', { name: 'Filters' }).click();
      await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
    });
  });
}

test('stays readable with text at 200%, and every tap target is big enough', async ({ page }) => {
  await openPlan(page);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(period(page, '2026-10-30').getByText('£4.53 left')).toBeVisible();
  const problems = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const found: string[] = [];
    for (const element of document.body.querySelectorAll('*')) {
      if (element.closest('.visually-hidden, dialog:not([open])')) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (box.left < -1 || box.right > width + 1) found.push(`outside: ${element.tagName}`);
      const style = getComputedStyle(element);
      const hides = style.overflowX !== 'visible' || style.textOverflow === 'ellipsis';
      if (hides && element.scrollWidth > element.clientWidth + 1 && element.tagName !== 'HTML') {
        found.push(`clipped: ${element.textContent?.trim().slice(0, 30)}`);
      }
    }
    for (const element of document.querySelectorAll('a, button, label')) {
      if (element.closest('.visually-hidden, dialog:not([open])')) continue;
      const box = element.getBoundingClientRect();
      if (box.width > 0 && (box.width < 44 || box.height < 44)) {
        found.push(`small: ${element.textContent?.trim().slice(0, 30)}`);
      }
    }
    return found;
  });
  expect(problems).toEqual([]);
});
