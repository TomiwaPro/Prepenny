// First-time setup (brief 4.1, D163, step 2e), from a phone with nothing on
// it, at 320px and 360px wide, in light and dark, checked by axe: the
// owner's tests 1 to 6, now on 6 screens in 3 parts. And for the shorter
// setup (D356): the whole of it from the welcome to the plan, counting its
// screens and taps (test 7); progress saved on each of the old 8 steps opens
// the matching new screen with nothing lost (test 8); and "Add a goal" on
// the plan (test 9). "Today" is the test-only today (D201).

import { expect, type Page, test } from '@playwright/test';
import { type PlanRecords, workOutPlan } from '@prepenny/engine';
import { build, kofiSteps } from '../../../packages/engine/test/fixtures/from-empty.ts';
import { calendarFor as holidaysFor } from '../../../packages/engine/test/fixtures/holidays.ts';
import { priyaPlan } from '../../../packages/engine/test/fixtures/people.ts';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { openPeriod, paydayButton, period, rowIn } from './coming-up.ts';
import { settingScript } from './fixtures.ts';
import {
  addGoalOnPlan,
  asOldItems,
  back,
  billOn,
  box,
  comparable,
  countTaps,
  expectAddedOn,
  expectStep,
  fillAccount,
  fillWhen,
  lastForm,
  next,
  noAxeProblems,
  OLD_STEP_OPENS,
  openFresh,
  ownRecords,
  radio,
  rentForm,
  SCREEN_TITLES,
  setUpEverything,
  setUpKofi,
  setUpPriya,
  skip,
  startSetup,
  storedPlans,
  tapsSoFar,
} from './setup.ts';
import {
  buildFrom,
  KOFI_ALREADY_SPENT,
  KOFI_TODAY,
  kofiCommands,
  PRIYA_ALREADY_SPENT,
  PRIYA_TODAY,
  priyaCommands,
  withSetupRules,
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
      // £35.00 lower than before step 2f: what's left of this month's Food
      // (£30.00) and this week's Travel (£5.00) leaves today (D230).
      await expect(page.getByTestId('setup-lowest')).toContainText('£1,187.73');
      await expect(page.getByTestId('setup-lowest')).toContainText('Thu 29 Oct');
      await expect(page.getByTestId('setup-left-to-spend')).toContainText(
        'Left to spend until Fri 30 Oct',
      );
      await expect(page.getByTestId('setup-left-to-spend')).toContainText('£49.28');
      // The holiday fund is reached with the 8th move of £150 (D137).
      await expect(page.getByTestId('setup-first-goal')).toHaveText(
        'First savings goal reachedHoliday, Fri 28 May 2027',
      );
      await expect(summary.getByTestId('setup-first-debt')).toHaveCount(0);

      // The plan the screens built is the plan the step 2a commands build from the same answers.
      const saved = await ownRecords(page);
      const commands = buildFrom(priyaCommands(), PRIYA_TODAY);
      expect(comparable(saved)).toEqual(comparable(commands));
      // And every day's balance is her test plan's (D137), a year ahead, with
      // the owner's two answers for setup made on it: her budgets start this
      // week and month, with what she's already spent inside her balance
      // (D230), and rent and bills move to the next working day (D231).
      const fixture = priyaPlan();
      expect(dayBalances(saved, PRIYA_TODAY, '2027-10-24')).toEqual(
        dayBalances(
          withSetupRules(
            { ...fixture, settings: { nation: 'england-and-wales', mainPayFamilyId: 'salary' } },
            PRIYA_TODAY,
            PRIYA_ALREADY_SPENT,
          ),
          PRIYA_TODAY,
          '2027-10-24',
        ),
      );
      // Rent on Sun 1 Nov moves to Mon 2 Nov; on a Tuesday it keeps its date (D231).
      expect(datesOf(saved, PRIYA_TODAY, 'Rent').slice(0, 2)).toEqual(['2026-11-02', '2026-12-01']);
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
      await setUpKofi(page);
      await expectStep(page, 6, "Here's your plan");
      await expect(page.getByTestId('setup-first-debt')).toContainText('Van finance');
      // £70.00 lower than before step 2f: what's left of this week's Fuel
      // (£40.00) and Food (£30.00) leaves today (D230).
      await expect(page.getByTestId('setup-lowest')).toContainText('£86.00');
      await expect(page.getByTestId('setup-lowest')).toContainText('Thu 5 Nov');
      await expect(page.getByTestId('setup-left-to-spend')).toContainText('£70.00');
      await noAxeProblems(page);

      const saved = await ownRecords(page);
      expect(comparable(saved)).toEqual(comparable(buildFrom(kofiCommands(), KOFI_TODAY)));
      // Every day's balance is his test plan's as he set it up (D137, D157),
      // with the owner's two answers for setup made on it (D230, D231).
      const steps = kofiSteps();
      const atSetup = build(
        steps.slice(0, steps.findIndex((one) => one.command.kind === 'choose-main-pay') + 1),
      );
      expect(dayBalances(saved, KOFI_TODAY, '2027-02-28')).toEqual(
        dayBalances(
          withSetupRules(atSetup.records, KOFI_TODAY, KOFI_ALREADY_SPENT),
          KOFI_TODAY,
          '2027-02-28',
        ),
      );
      // Rent on Sun 1 Nov moves to Mon 2 Nov; his van finance keeps its date (D231).
      expect(datesOf(saved, KOFI_TODAY, 'Rent')[0]).toBe('2026-11-02');

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
      await page.getByRole('button', { name: 'Change view', exact: true }).click();
      await expect(page.getByRole('dialog').getByText('Mon to Sun', { exact: true })).toBeVisible();
    });

    test('test 3: skipping every screen but the first still gives a plan with one account and its balance', async ({
      page,
    }) => {
      await countTaps(page);
      await startSetup(page, '2026-11-04');
      await fillAccount(lastForm(page, 'account'), {
        name: 'Current account',
        balance: '412.30',
        warning: '20',
      });
      await next(page);
      for (const [step, title] of [
        [2, "How you're paid"],
        [3, 'Home and bills'],
        [4, 'Debts'],
        [5, 'Spending money'],
      ] as const) {
        await expectStep(page, step, title);
        await skip(page);
      }
      await expectStep(page, 6, "Here's your plan");
      // Make my plan, 3 boxes and Next, then 4 Skips (D356): 9 taps, then Go to my plan.
      expect(await tapsSoFar(page)).toBe(9);
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

    test('test 4: leaving after Home and bills and opening the app again carries on at Debts', async ({
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
      await expectStep(page, 3, 'Home and bills');
      await box(rentForm(page), 'Amount').fill('550');
      await fillWhen(rentForm(page), { date: '2026-12-01' });
      const phone = billOn(page, 'phone');
      await phone.getByRole('checkbox', { name: 'Phone', exact: true }).check();
      await box(phone, 'Amount').fill('18');
      await fillWhen(phone, { date: '2026-11-20' });
      await next(page);
      await expectStep(page, 4, 'Debts');
      await page.close();

      // Opening PrePenny again, in a new tab on the same phone.
      const again = await context.newPage();
      await again.emulateMedia({ colorScheme });
      await openAgain(again, '2026-11-04');
      await expectStep(again, 4, 'Debts');
      await back(again);
      await expectStep(again, 3, 'Home and bills');
      // Rent first, then the bills, each with Remove (D221, D356).
      await expect(again.getByTestId('added').getByRole('listitem')).toHaveCount(2);
      await expect(again.getByTestId('added').getByRole('listitem').first()).toContainText(
        'Rent£550.00, monthly on the 1st, next Tue 1 Dec',
      );
      await expect(again.getByTestId('added').getByRole('listitem').nth(1)).toContainText(
        'Phone£18.00, monthly on the 20th, next Fri 20 Nov',
      );
      // Rent is added, so its card has gone; the phone has left the checklist.
      await expect(rentForm(again)).toHaveCount(0);
      await expect(billOn(again, 'phone')).toHaveCount(0);
      await expect(billOn(again, 'energy')).toBeVisible();
      await noAxeProblems(again);

      // Anything added can be removed while setting up, as one undo (D221)…
      await again.getByRole('button', { name: 'Remove Rent' }).click();
      await expect(again.getByTestId('added').getByRole('listitem')).toHaveCount(1);
      await expect(box(rentForm(again), 'Amount')).toBeVisible();
      expect((await ownRecords(again)).series.map((one) => one.name)).toEqual(['Pay', 'Phone']);
      await again.getByRole('button', { name: 'Remove Phone' }).click();
      await expect(again.getByTestId('added')).toHaveCount(0);
      // Its row and button have gone, so focus moves to "Add another bill" (WCAG 2.4.3).
      await expect(again.getByRole('button', { name: 'Add another bill' })).toBeFocused();
      expect((await ownRecords(again)).series.map((one) => one.name)).toEqual(['Pay']);

      // Rent can still be left out on its own, as Skip on the old rent step
      // did, while the bills are added (D356).
      await radio(rentForm(again), "I'll add it later").check();
      await expect(box(rentForm(again), 'Amount')).toHaveCount(0);
      const water = billOn(again, 'water');
      await water.getByRole('checkbox', { name: 'Water', exact: true }).check();
      await box(water, 'Amount').fill('32');
      await fillWhen(water, { date: '2026-11-10' });
      await next(again);
      await expectStep(again, 4, 'Debts');
      expect((await ownRecords(again)).series.map((one) => one.name)).toEqual(['Pay', 'Water']);
      // And it's asked again on the way back, with nothing chosen for them.
      await back(again);
      await expect(radio(rentForm(again), 'Rent')).toBeChecked();
      await radio(rentForm(again), "I don't pay rent or a mortgage").check();
      await next(again);
      await expectStep(again, 4, 'Debts');
      await back(again);
      // "I don't pay rent or a mortgage" is kept when coming back.
      await expect(radio(rentForm(again), "I don't pay rent or a mortgage")).toBeChecked();
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

      // Screen 3: rent and a bill, both before today. Nothing is saved until
      // both are right, and focus goes to the first, the rent (D203).
      await expectStep(page, 3, 'Home and bills');
      const rent = rentForm(page);
      await box(rent, 'Amount').fill('550');
      await fillWhen(rent, { date: '2026-11-01' });
      const phone = billOn(page, 'phone');
      await phone.getByRole('checkbox', { name: 'Phone', exact: true }).check();
      await box(phone, 'Amount').fill('18');
      await fillWhen(phone, { date: '2026-10-20' });
      await next(page);
      await expect(rent.getByText(message, { exact: true })).toBeVisible();
      await expect(phone.getByText(message, { exact: true })).toBeVisible();
      await expect(box(rent, 'Next payment')).toBeFocused();
      await noAxeProblems(page);
      expect((await ownRecords(page)).series.map((one) => one.name)).toEqual(['Pay']);
      await fillWhen(rent, { date: '2026-12-01' });
      await next(page);
      await expect(rent.getByText(message, { exact: true })).toHaveCount(0);
      await expect(box(phone, 'Next payment')).toBeFocused();
      await fillWhen(phone, { date: '2026-11-20' });
      // Rent left empty says to type it or choose no rent.
      await box(rent, 'Amount').fill('');
      await next(page);
      await expect(
        rent.getByText("Type the amount, for example 550. Or choose I'll add it later.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(box(rent, 'Amount')).toBeFocused();
      await box(rent, 'Amount').fill('550');
      await next(page);

      // Screen 4: a debt's payments.
      await expectStep(page, 4, 'Debts');
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

      // Screen 5: a budget starts this week or month, so there's no date to pick
      // (D230). What's already spent is an amount, explained in words too.
      await expectStep(page, 5, 'Spending money');
      const food = page.getByTestId('budget-form').first();
      await box(food, 'Amount').fill('200');
      await box(food, 'Already spent this month').fill('lots');
      await next(page);
      await expect(
        food.getByText('Type an amount, for example 6, or leave it empty.', { exact: true }),
      ).toBeVisible();
      await expect(box(food, 'Already spent this month')).toBeFocused();
      await box(food, 'Already spent this month').fill('');
      await next(page);

      // Screen 6: money moved into a savings goal, from "Add a goal" (D356).
      await expectStep(page, 6, "Here's your plan");
      await page.getByRole('button', { name: 'Add a goal', exact: true }).click();
      const goal = page.getByRole('dialog', { name: 'Add a savings goal' });
      await box(goal, 'What are you saving for?').fill('Holiday');
      await box(goal, 'Target').fill('1200');
      await box(goal, 'Move into it').fill('50');
      await radio(goal, 'Another way').check();
      await fillWhen(goal, { date: '2026-11-01' });
      await goal.getByRole('button', { name: 'Add goal', exact: true }).click();
      await expect(goal.getByText(message, { exact: true })).toBeVisible();
      await expect(box(goal, 'Next payment')).toBeFocused();
      await noAxeProblems(page);
      expect((await ownRecords(page)).goals ?? []).toEqual([]);
      await fillWhen(goal, { date: '2026-11-06' });
      await goal.getByRole('button', { name: 'Add goal', exact: true }).click();
      await expect(goal).toBeHidden();
      await expect(page.getByTestId('add-goal').getByTestId('added')).toContainText('Holiday');
    });

    test('test 7: the whole of setup, from the welcome to the plan, is 6 screens in 3 parts', async ({
      page,
    }) => {
      // Priya uses every screen, and adds her holiday goal from the plan (D356).
      await countTaps(page);
      const seen: string[] = [];
      await setUpPriya(page, async (screen) => {
        if (screen === 0) {
          seen.push('welcome');
          // Counting starts on the welcome.
          expect(await tapsSoFar(page)).toBe(0);
          return;
        }
        // Each screen's part at the top, with its bar of three, filled this far.
        const bar = page.getByTestId('setup-parts');
        await expect(bar.locator('span > span')).toHaveCount(3);
        seen.push((await page.getByRole('heading', { level: 1 }).textContent()) ?? '');
      });
      expect(seen).toEqual(['welcome', ...SCREEN_TITLES]);
      const fills = await page
        .getByTestId('setup-parts')
        .locator('span > span')
        .evaluateAll((parts) => parts.map((part) => (part as HTMLElement).style.width));
      expect(fills).toEqual(['100%', '100%', '100%']);
      const taps = await tapsSoFar(page);
      await page.getByRole('button', { name: 'Go to my plan' }).click();
      await expect(page).toHaveURL(/\/app\/$/);
      await expect(page.getByTestId('balance')).toContainText('£1,240.00');
      // 6 screens after the welcome, and every tap from Make my plan to Go to my plan.
      test.info().annotations.push({
        type: 'setup',
        description: `${seen.length - 1} screens after the welcome, ${taps + 1} taps`,
      });
      expect(seen.length - 1).toBe(6);
      expect(taps + 1).toBe(PRIYA_TAPS);
    });

    test('test 8: progress saved on each of the old 8 steps opens the matching new screen, with nothing lost', async ({
      page,
    }) => {
      // Something added on every screen, a goal included, as the old steps had.
      await setUpEverything(page);
      const records = await ownRecords(page);
      const saved = await ownSetup(page);
      expect(saved.layout).toBe(2);
      const oldItems = asOldItems(saved.items);
      for (const [old, screen] of OLD_STEP_OPENS) {
        // As the old setup saved it: no layout, its own step numbers.
        await writeSetup(page, { step: old, items: oldItems, answers: saved.answers });
        await page.goto('/app/');
        await expect(page).toHaveURL(/\/setup\/$/);
        if (screen === null) {
          await expect(page.getByRole('button', { name: 'Carry on making my plan' })).toBeVisible();
          await page.getByRole('button', { name: 'Carry on making my plan' }).click();
          await expectStep(page, 1, 'Your account');
        } else {
          await expectStep(page, screen, SCREEN_TITLES[screen - 1] ?? '');
        }
        await expectAddedOn(page, screen ?? 1);
        // Nothing lost: the plan is as it was.
        expect(await ownRecords(page)).toEqual(records);
      }
      await noAxeProblems(page);

      // An old "I don't pay rent" answer is still chosen (D358).
      await writeSetup(page, {
        step: 4,
        items: oldItems.filter((item) => item.kind !== 'rent'),
        answers: { ...saved.answers, noRent: true },
      });
      await page.goto('/app/');
      await expectStep(page, 3, 'Home and bills');
      await expect(radio(rentForm(page), "I don't pay rent or a mortgage")).toBeChecked();

      // A goal from the old savings step is on the plan's card, and Remove takes it back.
      await writeSetup(page, { step: 7, items: oldItems, answers: saved.answers });
      await page.goto('/app/');
      await expectStep(page, 6, "Here's your plan");
      await page.getByRole('button', { name: 'Remove Holiday' }).click();
      await expect(page.getByTestId('add-goal').getByRole('status')).toHaveText('Holiday removed.');
      expect((await ownRecords(page)).goals ?? []).toEqual([]);
      const goalGone = await ownRecords(page);

      // Every screen still lists what it added, and Remove still takes it back.
      await writeSetup(page, {
        step: 4,
        items: oldItems.filter((item) => item.kind !== 'goal'),
        answers: saved.answers,
      });
      await page.goto('/app/');
      await expectStep(page, 3, 'Home and bills');
      await page.getByRole('button', { name: 'Remove Phone' }).click();
      await expect(page.getByTestId('added').getByRole('listitem')).toHaveCount(1);
      expect((await ownRecords(page)).series.map((one) => one.name)).toEqual(
        goalGone.series.map((one) => one.name).filter((name) => name !== 'Phone'),
      );
      // Saving again saves the new layout, with every item on its new screen.
      const after = await ownSetup(page);
      expect(after.layout).toBe(2);
      expect(after.step).toBe(3);
      expect(after.items.map((item) => [item.kind, item.step])).toEqual(
        saved.items
          .filter((item) => item.kind !== 'bill' && item.kind !== 'goal')
          .map((item) => [item.kind, item.step]),
      );
    });

    test('test 9: "Add a goal" on the plan adds a savings goal, and Remove takes it back', async ({
      page,
    }) => {
      await startSetup(page, '2026-11-04');
      await fillAccount(lastForm(page, 'account'), {
        name: 'Current account',
        balance: '500',
        warning: '20',
      });
      await next(page);
      const pay = lastForm(page, 'income');
      await box(pay, 'Next payday').fill('2026-11-06');
      await box(pay, 'How much comes in, after tax').fill('450');
      await radio(page, 'No').check();
      await next(page);
      for (const [step, title] of [
        [3, 'Home and bills'],
        [4, 'Debts'],
        [5, 'Spending money'],
      ] as const) {
        await expectStep(page, step, title);
        await skip(page);
      }
      await expectStep(page, 6, "Here's your plan");
      await expect(page.getByTestId('setup-first-goal')).toHaveCount(0);
      const card = page.getByTestId('add-goal');
      await expect(card).toContainText(
        "Set a target and see the date you'll get there. You can also add one later from More, under Savings goals.",
      );
      // With one account, the goal is kept in a new savings account, as before (D226).
      await addGoalOnPlan(page, { name: 'New phone', target: '300', move: '50' }, async (sheet) => {
        await expect(
          radio(sheet.getByRole('group', { name: 'Kept in' }), 'A new savings account'),
        ).toBeChecked();
        await box(sheet, 'Name of the savings account').fill('Savings');
        await expect(radio(sheet, 'Each payday, from Fri 6 Nov')).toBeChecked();
      });
      await expect(page.getByTestId('setup-first-goal')).toHaveText(
        'First savings goal reachedNew phone, Fri 11 Dec',
      );
      await expect(card.getByRole('button', { name: 'Add another goal' })).toBeFocused();
      await noAxeProblems(page);
      const records = await ownRecords(page);
      expect(records.goals?.map((one) => one.name)).toEqual(['New phone']);
      expect(records.accounts.map((one) => one.name)).toEqual(['Current account', 'Savings']);
      expect(records.series.map((one) => one.name)).toEqual(['Pay', 'Saving for New phone']);

      // Remove takes the goal, its new account and its moves back, as one undo (D221).
      await card.getByRole('button', { name: 'Remove New phone' }).click();
      await expect(card.getByRole('status')).toHaveText('New phone removed.');
      await expect(card.getByTestId('added')).toHaveCount(0);
      // Its row has gone, so focus moves to "Add a goal" (WCAG 2.4.3).
      await expect(card.getByRole('button', { name: 'Add a goal', exact: true })).toBeFocused();
      await expect(page.getByTestId('setup-first-goal')).toHaveCount(0);
      const after = await ownRecords(page);
      expect(after.goals ?? []).toEqual([]);
      expect(after.accounts.map((one) => one.name)).toEqual(['Current account']);

      // Added again, it's there on Home's plan and under More, Savings goals.
      await addGoalOnPlan(page, { name: 'New phone', target: '300', move: '50' }, async (sheet) => {
        await box(sheet, 'Name of the savings account').fill('Savings');
      });
      await page.getByRole('button', { name: 'Go to my plan' }).click();
      await expect(page).toHaveURL(/\/app\/$/);
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'More', exact: true })
        .click();
      await page.getByRole('link', { name: 'Savings goals' }).click();
      await expect(page.getByTestId('goal')).toContainText('New phone');
      await noAxeProblems(page);
    });
  });
}

