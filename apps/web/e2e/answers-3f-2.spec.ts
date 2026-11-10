// The owner's fixes from testing the live app, step 3f-2, at 320px and 360px
// wide, in light and dark, checked by axe:
//
// A. Setup's "Your account": the name follows the type chosen ("Joint
//    account", "Savings") until the person types a name of their own (D429).
// C. Home: "+ Add an account" right under the account card, opening the same
//    form as More, Accounts (D431).
// D. Home's big figure: "About £X now", by brief 5.5 from the last balance
//    check with every payment up to and including today, Not ticked yet
//    included, with "Your bank showed £500.00 on Sun 8 Nov" under it; and
//    the figure with "Checked today" when nothing has moved since (D430).
//
// B, the old address, is e2e/old-address.spec.ts.

import { test as fresh, type Page, type TestInfo } from '@playwright/test';
import type { PlanRecords } from '@prepenny/engine';
import { TEST_SETTING_KEY, type TestSetting } from '../lib/test-setting.ts';
import { strings } from '../strings/en-GB.ts';
import { layoutProblems } from './coming-up.ts';
import { expect, settingScript, test } from './fixtures.ts';
import { noSidewaysScroll } from './journeys.ts';
import {
  back,
  box,
  expectStep,
  fillAccount,
  lastForm,
  next,
  noAxeProblems,
  ownRecords,
  radio,
  SCREEN_TITLES,
  startSetup,
} from './setup.ts';

const SCREENS = '../../docs/screens/3f-2';
const NB = ' ';
const day = (text: string) => text.replaceAll(' ', NB);
const t = strings.home;
const kinds = strings.setup.account;

/** True for the one run that saves the screenshots: 360px, light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  colorScheme === 'light' && info.project.name === 'phone-360';

async function useSetting(page: Page, setting: TestSetting) {
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, setting] as const);
}

/** A current account the bank showed £500.00 on Sun 8 Nov, and a £20 phone bill on Tue 10 Nov. */
const phoneBill: PlanRecords = {
  accounts: [
    {
      id: 'current',
      name: 'Current account',
      kind: 'current',
      overdraftLimit: 0,
      warningLevel: 2000,
    },
  ],
  balanceUpdates: [
    {
      id: 'checked',
      accountId: 'current',
      balance: 50000,
      checkedOn: '2026-11-08',
      checkedAt: '2026-11-08T09:00:00Z',
    },
  ],
  series: [
    {
      id: 'phone',
      accountId: 'current',
      name: 'Phone bill',
      direction: 'out',
      type: 'bills',
      amount: 2000,
      start: '2026-11-10',
      schedule: { kind: 'once' },
      end: { kind: 'never' },
      holidayRule: 'keep',
      isEstimate: false,
      familyId: 'phone',
      familyCreatedAt: '2026-11-08T09:00:00Z',
    },
  ],
  changes: [],
  ticks: [],
};

async function openHomeOn(page: Page, today: string, plan?: PlanRecords) {
  await useSetting(page, { today, ...(plan === undefined ? {} : { plan }) });
  await page.goto('/app/');
  await expect(page.getByTestId('balance')).toBeVisible();
}

