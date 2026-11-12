// The owner's answers to step 2h, built in step 3a (D276 to D284), at 320px
// and 360px wide, in light and dark, checked by axe. "Today" is Sun 25 Oct
// 2026 on Sam's example.

import type { Locator, Page } from '@playwright/test';
import type { PlanRecords } from '@prepenny/engine';
import { examplePlan } from '../data/example-plan.ts';
import { TEST_SETTING_KEY, type TestSetting } from '../lib/test-setting.ts';
import { axeOnceStill } from './axe.ts';
import { AXE_TAGS, layoutProblems, openComingUp, openPeriod, rowIn } from './coming-up.ts';
import { expect, settingScript, test } from './fixtures.ts';

const NB = ' ';
const day = (text: string) => text.replaceAll(' ', NB);

async function useSetting(page: Page, setting: TestSetting) {
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, setting] as const);
}

async function noAxeProblems(page: Page) {
  expect((await (await axeOnceStill(page)).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
}

const undoBar = (page: Page) => page.getByTestId('undo-bar');

/** The colour the page gives Short's words, for comparing. */
function shortColour(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--short-text)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
}

/** Sam's example with his pay every 2 weeks instead of every week, still in a pattern of 4. */
const fortnightlyPay: PlanRecords = {
  ...examplePlan,
  series: examplePlan.series.map((one) =>
    one.id === 'pay' ? { ...one, schedule: { kind: 'weekly', every: 2 } } : one,
  ),
  // His weekly payslip's year so far doesn't fit fortnightly pay, so it's left out.
  payProfiles: (examplePlan.payProfiles ?? []).map(({ soFar: _weekly, ...one }) => ({
    ...one,
    frequency: 'two-weekly',
  })),
};

/** How much of the screen, from the top of the undo bar down, the bar and the navigation cover. */
async function barCovers(page: Page): Promise<number> {
  return page.evaluate(() => {
    const bar = document.querySelector('[data-testid="undo-bar"]');
    if (bar === null) return 0;
    return (window.innerHeight - bar.getBoundingClientRect().top) / window.innerHeight;
  });
}

async function changeAmount(sheet: Locator, amount: string, later: boolean) {
  await sheet.getByLabel('Amount').fill(amount);
  if (later) await sheet.getByRole('radio', { name: 'This and all later ones' }).check();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`The owner's answers to step 2h, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('answer 1: a mistake in what was typed is red, the same red as Short', async ({
      page,
    }) => {
      await page.goto('/app/');
      await page.getByRole('button', { name: 'Add a payment', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Add a payment' });
      await sheet.getByRole('button', { name: 'Add payment' }).click();
      const mistake = sheet.getByText('Type a name, for example Car MOT.');
      await expect(mistake).toBeVisible();
      const colour = await mistake.evaluate((element) => getComputedStyle(element).color);
      expect(colour).toBe(await shortColour(page));
      await noAxeProblems(page);
    });

    test('answer 2: Coming up says "Try a change" and "Change view"', async ({ page }) => {
      await openComingUp(page);
      await expect(page.getByRole('button', { name: 'View', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Change view', exact: true }).click();
      const view = page.getByRole('dialog', { name: 'View' });
      await expect(view).toBeVisible();
      await noAxeProblems(page);
      await view.getByRole('button', { name: 'Done' }).click();
      await expect(view).toBeHidden();
      const line = page.getByTestId('what-if-line');
      await expect(line.getByRole('link', { name: 'What if', exact: true })).toHaveCount(0);
      await line.getByRole('link', { name: 'Try a change' }).click();
      // The page it opens is still called What if.
      await expect(page.getByRole('heading', { level: 1, name: 'What if' })).toBeVisible();
      expect(await layoutProblems(page)).toEqual([]);
    });

    test('answer 3: money coming in is marked as arrived, money going out as paid', async ({
      page,
    }) => {
      await openComingUp(page);
      await openPeriod(page, '2026-10-30');
      await rowIn(page, '2026-10-30', 'Pay').click();
      let sheet = page.getByRole('dialog', { name: 'Pay' });
      await expect(sheet.getByRole('button', { name: 'Mark as paid' })).toHaveCount(0);
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Mark as arrived' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Pay marked as arrived.');
      // Ticked before its day, it counts as arrived today (D1), so it's in this pay now.
      await expect(rowIn(page, '2026-10-25', 'Pay')).toContainText(
        `${day('Sun 25 Oct')}, estimate, arrived`,
      );
      await rowIn(page, '2026-10-25', 'Pay').click();
      sheet = page.getByRole('dialog', { name: 'Pay' });
      await sheet.getByRole('button', { name: 'Mark as not arrived' }).click();
      await expect(undoBar(page)).toContainText('Pay marked as not arrived.');

      // Money moved in from savings arrives too; money going out is still paid.
      await rowIn(page, '2026-10-25', 'From savings').click();
      sheet = page.getByRole('dialog', { name: 'From savings' });
      await expect(sheet.getByRole('button', { name: 'Mark as arrived' })).toBeVisible();
      await sheet.getByRole('button', { name: 'Close' }).click();
      await rowIn(page, '2026-10-25', 'Family loan').click();
      sheet = page.getByRole('dialog', { name: 'Family loan' });
      await expect(sheet.getByRole('button', { name: 'Mark as paid' })).toBeVisible();
      await expect(sheet.getByRole('button', { name: 'Mark as arrived' })).toHaveCount(0);
    });

    test('answer 4: closing a debt answers "Yes, remove them" or "No, keep them"', async ({
      page,
    }) => {
      await page.goto('/app/debts/');
      await page.getByRole('link', { name: /^Family loan/ }).click();
      await page.getByRole('button', { name: 'Close this debt' }).click();
      let sheet = page.getByRole('dialog', { name: 'Close this debt' });
      let question = sheet.getByRole('group', { name: 'Also remove its 6 planned payments?' });
      await expect(question.getByRole('radio')).toHaveCount(2);
      await expect(
        question.getByRole('radio', { name: 'Yes, remove them', exact: true }),
      ).toBeVisible();
      await expect(
        question.getByRole('radio', { name: 'No, keep them', exact: true }),
      ).toBeVisible();
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Go back' }).click();

      // A debt with one planned payment says "it".
      await page.goto('/app/debts/');
      await page.getByRole('link', { name: /^Pay-later card/ }).click();
      await page.getByRole('button', { name: 'Close this debt' }).click();
      sheet = page.getByRole('dialog', { name: 'Close this debt' });
      question = sheet.getByRole('group', { name: 'Also remove its planned payment?' });
      await expect(
        question.getByRole('radio', { name: 'Yes, remove it', exact: true }),
      ).toBeVisible();
      await expect(question.getByRole('radio', { name: 'No, keep it', exact: true })).toBeVisible();
    });

    test('answer 5: pay that isn’t weekly says "Payday 2 of 4", not "Week 2 of 4"', async ({
      page,
    }) => {
      await useSetting(page, { plan: fortnightlyPay });
      await page.goto('/app/pay/');
      await page.getByRole('button', { name: 'Work out take-home pay' }).click();
      await page
        .getByTestId('pay-result')
        .getByRole('button', { name: 'Save as a usual week' })
        .click();
      const sheet = page.getByRole('dialog', { name: 'Save as a usual week' });
      const which = sheet.getByRole('group', { name: 'Which paydays is it for?' });
      await which.getByRole('radio', { name: 'One payday of the pattern' }).check();
      const step = sheet.getByRole('group', { name: 'Which payday of the pattern?' });
      await expect(step).toContainText(`Payday 2 of 4, next on ${day('Fri 13 Nov')}`);
      await expect(step).not.toContainText('Week');
      await step.getByRole('radio', { name: /^Payday 2 of 4/ }).check();
      await noAxeProblems(page);
      await sheet.getByLabel('Name this week').fill('Short week');
      await sheet.getByRole('button', { name: 'Save usual week' }).click();
      await expect(undoBar(page)).toContainText(
        'Short week saved as the usual week for payday 2 of your pay pattern.',
      );
      await page.goto('/app/job/');
      const job = page.getByTestId('job');
      await expect(job).toContainText('Short weekPayday 2 of 4 in your pay pattern');
      await expect(job).toContainText('Rota week 1, 3 shiftsPayday 1 of 4 in your pay pattern');

      // The edit sheet asks the same way.
      await openComingUp(page);
      await openPeriod(page, '2026-10-30');
      await rowIn(page, '2026-10-30', 'Pay').click();
      const edit = page.getByRole('dialog', { name: 'Pay' });
      await changeAmount(edit, '600', true);
      await expect(
        edit.getByRole('radio', { name: 'Only this payday of the pattern', exact: true }),
      ).toBeVisible();
      await expect(edit.getByRole('radio', { name: 'Only this week of the pattern' })).toHaveCount(
        0,
      );
    });

    test('answer 5: weekly pay still says "Week 2 of 4" and "Only this week of the pattern"', async ({
      page,
    }) => {
      await openComingUp(page);
      await openPeriod(page, '2026-10-30');
      await rowIn(page, '2026-10-30', 'Pay').click();
      const edit = page.getByRole('dialog', { name: 'Pay' });
      await changeAmount(edit, '600', true);
      await expect(
        edit.getByRole('radio', { name: 'Only this week of the pattern', exact: true }),
      ).toBeVisible();
    });

    test('answer 6: "usual week" everywhere, never "pay week" or "saved week"', async ({
      page,
    }) => {
      await page.goto('/app/pay/');
      await expect(page.getByText('Start from a usual week')).toBeVisible();
      await page.getByRole('button', { name: 'Work out take-home pay' }).click();
      await expect(page.getByRole('button', { name: 'Save as a usual week' })).toBeVisible();
      await expect(page.getByText(/pay week|saved week/i)).toHaveCount(0);
      await page.goto('/app/job/');
      await expect(page.getByTestId('job')).toContainText('Usual weeks');
      await expect(page.getByText(/pay week|saved week/i)).toHaveCount(0);
    });

    test('answer 7: Home’s fourth button says "Overtime or missed shift" and opens "What happened?"', async ({
      page,
    }) => {
      await page.goto('/app/');
      const button = page.getByRole('button', { name: 'Overtime or missed shift', exact: true });
      await expect(button).toBeVisible();
      expect(await layoutProblems(page)).toEqual([]);
      await button.click();
      const sheet = page.getByRole('dialog', { name: 'I did overtime' });
      const what = sheet.getByRole('group', { name: 'What happened?' });
      await expect(what.getByRole('radio', { name: 'I worked extra hours' })).toBeChecked();
      await expect(what.getByRole('radio', { name: 'I missed a shift' })).toBeVisible();
      await noAxeProblems(page);
    });

    test('answer 9: with very large text, the undo bar uses shorter words and never covers half the screen', async ({
      page,
    }) => {
      // With usual text, the bar says it all.
      await openComingUp(page);
      await openPeriod(page, '2026-10-30');
      await rowIn(page, '2026-10-30', 'Rent').click();
      let sheet = page.getByRole('dialog', { name: 'Rent' });
      await changeAmount(sheet, '560', true);
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(undoBar(page)).toContainText('Rent changed for this and all later ones.');
      await undoBar(page).getByRole('button', { name: 'Undo' }).click();
      await expect(undoBar(page)).toHaveText('Change undone.');

      // At 200% text, shorter words, and the bar and navigation cover under half the screen.
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await rowIn(page, '2026-10-30', 'Rent').click();
      sheet = page.getByRole('dialog', { name: 'Rent' });
      await changeAmount(sheet, '560', true);
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(undoBar(page)).toContainText('Rent changed.');
      await expect(undoBar(page)).not.toContainText('this and all later ones');
      await expect(undoBar(page).getByRole('button', { name: 'Undo' })).toBeVisible();
      expect(await barCovers(page)).toBeLessThan(0.5);
      await noAxeProblems(page);

      // Update balance, whose usual words are the longest of all.
      await page.goto('/app/');
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await page.getByRole('button', { name: 'Update balance', exact: true }).click();
      sheet = page.getByRole('dialog', { name: 'Update balance' });
      await sheet.getByLabel('Type what your bank shows now').fill('237.54');
      await sheet.getByRole('button', { name: 'Next' }).click();
      await sheet.getByRole('button', { name: 'Next' }).click();
      await sheet.getByRole('button', { name: 'Tick all' }).click();
      await sheet.getByRole('button', { name: 'Done' }).click();
      await sheet.getByRole('button', { name: 'Close' }).first().click();
      await expect(undoBar(page)).toHaveText(/^Balance updated\.Undo$/);
      expect(await barCovers(page)).toBeLessThan(0.5);
      await undoBar(page).getByRole('button', { name: 'Undo' }).click();
      await expect(undoBar(page)).toHaveText('Change undone.');
      expect(await barCovers(page)).toBeLessThan(0.5);
    });
  });
}