/** Opens PrePenny again on the same phone, with the same test-only today. */
async function openAgain(page: Page, today: string) {
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today }] as const);
  await page.goto('/app/');
  await expect(page).toHaveURL(/\/setup\/$/);
}

test('the welcome says what PrePenny is, how long setting it up takes, with Make my plan and Look at an example plan', async ({
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
  // Before setup starts (D356).
  await expect(
    page.getByText('Set it up once, about 5 minutes. After that, just keep it up to date.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Look at an example plan' })).toBeVisible();
  await noAxeProblems(page);
  // The website's first page is the same welcome.
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Make my plan' })).toBeVisible();
});

/** Every tap of Priya's whole setup, from Make my plan to Go to my plan (test 7, D356). */
const PRIYA_TAPS = 79;

interface StoredSetup {
  readonly layout?: number;
  readonly step: number | 'done';
  readonly items: readonly { readonly kind: string; readonly step: number }[];
  readonly answers: Record<string, unknown>;
}

/** How far setup has got, as the phone keeps it with the person's own plan. */
async function ownSetup(page: Page): Promise<StoredSetup> {
  const plans = (await storedPlans(page)) as { isExample: boolean; setup?: StoredSetup }[];
  const own = plans.find((plan) => !plan.isExample);
  if (own?.setup === undefined) throw new Error('No setup on the phone.');
  return own.setup;
}

/** Writes how far setup has got straight into the phone's database, as an older PrePenny saved it. */
async function writeSetup(page: Page, setup: unknown) {
  await page.evaluate(
    (value) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('prepenny');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const store = db.transaction('plans', 'readwrite').objectStore('plans');
          const all = store.getAll();
          all.onsuccess = () => {
            const own = (all.result as { isExample: boolean }[]).find((plan) => !plan.isExample);
            if (own === undefined) {
              db.close();
              reject(new Error('No plan of its own on the phone.'));
              return;
            }
            const put = store.put({ ...own, setup: value });
            put.onsuccess = () => {
              db.close();
              resolve();
            };
            put.onerror = () => reject(put.error);
          };
        };
      }),
    setup,
  );
}