// Setup starts on a phone with nothing on it, as setup's own tests do.
for (const colorScheme of ['light', 'dark'] as const) {
  fresh.describe(`step 3f-2's fix to setup, ${colorScheme}`, () => {
    fresh.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    fresh(
      "A. setup: the account's name follows the type chosen, until a name of one's own is typed",
      async ({ page }, info) => {
        await startSetup(page, '2026-10-25');
        const form = lastForm(page, 'account');
        const name = box(form, 'Name of the account');
        await expect(name).toHaveValue(kinds.current);
        await radio(form, kinds.joint).check();
        await expect(name).toHaveValue(kinds.joint);
        await noAxeProblems(page);
        await noSidewaysScroll(page);
        if (shoots(info, colorScheme)) {
          await page.screenshot({ path: `${SCREENS}/setup-joint-account-360-light.png` });
        }
        await radio(form, kinds.savings).check();
        await expect(name).toHaveValue(kinds.savings);
        await radio(form, kinds.current).check();
        await expect(name).toHaveValue(kinds.current);
        // A name of one's own stays, whatever the type.
        await name.fill('Bills account');
        await radio(form, kinds.joint).check();
        await expect(name).toHaveValue('Bills account');
        // Even when it's the same words as a type.
        await name.fill('Savings');
        await radio(form, kinds.current).check();
        await expect(name).toHaveValue('Savings');

        // "Add another account" starts as Savings, and follows its type too.
        await page.getByRole('button', { name: kinds.addAnother }).click();
        const another = lastForm(page, 'account');
        const anotherName = box(another, 'Name of the account');
        await expect(anotherName).toHaveValue(kinds.savings);
        await radio(another, kinds.joint).check();
        await expect(anotherName).toHaveValue(kinds.joint);
        await noAxeProblems(page);

        // What's saved is the name shown: "Joint account".
        await fillAccount(page.getByTestId('account-form').first(), {
          name: 'Bills account',
          balance: '100',
          warning: '20',
        });
        await box(another, 'Type what your bank shows today').fill('50');
        await next(page);
        await expectStep(page, 2, SCREEN_TITLES[1]);
        await back(page);
        await expectStep(page, 1, SCREEN_TITLES[0]);
        const names = (await ownRecords(page)).accounts.map((one) => one.name);
        expect(names).toEqual(['Bills account', kinds.joint]);
      },
    );
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`step 3f-2's fixes, ${colorScheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('A. Add an account, under More: the name follows the type there too', async ({ page }) => {
      await page.goto('/app/accounts/');
      await page.getByRole('button', { name: strings.accounts.add, exact: true }).click();
      const sheet = page.getByRole('dialog', { name: strings.accountSheet.addTitle });
      const name = box(sheet, 'Name of the account');
      await expect(name).toHaveValue(kinds.savings);
      await radio(sheet, kinds.joint).check();
      await expect(name).toHaveValue(kinds.joint);
      await name.fill('Holiday pot');
      await radio(sheet, kinds.savings).check();
      await expect(name).toHaveValue('Holiday pot');
    });

    test('C. "+ Add an account" under the account card opens the same form as More, Accounts', async ({
      page,
    }, info) => {
      await openHomeOn(page, '2026-10-25');
      const link = page.getByRole('button', { name: t.addAccount });
      await expect(link).toBeVisible();
      // Right under the account card, before the lowest point.
      const card = await page.getByRole('region', { name: 'Current account' }).boundingBox();
      const under = await link.boundingBox();
      const lowest = await page.getByTestId('lowest-point').boundingBox();
      expect(card !== null && under !== null && lowest !== null).toBe(true);
      if (card !== null && under !== null && lowest !== null) {
        expect(under.y).toBeGreaterThanOrEqual(card.y + card.height - 1);
        expect(under.y + under.height).toBeLessThanOrEqual(lowest.y + 1);
        expect(under.height).toBeGreaterThanOrEqual(44);
      }
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({
          path: `${SCREENS}/home-about-now-and-add-an-account-360-light.png`,
        });
      }
      await link.click();
      const sheet = page.getByRole('dialog', { name: strings.accountSheet.addTitle });
      await expect(sheet).toBeVisible();
      await noAxeProblems(page);
      await fillAccount(sheet, { name: 'Holiday pot', balance: '75', warning: '0' });
      await sheet.getByRole('button', { name: strings.accountSheet.save }).click();
      await expect(sheet).toBeHidden();
      // It's in the plan, as from More, Accounts.
      await page.goto('/app/accounts/');
      await expect(page.getByText('Holiday pot', { exact: true })).toBeVisible();
      await expect(page.getByText('£75.00, checked today')).toBeVisible();
    });

    test('D. "About £X now" from the day of a payment, and the bank\'s figure when nothing has moved', async ({
      page,
    }) => {
      // Checked today, nothing since: the figure as the bank showed it.
      await openHomeOn(page, '2026-11-08', phoneBill);
      await expect(page.getByTestId('balance')).toHaveText('£500.00');
      await expect(page.getByText(t.checkedToday(day('Sun 8 Nov')), { exact: true })).toBeVisible();
      await expect(page.getByTestId('now')).toHaveCount(0);

      // The day before the payment: still nothing has moved.
      await openHomeOn(page, '2026-11-09', phoneBill);
      await expect(page.getByTestId('balance')).toHaveText('£500.00');
      await expect(page.getByText(t.checked(day('Sun 8 Nov')), { exact: true })).toBeVisible();
      await expect(page.getByTestId('now')).toHaveCount(0);

      // The payment's day: about £480.00 now, not ticked yet.
      await openHomeOn(page, '2026-11-10', phoneBill);
      await expect(page.getByTestId('now')).toHaveText('About £480.00 now');
      await expect(page.getByTestId('bank-showed')).toHaveText(
        `Your bank showed £500.00 ${t.bankShowedOn(day('Sun 8 Nov'))}`,
      );
      await expect(page.getByTestId('balance')).toHaveText('£500.00');
      await noAxeProblems(page);
      await noSidewaysScroll(page);

      // The day after: still counted, as Not ticked yet (brief 5.5).
      await openHomeOn(page, '2026-11-11', phoneBill);
      await expect(page.getByTestId('now')).toHaveText('About £480.00 now');
      await expect(page.getByTestId('bank-showed')).toHaveText(
        `Your bank showed £500.00 ${t.bankShowedOn(day('Sun 8 Nov'))}`,
      );
      // With text at 200%, it still fits.
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      expect(await layoutProblems(page)).toEqual([]);
    });

    test("D. Sam's example on Sun 25 Oct: about £237.54 now, after the £30 spending money due today", async ({
      page,
    }) => {
      await openHomeOn(page, '2026-10-25');
      await expect(page.getByTestId('now')).toHaveText('About £237.54 now');
      await expect(page.getByTestId('bank-showed')).toHaveText(
        `Your bank showed £267.54 ${t.bankShowedToday}`,
      );
      await expect(page.getByTestId('balance')).toHaveText('£267.54');
      await noAxeProblems(page);
      for (const width of [320, 360]) {
        await page.setViewportSize({ width, height: 700 });
        await noSidewaysScroll(page);
      }
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      expect(await layoutProblems(page)).toEqual([]);
    });
  });
}
