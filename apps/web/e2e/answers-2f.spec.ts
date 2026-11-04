// The owner's answers to step 2f, built in step 2g, at 320px and 360px
// wide, in light and dark, checked by axe. "Today" is Sun 25 Oct 2026 on
// Sam's example. The move before closing an account (answer 2) is in the
// step 2f test 7, in money-screens.spec.ts.

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { type PlanRecords, parsePounds } from '@prepenny/engine';
import { examplePlan } from '../data/example-plan.ts';
import { TEST_SETTING_KEY, type TestSetting } from '../lib/test-setting.ts';
import { AXE_TAGS, MINUS, openComingUp, period } from './coming-up.ts';
import { expect, settingScript, test } from './fixtures.ts';

async function useSetting(page: Page, setting: TestSetting) {
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, setting] as const);
}

async function noAxeProblems(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
}

const undoBar = (page: Page) => page.getByTestId('undo-bar');

async function undo(page: Page) {
  await undoBar(page).getByRole('button', { name: 'Undo' }).click();
  await expect(undoBar(page)).toHaveText('Change undone.');
}

async function openDebt(page: Page, name: string) {
  await page.goto('/app/debts/');
  await expect(page.getByTestId('owed-now')).toBeVisible();
  await page.getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByTestId('left-now')).toBeVisible();
}

/** The Laptop loan at £250.00, so its £150.00 on Sun 20 Dec is £50.00 more than what's left. */
const smallerLaptopLoan: PlanRecords = {
  ...examplePlan,
  debts: (examplePlan.debts ?? []).map((one) =>
    one.id === 'laptop-loan' ? { ...one, balance: parsePounds('250.00') } : one,
  ),
};

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`The owner's answers to step 2f, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('answer 1: Add a budget asks "Already spent this week", like setup', async ({ page }) => {
      await page.goto('/app/budgets/');
      await page.getByRole('button', { name: 'Add a budget' }).click();
      const sheet = page.getByRole('dialog', { name: 'Add a budget' });
      await sheet.getByLabel('Name').fill('Travel');
      await sheet.getByLabel('Amount').fill('25');
      await sheet.getByRole('radio', { name: 'Week', exact: true }).check();
      const spent = sheet.getByLabel('Already spent this week');
      await expect(spent).toBeVisible();
      await expect(sheet).toContainText(
        "What you've spent from it so far, which your balance already shows.",
      );
      // A budget that starts later has no week under way yet, so it isn't asked.
      await sheet.getByLabel('Starts').fill('2026-10-30');
      await expect(sheet.getByLabel('Already spent this week')).toHaveCount(0);
      await sheet.getByLabel('Starts').fill('2026-10-25');
      await sheet.getByLabel('Already spent this week').fill('4');
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Add budget' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Travel added.');
      const budget = page.locator('[data-budget="Travel"]');
      await expect(budget).toContainText('This week, to Thu 29 Oct');
      await expect(budget.getByRole('definition')).toHaveText(['£4.00', '£21.00']);
      // The £4.00 is inside the balance typed this morning, so only £21.00 leaves today (D230).
      await openComingUp(page);
      await expect(
        period(page, '2026-10-25').getByRole('button', { name: /^Travel Sun 25 Oct/ }),
      ).toContainText(`${MINUS}£21.00`);
    });

    test('answer 3: "Make it £20.99 and stop after it" says first which later payments go', async ({
      page,
    }) => {
      await openDebt(page, 'Credit card');
      await expect(page.getByTestId('fix')).toContainText(
        'This also removes every later payment to Credit card. Undo puts them back.',
      );
      await useSetting(page, { plan: smallerLaptopLoan });
      await openDebt(page, 'Laptop loan');
      const fix = page.getByTestId('fix');
      await expect(fix).toContainText(
        'This also removes 2 later payments to Laptop loan. Undo puts them back.',
      );
      await noAxeProblems(page);
      await fix.getByRole('button', { name: 'Make it £100.00 and stop after it' }).click();
      await expect(undoBar(page)).toContainText(
        'Laptop loan made £100.00, and later payments to it removed.',
      );
      await expect(page.getByTestId('debt-row')).toHaveCount(2);
      await undo(page);
      await expect(page.getByTestId('debt-row')).toHaveCount(4);
    });

    test('answer 4: closing a debt asks "Also remove its 6 planned payments?", with neither answer chosen', async ({
      page,
    }) => {
      await openDebt(page, 'Family loan');
      await page.getByRole('button', { name: 'Close this debt' }).click();
      const sheet = page.getByRole('dialog', { name: 'Close this debt' });
      await expect(sheet).toContainText('Closing it stops it counting in Owed now, on Debts.');
      const question = sheet.getByRole('group', { name: 'Also remove its 6 planned payments?' });
      // Neither answer is chosen to start with: the person picks one (step 2h).
      await expect(question.getByRole('radio', { name: 'Yes' })).not.toBeChecked();
      await expect(question.getByRole('radio', { name: 'No' })).not.toBeChecked();
      await noAxeProblems(page);
      // The mistake is read with the radio that takes focus, every time Close is
      // tapped, as a text box's mistake is (D203, step 2h).
      for (let tap = 0; tap < 2; tap += 1) {
        await sheet.getByRole('button', { name: 'Close this debt' }).click();
        const yes = question.getByRole('radio', { name: 'Yes' });
        await expect(yes).toBeFocused();
        await expect(yes).toHaveAccessibleDescription('Choose Yes or No first.');
        await expect(yes).toHaveAttribute('aria-invalid', 'true');
        await expect(question.getByRole('radio', { name: 'No' })).toHaveAccessibleDescription(
          'Choose Yes or No first.',
        );
      }
      await expect(sheet).toBeVisible();
      await question.getByRole('radio', { name: 'Yes' }).check();
      await expect(sheet.getByText('Choose Yes or No first.')).toHaveCount(0);
      await expect(question.getByRole('radio', { name: 'Yes' })).not.toHaveAttribute(
        'aria-invalid',
      );
      await sheet.getByRole('button', { name: 'Close this debt' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText(
        'Family loan closed, and its planned payments removed.',
      );
      await expect(undoBar(page).getByRole('button', { name: 'Undo' })).toBeFocused();
      await expect(page.getByTestId('debt-row')).toHaveCount(0);
      await undo(page);
      await expect(page.getByTestId('debt-row')).toHaveCount(6);
      // No keeps them, as before.
      await page.getByRole('button', { name: 'Close this debt' }).click();
      await question.getByRole('radio', { name: 'No' }).check();
      await sheet.getByRole('button', { name: 'Close this debt' }).click();
      await expect(undoBar(page)).toContainText('Family loan closed.');
      await expect(page.getByTestId('debt-row')).toHaveCount(6);
    });

    test("answer 5: tapping a payment on a debt's page opens the same edit sheet as on Coming up", async ({
      page,
    }) => {
      await openDebt(page, 'Family loan');
      await expect(page.getByText('Tap a payment to change it, move it or skip it.')).toBeVisible();
      const first = page.getByRole('button', { name: /^Family loan Mon 26 Oct/ });
      await first.click();
      const sheet = page.getByRole('dialog', { name: 'Family loan' });
      await expect(sheet).toContainText('Mon 26 Oct, Current account');
      await expect(sheet).toContainText('£112.54 left');
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Move to next payday' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Family loan moved to Fri 30 Oct.');
      await expect(page.getByRole('button', { name: /^Family loan Fri 30 Oct/ })).toBeVisible();
      await undo(page);
      await expect(page.getByRole('button', { name: /^Family loan Mon 26 Oct/ })).toBeVisible();
    });
  });
}
