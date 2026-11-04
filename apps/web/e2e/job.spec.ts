// Your job (step 2h, brief 4.15, D154), at 320px and 360px wide, in light
// and dark, checked by axe: the details from Sam's week 29 payslip, changing
// them as one change with one Undo, overtime saved for a payday still to
// come worked out again, the words for each mistake, and "Save as a pay
// week" asking which paydays the week is for (D5). "Today" is Sun 25 Oct
// 2026 on Sam's example.

import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { AXE_TAGS, layoutProblems, openPeriod, rowIn } from './coming-up.ts';
import { expect, test } from './fixtures.ts';

const NB = ' ';
const day = (text: string) => text.replaceAll(' ', NB);

async function noAxeProblems(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
}

async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(wide).toBeLessThanOrEqual(0);
}

const undoBar = (page: Page) => page.getByTestId('undo-bar');

async function undo(page: Page) {
  await undoBar(page).getByRole('button', { name: 'Undo' }).click();
  await expect(undoBar(page)).toHaveText('Change undone.');
}

/** Opens Your job from More, as a person would. */
async function openJob(page: Page): Promise<Locator> {
  await page.goto('/app/more/');
  const link = page.getByRole('link', { name: /^Your job/ });
  await expect(link).toContainText('Tax code, pension and overtime rate, from your payslip');
  await link.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your job' })).toBeVisible();
  const job = page.getByTestId('job');
  await expect(job).toBeVisible();
  return job;
}

/** One detail's words, under its label. */
const detail = (job: Locator, label: string) =>
  job.getByRole('term').filter({ hasText: label }).locator('xpath=following-sibling::dd');

/** Adds 11.5 hours of overtime on Mon 26 Oct from Home: +£155.12 on Fri 6 Nov (D5, D124). */
async function addOvertime(page: Page) {
  await page.goto('/app/');
  await expect(page.getByTestId('balance')).toBeVisible();
  await page.getByRole('button', { name: 'I did overtime', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'I did overtime' });
  await sheet.getByLabel('Day of the overtime').fill('2026-10-26');
  await sheet.getByLabel('Hours', { exact: true }).fill('11.5');
  await expect(sheet.getByTestId('shift-preview')).toHaveText(
    `This adds £155.12 to your pay on ${day('Fri 6 Nov')}, making it £773.58.`,
  );
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
}

/** Goes to Coming up and opens Fri 6 Nov. */
async function openPeriodFromNav(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Coming up' })
    .click();
  await openPeriod(page, '2026-11-06');
}

async function openSheet(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Change these details' }).click();
  const sheet = page.getByRole('dialog', { name: 'Your job details' });
  await expect(sheet).toContainText("Change anything that's different on your latest payslip.");
  return sheet;
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Your job, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test("shows every detail from Sam's week 29 payslip, and which week of the pattern each usual week is", async ({
      page,
    }) => {
      const job = await openJob(page);
      await expect(
        page.getByText('The details from your payslip that PrePenny uses'),
      ).toBeVisible();
      await expect(job.getByRole('heading', { name: 'Warehouse job' })).toBeVisible();
      await expect(job).toContainText('For Pay.');
      const expected = [
        ['Paid', 'Every week'],
        ['Tax code', '1257L, the usual way'],
        ['Workplace pension', '4% of your pay from £120.00 to £967.00 a week, before tax'],
        ['Student loan', 'None'],
        ['Other deductions', 'None'],
        [
          'From your last payslip',
          'Tax week 29: gross for tax so far £10,732.73, tax paid so far £743.40',
        ],
        ['Overtime rate', '£19.07 an hour'],
        [
          'Work each payday pays for',
          `${day('Fri 30 Oct')} pays for work up to ${day('Sun 25 Oct')}`,
        ],
      ] as const;
      for (const [label, words] of expected) {
        await expect(detail(job, label)).toHaveText(words);
      }
      await expect(job).toContainText('Rota week 1, 3 shiftsWeek 1 of 4 in your pay pattern');
      await expect(job).toContainText('Rota week 4, 4 shiftsWeek 4 of 4 in your pay pattern');
      await expect(page.getByTestId('shifts-ahead')).toHaveCount(0);
      // The bottom navigation marks More.
      await expect(
        page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }),
      ).toHaveAttribute('aria-current', 'location');
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      const sheet = await openSheet(page);
      await expect(sheet.getByLabel('Tax code')).toHaveValue('1257L');
      await expect(sheet.getByLabel('Overtime rate an hour')).toHaveValue('19.07');
      await expect(sheet.getByLabel(`${day('Fri 30 Oct')} pays for work up to`)).toHaveValue(
        '2026-10-25',
      );
      await noAxeProblems(page);
    });

    test('taking the pension off works out the overtime saved for Fri 6 Nov again, and Undo puts it back (D154)', async ({
      page,
    }) => {
      await addOvertime(page);
      const job = await openJob(page);
      await expect(page.getByTestId('shifts-ahead')).toHaveText(
        '1 overtime or missed shift is saved for a payday still to come. Changing these details works it out again.',
      );
      const sheet = await openSheet(page);
      await expect(sheet).toContainText(
        'Overtime and missed shifts saved for paydays still to come are worked out again with these details.',
      );
      await sheet.getByRole('checkbox', { name: 'I pay into a workplace pension' }).uncheck();
      await sheet.getByRole('button', { name: 'Save these details' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText(
        `Your job details changed. Your pay on ${day('Fri 6 Nov')} is now £779.06.`,
      );
      await expect(detail(job, 'Workplace pension')).toHaveText('None');
      // Undo puts the pension, and the overtime worked out with it, back.
      await undo(page);
      await expect(detail(job, 'Workplace pension')).toHaveText(
        '4% of your pay from £120.00 to £967.00 a week, before tax',
      );
      await openPeriodFromNav(page);
      await expect(rowIn(page, '2026-11-06', 'Pay')).toContainText('+£773.58');
      // Made again, Coming up shows Fri 6 Nov's new pay.
      await page.goto('/app/job/');
      const again = await openSheet(page);
      await again.getByRole('checkbox', { name: 'I pay into a workplace pension' }).uncheck();
      await again.getByRole('button', { name: 'Save these details' }).click();
      await expect(again).toBeHidden();
      await openPeriodFromNav(page);
      await expect(rowIn(page, '2026-11-06', 'Pay')).toContainText('+£779.06');
    });
  });
}

