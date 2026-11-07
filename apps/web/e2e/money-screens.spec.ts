// The Debts, Budgets, Savings goals and Accounts screens, and changing how
// often a payment repeats (step 2f, brief 4.2, 4.5, 4.6, 4.7), at 320px and
// 360px wide, in light and dark, checked by axe: the owner's tests 1 to 8.
// "Today" is Sun 25 Oct 2026 on Sam's example unless a test says otherwise.
// Tests that need a test plan use the test-only setting (D201).

import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import {
  type Account,
  type BalanceUpdate,
  type Budget,
  type Debt,
  type PlanRecords,
  parsePounds,
  type Spend,
} from '@prepenny/engine';
import { examplePlan } from '../data/example-plan.ts';
import { TEST_SETTING_KEY, type TestSetting } from '../lib/test-setting.ts';
import {
  chooseView,
  MINUS,
  openComingUp,
  openPeriod,
  rowIn,
  AXE_TAGS as tags,
} from './coming-up.ts';
import { expect, settingScript, test } from './fixtures.ts';

async function useSetting(page: Page, setting: TestSetting) {
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, setting] as const);
}

async function noAxeProblems(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
}

const undoBar = (page: Page) => page.getByTestId('undo-bar');

async function undo(page: Page) {
  await undoBar(page).getByRole('button', { name: 'Undo' }).click();
  await expect(undoBar(page)).toHaveText('Change undone.');
}

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });

/** Goes to a screen under More by its link (step 2f). */
async function openUnderMore(page: Page, name: string) {
  await page.goto('/app/');
  await expect(page.getByTestId('balance')).toBeVisible();
  await nav(page, 'More').click();
  await page.getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

async function openDebts(page: Page) {
  await page.goto('/app/');
  await expect(page.getByTestId('balance')).toBeVisible();
  await nav(page, 'Debts').click();
  await expect(page.getByTestId('owed-now')).toBeVisible();
}

async function openDebt(page: Page, name: string) {
  await openDebts(page);
  await page.getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByTestId('left-now')).toBeVisible();
}

/** A debt's row on its own page, by the date written in its second line. */
const debtRow = (page: Page, date: string): Locator =>
  page.getByTestId('debt-row').filter({ hasText: date });

/** Step 1d's hand-worked card (D101, D102): £420.99, 24.9% a year, statement day the 10th. */
const handWorkedCard: PlanRecords = {
  ...examplePlan,
  debts: (examplePlan.debts ?? []).map(
    (debt): Debt =>
      debt.id === 'credit-card'
        ? {
            ...debt,
            interestRate: '24.9',
            statementDay: 10,
            minimumRule: { kind: 'rule', percent: '1', atLeast: parsePounds('5.00') },
          }
        : debt,
  ),
};

/** Sam's example with Travel at £25 a week from Friday, and £4.00 spent on Sat 24 Oct before the update. */
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

/** The same, with roll-over on from the week before, and £18.00 spent in it (D110's owner test 4). */
const withRollOver: PlanRecords = {
  ...examplePlan,
  budgets: [{ ...travel, rollOver: true, startsOn: '2026-10-16' }],
  spends: [
    {
      id: 'week-before',
      budgetId: 'travel',
      amount: parsePounds('18.00'),
      spentOn: '2026-10-20',
      recordedAt: '2026-10-20T17:00:00Z',
    },
    busOn24Oct,
  ],
};

