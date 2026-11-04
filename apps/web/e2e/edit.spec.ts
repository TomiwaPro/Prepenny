// Editing a payment with Sam's example plan on Sun 25 Oct 2026 (brief 4.4
// and 5.4, the edit sketch in ARCHITECTURE.md 4.6), at 320px and 360px wide,
// in light and dark: the owner's step 2c tests 4 to 7, on the Coming up page
// (D208). Test 3, Rent £560.00 from Fri 1 Jan 2027, is step 2d-2's test 6 in
// coming-up.spec.ts. Every change is saved on the phone, the plan updates,
// and one tap of Undo puts it all back.

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  goToComingUp,
  leftAtEnd,
  MINUS,
  openComingUp,
  openPeriod,
  rowIn,
  AXE_TAGS as tags,
} from './coming-up.ts';

const openPlan = openComingUp;

async function openRow(page: Page, start: string, name: string) {
  if (start !== '2026-10-25') await openPeriod(page, start);
  await rowIn(page, start, name).click();
  const sheet = page.getByRole('dialog', { name });
  await expect(sheet).toBeVisible();
  return sheet;
}

const undoBar = (page: Page) => page.getByTestId('undo-bar');

async function undo(page: Page) {
  await undoBar(page).getByRole('button', { name: 'Undo' }).click();
  await expect(undoBar(page)).toHaveText('Change undone.');
  // The Undo button has gone, so focus is on the bar's words, not lost.
  await expect(undoBar(page).getByText('Change undone.')).toBeFocused();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Editing a payment, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('test 4: the real pay on Fri 6 Nov, £640.00, just this one', async ({ page }) => {
      await openPlan(page);
      const sheet = await openRow(page, '2026-11-06', 'Pay');
      const estimate = sheet.getByLabel('This is an estimate');
      await expect(estimate).toBeChecked();
      await sheet.getByLabel('Amount').fill('640.00');
      // The real amount is in, so it isn't an estimate any more (D185).
      await expect(estimate).not.toBeChecked();
      await expect(sheet.getByText('£21.54 more than the estimate.')).toBeVisible();
      await expect(sheet.getByRole('radio', { name: 'Just this one' })).toBeChecked();
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Pay changed for just this one.');

      const pay = rowIn(page, '2026-11-06', 'Pay');
      await expect(pay.getByText('Fri 6 Nov', { exact: true })).toBeVisible();
      await expect(pay.getByText('Fri 6 Nov, estimate', { exact: true })).toHaveCount(0);
      await expect(pay).toContainText('+£640.00');
      await expect(leftAtEnd(page, '2026-11-06')).toHaveText('£177.23');
      // Only that payday: the next one is still an estimate.
      await openPeriod(page, '2026-11-13');
      await expect(rowIn(page, '2026-11-13', 'Pay')).toContainText('Fri 13 Nov, estimate');

      // The real amount can be the same as the estimate: untick the box and save (D185).
      const next = await openRow(page, '2026-11-13', 'Pay');
      await next.getByLabel('This is an estimate').uncheck();
      await next.getByRole('button', { name: 'Save' }).click();
      await expect(next).toBeHidden();
      await expect(rowIn(page, '2026-11-13', 'Pay')).toContainText('Fri 13 Nov');
      await expect(rowIn(page, '2026-11-13', 'Pay')).not.toContainText('estimate');
      await expect(rowIn(page, '2026-11-13', 'Pay')).toContainText('+£469.06');
    });

    test('test 5: Move to next payday, and Home warns from Sun 1 Nov', async ({ page }) => {
      await openPlan(page);
      const sheet = await openRow(page, '2026-10-25', 'Driving lesson');
      await expect(sheet.getByText('Moves it to Fri 30 Oct', { exact: true })).toBeVisible();
      await sheet.getByRole('button', { name: 'Move to next payday' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Driving lesson moved to Fri 30 Oct.');
      await expect(rowIn(page, '2026-10-25', 'Driving lesson')).toHaveCount(0);
      await openPeriod(page, '2026-10-30');
      await expect(rowIn(page, '2026-10-30', 'Driving lesson')).toContainText('Fri 30 Oct');

      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Home' })
        .click();
      const lowest = page.getByTestId('lowest-point');
      await expect(lowest.getByText('Under £20 from Sun 1 Nov.', { exact: true })).toBeVisible();
      await expect(lowest.getByText('£4.53', { exact: true })).toBeVisible();
      await expect(lowest.getByText('Sun 1 Nov, after Rent', { exact: true })).toBeVisible();
      // The change stays on this phone.
      await page.reload();
      await expect(
        page.getByTestId('lowest-point').getByText('Under £20 from Sun 1 Nov.', { exact: true }),
      ).toBeVisible();
    });

    test('test 6: Skip this one, Mark as paid and Remove each work, and each is undone', async ({
      page,
    }) => {
      await openPlan(page);

      // Skip this one.
      let sheet = await openRow(page, '2026-10-25', 'Driving lesson');
      await sheet.getByRole('button', { name: 'Skip this one' }).click();
      await expect(undoBar(page)).toContainText('Driving lesson skipped.');
      await expect(rowIn(page, '2026-10-25', 'Driving lesson')).toHaveCount(0);
      await expect(leftAtEnd(page, '2026-10-25')).toHaveText('£146.47');
      await undo(page);
      await expect(rowIn(page, '2026-10-25', 'Driving lesson')).toHaveCount(1);
      await expect(leftAtEnd(page, '2026-10-25')).toHaveText('£46.47');

      // Mark as paid: ticked today, it goes out today (D1).
      sheet = await openRow(page, '2026-10-25', 'Family loan');
      await sheet.getByRole('button', { name: 'Mark as paid' }).click();
      await expect(undoBar(page)).toContainText('Family loan marked as paid.');
      await expect(rowIn(page, '2026-10-25', 'Family loan')).toContainText('Sun 25 Oct, paid');
      await expect(leftAtEnd(page, '2026-10-25')).toHaveText('£46.47');
      await undo(page);
      await expect(rowIn(page, '2026-10-25', 'Family loan')).toContainText('Mon 26 Oct');
      await expect(rowIn(page, '2026-10-25', 'Family loan')).not.toContainText('paid');

      // Remove this and all later ones.
      sheet = await openRow(page, '2026-10-30', 'Rent');
      await sheet.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(sheet.getByRole('heading', { name: 'Remove it' })).toBeFocused();
      await sheet.getByRole('button', { name: 'Remove this and all later ones' }).click();
      await expect(undoBar(page)).toContainText('Rent removed for this and all later ones.');
      await expect(page.getByRole('button', { name: /^Rent / })).toHaveCount(0);
      await expect(leftAtEnd(page, '2026-10-30')).toHaveText('£604.53');
      await undo(page);
      await expect(rowIn(page, '2026-10-30', 'Rent')).toContainText(`${MINUS}£600.00`);
      await expect(leftAtEnd(page, '2026-10-30')).toHaveText('£4.53');

      // Remove just this one.
      sheet = await openRow(page, '2026-10-30', 'Rent');
      await sheet.getByRole('button', { name: 'Remove', exact: true }).click();
      await sheet.getByRole('button', { name: 'Remove just this one' }).click();
      await expect(undoBar(page)).toContainText('Rent removed for just this one.');
      await expect(rowIn(page, '2026-10-30', 'Rent')).toHaveCount(0);
      await undo(page);
      await expect(rowIn(page, '2026-10-30', 'Rent')).toHaveCount(1);
    });

    test('Remove this and all later ones is refused while one is ticked: Untick it first', async ({
      page,
    }) => {
      await openPlan(page);
      let sheet = await openRow(page, '2026-10-30', 'Rent');
      await sheet.getByRole('button', { name: 'Mark as paid' }).click();
      await expect(undoBar(page)).toContainText('Rent marked as paid.');
      // Ticked today, it goes out today.
      sheet = await openRow(page, '2026-10-25', 'Rent');
      await sheet.getByRole('button', { name: 'Remove', exact: true }).click();
      await sheet.getByRole('button', { name: 'Remove this and all later ones' }).click();
      await expect(sheet.getByRole('alert')).toHaveText(
        'One of these payments is ticked as paid. Untick it first.',
      );
      await expect(sheet).toBeVisible();
      await sheet.getByRole('button', { name: "Don't remove it" }).click();
      await expect(sheet.getByRole('button', { name: 'Remove', exact: true })).toBeFocused();
      await sheet.getByRole('button', { name: 'Mark as not paid' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Rent marked as not paid.');
      await expect(rowIn(page, '2026-10-30', 'Rent')).toContainText('Sun 1 Nov');
    });

    test('test 7: the sheet takes focus, closes with Escape or Close, and gives focus back', async ({
      page,
    }) => {
      await openPlan(page);
      await openPeriod(page, '2026-10-30');
      const row = rowIn(page, '2026-10-30', 'Rent');
      await row.focus();
      await page.keyboard.press('Enter');
      const sheet = page.getByRole('dialog', { name: 'Rent' });
      await expect(sheet).toBeVisible();
      expect(await sheet.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await expect(row).toBeFocused();

      await row.click();
      await expect(sheet).toBeVisible();
      await sheet.getByRole('button', { name: 'Close' }).click();
      await expect(sheet).toBeHidden();
      await expect(row).toBeFocused();

      // Every control has a name a screen reader says.
      await row.click();
      for (const label of ['Amount', 'Date', 'Name', 'Note', 'This is an estimate']) {
        await expect(sheet.getByLabel(label, { exact: true })).toBeVisible();
      }
      for (const name of ['Just this one', 'This and all later ones']) {
        await expect(sheet.getByRole('radio', { name })).toBeVisible();
      }
      for (const name of [
        'Mark as paid',
        'Move to next payday',
        'Skip this one',
        'Save',
        'Remove',
      ]) {
        await expect(sheet.getByRole('button', { name, exact: true })).toBeVisible();
      }
      await expect(sheet.getByText('Change this payment, move it or skip it.')).toBeVisible();
      await expect(sheet.getByText('Sun 1 Nov, Current account')).toBeVisible();
      await expect(sheet.getByText(`${MINUS}£600.00`, { exact: true })).toBeVisible();
      await expect(sheet.getByText('£4.53 left', { exact: true })).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);

      // A mistake is explained with words, beside the box.
      await sheet.getByLabel('Amount').fill('six hundred');
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet.getByText('Type an amount, for example 25.')).toBeVisible();
      await expect(sheet.getByLabel('Amount')).toBeFocused();
      await expect(sheet.getByLabel('Amount')).toHaveAttribute('aria-invalid', 'true');
      expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
      await sheet.getByRole('button', { name: 'Close' }).click();

      // After a change, focus comes back to the row.
      await rowIn(page, '2026-10-25', 'Family loan').click();
      await page
        .getByRole('dialog', { name: 'Family loan' })
        .getByRole('button', { name: 'Mark as paid' })
        .click();
      await expect(undoBar(page)).toContainText('Family loan marked as paid.');
      await expect(rowIn(page, '2026-10-25', 'Family loan')).toBeFocused();
      expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
    });
  });
}

test('the undo bar goes when the screen changes, and the example can start again', async ({
  page,
}) => {
  await openPlan(page);
  const sheet = await openRow(page, '2026-10-25', 'Driving lesson');
  await sheet.getByRole('button', { name: 'Skip this one' }).click();
  await expect(undoBar(page)).toContainText('Driving lesson skipped.');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
  await expect(undoBar(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Start again with the example' }).click();
  const ask = page.getByRole('dialog', { name: 'Start again with the example' });
  await expect(ask.getByText('Your changes to the example will go')).toBeVisible();
  await ask.getByRole('button', { name: 'Keep my changes' }).click();
  await expect(ask).toBeHidden();
  await goToComingUp(page);
  await expect(rowIn(page, '2026-10-25', 'Driving lesson')).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Start again with the example' }).click();
  await ask.getByRole('button', { name: 'Start again', exact: true }).click();
  await expect(page.getByText('The example is back to how it started.')).toBeVisible();
  await openComingUp(page);
  await expect(rowIn(page, '2026-10-25', 'Driving lesson')).toHaveCount(1);
  await expect(leftAtEnd(page, '2026-10-25')).toHaveText('£46.47');
});

test('Home’s next due rows open the same sheet', async ({ page }) => {
  await page.goto('/app/');
  const due = page.getByTestId('next-due');
  await due.getByRole('button', { name: /^Family loan / }).click();
  const sheet = page.getByRole('dialog', { name: 'Family loan' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Moves it to Fri 30 Oct')).toBeVisible();
  await sheet.getByRole('button', { name: 'Skip this one' }).click();
  await expect(undoBar(page)).toContainText('Family loan skipped.');
  await expect(due.getByRole('listitem').nth(1)).toContainText('Driving lesson');
  await expect(due.getByRole('listitem').nth(1)).toContainText('£137.54 left');
  await undo(page);
  await expect(due.getByRole('listitem').nth(1)).toContainText('Family loan');
});
