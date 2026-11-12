// Home and wording polish, from the owner's decisions of 12 Nov 2026, at
// 320px and 360px wide, in light and dark, checked by axe:
//
// 1. Sam's example says "Example plan, as on Sun 25 Oct 2026" where it said
//    "Checked today, Sun 25 Oct", and never "today" about the bank's figure;
//    it still shows Sun 25 Oct 2026 as today (D133, D440).
// 2. Home's fourth button, What if's and the usual week's sentence say
//    "Overtime or missed shift", two per row at 320px, and the sheet's title
//    follows the choice: "I did overtime" or "I missed a shift" (D282, D441).
// 3. "+ Add an account" is under Home's four buttons, and on a 320 by 568
//    phone Home shows the account card, "About £X now" included, and the
//    lowest point ahead without scrolling, on a plan of one's own (D431,
//    D442). Sam's example has its banner above, so it isn't one of them.

import { test as fresh, type Locator, type Page, type TestInfo } from '@playwright/test';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { strings } from '../strings/en-GB.ts';
import { layoutProblems } from './coming-up.ts';
import { expect, settingScript, test } from './fixtures.ts';
import { noSidewaysScroll } from './journeys.ts';
import {
  box,
  expectStep,
  fillAccount,
  fillWhen,
  lastForm,
  next,
  noAxeProblems,
  radio,
  rentForm,
  billOn,
  skip,
  startSetup,
} from './setup.ts';

const SCREENS = '../../docs/screens/polish';
const NB = ' ';
const day = (text: string) => text.replaceAll(' ', NB);
const t = strings.home;
const BUTTON = 'Overtime or missed shift';

/** True for the one run that saves the screenshots: 320px, light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  colorScheme === 'light' && info.project.name === 'phone-320';

async function openHome(page: Page) {
  await page.goto('/app/');
  await expect(page.getByTestId('lowest-point')).toBeVisible();
}

/** Opens the overtime sheet from a button, and checks its title. */
async function openSheet(page: Page, button: Locator, title: string) {
  await button.click();
  const sheet = page.getByRole('dialog', { name: title });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
  return sheet;
}