/** Sam's example with a third account that has £3.12 left in it and nothing planned. */
const oldAccount: Account = {
  id: 'old',
  name: 'Old account',
  kind: 'current',
  overdraftLimit: 0,
  warningLevel: 0,
};
const oldBalance: BalanceUpdate = {
  id: 'old-balance',
  accountId: 'old',
  balance: parsePounds('3.12'),
  checkedOn: '2026-10-25',
  checkedAt: '2026-10-25T08:00:00Z',
};
const withOldAccount: PlanRecords = {
  ...examplePlan,
  accounts: [...examplePlan.accounts, oldAccount],
  balanceUpdates: [...examplePlan.balanceUpdates, oldBalance],
};

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Debts, budgets, goals and accounts, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('test 1: Debts shows Owed now, then each debt in the order it is paid off', async ({
      page,
    }) => {
      await openDebts(page);
      await expect(nav(page, 'Debts')).toHaveAttribute('aria-current', 'page');
      await expect(
        page.getByText('What you owe, and the date each debt will be paid off.'),
      ).toBeVisible();
      const owed = page.getByTestId('owed-now');
      await expect(owed).toContainText('£3,214.86');
      await expect(owed).toContainText('6 debts. Family loan is counted at €1.1612 to £1.');
      const debts = page.getByTestId('debt');
      await expect(debts.locator('[class*="rowName"]')).toHaveText([
        'Pay-later card',
        'Pay in 3',
        'Family loan',
        'Laptop loan',
        'Sofa finance',
        'Credit card',
      ]);
      const debt = (name: string) => page.locator(`[data-debt="${name}"]`);
      await expect(debt('Pay-later card')).toContainText('Paid off on Thu 29 Oct');
      await expect(debt('Pay in 3')).toContainText('Paid off on Sun 6 Dec');
      await expect(debt('Family loan')).toContainText('€1,400.57');
      await expect(debt('Family loan')).toContainText('about £1,206.14');
      await expect(debt('Family loan')).toContainText('Paid off on Fri 1 Jan 2027');
      await expect(debt('Family loan')).toContainText('42% paid');
      await expect(debt('Laptop loan')).toContainText('Paid off on Sat 20 Feb 2027');
      await expect(debt('Sofa finance')).toContainText('Paid off on Mon 23 Aug 2027');
      await expect(debt('Credit card')).toContainText('Paid off on Wed 15 Mar 2028');
      // Its £25.00 payments are estimates, so its date is too (D100).
      await expect(debt('Credit card')).toContainText('Estimate');
      await expect(debt('Family loan')).not.toContainText('Estimate');
      await expect(page.getByRole('button', { name: 'Add a debt' })).toBeVisible();
      await noAxeProblems(page);
    });

    test('test 1, with no debts: "No debts" and "Add a debt", which opens the form', async ({
      page,
    }) => {
      const noDebts: PlanRecords = {
        ...examplePlan,
        debts: [],
        series: examplePlan.series.map(({ debtId: _debt, ...series }) => series),
      };
      await useSetting(page, { plan: noDebts });
      await page.goto('/app/debts/');
      await expect(page.getByTestId('no-debts')).toContainText('No debts');
      await page.getByRole('button', { name: 'Add a debt' }).click();
      const sheet = page.getByRole('dialog', { name: 'Add a debt' });
      await expect(sheet).toBeVisible();
      // Every kind in brief 4.6.
      for (const kind of [
        'Pay-later plan',
        'Credit card',
        'Loan',
        'Overdraft',
        'Money owed to a person',
      ]) {
        await expect(sheet.getByRole('radio', { name: kind, exact: true })).toBeVisible();
      }
      await sheet.getByLabel('Name', { exact: true }).fill('Car loan');
      await sheet.getByRole('radio', { name: 'Loan', exact: true }).check();
      await sheet.getByLabel('What you owe now', { exact: true }).fill('1200');
      await sheet
        .getByRole('checkbox', { name: "I don't have payments planned for it yet" })
        .check();
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Add this debt' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Car loan added.');
      await expect(page.getByTestId('owed-now')).toContainText('£1,200.00');
      await expect(page.locator('[data-debt="Car loan"]')).toContainText(
        '£1,200.00 still left on Wed 25 Oct 2028',
      );
      await undo(page);
      await expect(page.getByTestId('no-debts')).toBeVisible();
    });

    test('test 2: the Family loan comes off as €145.15, €145.15, €290.30, €290.30, €290.30 and €239.38', async ({
      page,
    }) => {
      await openDebt(page, 'Family loan');
      await expect(page).toHaveURL(/\/app\/debt\/#id=family-loan$/);
      await expect(nav(page, 'Debts')).toHaveAttribute('aria-current', 'location');
      const left = page.getByTestId('left-now');
      await expect(left).toContainText('€1,400.57');
      await expect(left).toContainText('About £1,206.14 at €1.1612 per £1');
      await expect(left).toContainText('Paid off on Fri 1 Jan 2027');
      await expect(left).toContainText('42% paid');
      await expect(left).toContainText('€996.36 paid of €2,396.93');
      const rows = page.getByTestId('debt-row');
      await expect(rows).toHaveCount(6);
      const expected = [
        ['Mon 26 Oct, €145.15', `${MINUS}£125.00`, '€1,255.42 left'],
        ['Fri 6 Nov, €145.15', `${MINUS}£125.00`, '€1,110.27 left'],
        ['Fri 20 Nov, €290.30', `${MINUS}£250.00`, '€819.97 left'],
        ['Fri 4 Dec, €290.30', `${MINUS}£250.00`, '€529.67 left'],
        ['Fri 18 Dec, €290.30', `${MINUS}£250.00`, '€239.37 left'],
        ['Fri 1 Jan 2027, €239.38', `${MINUS}£206.15`, 'Paid off'],
      ] as const;
      for (const [index, [second, amount, after]] of expected.entries()) {
        const row = rows.nth(index);
        await expect(row.getByText(second, { exact: true })).toBeVisible();
        await expect(row.getByText(amount, { exact: true })).toBeVisible();
        await expect(row.getByText(after, { exact: true })).toBeVisible();
      }
      // Its actions, each saying what it does (D213).
      for (const action of [
        'Update from statement',
        'Change the rate',
        'Add a payment',
        'Change its details',
        'Close this debt',
      ]) {
        await expect(page.getByRole('button', { name: action, exact: true })).toBeVisible();
      }
      await noAxeProblems(page);

      // Change the rate: every payment is converted again at the new rate.
      await page.getByRole('button', { name: 'Change the rate' }).click();
      const sheet = page.getByRole('dialog', { name: 'Change the rate' });
      await expect(sheet.getByLabel('How many EUR to £1')).toHaveValue('1.1612');
      await sheet.getByLabel('How many EUR to £1').fill('1.2');
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(undoBar(page)).toContainText("Family loan's rate changed.");
      await expect(rows.first()).toContainText('Mon 26 Oct, €150.00');
      await undo(page);
      await expect(rows.first()).toContainText('Mon 26 Oct, €145.15');
    });

    test('test 3: the Credit card payment on Wed 15 Mar 2028 is £4.01 more than what is left, and the fix makes it £20.99', async ({
      page,
    }) => {
      await openDebt(page, 'Credit card');
      await expect(page.getByTestId('left-now')).toContainText(
        'No interest added, because no rate is saved',
      );
      const rows = page.getByTestId('debt-row');
      await expect(rows).toHaveCount(24);
      const march = debtRow(page, 'Wed 15 Mar 2028');
      await expect(march).toContainText("£4.01 more than what's left");
      await expect(march).toContainText('Paid off');
      const fix = march.getByRole('button', { name: 'Make it £20.99 and stop after it' });
      await expect(fix).toBeVisible();
      // Only that payment offers the fix; the ones after it are all more than what's left.
      await expect(page.getByRole('button', { name: /^Make it/ })).toHaveCount(1);
      await expect(debtRow(page, 'Sun 15 Oct 2028')).toContainText("£25.00 more than what's left");
      await noAxeProblems(page);

      await fix.click();
      await expect(undoBar(page)).toContainText(
        'Credit card made £20.99, and later payments to it removed.',
      );
      // The fix has gone, so focus goes to Undo rather than being lost.
      await expect(undoBar(page).getByRole('button', { name: 'Undo' })).toBeFocused();
      await expect(rows).toHaveCount(17);
      await expect(march).toContainText(`${MINUS}£20.99`);
      await expect(march).toContainText('Paid off');
      await expect(march).not.toContainText('more than');
      await expect(page.getByTestId('left-now')).toContainText('Paid off on Wed 15 Mar 2028');

      await undo(page);
      await expect(rows).toHaveCount(24);
      await expect(march).toContainText(`${MINUS}£25.00`);
      await expect(march).toContainText("£4.01 more than what's left");
    });

    test("test 4: Compare ways to pay, on step 1d's hand-worked card", async ({ page }) => {
      await useSetting(page, { plan: handWorkedCard });
      await openDebt(page, 'Credit card');
      const card = page.getByTestId('card-details');
      await expect(card).toContainText('24.9% a year');
      await expect(card).toContainText('Statement on the 10th of each month');
      await expect(card).toContainText('Minimum: interest plus 1% of what you owe, at least £5.00');
      await expect(card).toContainText(
        'Next statement, Tue 10 Nov: about £8.74 of interest, an estimate.',
      );
      await expect(card).toContainText('Its minimum: about £12.95, an estimate.');
      const compare = page.getByTestId('compare');
      await expect(compare.getByLabel('A fixed amount each month')).toHaveValue('25.00');
      await expect(page.getByTestId('compare-minimum')).toContainText(
        'Paying the minimum each month',
      );
      await expect(page.getByTestId('compare-minimum')).toContainText(
        '150 payments, £647.14 interest',
      );
      await expect(page.getByTestId('compare-fixed')).toContainText('Paying £25.00 each month');
      await expect(page.getByTestId('compare-fixed')).toContainText(
        '21 payments, £102.32 interest',
      );
      await expect(page.getByTestId('compare-full')).toContainText('Paying all you owe each month');
      await expect(page.getByTestId('compare-full')).toContainText('1 payment, £8.74 interest');
      // Numbers only, never advice (brief Part 3, principle 10).
      await expect(compare).toContainText('PrePenny shows the numbers, not which to choose.');
      // A fixed amount below the interest never clears it.
      await compare.getByLabel('A fixed amount each month').fill('5');
      await expect(page.getByTestId('compare-fixed')).toContainText(
        'It never clears: the interest is more than the payment.',
      );
      await noAxeProblems(page);
    });

    test('test 5: Travel shows £10.00 spent and £15.00 left, and roll-over shows "£25 + £7 from last week"', async ({
      page,
    }) => {
      await useSetting(page, { plan: withTravel });
      // £6.00 spent after the update, through I spent on Home.
      await page.goto('/app/');
      await page.getByRole('button', { name: 'I spent', exact: true }).click();
      const spent = page.getByRole('dialog', { name: 'I spent' });
      await spent.getByLabel('How much').fill('6');
      await spent.getByRole('button', { name: 'Save' }).click();
      await expect(spent).toBeHidden();
      await nav(page, 'More').click();
      await page.getByRole('link', { name: /^Budgets/ }).click();
      const budget = page.locator('[data-budget="Travel"]');
      await expect(budget).toContainText('£25.00 a week, from Current account');
      await expect(budget).toContainText('This week, to Thu 29 Oct');
      await expect(budget.getByRole('term')).toHaveText(['Spent', 'Left']);
      await expect(budget.getByRole('definition')).toHaveText(['£10.00', '£15.00']);
      await expect(budget.getByTestId('rolled-over')).toHaveCount(0);
      await noAxeProblems(page);

      // Change it from this week on (D161), then undo.
      await page.getByRole('button', { name: 'Change Travel' }).click();
      const sheet = page.getByRole('dialog', { name: 'Change this budget' });
      await expect(sheet.getByLabel('Amount')).toHaveValue('25.00');
      // A weekly budget can't become a monthly card bill, so it isn't offered, and the sheet says why.
      await expect(
        sheet.getByRole('radio', { name: 'As one pay-later bill each month' }),
      ).toHaveCount(0);
      await expect(sheet.getByText(/^To move it to a pay-later card, end it/)).toBeVisible();
      await sheet.getByLabel('Amount').fill('30');
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(undoBar(page)).toContainText('Travel changed.');
      await expect(budget.getByRole('definition')).toHaveText(['£10.00', '£20.00']);
      await undo(page);
      await expect(budget.getByRole('definition')).toHaveText(['£10.00', '£15.00']);
    });

    test('test 5, with roll-over: last week’s £7.00 makes this week "£25 + £7 from last week"', async ({
      page,
    }) => {
      await useSetting(page, { plan: withRollOver });
      await openUnderMore(page, 'Budgets');
      const budget = page.locator('[data-budget="Travel"]');
      await expect(budget).toContainText("What's left moves to the next week or month.");
      await expect(budget.getByTestId('rolled-over')).toHaveText('£25 + £7 from last week');
      // £32.00 this week, less the £4.00 spent before the update (D110).
      await expect(budget.getByRole('definition')).toHaveText(['£4.00', '£28.00']);
      await noAxeProblems(page);
    });

    test('I spent with no budgets offers Add a budget, which opens the form straight away (D207)', async ({
      page,
    }) => {
      await page.goto('/app/');
      await page.getByRole('button', { name: 'I spent', exact: true }).click();
      const spent = page.getByRole('dialog', { name: 'I spent' });
      await expect(spent.getByTestId('no-budgets')).toContainText(
        "There's no budget to spend from yet.",
      );
      await spent.getByRole('button', { name: 'Add a budget' }).click();
      const add = page.getByRole('dialog', { name: 'Add a budget' });
      await expect(add).toBeVisible();
      await expect(add.getByLabel('Name', { exact: true })).toBeVisible();
      await add.getByLabel('Name', { exact: true }).fill('Travel');
      await add.getByLabel('Amount').fill('25');
      await noAxeProblems(page);
      await add.getByRole('button', { name: 'Add budget' }).click();
      // Back to I spent, with the new budget to spend from.
      await expect(spent).toBeVisible();
      await expect(spent.getByRole('heading', { name: 'Travel' })).toBeVisible();
      await expect(spent.getByTestId('budget-period')).toContainText('This week, to Thu 29 Oct');
      await expect(undoBar(page)).toContainText('Travel added.');
    });

    test('test 6: a £1,200.00 Holiday goal with £50.00 every Friday from Fri 30 Oct is reached on Fri 9 Apr 2027', async ({
      page,
    }) => {
      await openUnderMore(page, 'Savings goals');
      await expect(nav(page, 'More')).toHaveAttribute('aria-current', 'location');
      await expect(page.getByTestId('no-goals')).toBeVisible();
      await page.getByRole('button', { name: 'Add a savings goal' }).click();
      const sheet = page.getByRole('dialog', { name: 'Add a savings goal' });
      await sheet.getByLabel('What are you saving for?').fill('Holiday');
      await sheet.getByLabel('Target').fill('1200');
      await expect(
        sheet
          .getByRole('group', { name: 'Kept in' })
          .getByRole('radio', { name: 'Savings', exact: true }),
      ).toBeChecked();
      await sheet.getByLabel('Move into it').fill('50');
      await sheet.getByRole('radio', { name: 'Another way' }).check();
      await sheet.getByLabel('Next payment').fill('2026-10-30');
      await sheet.getByRole('radio', { name: 'Every week, or every few weeks' }).check();
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Add goal' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Holiday added.');
      const goal = page.locator('[data-goal="Holiday"]');
      await expect(goal).toContainText('£0.00 saved of £1,200.00');
      await expect(goal).toContainText('0% saved');
      await expect(goal.getByTestId('goal-reached')).toHaveText('Reached on Fri 9 Apr 2027');
      await expect(goal).toContainText('Kept in Savings');
      await noAxeProblems(page);

      // Change it, then close it, each with its own undo (D153).
      await page.getByRole('button', { name: 'Change Holiday' }).click();
      const change = page.getByRole('dialog', { name: 'Change this goal' });
      await change.getByLabel('Target').fill('600');
      await change.getByRole('button', { name: 'Save' }).click();
      // 12 moves of £50.00: 11 weeks after Fri 30 Oct.
      await expect(goal.getByTestId('goal-reached')).toHaveText('Reached on Fri 15 Jan 2027');
      await undo(page);
      await expect(goal.getByTestId('goal-reached')).toHaveText('Reached on Fri 9 Apr 2027');
      await page.getByRole('button', { name: 'Close Holiday' }).click();
      await page
        .getByRole('dialog', { name: 'Close this goal' })
        .getByRole('button', { name: 'Close this goal' })
        .click();
      await expect(undoBar(page)).toContainText('Holiday closed.');
      // Its buttons have gone, so focus goes to Undo; it's listed under Closed goals.
      await expect(undoBar(page).getByRole('button', { name: 'Undo' })).toBeFocused();
      await expect(page.getByRole('heading', { level: 2, name: 'Closed goals' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 3, name: 'Holiday' })).toBeVisible();
      await expect(goal).toContainText('Closed.');
      await expect(page.getByTestId('no-goals')).toHaveCount(0);
      await noAxeProblems(page);
    });

    test('test 7: closing an account with £3.12 left offers the move first, and closes it once it is at £0.00', async ({
      page,
    }) => {
      await useSetting(page, { plan: withOldAccount });
      await openUnderMore(page, 'Accounts');
      const old = page.locator('[data-account="Old account"]');
      await expect(old).toContainText('£3.12, checked today');
      await expect(page.locator('[data-account="Current account"]')).toContainText(
        '£267.54, checked today',
      );
      await expect(
        page.getByText('Payments that move on bank holidays follow England and Wales.'),
      ).toBeVisible();
      await noAxeProblems(page);

      await page.getByRole('button', { name: 'Change Old account' }).click();
      const sheet = page.getByRole('dialog', { name: 'Change this account' });
      const closing = sheet.getByTestId('close-account');
      await expect(closing).toContainText(
        'It has £3.12 in it at the end of today, so that has to move first.',
      );
      await expect(closing.getByRole('button', { name: 'Close this account' })).toHaveCount(0);
      await expect(
        closing.getByRole('group', { name: 'Move it to' }).getByRole('radio', {
          name: 'Current account',
        }),
      ).toBeChecked();
      await expect(closing).toContainText(
        'This adds a move to Current account today, marked as done. Make the same move in your banking app.',
      );
      await noAxeProblems(page);
      await closing.getByRole('button', { name: 'Move £3.12 to another account first' }).click();
      // The owner's answer to step 2f: the move is added ticked, with a reminder.
      await expect(undoBar(page)).toContainText(
        '£3.12 moved from Old account to Current account. Now move £3.12 in your banking app too.',
      );
      await expect(closing.getByTestId('move-reminder')).toHaveText(
        'Now move £3.12 in your banking app too.',
      );
      await expect(closing.getByRole('button', { name: 'Close this account' })).toBeVisible();
      await closing.getByRole('button', { name: 'Close this account' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Old account closed.');
      await expect(page.getByRole('heading', { name: 'Closed accounts' })).toBeVisible();
      await expect(old).toContainText('Closed. Kept for its history.');
      await expect(page.getByRole('button', { name: 'Change Old account' })).toHaveCount(0);
      await noAxeProblems(page);
      await undo(page);
      await expect(page.getByRole('button', { name: 'Change Old account' })).toBeVisible();
    });

    test('test 8: Rent from the 1st to the 3rd of each month from Fri 1 Jan 2027, for this and all later ones', async ({
      page,
    }) => {
      await openComingUp(page);
      await chooseView(page, ['By calendar month']);
      await page.getByRole('button', { name: 'Show another month' }).click();
      await page.getByRole('button', { name: 'Show another month' }).click();
      const months = ['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'];
      for (const start of months) await openPeriod(page, start);
      const rentIn = (start: string) => rowIn(page, start, 'Rent');

      await rentIn('2027-01-01').click();
      const sheet = page.getByRole('dialog', { name: 'Rent' });
      await sheet.getByLabel('Date', { exact: true }).fill('2027-01-03');
      await sheet.getByText('This and all later ones', { exact: true }).click();
      await sheet.getByRole('checkbox', { name: 'Change how often it repeats' }).check();
      await expect(
        sheet.getByRole('radio', { name: 'Every month, or every few months' }),
      ).toBeChecked();
      await expect(sheet.getByLabel('How many months apart')).toHaveValue('1');
      // The day of the month comes from the date above (D96, D199).
      await expect(sheet.getByRole('radio', { name: 'The 3rd of the month' })).toBeChecked();
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Rent changed for this and all later ones.');

      await expect(rentIn('2027-01-01')).toContainText('Sun 3 Jan 2027');
      await expect(rentIn('2027-02-01')).toContainText('Wed 3 Feb 2027');
      await expect(rentIn('2026-11-01')).toContainText('Sun 1 Nov');
      await expect(rentIn('2026-11-01')).toContainText(`${MINUS}£600.00`);
      await expect(rentIn('2026-12-01')).toContainText('Tue 1 Dec');
      await expect(rentIn('2026-12-01')).toContainText(`${MINUS}£550.00`);

      await undo(page);
      await expect(rentIn('2027-01-01')).toContainText('Fri 1 Jan 2027');
      await expect(rentIn('2027-02-01')).toContainText('Mon 1 Feb 2027');
    });

    test('changing a debt’s kind keeps its currency, so what’s owed stays the same (D246)', async ({
      page,
    }) => {
      await openDebt(page, 'Family loan');
      await page.getByRole('button', { name: 'Change its details' }).click();
      const sheet = page.getByRole('dialog', { name: 'Change this debt' });
      await expect(
        sheet.getByText("It's in euros. That stays as it is, so what's owed doesn't change."),
      ).toBeVisible();
      await expect(sheet.getByRole('group', { name: 'Currency' })).toHaveCount(0);
      await sheet.getByRole('radio', { name: 'Loan', exact: true }).check();
      await expect(sheet.getByLabel('How many EUR to £1')).toHaveValue('1.1612');
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(undoBar(page)).toContainText('Family loan changed.');
      await expect(page.getByTestId('left-now')).toContainText('€1,400.57');
      await expect(page.getByTestId('left-now')).toContainText('Paid off on Fri 1 Jan 2027');
      await expect(page.getByText('Loan, in euros')).toBeVisible();
      await nav(page, 'Debts').click();
      await expect(page.getByTestId('owed-now')).toContainText('£3,214.86');
    });

    test('changing how often works for rent moved off a Sunday: it repeats on the 1st (D96)', async ({
      page,
    }) => {
      const moved: PlanRecords = {
        ...examplePlan,
        series: examplePlan.series.map((one) =>
          one.id === 'rent' ? { ...one, holidayRule: 'working-day-after' } : one,
        ),
      };
      await useSetting(page, { plan: moved });
      await openComingUp(page);
      await openPeriod(page, '2026-10-30');
      await rowIn(page, '2026-10-30', 'Rent').click();
      const sheet = page.getByRole('dialog', { name: 'Rent' });
      await expect(sheet.getByText('Mon 2 Nov, Current account')).toBeVisible();
      await sheet.getByText('This and all later ones', { exact: true }).click();
      await sheet.getByRole('checkbox', { name: 'Change how often it repeats' }).check();
      await expect(sheet.getByRole('radio', { name: 'The 1st of the month' })).toBeChecked();
      // Nothing changed yet.
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet.getByText('Change something first, then save.')).toBeVisible();
      await sheet.getByLabel('How many months apart').fill('2');
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Rent changed for this and all later ones.');
      await undo(page);
    });
  });
}
