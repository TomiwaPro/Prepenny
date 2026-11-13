// The four actions on Home (brief 4.2, 4.3, 4.5, 4.9): Update balance, I
// spent, Add a payment, and I did overtime or I missed a shift, at 320px
// and 360px wide, in light and dark, checked by axe: the owner's step 2d
// tests 1 to 7. Each saves at once, updates the plan, and shows the undo bar.
//
// Tests that need another "today", or a plan with a budget, use the
// test-only setting (lib/test-setting.ts, D201), which only a browser
// driven by test software can reach.

import type { Locator, Page } from '@playwright/test';
import { type Budget, type PlanRecords, parsePounds, type Spend } from '@prepenny/engine';
import { examplePlan } from '../data/example-plan.ts';
import { TEST_SETTING_KEY, type TestSetting } from '../lib/test-setting.ts';
import { axeOnceStill } from './axe.ts';
import {
  goToComingUp,
  leftAtEnd,
  MINUS,
  named,
  openPeriod,
  period,
  rowIn,
  AXE_TAGS as tags,
} from './coming-up.ts';
import { expect, settingScript, test } from './fixtures.ts';
import { helperInCharge } from './offline-helper.ts';

/** Sam's example with Travel at £25 a week from Friday, all at the start, and £4.00 spent on Sat 24 Oct before the update. */
const travel: Budget = {
  id: 'travel',
  accountId: 'current',
  name: 'Travel',
  amount: parsePounds('25.00'),
  every: 'week',
  leaves: 'at-start',
  rollOver: false,
  startsOn: '2026-10-23',
  createdAt: '2026-10-23T09:00:00Z',
};
const busOn24Oct: Spend = {
  id: 'bus-24-oct',
  budgetId: 'travel',
  amount: parsePounds('4.00'),
  spentOn: '2026-10-24',
  recordedAt: '2026-10-24T17:00:00Z',
};
const withTravel: PlanRecords = { ...examplePlan, budgets: [travel], spends: [busOn24Oct] };

/** Puts the test-only setting on the page before PrePenny starts (D201). */
async function useSetting(page: Page, setting: TestSetting) {
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, setting] as const);
}

async function openHome(page: Page) {
  await page.goto('/app/');
  await expect(page.getByTestId('balance')).toBeVisible();
}

async function openAction(page: Page, name: string, title = name): Promise<Locator> {
  await page.getByRole('button', { name, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: title });
  await expect(sheet).toBeVisible();
  return sheet;
}

const undoBar = (page: Page) => page.getByTestId('undo-bar');

async function undo(page: Page) {
  await undoBar(page).getByRole('button', { name: 'Undo' }).click();
  await expect(undoBar(page)).toHaveText('Change undone.');
}

async function noAxeProblems(page: Page) {
  expect((await (await axeOnceStill(page)).withTags(tags).analyze()).violations).toEqual([]);
}

/** Goes to the Coming up page and opens the paydays given (D211). */
async function openPlan(page: Page, ...paydays: readonly string[]) {
  await goToComingUp(page);
  for (const start of paydays) await openPeriod(page, start);
}

const rowsIn = (page: Page, start: string) => period(page, start).locator('[data-row-key]');

