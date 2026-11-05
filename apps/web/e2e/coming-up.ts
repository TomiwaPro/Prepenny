// Shared steps for the end-to-end tests that use the Coming up page (D208 to
// D212): opening it, finding a payday or month by its first day, opening a
// later one in place, and finding a payment's row in it.

import { expect, type Locator, type Page } from '@playwright/test';

export const MINUS = '−';
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Goes to the Coming up page and waits for this pay to be drawn. */
export async function openComingUp(page: Page) {
  await page.goto('/app/coming-up/');
  await expect(page.getByTestId('period').first()).toBeVisible();
}

/** Goes to the Coming up page from the bottom navigation. */
export async function goToComingUp(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Coming up', exact: true })
    .click();
  await expect(page.getByTestId('period').first()).toBeVisible();
}

/** This pay, a later payday or a month, by its first day. */
export const period = (page: Page, start: string) =>
  page.locator(`[data-testid="period"][data-start="${start}"]`);

/** The button that opens and closes a later payday or month. */
export const paydayButton = (page: Page, start: string) =>
  period(page, start).locator(':scope > :is(h3, h4) > button');

/** Opens a later payday or month in place, if it isn't open already (D211). */
export async function openPeriod(page: Page, start: string) {
  const where = period(page, start);
  await expect(where).toBeVisible();
  if ((await where.getAttribute('data-open')) !== 'true') {
    await paydayButton(page, start).click();
  }
  await expect(where).toHaveAttribute('data-open', 'true');
}

/** A payment's row button, by its name: its name for screen readers starts with it. */
export const named = (name: string) =>
  new RegExp(`^${name.replace(/[()]/g, '\\$&')} (Mon|Tue|Wed|Thu|Fri|Sat|Sun)`);

export const rowIn = (page: Page, start: string, name: string) =>
  period(page, start).getByRole('button', { name: named(name) });

/** "Left at the end" of an open period. */
export const leftAtEnd = (page: Page, start: string) =>
  period(page, start).getByRole('definition').last();

export type Row = readonly [
  name: string,
  second: string,
  amount: string,
  left: string,
  status?: string,
];

/** Each row's name, second line, amount and what's left, and Tight or Short when there is one. */
export async function expectRows(where: Locator, rows: readonly Row[]) {
  const items = where.locator('[data-row-key]');
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

/** Opens the View sheet, picks what's given, and closes it with Done (D210). */
export async function chooseView(page: Page, choices: readonly string[]) {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'View' });
  await expect(sheet).toBeVisible();
  for (const choice of choices) {
    await sheet.getByRole('radio', { name: choice }).first().check();
  }
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
}

/**
 * With text at 200%: anything outside the screen or cut off, and any tap
 * target under 44 by 44px (brief Part 6, WCAG 1.4.4 and 2.5.8). Empty when
 * there's nothing wrong.
 */
export async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const found: string[] = [];
    for (const element of document.body.querySelectorAll('*')) {
      if (element.closest('.visually-hidden, dialog:not([open]), [hidden]')) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (box.left < -1 || box.right > width + 1) found.push(`outside: ${element.tagName}`);
      const style = getComputedStyle(element);
      const hides = style.overflowX !== 'visible' || style.textOverflow === 'ellipsis';
      // A text box scrolls a long name inside itself, as every text box does: nothing is lost.
      const textBox = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
      if (
        hides &&
        !textBox &&
        element.scrollWidth > element.clientWidth + 1 &&
        element.tagName !== 'HTML'
      ) {
        found.push(`clipped: ${element.textContent?.trim().slice(0, 30)}`);
      }
    }
    // A label above a box, pointing at it with `for`, isn't what's tapped: the box is.
    for (const element of document.querySelectorAll('a, button, label:not([for]), input, select')) {
      if (element.closest('.visually-hidden, dialog:not([open]), [hidden]')) continue;
      if (element instanceof HTMLInputElement && element.closest('label') !== null) continue;
      const box = element.getBoundingClientRect();
      if (box.width > 0 && (box.width < 44 || box.height < 44)) {
        found.push(`small: ${element.textContent?.trim().slice(0, 30) || element.id}`);
      }
    }
    return found;
  });
}
