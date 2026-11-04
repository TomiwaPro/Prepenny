// First-time setup (brief 4.1, D163, step 2e), from a phone with nothing on
// it, at 320px and 360px wide, in light and dark, checked by axe: the
// owner's tests 1 to 6. "Today" is the test-only today (D201).

import { expect, type Page, test } from '@playwright/test';
import { type PlanRecords, workOutPlan } from '@prepenny/engine';
import { build, kofiSteps } from '../../../packages/engine/test/fixtures/from-empty.ts';
import { calendarFor as holidaysFor } from '../../../packages/engine/test/fixtures/holidays.ts';
import { priyaPlan } from '../../../packages/engine/test/fixtures/people.ts';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { openPeriod, paydayButton, period, rowIn } from './coming-up.ts';
import { settingScript } from './fixtures.ts';
import {
  back,
  box,
  comparable,
  expectStep,
  fillAccount,
  fillWhen,
  lastForm,
  next,
  noAxeProblems,
  openFresh,
  ownRecords,
  radio,
  setUpPriya,
  skip,
  startSetup,
  storedPlans,
} from './setup.ts';
import {
  buildFrom,
  KOFI_TODAY,
  kofiCommands,
  PRIYA_TODAY,
  priyaCommands,
} from './setup-answers.ts';

/** Each account's balance at the end of every day, to the same last day. */
function dayBalances(records: PlanRecords, today: string, to: string) {
  const plan = workOutPlan({
    ...records,
    mainPayFamilyId: records.settings?.mainPayFamilyId ?? null,
    holidays: holidaysFor(records.settings?.nation ?? 'england-and-wales'),
    today,
    to,
  });
  return plan.accounts.map((account) => ({
    account: account.account.name,
    days: account.days.map((day) => [day.date, day.balance]),
  }));
}

