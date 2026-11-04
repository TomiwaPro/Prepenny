// The Coming up page with Sam's example plan on Sun 25 Oct 2026 (brief 4.8,
// D208 to D213), at 320px and 360px wide, in light and dark, checked by axe:
// the owner's step 2d-2 tests 1 to 8. Also what's shown, the accounts, the
// old address, no sideways scrolling, text at 200% and tap targets.

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  AXE_TAGS,
  chooseView,
  expectRows,
  leftAtEnd,
  MINUS,
  openComingUp,
  openPeriod,
  paydayButton,
  period,
  rowIn,
} from './coming-up.ts';

async function noAxeProblems(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
}

const undoBar = (page: Page) => page.getByTestId('undo-bar');

/** A later payday's line: its date, the pay coming in, its lowest point, and Tight or Short. */
async function expectLine(
  page: Page,
  start: string,
  [date, payIn, lowest, status]: readonly [string, string, string, string | null],
) {
  const button = paydayButton(page, start);
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button.getByText(date, { exact: true })).toBeVisible();
  await expect(button.getByText(payIn, { exact: true })).toBeVisible();
  await expect(button.getByText(lowest, { exact: true })).toBeVisible();
  for (const word of ['Tight', 'Short']) {
    await expect(button.getByText(word, { exact: true })).toHaveCount(word === status ? 1 : 0);
  }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`The Coming up page, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('the top says what the page is for, the account, what’s shown and the example banner', async ({
      page,
    }) => {
      await openComingUp(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Coming up');
      await expect(
        page.getByText(
          "Your bank shows money that's gone. This shows money that's going to go, and what you'll have left each time.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(page.getByTestId('example-banner')).toHaveText(
        'This is an example plan. Nothing here is yours.',
      );
      const account = page.getByTestId('plan-account');
      await expect(account.getByRole('heading')).toHaveText('Current account');
      await expect(account.getByText('£267.54, checked today', { exact: true })).toBeVisible();
      // Sam has two accounts, so he can switch.
      await expect(account.getByRole('button', { name: 'Switch account' })).toBeVisible();
      await expect(page.getByTestId('plan-showing')).toHaveText('By payday, showing everything');
      await expect(page.getByRole('button', { name: 'View', exact: true })).toBeVisible();
      await expect(page.getByTestId('not-ticked-yet')).toHaveCount(0);
      await expect(page).toHaveTitle('Coming up, PrePenny');
      await noAxeProblems(page);
    });

    test('test 1: this pay, with every payment and what’s left after it', async ({ page }) => {
      await openComingUp(page);
      const first = period(page, '2026-10-25');
      await expect(first.getByRole('heading')).toHaveText('This pay, until Thu 29 Oct');
      await expect(first).toHaveAttribute('data-open', 'true');
      await expectRows(first, [
        ['Spending money until payday', 'Sun 25 Oct', `${MINUS}£30.00`, '£237.54 left'],
        ['Family loan', 'Mon 26 Oct', `${MINUS}£125.00`, '£112.54 left'],
        ['Driving lesson', 'Mon 26 Oct', `${MINUS}£100.00`, '£12.54 left', 'Tight'],
        ['From savings', 'Wed 28 Oct', '+£500.00', '£512.54 left'],
        ['Pay-later card', 'Thu 29 Oct', `${MINUS}£466.07`, '£46.47 left'],
      ]);
      await expect(first.getByRole('term')).toHaveText(['Left at the end']);
      await expect(leftAtEnd(page, '2026-10-25')).toHaveText('£46.47');
    });

    test('test 2: each later payday is one line, with its pay and its lowest point', async ({
      page,
    }) => {
      await openComingUp(page);
      await expect(page.getByRole('heading', { name: 'Next paydays' })).toBeVisible();
      await expect(page.getByText('Tap one to see every payment in it.')).toBeVisible();
      await expectLine(page, '2026-10-30', [
        'Fri 30 Oct',
        'Pay £603.06 in',
        'Lowest £4.53',
        'Tight',
      ]);
      await expectLine(page, '2026-11-06', ['Fri 6 Nov', 'Pay £618.46 in', 'Lowest £155.69', null]);
      await expectLine(page, '2026-11-13', [
        'Fri 13 Nov',
        'Pay £469.06 in',
        'Lowest £295.75',
        null,
      ]);
      await expectLine(page, '2026-11-20', [
        'Fri 20 Nov',
        'Pay £592.17 in',
        'Lowest £384.74',
        null,
      ]);
      // A closed payday shows none of its payments.
      await expect(period(page, '2026-11-06').locator('[data-row-key]')).toHaveCount(0);
    });

    test('test 3: opening Fri 6 Nov shows every payment in it, and tapping again closes it', async ({
      page,
    }) => {
      await openComingUp(page);
      const button = paydayButton(page, '2026-11-06');
      await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      const fri6 = period(page, '2026-11-06');
      // On the same day, Family loan goes before Spending money: it was set up
      // first (D12). The owner confirmed this order on 4 Nov 2026 (D215).
      await expectRows(fri6, [
        ['Pay', 'Fri 6 Nov, estimate', '+£618.46', '£622.99 left'],
        ['Family loan', 'Fri 6 Nov', `${MINUS}£125.00`, '£497.99 left'],
        ['Spending money', 'Fri 6 Nov', `${MINUS}£54.00`, '£443.99 left'],
        ['Pay in 3 (£165.20 order)', 'Sat 7 Nov', `${MINUS}£41.30`, '£402.69 left'],
        ['Pay in 3 (£79.99 order)', 'Sun 8 Nov', `${MINUS}£20.00`, '£382.69 left'],
        ['Laptop loan', 'Tue 10 Nov', `${MINUS}£150.00`, '£232.69 left'],
        ['Sofa finance', 'Tue 10 Nov', `${MINUS}£77.00`, '£155.69 left'],
      ]);
      await expect(leftAtEnd(page, '2026-11-06')).toHaveText('£155.69');
      await noAxeProblems(page);

      await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(fri6.locator('[data-row-key]')).toHaveCount(0);
    });

    test('test 4: the lowest point line, and tapping it opens Fri 30 Oct', async ({ page }) => {
      await openComingUp(page);
      const lowest = page.getByTestId('plan-lowest');
      await expect(
        lowest.getByText('Lowest point: £4.53 on Sun 1 Nov, after Rent', { exact: true }),
      ).toBeVisible();
      await expect(lowest.getByText('Tight', { exact: true })).toBeVisible();
      await expect(lowest.getByText('Under £20 from Mon 26 Oct.', { exact: true })).toBeVisible();
      const tap = lowest.getByRole('button');
      await expect(tap).toContainText('Open Fri 30 Oct below');
      await tap.click();
      await expect(paydayButton(page, '2026-10-30')).toHaveAttribute('aria-expanded', 'true');
      const rent = rowIn(page, '2026-10-30', 'Rent');
      await expect(rent).toBeFocused();
      await expect(rent).toContainText('Lowest point ahead');
      await expect(rent).toContainText('£4.53 left');
      await expect(leftAtEnd(page, '2026-10-30')).toHaveText('£4.53');
    });

    test('test 5: by calendar month, October ends at £604.53 and November at £732.91', async ({
      page,
    }) => {
      await openComingUp(page);
      await chooseView(page, ['By calendar month']);
      await expect(page.getByTestId('plan-showing')).toHaveText(
        'By calendar month, showing everything',
      );
      const october = period(page, '2026-10-01');
      await expect(october.getByRole('heading')).toHaveText('This month, until Sat 31 Oct');
      await expect(leftAtEnd(page, '2026-10-01')).toHaveText('£604.53');
      await expect(page.getByRole('heading', { name: 'Next months' })).toBeVisible();
      await expect(paydayButton(page, '2026-11-01')).toContainText('November');
      await expect(paydayButton(page, '2026-12-01')).toContainText('December');
      await openPeriod(page, '2026-11-01');
      await expect(leftAtEnd(page, '2026-11-01')).toHaveText('£732.91');
      // How to read this follows the months too.
      await expect(page.getByTestId('how-to-read')).toContainText(
        'This month shows every payment from today until the end of the month.',
      );
      // By calendar month stays picked on this phone.
      await page.reload();
      await expect(page.getByTestId('plan-showing')).toHaveText(
        'By calendar month, showing everything',
      );
      // Show another month adds one more line each time.
      await expect(page.getByTestId('period')).toHaveCount(3);
      await page.getByRole('button', { name: 'Show another month' }).click();
      await expect(page.getByTestId('period')).toHaveCount(4);
      await expect(paydayButton(page, '2027-01-01')).toContainText('January 2027');
    });

    test('test 6: brief 8.4 test 1, Rent £560.00 from Fri 1 Jan 2027 for this and all later ones, then Undo', async ({
      page,
    }) => {
      await openComingUp(page);
      await chooseView(page, ['By calendar month']);
      await page.getByRole('button', { name: 'Show another month' }).click();
      await page.getByRole('button', { name: 'Show another month' }).click();
      await expect(page.getByTestId('period')).toHaveCount(5);
      const months = ['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'];
      for (const start of months) await openPeriod(page, start);

      const rentIn = (start: string) => rowIn(page, start, 'Rent');
      const rents = async () => Promise.all(months.map((start) => rentIn(start).textContent()));
      const before = await rents();

      await rentIn('2027-01-01').click();
      const sheet = page.getByRole('dialog', { name: 'Rent' });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText('Change this payment, move it or skip it.')).toBeVisible();
      await expect(sheet.getByText('Fri 1 Jan 2027, Current account')).toBeVisible();
      await sheet.getByLabel('Amount').fill('560');
      await sheet.getByText('This and all later ones', { exact: true }).click();
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Rent changed for this and all later ones.');

      await expect(rentIn('2026-11-01')).toContainText(`${MINUS}£600.00`);
      await expect(rentIn('2026-12-01')).toContainText(`${MINUS}£550.00`);
      await expect(rentIn('2027-01-01')).toContainText(`${MINUS}£560.00`);
      await expect(rentIn('2027-02-01')).toContainText(`${MINUS}£560.00`);
      // February's end goes down by £10.00 for January and £10.00 for February.
      await expect(leftAtEnd(page, '2027-02-01')).toHaveText('£3,284.87');

      await undoBar(page).getByRole('button', { name: 'Undo' }).click();
      await expect(undoBar(page)).toHaveText('Change undone.');
      await expect(rentIn('2027-01-01')).toContainText(`${MINUS}£550.00`);
      await expect(rentIn('2027-02-01')).toContainText(`${MINUS}£550.00`);
      await expect(leftAtEnd(page, '2027-02-01')).toHaveText('£3,304.87');
      expect(await rents()).toEqual(before);
    });

    test('test 7: How to read this shows on the first visit, goes after Got it, and comes back from “?”', async ({
      page,
    }) => {
      await openComingUp(page);
      const help = page.getByTestId('how-to-read');
      const question = page.getByRole('button', { name: 'How to read this' });
      await expect(help).toBeVisible();
      await expect(question).toHaveAttribute('aria-expanded', 'true');
      await expect(help.getByRole('heading')).toHaveText('How to read this');
      await expect(help.getByRole('listitem')).toHaveText([
        'This pay shows every payment from today until the day before your next payday.',
        'Each line under Next paydays is one later pay. Tap it to see its payments.',
        `A minus (${MINUS}£30.00) is money going out. A plus (+£500.00) is money coming in.`,
        '"Left" is what will be in your account after that payment.',
        '"Tight" means under the amount you want to keep. "Short" means you\'d run out of money.',
        'Tap any payment to change it, move it or skip it.',
      ]);
      await noAxeProblems(page);

      await help.getByRole('button', { name: 'Got it' }).click();
      await expect(help).toHaveCount(0);
      await expect(question).toBeFocused();
      await expect(question).toHaveAttribute('aria-expanded', 'false');
      // It doesn't come back by itself.
      await page.reload();
      await expect(page.getByTestId('period').first()).toBeVisible();
      await expect(page.getByTestId('how-to-read')).toHaveCount(0);

      await page.getByRole('button', { name: 'How to read this' }).click();
      await expect(page.getByTestId('how-to-read')).toBeVisible();
      await expect(page.getByRole('button', { name: 'How to read this' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    test('test 8: every line that opens and closes is a button that says whether it’s open', async ({
      page,
    }) => {
      await openComingUp(page);
      const lines = page.locator('[data-testid="period"][data-open] > h3 > button');
      const count = await lines.count();
      expect(count).toBeGreaterThanOrEqual(13);
      for (let index = 0; index < count; index += 1) {
        const line = lines.nth(index);
        await expect(line).toHaveRole('button');
        await expect(line).toHaveAttribute('aria-expanded', 'false');
        const region = await line.getAttribute('aria-controls');
        expect(region).not.toBeNull();
      }
      // Opening one tells screen readers it's open, and what it opened.
      const line = paydayButton(page, '2026-11-13');
      await line.focus();
      await page.keyboard.press('Enter');
      await expect(line).toHaveAttribute('aria-expanded', 'true');
      const region = page.locator(`[id="${await line.getAttribute('aria-controls')}"]`);
      await expect(region).toBeVisible();
      await expect(region).toHaveAccessibleName(/^Fri\s13\sNov/);
      await page.keyboard.press('Space');
      await expect(line).toHaveAttribute('aria-expanded', 'false');
      await expect(region).toBeHidden();
      // The "?" says so too.
      await expect(page.getByRole('button', { name: 'How to read this' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await noAxeProblems(page);
    });

    test('View shows one type, and Switch account shows the other account', async ({ page }) => {
      await openComingUp(page);
      await page.getByRole('button', { name: 'View', exact: true }).click();
      const view = page.getByRole('dialog', { name: 'View' });
      await expect(
        view.getByText('Choose how payments are grouped, and which ones to show.'),
      ).toBeVisible();
      await expect(view.getByRole('radio', { name: 'By payday' })).toBeChecked();
      await expect(view.getByText('Fri to Thu', { exact: true })).toBeVisible();
      for (const name of [
        'Everything',
        'Still to pay',
        'Money coming in',
        'Debt payments',
        'One type, such as Bills',
      ]) {
        await expect(view.getByRole('radio', { name })).toBeVisible();
      }
      await view.getByRole('radio', { name: 'One type, such as Bills' }).check();
      await expect(view.getByRole('radio', { name: 'Bills', exact: true })).toBeChecked();
      await view.getByRole('radio', { name: 'Other', exact: true }).check();
      await noAxeProblems(page);
      await view.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByTestId('plan-showing')).toHaveText('By payday, showing only Other');
      const first = period(page, '2026-10-25');
      await expectRows(first, [
        ['Driving lesson', 'Mon 26 Oct', `${MINUS}£100.00`, '£12.54 left', 'Tight'],
      ]);
      // What's shown never changes a figure (D184).
      await expect(leftAtEnd(page, '2026-10-25')).toHaveText('£46.47');
      await chooseView(page, ['Money coming in']);
      await expect(page.getByTestId('plan-showing')).toHaveText(
        'By payday, showing only money coming in',
      );
      await expectRows(first, [['From savings', 'Wed 28 Oct', '+£500.00', '£512.54 left']]);
      await chooseView(page, ['Everything']);

      await page.getByRole('button', { name: 'Switch account' }).click();
      const accounts = page.getByRole('dialog', { name: 'Switch account' });
      await expect(accounts.getByText('Choose which account to see.')).toBeVisible();
      const current = accounts.getByRole('button', { name: /^Current account/ });
      await expect(current).toHaveAttribute('aria-current', 'true');
      await expect(current).toContainText('Showing now');
      await noAxeProblems(page);
      await accounts.getByRole('button', { name: /^Savings/ }).click();
      await expect(accounts).toBeHidden();
      await expect(page.getByRole('button', { name: 'Switch account' })).toBeFocused();
      await expect(page.getByTestId('plan-account').getByRole('heading')).toHaveText('Savings');
      await expect(page.getByTestId('plan-account')).toContainText('£500.00, checked today');
      await expectRows(first, [['From savings', 'Wed 28 Oct', `${MINUS}£500.00`, '£0.00 left']]);
      // No pay arrives in savings: the line says what does.
      await expect(paydayButton(page, '2026-11-13')).toContainText('£150.00 coming in');
    });

    test('has no problems for axe, and no sideways scrolling', async ({ page }) => {
      await openComingUp(page);
      await noAxeProblems(page);
      await openPeriod(page, '2026-10-30');
      await noAxeProblems(page);
      const { scrollWidth, width } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        width: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(width);
    });
  });
}

test('the old address goes to Coming up', async ({ page }) => {
  await page.goto('/app/plan/');
  await expect(page).toHaveURL(/\/app\/coming-up\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Coming up' })).toBeVisible();
});

test('stays readable with text at 200%, and every tap target is big enough', async ({ page }) => {
  await openComingUp(page);
  await openPeriod(page, '2026-10-30');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(period(page, '2026-10-30').getByText('£4.53 left')).toBeVisible();
  const problems = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const found: string[] = [];
    for (const element of document.body.querySelectorAll('*')) {
      if (element.closest('.visually-hidden, dialog:not([open]), [hidden]')) continue;
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
      if (element.closest('.visually-hidden, dialog:not([open]), [hidden]')) continue;
      const box = element.getBoundingClientRect();
      if (box.width > 0 && (box.width < 44 || box.height < 44)) {
        found.push(`small: ${element.textContent?.trim().slice(0, 30)}`);
      }
    }
    return found;
  });
  expect(problems).toEqual([]);
});