test('each mistake is explained beside its box, and saving with nothing changed says so', async ({
  page,
}) => {
  await openJob(page);
  const sheet = await openSheet(page);
  await sheet.getByRole('button', { name: 'Save these details' }).click();
  await expect(sheet).toContainText('Change something first, then save.');
  await sheet.getByLabel('Tax code').fill('XYZ');
  await sheet.getByLabel('Overtime rate an hour').fill('lots');
  await sheet.getByRole('button', { name: 'Save these details' }).click();
  await expect(sheet).toContainText(
    'Type the tax code as it is on your payslip, for example 1257L.',
  );
  await expect(sheet).toContainText('Type the rate, for example 19.07, or leave it empty.');
  await expect(sheet.getByLabel('Tax code')).toBeFocused();
  await noAxeProblems(page);
  // A new tax code, as on the payslip, is saved as one change with one Undo.
  await sheet.getByLabel('Tax code').fill('1263l');
  await sheet.getByLabel('Overtime rate an hour').fill('19.07');
  await sheet.getByRole('button', { name: 'Save these details' }).click();
  await expect(sheet).toBeHidden();
  await expect(undoBar(page)).toHaveText(/^Your job details changed\./);
  await expect(detail(page.getByTestId('job'), 'Tax code')).toHaveText('1263L, the usual way');
  await undo(page);
  await expect(detail(page.getByTestId('job'), 'Tax code')).toHaveText('1257L, the usual way');
});

test('a new last day covered that would move a saved shift to another payday is refused in words (D154)', async ({
  page,
}) => {
  await addOvertime(page);
  await openJob(page);
  const sheet = await openSheet(page);
  // Fri 30 Oct covering work up to Wed 28 Oct would put Mon 26 Oct's shift on Fri 30 Oct.
  await sheet.getByLabel(`${day('Fri 30 Oct')} pays for work up to`).fill('2026-10-28');
  await sheet.getByRole('button', { name: 'Save these details' }).click();
  await expect(sheet).toContainText(
    'A shift saved for a payday still to come would then go on another payday. Remove that shift, change this, then add the shift again.',
  );
  await expect(undoBar(page)).toHaveCount(0);
});

test('Your job and its sheet stay readable with text at 200%', async ({ page }) => {
  await openJob(page);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(await layoutProblems(page)).toEqual([]);
  await openSheet(page);
  expect(await layoutProblems(page)).toEqual([]);
});

test('Save as a pay week asks which paydays it is for, and one week of the pattern changes only that week (D5)', async ({
  page,
}) => {
  await page.goto('/app/pay/');
  await expect(page.getByRole('heading', { level: 1, name: 'Pay calculator' })).toBeVisible();
  await page.getByRole('button', { name: 'Work out take-home pay' }).click();
  const result = page.getByTestId('pay-result');
  await expect(result).toBeVisible();
  await result.getByRole('button', { name: 'Save as a pay week' }).click();
  const sheet = page.getByRole('dialog', { name: 'Save as a pay week' });
  const which = sheet.getByRole('group', { name: 'Which paydays is it for?' });
  await expect(which.getByRole('radio', { name: 'Every payday' })).toBeChecked();
  await which.getByRole('radio', { name: 'One week of the pattern' }).check();
  const step = sheet.getByRole('group', { name: 'Which week of the pattern?' });
  await expect(step.getByRole('radio')).toHaveCount(4);
  await expect(step).toContainText(`Week 2 of 4, next on ${day('Fri 6 Nov')}`);
  await expect(step).toContainText('Uses Rota week 2, 4 shifts now.');
  await step.getByRole('radio', { name: /^Week 2 of 4/ }).check();
  await noAxeProblems(page);
  await sheet.getByLabel('Name this week').fill('Short week');
  await sheet.getByRole('button', { name: 'Save pay week' }).click();
  await expect(sheet).toBeHidden();
  await expect(undoBar(page)).toContainText(
    'Short week saved as the pay week for week 2 of your pay pattern.',
  );
  const job = await openJob(page);
  await expect(job).toContainText('Short weekWeek 2 of 4 in your pay pattern');
  await expect(job).toContainText('Rota week 2, 4 shiftsKept to start from in the Pay calculator');
  await expect(job).toContainText('Rota week 1, 3 shiftsWeek 1 of 4 in your pay pattern');
});