/** Where a part of the page is on screen, rounded to whole pixels. */
async function boxOf(where: Locator) {
  const found = await where.boundingBox();
  expect(found).not.toBeNull();
  const { x, y, width, height } = found ?? { x: 0, y: 0, width: 0, height: 0 };
  return { x, y, width, height, bottom: y + height, right: x + width };
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Home and wording polish, ${colorScheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test("1. Sam's example: \"Example plan, as on Sun 25 Oct 2026\", never \"today\"", async ({
      page,
    }, info) => {
      await openHome(page);
      const card = page.getByRole('region', { name: 'Current account' });
      // Money has moved since the bank was checked (the £30.00 spending
      // money due on Sun 25 Oct), so the figure is about what's there now,
      // with the bank's figure under it, then the example's day (D430, D440).
      await expect(page.getByTestId('now')).toHaveText('About £237.54 now');
      await expect(page.getByTestId('bank-showed')).toHaveText('Your bank showed £267.54');
      await expect(page.getByTestId('balance')).toHaveText('£267.54');
      await expect(page.getByTestId('checked')).toHaveText(
        `Example plan, as on ${day('Sun 25 Oct 2026')}`,
      );
      await expect(card).not.toContainText(/today|Checked/);
      // Still Sun 25 Oct as today (D133): the brief's figures.
      await expect(page.getByTestId('left-to-spend')).toHaveText('£30.00');
      await expect(page.getByTestId('lowest-point')).toContainText('£4.53');
      await expect(page.getByTestId('lowest-point')).toContainText(
        `${day('Sun 1 Nov')}, after Rent`,
      );
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/home-example-320-light.png` });
      }

      // With the £30.00 ticked in Update balance, nothing has moved since:
      // the figure as the bank showed it, and the same line.
      await page.getByRole('button', { name: 'Update balance' }).click();
      const sheet = page.getByRole('dialog', { name: 'Update balance' });
      await sheet.getByLabel('Type what your bank shows now').fill('237.54');
      await sheet.getByRole('button', { name: 'Next' }).click();
      await sheet.getByRole('button', { name: 'Next' }).click();
      await sheet.getByTestId('to-tick').getByRole('checkbox').first().check();
      await sheet.getByRole('button', { name: 'Done' }).click();
      await sheet.getByRole('button', { name: 'Done' }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByTestId('balance')).toHaveText('£237.54');
      await expect(page.getByTestId('now')).toHaveCount(0);
      await expect(page.getByTestId('checked')).toHaveText(
        `Example plan, as on ${day('Sun 25 Oct 2026')}`,
      );
      await expect(card).not.toContainText(/today|Checked/);
      await noAxeProblems(page);

      // With text at 200%, it all still fits.
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(page.getByTestId('now')).toHaveText('About £237.54 now');
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      expect(await layoutProblems(page)).toEqual([]);
    });

    test(`2. "${BUTTON}" on Home, two per row at 320px, and the sheet's title follows the choice`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await openHome(page);
      const actions = page.getByRole('region', { name: strings.actions.label });
      const names = await actions.getByRole('button').allTextContents();
      expect(names).toEqual(['Update balance', 'Add a payment', 'I spent', BUTTON]);
      await expect(page.getByText(/Extra\/Missed/)).toHaveCount(0);

      // Two per row: "I spent" and "Overtime or missed shift" side by side,
      // each half the row, all four the same height, and every word showing.
      const button = actions.getByRole('button', { name: BUTTON, exact: true });
      const spent = await boxOf(actions.getByRole('button', { name: 'I spent', exact: true }));
      const update = await boxOf(actions.getByRole('button', { name: 'Update balance' }));
      const add = await boxOf(actions.getByRole('button', { name: 'Add a payment' }));
      const mine = await boxOf(button);
      expect(Math.abs(mine.y - spent.y)).toBeLessThan(1);
      expect(mine.x).toBeGreaterThan(spent.right);
      expect(Math.abs(mine.width - spent.width)).toBeLessThan(1);
      expect(mine.right).toBeLessThanOrEqual(304.5);
      for (const other of [update, add, spent]) {
        expect(Math.abs(other.height - mine.height)).toBeLessThan(1);
      }
      expect(mine.height).toBeGreaterThanOrEqual(48);
      const fits = await button.evaluate((element) => {
        const style = getComputedStyle(element);
        const lines = Math.round(
          (element.clientHeight -
            Number.parseFloat(style.paddingTop) -
            Number.parseFloat(style.paddingBottom)) /
            Number.parseFloat(style.lineHeight),
        );
        return {
          lines,
          clipped:
            element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
        };
      });
      expect(fits.clipped).toBe(false);
      expect(fits.lines).toBeLessThanOrEqual(2);
      expect(await layoutProblems(page)).toEqual([]);
      await noSidewaysScroll(page);
      if (shoots(info, colorScheme)) {
        await actions.screenshot({ path: `${SCREENS}/home-buttons-320-light.png` });
      }

      // It opens "I did overtime", with "What happened?" (D213, D282).
      const sheet = await openSheet(page, button, 'I did overtime');
      const what = sheet.getByRole('group', { name: 'What happened?' });
      await expect(what.getByRole('radio', { name: 'I worked extra hours' })).toBeChecked();
      await expect(sheet.getByLabel('Day of the overtime')).toBeVisible();
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/sheet-i-did-overtime-320-light.png` });
      }

      // "I missed a shift": the title follows the choice.
      await what.getByRole('radio', { name: 'I missed a shift' }).check();
      const missed = page.getByRole('dialog', { name: 'I missed a shift' });
      await expect(
        missed.getByRole('heading', { level: 2, name: 'I missed a shift', exact: true }),
      ).toBeVisible();
      await expect(missed.getByLabel('Day of the shift')).toBeVisible();
      await expect(page.getByRole('dialog', { name: 'I did overtime' })).toHaveCount(0);
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/sheet-i-missed-a-shift-320-light.png` });
      }

      // And back again.
      await missed.getByRole('radio', { name: 'I worked extra hours' }).check();
      await expect(
        page
          .getByRole('dialog', { name: 'I did overtime' })
          .getByRole('heading', { level: 2, name: 'I did overtime', exact: true }),
      ).toBeVisible();
      await page
        .getByRole('dialog', { name: 'I did overtime' })
        .getByRole('button', { name: 'Close' })
        .first()
        .click();
      await expect(button).toBeFocused();

      // Each time it opens, it starts on "I did overtime", the first answer.
      await openSheet(page, button, 'I did overtime');
    });

    test(`2. What if's button and the usual week's sentence say "${BUTTON}"`, async ({ page }) => {
      await page.goto('/app/what-if/');
      await expect(page.getByRole('heading', { level: 1, name: 'What if' })).toBeVisible();
      const practice = page.getByRole('region', { name: strings.whatIf.makeChange });
      const button = practice.getByRole('button', { name: BUTTON, exact: true });
      await expect(button).toBeVisible();
      const sheet = await openSheet(page, button, 'I did overtime');
      await sheet.getByRole('group', { name: 'What happened?' }).getByRole('radio', {
        name: 'I missed a shift',
      }).check();
      await expect(
        page
          .getByRole('dialog', { name: 'I missed a shift' })
          .getByRole('heading', { level: 2, name: 'I missed a shift', exact: true }),
      ).toBeVisible();
      await noAxeProblems(page);

      await page.goto('/app/pay/');
      await page.getByRole('button', { name: 'Work out take-home pay' }).click();
      await page
        .getByTestId('pay-result')
        .getByRole('button', { name: 'Save as a usual week' })
        .click();
      const week = page.getByRole('dialog', { name: 'Save as a usual week' });
      await expect(week).toContainText(
        'Save these hours and rates as a usual week. You can start from it again here, and "Overtime or missed shift" uses it to work out your pay.',
      );
      await expect(page.getByText(/Extra\/Missed/)).toHaveCount(0);
    });

    test('3. "+ Add an account" is under the four buttons, and opens Add an account', async ({
      page,
    }, info) => {
      await openHome(page);
      const link = page.getByRole('button', { name: t.addAccount });
      await expect(link).toBeVisible();
      const actions = await boxOf(page.getByRole('region', { name: strings.actions.label }));
      const under = await boxOf(link);
      const lowest = await boxOf(page.getByTestId('lowest-point'));
      expect(under.y).toBeGreaterThanOrEqual(actions.bottom);
      expect(under.y).toBeGreaterThan(lowest.bottom);
      expect(under.height).toBeGreaterThanOrEqual(44);
      // Nothing between the account card and the lowest point now.
      const card = await boxOf(page.getByRole('region', { name: 'Current account' }));
      expect(lowest.y - card.bottom).toBeLessThanOrEqual(12.5);
      await link.scrollIntoViewIfNeeded();
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/home-add-an-account-320-light.png` });
      }
      await link.click();
      const sheet = page.getByRole('dialog', { name: strings.accountSheet.addTitle });
      await expect(sheet).toBeVisible();
      await fillAccount(sheet, { name: 'Holiday pot', balance: '75', warning: '0' });
      await sheet.getByRole('button', { name: strings.accountSheet.save }).click();
      await expect(sheet).toBeHidden();
      await expect(link).toBeFocused();
      await page.goto('/app/accounts/');
      await expect(page.getByText('Holiday pot', { exact: true })).toBeVisible();
    });
  });
}

/**
 * A plan of one's own, made on setup's screens on Sun 25 Oct: £267.54 in the
 * current account, warned under £100, a £30.00 phone bill today, pay of
 * £452.17 every Friday from Fri 30 Oct and £600.00 rent on the 1st. Home
 * shows "About £237.54 now", and the lowest point is Tight: £89.71 on Mon 2
 * Nov, after Rent, moved off the Sunday (D231).
 */
async function setUpOwnPlan(page: Page) {
  await startSetup(page, '2026-10-26');
  await fillAccount(lastForm(page, 'account'), {
    name: 'Current account',
    balance: '267.54',
    warning: '200',
  });
  await next(page);
  const pay = lastForm(page, 'income');
  await box(pay, 'Next payday').fill('2026-10-30');
  await box(pay, 'How much comes in, after tax').fill('452.17');
  await radio(page, 'No').check();
  await next(page);
  await expectStep(page, 3, 'Home and bills');
  await box(rentForm(page), 'Amount').fill('600');
  await fillWhen(rentForm(page), { date: '2026-11-01' });
  const phone = billOn(page, 'phone');
  await phone.getByRole('checkbox', { name: 'Phone', exact: true }).check();
  await box(phone, 'Amount').fill('30');
  await fillWhen(phone, { date: '2026-10-26' });
  await next(page);
  await expectStep(page, 4, 'Debts');
  await skip(page);
  await expectStep(page, 5, 'Spending money');
  await box(page.getByTestId('budget-form').first(), 'Amount').fill('40');
  await next(page);
  await expectStep(page, 6, "Here's your plan");
  await page.getByRole('button', { name: 'Go to my plan' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByTestId('lowest-point')).toBeVisible();
  await expect(page.getByTestId('example-banner')).toHaveCount(0);
}

/**
 * Nothing scrolled; the account card, "About £X now" in it, ends above the
 * bottom navigation; and so does the lowest point ahead: the whole card, or
 * its label, status, figure and date.
 */
async function expectInView(page: Page, lowestShows: 'whole card' | 'up to its date') {
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const nav = await boxOf(page.getByRole('navigation', { name: 'Main' }));
  const card = await boxOf(page.getByRole('region', { name: 'Current account' }));
  const now = await boxOf(page.getByTestId('now'));
  const lowest = page.getByTestId('lowest-point');
  expect(card.y).toBeGreaterThanOrEqual(0);
  expect(now.y).toBeGreaterThanOrEqual(card.y);
  expect(now.bottom).toBeLessThanOrEqual(card.bottom);
  expect(card.bottom).toBeLessThanOrEqual(nav.y);
  const low = await boxOf(lowest);
  expect(low.y).toBeGreaterThan(card.bottom);
  for (const part of [
    lowest.getByText('Lowest point ahead', { exact: true }),
    lowest.getByText('Tight', { exact: true }),
    lowest.getByText('£9.71', { exact: true }),
    lowest.getByText(`${day('Mon 2 Nov')}, after Rent`, { exact: true }),
  ]) {
    expect((await boxOf(part)).bottom).toBeLessThanOrEqual(nav.y);
  }
  if (lowestShows === 'whole card') expect(low.bottom).toBeLessThanOrEqual(nav.y);
}

// A plan of one's own starts on a phone with nothing on it, as setup's tests do.
for (const colorScheme of ['light', 'dark'] as const) {
  fresh.describe(`Home on a 320 by 568 phone, ${colorScheme}`, () => {
    fresh.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    fresh(
      '3. the account card, "About £X now" included, and the lowest point ahead, without scrolling',
      async ({ page }, info) => {
        await setUpOwnPlan(page);
        // 320 by 568, as the owner asked; the 360px run tries 360 by 640, a
        // small Android phone, as well.
        await page.setViewportSize(
          info.project.name === 'phone-360'
            ? { width: 360, height: 640 }
            : { width: 320, height: 568 },
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        // The account card with every line it has: about what's there now,
        // what the bank showed, Left to spend and its line (D3, D118, D430).
        // The £40.00 for food is still in the bank until it's spent.
        await expect(page.getByTestId('now')).toHaveText('About £197.54 now');
        await expect(page.getByTestId('bank-showed')).toHaveText('Your bank showed £267.54 today');
        await expect(page.getByTestId('left-to-spend')).toHaveText('£40.00');
        await expect(
          page.getByText(
            `Spend no more than £37.54 to keep at least £200 until ${day('Fri 30 Oct')}.`,
            { exact: true },
          ),
        ).toBeVisible();
        // The lowest point with every line it has.
        const lowest = page.getByTestId('lowest-point');
        await expect(lowest).toContainText('£9.71');
        await expect(lowest).toContainText('Tight');
        await expect(lowest).toContainText(`${day('Mon 2 Nov')}, after Rent`);
        await expect(lowest).toContainText(`Under £200 from ${day('Mon 26 Oct')}.`);

        // On the day the bank was checked, nothing scrolled, and both whole
        // cards end above the bottom navigation.
        await expectInView(page, 'whole card');
        await noSidewaysScroll(page);
        await noAxeProblems(page);
        if (shoots(info, colorScheme)) {
          await page.screenshot({ path: `${SCREENS}/home-own-plan-320x568-light.png` });
        }

        // A day later the bank's line says the day, on two lines at 320px:
        // the whole account card still shows, and the lowest point with its
        // status, figure and date; only its last small line can be under
        // the navigation.
        await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today: '2026-10-27' }] as const);
        await page.goto('/app/');
        await expect(page.getByTestId('bank-showed')).toHaveText(
          `Your bank showed £267.54 on ${day('Mon 26 Oct')}`,
        );
        await expect(page.getByTestId('now')).toHaveText('About £197.54 now');
        await expectInView(page, 'up to its date');
      },
    );
  });
}