/** The names of a period's rows, in order: each row's words without its date tile. */
const namesIn = (page: Page, start: string) =>
  rowsIn(page, start).evaluateAll((rows) =>
    rows.map((row) =>
      [...row.querySelectorAll(':scope > span:nth-child(2) > span:first-child')]
        .map((one) => one.textContent ?? '')
        .join(''),
    ),
  );

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`The four actions, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('test 1: Update balance on Sun 25 Oct, typing £237.54, says the plan and the bank match', async ({
      page,
    }) => {
      await openHome(page);
      const sheet = await openAction(page, 'Update balance');
      await expect(sheet.getByText('Step 1 of 3')).toBeVisible();
      await expect(sheet.getByRole('radio', { name: 'Current account' })).toBeChecked();
      await sheet.getByLabel('Type what your bank shows now').fill('237.54');
      await sheet.getByRole('button', { name: 'Next' }).click();

      const compare = sheet.getByTestId('balance-compare');
      await expect(compare).toContainText('The plan expected £237.54 by the end of today.');
      await expect(compare).toContainText('Your bank shows £237.54.');
      await expect(compare).toContainText('They match.');
      await noAxeProblems(page);

      await sheet.getByRole('button', { name: 'Next' }).click();
      await expect(sheet.getByText('Step 3 of 3')).toBeVisible();
      const boxes = sheet.getByTestId('to-tick').getByRole('checkbox');
      await expect(boxes).toHaveCount(1);
      await boxes.first().check();
      await sheet.getByRole('button', { name: 'Done' }).click();
      await expect(sheet.getByRole('heading', { name: 'Balance updated' })).toBeVisible();
      await expect(
        sheet.getByText(/^£237\.54, Sun\u00a025\u00a0Oct, \d{1,2}:\d{2}(am|pm)$/),
      ).toBeVisible();
      await expect(sheet.getByTestId('balance-lowest')).toContainText(
        '£4.53 on Sun\u00a01\u00a0Nov, after Rent',
      );
      await sheet.getByRole('button', { name: 'Done' }).click();
      await expect(sheet).toBeHidden();

      await expect(page.getByTestId('balance')).toHaveText('£237.54');
      await expect(undoBar(page)).toContainText(
        'Current account balance updated, and 1 payment ticked.',
      );
      await undo(page);
      await expect(page.getByTestId('balance')).toHaveText('£267.54');
    });

    test('test 2: brief 8.4 test 5, on Fri 30 Oct, £600.00, Tick all and Done, then one Undo', async ({
      page,
    }) => {
      await useSetting(page, { today: '2026-10-30' });
      await openHome(page);
      // Money has moved since Sun 25 Oct, so Home shows about what's there
      // now, the figure Update balance expects (D430, D46). The example says
      // the day it's shown as on, here the test's own today (D440).
      await expect(page.getByTestId('now')).toHaveText('About £604.53 now');
      await expect(page.getByTestId('bank-showed')).toHaveText(
        'Bank: £267.54 on Sun\u00a025\u00a0Oct',
      );
      await expect(page.getByTestId('checked')).toHaveText(
        'Example plan, as on Fri\u00a030\u00a0Oct\u00a02026',
      );
      const sheet = await openAction(page, 'Update balance');
      await sheet.getByLabel('Type what your bank shows now').fill('600');
      await sheet.getByRole('button', { name: 'Next' }).click();
      const compare = sheet.getByTestId('balance-compare');
      await expect(compare).toContainText('The plan expected £604.53 by the end of today.');
      await expect(compare).toContainText('Your bank shows £600.00.');
      await expect(compare).toContainText("That's £4.53 less.");
      await sheet.getByRole('button', { name: 'Next' }).click();

      // Everything from today or earlier, oldest first.
      const boxes = sheet.getByTestId('to-tick').getByRole('checkbox');
      const names = await boxes.evaluateAll((all) =>
        all.map((box) => box.getAttribute('aria-label')),
      );
      const s = '\u00a0';
      expect(names).toEqual([
        `Sun${s}25${s}Oct, Spending money until payday, ${MINUS}£30.00`,
        `Mon${s}26${s}Oct, Family loan, ${MINUS}£125.00`,
        `Mon${s}26${s}Oct, Driving lesson, ${MINUS}£100.00`,
        `Wed${s}28${s}Oct, From savings, +£500.00`,
        `Thu${s}29${s}Oct, Pay-later card, ${MINUS}£466.07`,
        `Fri${s}30${s}Oct, Pay, +£603.06`,
        `Fri${s}30${s}Oct, Spending money, ${MINUS}£45.00`,
      ]);
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Tick all' }).click();
      for (const box of await boxes.all()) await expect(box).toBeChecked();
      await sheet.getByRole('button', { name: 'Done' }).click();

      await expect(sheet.getByText(/^£600\.00, Fri\u00a030\u00a0Oct, /)).toBeVisible();
      await expect(sheet.getByText('7 payments ticked as paid.')).toBeVisible();
      const lowest = sheet.getByTestId('balance-lowest');
      await expect(lowest).toContainText('£0.00 on Sun\u00a01\u00a0Nov, after Rent');
      await expect(lowest).toContainText('Tight');
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Done' }).click();
      await expect(sheet).toBeHidden();

      await expect(page.getByTestId('balance')).toHaveText('£600.00');
      await expect(page.getByTestId('checked')).toHaveText(
        'Example plan, as on Fri\u00a030\u00a0Oct\u00a02026',
      );
      await expect(page.getByTestId('lowest-point')).toContainText('£0.00');
      // On payday, the pay that came in today, never "Coming in £0.00" (D206).
      const cover = page.getByTestId('this-pay');
      await expect(cover.getByText('Pay £603.06, came in today', { exact: true })).toBeVisible();
      await expect(cover.getByRole('term')).toHaveText(['Going out by Thu\u00a05\u00a0Nov']);
      await expect(cover.getByRole('definition')).toHaveText(['£600.00']);
      await expect(undoBar(page)).toContainText(
        'Current account balance updated, and 7 payments ticked.',
      );

      // One Undo puts everything back: the balance, its date and every tick.
      await undo(page);
      await expect(page.getByTestId('balance')).toHaveText('£267.54');
      await expect(page.getByTestId('bank-showed')).toHaveText(
        'Bank: £267.54 on Sun\u00a025\u00a0Oct',
      );
      await expect(page.getByTestId('now')).toHaveText('About £604.53 now');
      await expect(page.getByTestId('lowest-point')).toContainText('£4.53');
      // Before it's ticked, the pay is still coming in today.
      await expect(
        page.getByTestId('this-pay').getByText('Pay £603.06, coming in today', { exact: true }),
      ).toBeVisible();
      await openPlan(page);
      await expect(page.getByTestId('not-ticked-yet').locator('[data-row-key]')).toHaveCount(5);
    });

    test('test 3: I spent £6.00 on Travel, with £4.00 already spent, and Home warns', async ({
      page,
    }) => {
      await useSetting(page, { plan: withTravel });
      await openHome(page);
      let sheet = await openAction(page, 'I spent');
      await expect(sheet.getByRole('heading', { name: 'Travel' })).toBeVisible();
      const week = sheet.getByTestId('budget-period');
      await expect(week).toContainText('This week, to Thu\u00a029\u00a0Oct');
      await expect(week.getByRole('definition')).toHaveText(['£4.00', '£21.00']);
      await expect(sheet.getByLabel('When')).toHaveValue('2026-10-25');
      await sheet.getByLabel('How much').fill('6.00');
      await expect(sheet.getByText('With this: £10.00 spent, £15.00 left.')).toBeVisible();
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText(
        '£6.00 spent on Travel. This week: £10.00 spent, £15.00 left.',
      );

      sheet = await openAction(page, 'I spent');
      await expect(sheet.getByTestId('budget-period').getByRole('definition')).toHaveText([
        '£10.00',
        '£15.00',
      ]);
      await sheet.getByRole('button', { name: 'Close' }).click();

      await expect(page.getByText('Left to spend until Fri\u00a030\u00a0Oct')).toBeVisible();
      await expect(page.getByTestId('left-to-spend')).toHaveText('£45.00');
      await expect(
        page.getByText(
          'Spend no more than £16.54 to keep at least £20 until Fri\u00a030\u00a0Oct.',
        ),
      ).toBeVisible();
      const lowest = page.getByTestId('lowest-point');
      await expect(lowest).toContainText(`${MINUS}£41.47`);
      await expect(lowest).toContainText('Sun\u00a01\u00a0Nov, after Rent');
      await expect(lowest).toContainText('Short');
      await expect(lowest).toContainText('£8.46 short on Mon\u00a026\u00a0Oct.');
    });

    test('test 4: Add a payment, Car MOT, £54.85 once on Fri 13 Nov', async ({ page }) => {
      await openHome(page);
      await openPlan(page, '2026-11-13');
      await expect(rowIn(page, '2026-11-13', 'Spending money')).toContainText('£420.75 left');
      await page.getByRole('link', { name: 'Home', exact: true }).click();

      const sheet = await openAction(page, 'Add a payment');
      await expect(sheet.getByRole('radio', { name: 'Going out' })).toBeChecked();
      await sheet.getByLabel('Name').fill('Car MOT');
      await sheet.getByLabel('Amount').fill('54.85');
      await sheet.getByLabel('Next payment').fill('2026-11-13');
      await expect(sheet.getByText('Fri\u00a013\u00a0Nov', { exact: true })).toBeVisible();
      await expect(sheet.getByRole('radio', { name: 'Once' })).toBeChecked();
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Add payment' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Car MOT added.');

      // The paydays opened are kept while PrePenny is open (D211).
      await openPlan(page);
      await expect(rowIn(page, '2026-11-13', 'Car MOT')).toBeVisible();
      // Fri 13 Nov: Pay, To savings, Spending money, then Car MOT, the newest (D12).
      const names = await namesIn(page, '2026-11-13');
      expect(names.indexOf('Car MOT')).toBe(names.indexOf('Spending money') + 1);
      const mot = rowIn(page, '2026-11-13', 'Car MOT');
      await expect(mot).toContainText(`${MINUS}£54.85`);
      await expect(mot).toContainText('£365.90 left');
      await expect(rowIn(page, '2026-11-13', 'Spending money')).toContainText('£420.75 left');
    });

    test('test 5: I did overtime, 11.5 hours on Mon 26 Oct, lands on Fri 6 Nov', async ({
      page,
    }) => {
      await openHome(page);
      const sheet = await openAction(page, 'Overtime or missed shift', 'I did overtime');
      await sheet.getByLabel('Day of the overtime').fill('2026-10-26');
      await sheet.getByLabel('Hours', { exact: true }).fill('11.5');
      await expect(sheet.getByText('At £19.07 an hour.')).toBeVisible();
      await expect(sheet.getByTestId('shift-preview')).toHaveText(
        'This adds £155.12 to your pay on Fri\u00a06\u00a0Nov, making it £773.58.',
      );
      // Week 27's lines have a shift premium, so the extras box shows (D130).
      await expect(sheet.getByLabel('Extras it adds, such as shift premium, if any')).toBeVisible();
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText(
        'Overtime added. Your pay on Fri\u00a06\u00a0Nov goes up by £155.12.',
      );

      // Opened again, it remembers the hours and the rate (D200).
      const again = await openAction(page, 'Overtime or missed shift', 'I did overtime');
      await expect(again.getByLabel('Hours', { exact: true })).toHaveValue('11.5');
      await expect(again.getByText('At £19.07 an hour.')).toBeVisible();
      await again.getByRole('button', { name: 'Close', exact: true }).click();

      await openPlan(page, '2026-11-06');
      await expect(rowIn(page, '2026-11-06', 'Pay')).toContainText('+£773.58');
      await expect(leftAtEnd(page, '2026-11-06')).toHaveText('£310.81');
    });

    test('test 6: I missed a shift, 11.5 hours on Tue 3 Nov, comes off Fri 13 Nov', async ({
      page,
    }) => {
      await openHome(page);
      let sheet = await openAction(page, 'Overtime or missed shift', 'I did overtime');
      await sheet.getByRole('radio', { name: 'I missed a shift' }).check();
      sheet = page.getByRole('dialog', { name: 'I missed a shift' });
      await expect(sheet).toBeVisible();
      await sheet.getByLabel('Day of the shift').fill('2026-11-03');
      await sheet.getByLabel('Hours', { exact: true }).fill('11.5');
      await expect(sheet.getByText('At £12.71 an hour.')).toBeVisible();
      await expect(sheet.getByTestId('shift-preview')).toHaveText(
        'This takes £100.43 off your pay on Fri\u00a013\u00a0Nov, making it £368.63.',
      );
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText(
        'Missed shift added. Your pay on Fri\u00a013\u00a0Nov goes down by £100.43.',
      );
      await openPlan(page, '2026-11-06', '2026-11-13');
      await expect(rowIn(page, '2026-11-13', 'Pay')).toContainText('+£368.63');
      await expect(rowIn(page, '2026-11-06', 'Pay')).toContainText('+£618.46');
    });

    test('test 7: every sheet takes focus, closes with Escape or Close, gives focus back, and explains mistakes', async ({
      page,
    }) => {
      await useSetting(page, { plan: withTravel });
      await openHome(page);
      const sheets = [
        { button: 'Update balance', title: 'Update balance' },
        { button: 'Add a payment', title: 'Add a payment' },
        { button: 'I spent', title: 'I spent' },
        { button: 'Overtime or missed shift', title: 'I did overtime' },
      ];
      for (const one of sheets) {
        const button = page.getByRole('button', { name: one.button, exact: true });
        await button.focus();
        await page.keyboard.press('Enter');
        const sheet = page.getByRole('dialog', { name: one.title });
        await expect(sheet).toBeVisible();
        expect(await sheet.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(
          true,
        );
        await page.keyboard.press('Escape');
        await expect(sheet).toBeHidden();
        await expect(button).toBeFocused();

        await button.click();
        await expect(sheet).toBeVisible();
        await noAxeProblems(page);
        await sheet.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(sheet).toBeHidden();
        await expect(button).toBeFocused();
      }

      // Update balance: every control has a name, and a mistake says what to do.
      let sheet = await openAction(page, 'Update balance');
      for (const label of ['Type what your bank shows now', "It's overdrawn, below £0.00"]) {
        await expect(sheet.getByLabel(label, { exact: true })).toBeVisible();
      }
      await sheet.getByRole('button', { name: 'Next' }).click();
      await expect(sheet.getByText('Type what your bank shows, for example 237.54.')).toBeVisible();
      await expect(sheet.getByLabel('Type what your bank shows now')).toBeFocused();
      await expect(sheet.getByLabel('Type what your bank shows now')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Close', exact: true }).click();

      // Add a payment.
      sheet = await openAction(page, 'Add a payment');
      for (const label of [
        'Name',
        'Amount',
        'Next payment',
        'Type',
        'This is an estimate',
        'Note',
      ]) {
        await expect(sheet.getByLabel(label, { exact: true })).toBeVisible();
      }
      await sheet.getByRole('button', { name: 'Add payment' }).click();
      await expect(sheet.getByText('Type a name, for example Car MOT.')).toBeVisible();
      await expect(sheet.getByText('Type an amount, for example 25.')).toBeVisible();
      await expect(sheet.getByLabel('Name')).toBeFocused();
      await sheet.getByLabel('Name').fill('Car MOT');
      await sheet.getByLabel('Amount').fill('54.85');
      await sheet.getByLabel('Next payment').fill('2026-10-24');
      await sheet.getByRole('button', { name: 'Add payment' }).click();
      await expect(
        sheet.getByText(
          "Pick today or a later date. If it's already gone, update your balance instead.",
        ),
      ).toBeVisible();
      await expect(sheet.getByLabel('Next payment')).toBeFocused();
      await sheet.getByText('Every month, or every few months', { exact: true }).click();
      await sheet.getByLabel('Next payment').fill('2026-11-13');
      await expect(sheet.getByRole('radio', { name: 'The 13th of the month' })).toBeChecked();
      await expect(
        sheet.getByRole('radio', { name: 'The second Friday of the month' }),
      ).toBeVisible();
      await sheet.getByLabel('How many months apart').fill('13');
      await sheet.getByRole('button', { name: 'Add payment' }).click();
      await expect(sheet.getByText('Type a number from 1 to 12.')).toBeVisible();
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Close', exact: true }).click();

      // I spent.
      sheet = await openAction(page, 'I spent');
      for (const label of ['How much', 'When']) {
        await expect(sheet.getByLabel(label, { exact: true })).toBeVisible();
      }
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet.getByText('Type an amount, for example 25.')).toBeVisible();
      await expect(sheet.getByLabel('How much')).toBeFocused();
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Close', exact: true }).click();

      // I did overtime.
      sheet = await openAction(page, 'Overtime or missed shift', 'I did overtime');
      for (const label of ['Day of the overtime', 'Hours']) {
        await expect(sheet.getByLabel(label, { exact: true })).toBeVisible();
      }
      // A question with two clear choices, not a switch (D213).
      const what = sheet.getByRole('group', { name: 'What happened?' });
      await expect(what).toBeVisible();
      for (const name of ['I worked extra hours', 'I missed a shift']) {
        await expect(what.getByRole('radio', { name })).toBeVisible();
      }
      await expect(what.getByRole('radio', { name: 'I worked extra hours' })).toBeChecked();
      await expect(
        sheet.getByText(
          'Tell PrePenny about extra hours or a missed shift, and it works out your new pay.',
        ),
      ).toBeVisible();
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet.getByText('Type the hours, for example 11.5.')).toBeVisible();
      await expect(sheet.getByLabel('Hours', { exact: true })).toBeFocused();
      await sheet.getByRole('button', { name: 'Change the rate' }).click();
      await expect(sheet.getByLabel('Rate an hour')).toHaveValue('19.07');
      await noAxeProblems(page);
    });
  });
}

test('the overtime sheet keeps the extras box while typing, and each kind its own rate', async ({
  page,
}) => {
  await openHome(page);
  const sheet = await openAction(page, 'Overtime or missed shift', 'I did overtime');
  await sheet.getByLabel('Day of the overtime').fill('2026-10-26');
  await sheet.getByLabel('Hours', { exact: true }).fill('11.5');
  const extras = sheet.getByLabel('Extras it adds, such as shift premium, if any');
  await expect(extras).toBeVisible();
  await extras.pressSequentially('10');
  await expect(extras).toBeFocused();
  await expect(extras).toHaveValue('10');
  await expect(sheet.getByTestId('shift-preview')).toContainText('Fri\u00a06\u00a0Nov');

  // A missed shift has its own rate: the pay week's basic rate.
  await sheet.getByRole('radio', { name: 'I missed a shift' }).check();
  const missed = page.getByRole('dialog', { name: 'I missed a shift' });
  await missed.getByLabel('Day of the shift').fill('2026-11-03');
  await missed.getByLabel('Hours', { exact: true }).fill('11.5');
  await expect(missed.getByText('At £12.71 an hour.')).toBeVisible();
  await missed.getByRole('button', { name: 'Change the rate' }).click();
  await expect(missed.getByLabel('Rate an hour')).toBeFocused();
  await expect(missed.getByLabel('Rate an hour')).toHaveValue('12.71');
  await missed.getByRole('radio', { name: 'I worked extra hours' }).check();
  const overtime = page.getByRole('dialog', { name: 'I did overtime' });
  await expect(overtime.getByText('At £19.07 an hour.')).toBeVisible();
  await expect(overtime.getByLabel('Hours', { exact: true })).toHaveValue('11.5');

  // A cleared date says what to do.
  await overtime.getByLabel('Day of the overtime').fill('');
  await overtime.getByRole('button', { name: 'Save' }).click();
  await expect(overtime.getByText('Choose a date.')).toBeVisible();
  await expect(overtime.getByLabel('Day of the overtime')).toBeFocused();
  await noAxeProblems(page);
});

test('with no budgets, I spent says how to add one, and offers Add a budget (D207)', async ({
  page,
}) => {
  await openHome(page);
  const sheet = await openAction(page, 'I spent');
  await expect(sheet.getByTestId('no-budgets')).toHaveText(
    "There's no budget to spend from yet. Add one, such as Travel at £25 a week, then write down what you spend from it.",
  );
  await expect(sheet.getByRole('button', { name: 'Add a budget' })).toBeVisible();
  await noAxeProblems(page);
});

test('Add a payment: money coming in, every 2 weeks, ending after 3, with a different last amount', async ({
  page,
}) => {
  await openHome(page);
  const sheet = await openAction(page, 'Add a payment');
  await sheet.getByText('Coming in', { exact: true }).click();
  await sheet.getByLabel('Name').fill('Refund');
  await sheet.getByLabel('Amount').fill('20');
  await sheet.getByLabel('Next payment').fill('2026-10-27');
  await sheet.getByText('Every week, or every few weeks', { exact: true }).click();
  await sheet.getByLabel('How many weeks apart').fill('2');
  await expect(sheet.getByText(/Every 2 weeks, on a Tuesday\./)).toBeVisible();
  await sheet.getByText('After a number of payments', { exact: true }).click();
  await sheet.getByLabel('How many payments').fill('3');
  await sheet.getByLabel('The last payment is a different amount').check();
  await sheet.getByLabel('Last amount').fill('10');
  await sheet.getByRole('button', { name: 'Add payment' }).click();
  await expect(sheet).toBeHidden();
  // Tue 27 Oct, Tue 10 Nov and Tue 24 Nov.
  await openPlan(page, '2026-11-06', '2026-11-20');
  const refunds = page.getByRole('button', { name: named('Refund') });
  await expect(refunds).toHaveCount(3);
  await expect(refunds).toContainText(['+£20.00', '+£20.00', '+£10.00']);
  await expect(refunds.nth(1)).toContainText('Tue\u00a010\u00a0Nov');
});

test('the Coming up page shows the months up to a lowest point that comes later (D190, D209)', async ({
  page,
}) => {
  // A big payment in July 2027 makes the lowest point fall after the 3 months shown.
  const bigBill = {
    ...examplePlan.series[0],
    id: 'big-bill',
    familyId: 'big-bill',
    familyCreatedAt: '2026-10-25T09:00:00Z',
    name: 'Big bill',
    type: 'bills' as const,
    amount: parsePounds('8000.00'),
    start: '2027-07-01',
  };
  await useSetting(page, {
    plan: { ...examplePlan, series: [...examplePlan.series, bigBill] as PlanRecords['series'] },
  });
  await openHome(page);
  await openPlan(page);
  const lowest = page.getByTestId('plan-lowest');
  const show = lowest.getByRole('button', { name: /Show everything up to Thu\s1\sJul\s2027/ });
  await expect(show).toBeVisible();
  await show.click();
  // The payday it's in opens, and focus goes to its row.
  const bill = page.getByRole('button', { name: named('Big bill') });
  await expect(bill).toBeFocused();
  await expect(bill).toContainText('Lowest point ahead');
  await expect(period(page, '2027-06-25')).toHaveAttribute('data-open', 'true');
  await expect(lowest.getByRole('button')).toContainText(/Open Fri\s25\sJun\s2027 below/);
});

test('when a new version arrives, a note says so, and tapping it loads it (D202)', async ({
  page,
}) => {
  await openHome(page);
  await helperInCharge(page);
  await page.reload();
  await expect(page.getByTestId('balance')).toBeVisible();
  await expect(page.getByTestId('update-note')).toHaveCount(0);
  // A new version taking over the page, as the offline helper does when one arrives.
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  const note = page.getByRole('button', { name: 'PrePenny has been updated. Tap to reload.' });
  await expect(note).toBeVisible();
  await noAxeProblems(page);
  await Promise.all([page.waitForEvent('load'), note.click()]);
  await expect(page.getByTestId('balance')).toBeVisible();
  await expect(page.getByTestId('update-note')).toHaveCount(0);
});