/** Every payment's dates for one series, by name, over a long view. */
function datesOf(records: PlanRecords, today: string, name: string): string[] {
  const plan = workOutPlan({
    ...records,
    mainPayFamilyId: records.settings?.mainPayFamilyId ?? null,
    holidays: holidaysFor(records.settings?.nation ?? 'england-and-wales'),
    today,
    to: '2028-10-31',
  });
  return (plan.accounts[0]?.rows ?? [])
    .filter((row) => row.payment.name === name && row.kind === 'payment')
    .map((row) => row.date);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Setup, in ${colorScheme} mode`, () => {
    // Each test goes through several steps of setup, checking each with axe.
    test.describe.configure({ timeout: 120_000 });

    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('test 1: Priya sets up through the screens, and her plan is the one the commands build', async ({
      page,
    }) => {
      await setUpPriya(page);
      const summary = page.getByTestId('setup-summary');
      await expect(page.getByTestId('setup-lowest')).toContainText('Lowest point ahead');
      await expect(page.getByTestId('setup-left-to-spend')).toContainText(
        'Left to spend until Fri 30 Oct',
      );
      // The holiday fund is reached with the 8th move of £150 (D137).
      await expect(page.getByTestId('setup-first-goal')).toHaveText(
        'First savings goal reachedHoliday, Fri 28 May 2027',
      );
      await expect(summary.getByTestId('setup-first-debt')).toHaveCount(0);

      // The plan the screens built is the plan the step 2a commands build from the same answers.
      const saved = await ownRecords(page);
      const commands = buildFrom(priyaCommands(), PRIYA_TODAY);
      expect(comparable(saved)).toEqual(comparable(commands));
      // And every day's balance is her test plan's (D137), a year ahead.
      const fixture = priyaPlan();
      expect(dayBalances(saved, PRIYA_TODAY, '2027-10-24')).toEqual(
        dayBalances(
          { ...fixture, settings: { nation: 'england-and-wales', mainPayFamilyId: 'salary' } },
          PRIYA_TODAY,
          '2027-10-24',
        ),
      );
      // Salary on the last working day, moved to the working day before (brief 8.5).
      expect(datesOf(saved, PRIYA_TODAY, 'Salary').slice(0, 4)).toEqual([
        '2026-10-30',
        '2026-11-30',
        '2026-12-31',
        '2027-01-29',
      ]);
      // Car insurance once a year, and council tax with nothing in February or March.
      expect(datesOf(saved, PRIYA_TODAY, 'Car insurance')).toEqual(['2027-01-14', '2028-01-14']);
      expect(
        datesOf(saved, PRIYA_TODAY, 'Council tax').filter((date) => /-0[23]-/.test(date)),
      ).toEqual([]);

      await page.getByRole('button', { name: 'Go to my plan' }).click();
      await expect(page).toHaveURL(/\/app\/$/);
      await expect(page.getByTestId('balance')).toContainText('£1,240.00');
      await expect(page.getByTestId('example-banner')).toHaveCount(0);

      // Coming up shows her salary on Thu 31 Dec 2026 and Fri 29 Jan 2027.
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Coming up', exact: true })
        .click();
      await expect(period(page, '2026-10-25')).toBeVisible();
      await expect(paydayButton(page, '2026-12-31')).toContainText('Thu 31 Dec');
      await expect(paydayButton(page, '2026-12-31')).toContainText('Pay £2,100.00 in');
      await page.getByRole('button', { name: 'Show another month' }).click();
      await expect(paydayButton(page, '2027-01-29')).toContainText('Fri 29 Jan 2027');
      // Car insurance comes in the payday from Thu 31 Dec; council tax isn't in Fri 29 Jan's.
      await openPeriod(page, '2026-12-31');
      await expect(rowIn(page, '2026-12-31', 'Car insurance')).toBeVisible();
      await openPeriod(page, '2027-01-29');
      await expect(rowIn(page, '2027-01-29', 'Rent')).toBeVisible();
      await expect(rowIn(page, '2027-01-29', 'Council tax')).toHaveCount(0);
      await noAxeProblems(page);
    });

    test('test 2: Kofi sets up three irregular incomes, 25% for tax and his van finance', async ({
      page,
    }) => {
      await startSetup(page, KOFI_TODAY);
      await fillAccount(lastForm(page, 'account'), {
        name: 'Current account',
        balance: '640',
        warning: '50',
      });
      await page.getByRole('button', { name: 'Add another account' }).click();
      await fillAccount(lastForm(page, 'account'), {
        name: 'Tax',
        kind: 'Savings',
        balance: '1180',
        warning: '0',
      });
      await next(page);

      await expectStep(page, 2, "How you're paid");
      const platform = async (name: string, date: string, amount: string) => {
        const form = lastForm(page, 'income');
        await box(form, 'Name').fill(name);
        await radio(form, 'It changes: plan with a weekly estimate').check();
        await box(form, 'Next payday').fill(date);
        await box(form, 'About how much comes in each week').fill(amount);
        await radio(form, 'Keep the date').check();
        await form.getByRole('checkbox', { name: 'Put part of it aside, such as for tax' }).check();
        await box(form, 'How much, as a percentage').fill('25');
        await radio(form.getByRole('group', { name: 'Move it to' }), 'Tax').check();
      };
      await platform('Rides', '2026-11-02', '380');
      await page.getByRole('button', { name: 'Add another income' }).click();
      await platform('Deliveries', '2026-10-28', '145');
      await page.getByRole('button', { name: 'Add another income' }).click();
      await platform('Parcels', '2026-10-30', '90');
      const mainPay = page.getByRole('group', { name: 'Which is your main pay?' });
      await radio(mainPay, 'Rides').check();
      // Self-employed pay has no shifts, so the question isn't asked.
      await expect(
        page.getByRole('group', { name: 'Do you ever work extra hours or miss shifts?' }),
      ).toHaveCount(0);
      await noAxeProblems(page);
      await next(page);

      await expectStep(page, 3, 'Rent or mortgage');
      await box(page, 'Amount').fill('650');
      await fillWhen(page.getByRole('form'), { date: '2026-11-01' });
      await next(page);

      await expectStep(page, 4, 'Bills');
      const bill = (key: string) => page.locator(`[data-bill="${key}"]`);
      await bill('insurance').getByRole('checkbox', { name: 'Insurance', exact: true }).check();
      await box(bill('insurance'), 'Name').fill('Van insurance');
      await box(bill('insurance'), 'Amount').fill('96');
      await fillWhen(bill('insurance'), { date: '2026-11-12' });
      await bill('phone').getByRole('checkbox', { name: 'Phone', exact: true }).check();
      await box(bill('phone'), 'Amount').fill('25');
      await fillWhen(bill('phone'), { date: '2026-11-20' });
      await page.getByRole('button', { name: 'Add another bill' }).click();
      const tax = lastForm(page, 'bill');
      await box(tax, 'Name').fill('Self Assessment');
      await box(tax, 'Amount').fill('1450');
      await fillWhen(tax, { date: '2027-01-29', often: 'Once' });
      await radio(tax.getByRole('group', { name: 'From' }), 'Tax').check();
      await tax.getByRole('checkbox', { name: 'This is an estimate' }).check();
      await next(page);

      await expectStep(page, 5, 'Debts');
      await page.getByRole('button', { name: 'Add a debt' }).click();
      const van = lastForm(page, 'debt');
      await box(van, 'Name').fill('Van finance');
      await radio(van, 'Loan').check();
      await box(van, 'What you owe now').fill('6936');
      await box(van, 'What it started at, if you know').fill('10404');
      await box(van, 'Each payment').fill('289');
      await fillWhen(van, { date: '2026-11-05', payments: '24' });
      await noAxeProblems(page);
      await next(page);

      await expectStep(page, 6, 'Spending money');
      const fuel = page.getByTestId('budget-form').first();
      const food = page.getByTestId('budget-form').nth(1);
      await box(fuel, 'Name').fill('Fuel');
      await box(fuel, 'Amount').fill('70');
      await radio(fuel, 'Week').check();
      await box(food, 'Name').fill('Food');
      await box(food, 'Amount').fill('45');
      // His weeks run Monday to Sunday, so they start on Mon 2 Nov (D14, D108).
      await expect(fuel.getByText('Mon 2 Nov', { exact: true })).toBeVisible();
      await expect(food.getByText('Mon 2 Nov', { exact: true })).toBeVisible();
      await next(page);

      await expectStep(page, 7, 'Savings');
      await skip(page);
      await expectStep(page, 8, "Here's your plan");
      await expect(page.getByTestId('setup-first-debt')).toContainText('Van finance');
      await noAxeProblems(page);

      const saved = await ownRecords(page);
      expect(comparable(saved)).toEqual(comparable(buildFrom(kofiCommands(), KOFI_TODAY)));
      // Every day's balance is his test plan's as he set it up (D137, D157).
      const steps = kofiSteps();
      const atSetup = build(
        steps.slice(0, steps.findIndex((one) => one.command.kind === 'choose-main-pay') + 1),
      );
      expect(dayBalances(saved, KOFI_TODAY, '2027-02-28')).toEqual(
        dayBalances(atSetup.records, KOFI_TODAY, '2027-02-28'),
      );

      await page.getByRole('button', { name: 'Go to my plan' }).click();
      await expect(page.getByTestId('balance')).toContainText('£640.00');
      // Weeks from Monday to Sunday (D14).
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Coming up', exact: true })
        .click();
      // His first week is the one from Mon 26 Oct, shown from today.
      await expect(period(page, '2026-10-26').getByRole('heading').first()).toHaveText(
        'This pay, until Sun 1 Nov',
      );
      await expect(paydayButton(page, '2026-11-02')).toContainText('Mon 2 Nov');
      await page.getByRole('button', { name: 'View', exact: true }).click();
      await expect(page.getByRole('dialog').getByText('Mon to Sun', { exact: true })).toBeVisible();
    });

    test('test 3: skipping every step but the first still gives a plan with one account and its balance', async ({
      page,
    }) => {
      await startSetup(page, '2026-11-04');
      await fillAccount(lastForm(page, 'account'), {
        name: 'Current account',
        balance: '412.30',
        warning: '20',
      });
      await next(page);
      for (const [step, title] of [
        [2, "How you're paid"],
        [3, 'Rent or mortgage'],
        [4, 'Bills'],
        [5, 'Debts'],
        [6, 'Spending money'],
        [7, 'Savings'],
      ] as const) {
        await expectStep(page, step, title);
        await skip(page);
      }
      await expectStep(page, 8, "Here's your plan");
      await expect(page.getByTestId('setup-lowest')).toContainText('£412.30');
      await expect(page.getByTestId('setup-left-to-spend')).toHaveCount(0);
      await noAxeProblems(page);
      const saved = await ownRecords(page);
      expect(saved.accounts).toHaveLength(1);
      expect(saved.series).toEqual([]);
      await page.getByRole('button', { name: 'Go to my plan' }).click();
      await expect(page.getByTestId('balance')).toHaveText('£412.30');
      await expect(page.getByText('Current account', { exact: true }).first()).toBeVisible();
      await noAxeProblems(page);

      // More keeps "Look at the example plan", and coming back finds the plan as it was.
      const before = await ownRecords(page);
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'More' })
        .click();
      await page.getByRole('button', { name: 'Look at the example plan' }).click();
      await expect(page.getByTestId('example-banner')).toBeVisible();
      await expect(page.getByTestId('balance')).toHaveText('£267.54');
      await page.getByRole('button', { name: 'Go back to my plan' }).click();
      await expect(page.getByTestId('example-banner')).toHaveCount(0);
      await expect(page.getByTestId('balance')).toHaveText('£412.30');
      expect(await ownRecords(page)).toEqual(before);
    });

    test('test 4: leaving after step 3 and opening the app again carries on at step 4', async ({
      page,
      context,
    }) => {
      await startSetup(page, '2026-11-04');
      await fillAccount(lastForm(page, 'account'), {
        name: 'Current account',
        balance: '500',
        warning: '20',
      });
      await next(page);
      await expectStep(page, 2, "How you're paid");
      const pay = lastForm(page, 'income');
      await box(pay, 'Next payday').fill('2026-11-06');
      await box(pay, 'How much comes in, after tax').fill('450');
      await radio(page, 'No').check();
      await next(page);
      await expectStep(page, 3, 'Rent or mortgage');
      await box(page, 'Amount').fill('550');
      await fillWhen(page.getByRole('form'), { date: '2026-12-01' });
      await next(page);
      await expectStep(page, 4, 'Bills');
      await page.close();

      // Opening PrePenny again, in a new tab on the same phone.
      const again = await context.newPage();
      await again.emulateMedia({ colorScheme });
      await openAgain(again, '2026-11-04');
      await expectStep(again, 4, 'Bills');
      await back(again);
      await expectStep(again, 3, 'Rent or mortgage');
      await expect(again.getByTestId('added')).toContainText('Rent');
      await expect(again.getByTestId('added')).toContainText(
        '£550.00, monthly on the 1st, next Tue 1 Dec',
      );
      await noAxeProblems(again);

      // Anything added can be removed while setting up, as one undo (D221)…
      await again.getByRole('button', { name: 'Remove Rent' }).click();
      await expect(again.getByTestId('added')).toHaveCount(0);
      await expect(box(again, 'Amount')).toBeVisible();
      expect((await ownRecords(again)).series.map((one) => one.name)).toEqual(['Pay']);
      // …except something a later step uses: the pay arrives in the account.
      await back(again);
      await expectStep(again, 2, "How you're paid");
      await back(again);
      await expectStep(again, 1, 'Your account');
      await again.getByRole('button', { name: 'Remove Current account' }).click();
      await expect(again.getByTestId('added').getByRole('alert')).toHaveText(
        'Something added after this uses it. Remove that first.',
      );
      expect((await ownRecords(again)).accounts).toHaveLength(1);
    });

    test('test 5: looking at the example from the welcome changes nothing of the person’s own', async ({
      page,
    }) => {
      await startSetup(page, '2026-11-04');
      await fillAccount(lastForm(page, 'account'), {
        name: 'Current account',
        balance: '321.00',
        warning: '20',
      });
      await next(page);
      await expectStep(page, 2, "How you're paid");
      const before = await ownRecords(page);
      const plansBefore = (await storedPlans(page)).filter(
        (plan) => (plan as { isExample: boolean }).isExample === false,
      );

      await back(page);
      await expectStep(page, 1, 'Your account');
      await back(page);
      await expect(page.getByRole('button', { name: 'Carry on making my plan' })).toBeVisible();
      await page.getByRole('button', { name: 'Look at an example plan' }).click();
      await expect(page).toHaveURL(/\/app\/$/);
      await expect(page.getByTestId('example-banner').locator('p')).toHaveText(
        'This is an example plan. Nothing here is yours.',
      );
      await expect(page.getByTestId('balance')).toContainText('£267.54');
      await noAxeProblems(page);
      // A change to the example stays in the example.
      await page
        .getByRole('button', { name: /^Family loan / })
        .first()
        .click();
      await page.getByRole('button', { name: 'Mark as paid' }).click();
      await expect(page.getByTestId('undo-bar')).toContainText('Family loan marked as paid.');

      await page.getByRole('button', { name: 'Go back to making my plan' }).click();
      await expect(page).toHaveURL(/\/setup\/$/);
      await page.getByRole('button', { name: 'Carry on making my plan' }).click();
      await expectStep(page, 1, 'Your account');
      await expect(page.getByTestId('added')).toContainText('Current account');
      expect(await ownRecords(page)).toEqual(before);
      const plansAfter = (await storedPlans(page)).filter(
        (plan) => (plan as { isExample: boolean }).isExample === false,
      );
      expect(plansAfter.map((plan) => (plan as { id: string }).id)).toEqual(
        plansBefore.map((plan) => (plan as { id: string }).id),
      );
    });

    test('test 6: a date before today on any step says so in plain words', async ({ page }) => {
      const message =
        "Pick today or a later date. If it's already gone, update your balance instead.";
      await startSetup(page, '2026-11-04');
      await fillAccount(lastForm(page, 'account'), {
        name: 'Current account',
        balance: '500',
        warning: '20',
      });
      await page.getByRole('button', { name: 'Add another account' }).click();
      await fillAccount(lastForm(page, 'account'), {
        name: 'Savings',
        kind: 'Savings',
        balance: '100',
        warning: '0',
      });
      await next(page);

      // Step 2: the next payday.
      await expectStep(page, 2, "How you're paid");
      const pay = lastForm(page, 'income');
      await box(pay, 'Next payday').fill('2026-11-03');
      await box(pay, 'How much comes in, after tax').fill('450');
      await next(page);
      await expect(pay.getByText(message, { exact: true })).toBeVisible();
      await expect(box(pay, 'Next payday')).toBeFocused();
      await noAxeProblems(page);
      await box(pay, 'Next payday').fill('2026-11-06');
      await radio(page, 'No').check();
      await next(page);

      // Step 3: rent.
      await expectStep(page, 3, 'Rent or mortgage');
      await box(page, 'Amount').fill('550');
      await fillWhen(page.getByRole('form'), { date: '2026-11-01' });
      await next(page);
      await expect(page.getByText(message, { exact: true })).toBeVisible();
      await expect(box(page, 'Next payment')).toBeFocused();
      await fillWhen(page.getByRole('form'), { date: '2026-12-01' });
      await next(page);

      // Step 4: a bill.
      await expectStep(page, 4, 'Bills');
      const phone = page.locator('[data-bill="phone"]');
      await phone.getByRole('checkbox', { name: 'Phone', exact: true }).check();
      await box(phone, 'Amount').fill('18');
      await fillWhen(phone, { date: '2026-10-20' });
      await next(page);
      await expect(phone.getByText(message, { exact: true })).toBeVisible();
      await expect(box(phone, 'Next payment')).toBeFocused();
      await noAxeProblems(page);
      await fillWhen(phone, { date: '2026-11-20' });
      await next(page);

      // Step 5: a debt's payments.
      await expectStep(page, 5, 'Debts');
      await page.getByRole('button', { name: 'Add a debt' }).click();
      const debt = lastForm(page, 'debt');
      await box(debt, 'Name').fill('Sofa finance');
      await box(debt, 'What you owe now').fill('453.77');
      await box(debt, 'Each payment').fill('37.88');
      await fillWhen(debt, { date: '2026-10-23' });
      await next(page);
      await expect(debt.getByText(message, { exact: true })).toBeVisible();
      await expect(box(debt, 'Next payment')).toBeFocused();
      await fillWhen(debt, { date: '2026-11-23', payments: '12' });
      await next(page);

      // Step 6: a budget's start. A budget isn't already gone, so only the first sentence.
      await expectStep(page, 6, 'Spending money');
      const food = page.getByTestId('budget-form').first();
      await box(food, 'Amount').fill('200');
      await box(food, 'Starts').fill('2026-11-01');
      await next(page);
      await expect(food.getByText('Pick today or a later date.', { exact: true })).toBeVisible();
      await expect(box(food, 'Starts')).toBeFocused();
      await box(food, 'Starts').fill('2026-11-06');
      await next(page);

      // Step 7: money moved into a savings goal.
      await expectStep(page, 7, 'Savings');
      const goal = lastForm(page, 'goal');
      await box(goal, 'What are you saving for?').fill('Holiday');
      await box(goal, 'Target').fill('1200');
      await box(goal, 'Move into it').fill('50');
      await radio(goal, 'Another way').check();
      await fillWhen(goal, { date: '2026-11-01' });
      await next(page);
      await expect(goal.getByText(message, { exact: true })).toBeVisible();
      await expect(box(goal, 'Next payment')).toBeFocused();
      await noAxeProblems(page);
      await fillWhen(goal, { date: '2026-11-06' });
      await next(page);
      await expectStep(page, 8, "Here's your plan");
    });
  });
}

/** Opens PrePenny again on the same phone, with the same test-only today. */
async function openAgain(page: Page, today: string) {
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today }] as const);
  await page.goto('/app/');
  await expect(page).toHaveURL(/\/setup\/$/);
}

test('the welcome says what PrePenny is, with Make my plan and Look at an example plan', async ({
  page,
}) => {
  await openFresh(page, '2026-11-04');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('PrePenny');
  await expect(page.getByText('Plan every penny before payday.', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "See what's left after every payment, the lowest point ahead and when each debt is paid off.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Look at an example plan' })).toBeVisible();
  await noAxeProblems(page);
  // The website's first page is the same welcome.
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Make my plan' })).toBeVisible();
});
