// The take-home pay calculator (brief 4.15, step 2g), in the app under More
// and as the public page, at 320px and 360px wide, in light and dark,
// checked by axe: the owner's step 2g tests 3 to 6. "Today" is Sun 25 Oct
// 2026 on Sam's example. Brief 8.6's payslips were paid on Fridays (D6).

import AxeBuilder from '@axe-core/playwright';
import { test as fresh, type Locator, type Page } from '@playwright/test';
import { AXE_TAGS, layoutProblems, MINUS } from './coming-up.ts';
import { expect, test } from './fixtures.ts';
import { box, expectStep, fillAccount, lastForm, next, radio } from './setup.ts';

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
const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });

async function openCalculator(page: Page) {
  await page.goto('/app/more/');
  await page.getByRole('link', { name: /^Pay calculator/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pay calculator' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Work out take-home pay' })).toBeVisible();
}

interface Payslip {
  readonly hours: string;
  readonly premium: string;
  readonly payday?: string;
  readonly week: string;
  readonly gross: string;
  readonly tax: string;
}

/** Fills in the calculator as the owner's tests say, over whatever it started with. */
async function fillIn(page: Page, slip: Payslip) {
  const line = page.getByTestId('pay-line').first();
  await line.getByLabel('Kind of hours').selectOption('basic');
  await line.getByLabel('Hours', { exact: true }).fill(slip.hours);
  await line.getByLabel('Pay an hour').fill('12.71');
  if ((await page.getByTestId('extra').count()) === 0) {
    await page.getByRole('button', { name: 'Add a fixed amount, such as a shift premium' }).click();
  }
  const extra = page.getByTestId('extra').first();
  await extra.getByLabel("What it's for").fill('Shift premium');
  await extra.getByLabel('Amount').fill(slip.premium);
  if (slip.payday !== undefined) await page.getByLabel('Payday').fill(slip.payday);
  await radio(page, 'Every week').check();
  await page.getByLabel('Tax code').fill('1257L');
  await radio(page, 'The usual way, cumulative').check();
  await page.getByRole('checkbox', { name: 'I pay into a workplace pension' }).check();
  await page.getByLabel('Percentage that comes off').fill('4');
  await page.getByLabel('Worked on earnings from, each week').fill('120');
  await page.getByLabel('Up to, each week').fill('967');
  await radio(page, 'Before tax').check();
  await radio(page, 'None').check();
  await page.getByLabel('The tax week on it').fill(slip.week);
  await page.getByLabel('From your last payslip: gross for tax so far').fill(slip.gross);
  await page.getByLabel('From your last payslip: tax paid so far').fill(slip.tax);
}

/** Week 26 from brief 8.6, with the year so far from week 25's payslip. */
const week26: Payslip = {
  hours: '34.5',
  premium: '114.69',
  week: '25',
  gross: '7927.57',
  tax: '375.80',
};

/** Week 27, paid on Fri 9 Oct 2026, with the year so far from week 26's payslip. */
const week27: Payslip = {
  hours: '46',
  premium: '210.23',
  payday: '2026-10-09',
  week: '26',
  gross: '8463.43',
  tax: '434.60',
};

async function workOut(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Work out take-home pay' }).click();
  const result = page.getByTestId('pay-result');
  await expect(result).toBeVisible();
  await expect(result.getByRole('heading', { name: 'Take-home pay' })).toBeFocused();
  return result;
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`The pay calculator, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('test 3: week 26 from brief 8.6 gives £452.17, with tax £58.80, NI £24.89 and pension £17.33', async ({
      page,
    }) => {
      await openCalculator(page);
      await expect(page.getByText('An estimate, not tax advice.').first()).toBeVisible();
      // It starts from Sam's own pay: his next payday, and its saved week.
      await expect(page.getByLabel('Payday')).toHaveValue('2026-10-30');
      await expect(
        page.getByText("That's tax week 30 of the 2026 to 2027 tax year."),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Use Rota week 1, 3 shifts' })).toBeVisible();
      await noAxeProblems(page);

      await fillIn(page, week26);
      const result = await workOut(page);
      await expect(result.getByTestId('take-home')).toHaveText('£452.17');
      await expect(result.getByTestId('breakdown')).toHaveText(
        'Tax £58.80, National Insurance £24.89, Pension £17.33',
      );
      await expect(result).toContainText('Gross pay £553.19');
      await expect(result).toContainText('An estimate, not tax advice.');
      // The last payslip is from week 25, and Fri 30 Oct is in week 30 (D124).
      await expect(result.getByTestId('pay-estimate')).toHaveText(
        'Your last payslip is from tax week 25, so weeks 26 to 29 are counted as the same pay as this one. That makes it an estimate.',
      );
      await expect(
        result.getByRole('button', { name: 'Add to plan as the Fri 30 Oct estimate' }),
      ).toBeVisible();
      await expect(result.getByRole('button', { name: 'Save as a pay week' })).toBeVisible();
      await noAxeProblems(page);
      await noSidewaysScroll(page);

      // On Fri 2 Oct, tax week 26 itself, the same figures, and not an estimate.
      await page.getByLabel('Payday').fill('2026-10-02');
      await expect(page.getByTestId('pay-stale')).toHaveText(
        'You changed something, so work it out again.',
      );
      await expect(page.getByLabel('The tax week on it')).toHaveValue('25');
      const exact = await workOut(page);
      await expect(exact.getByTestId('take-home')).toHaveText('£452.17');
      await expect(exact.getByTestId('pay-estimate')).toHaveCount(0);
      await expect(exact).toContainText('An estimate, not tax advice.');
      await expect(exact.getByTestId('add-to-plan-note')).toHaveText(
        'To add it to your plan, choose one of your paydays as the payday above, such as Fri 30 Oct.',
      );
    });

    test('test 4: added as the Fri 30 Oct estimate, the lowest point is −£146.36 on Sun 1 Nov, and Undo puts it back', async ({
      page,
    }) => {
      await openCalculator(page);
      await fillIn(page, week26);
      const result = await workOut(page);
      await expect(result).toContainText(
        'Puts £452.17 in your plan as your pay on Fri 30 Oct, marked as an estimate.',
      );
      const add = result.getByRole('button', { name: 'Add to plan as the Fri 30 Oct estimate' });
      await add.click();
      await expect(undoBar(page)).toContainText('Pay on Fri 30 Oct is now £452.17, an estimate.');
      await expect(undoBar(page).getByRole('button', { name: 'Undo' })).toBeFocused();
      await undoBar(page).getByRole('button', { name: 'Undo' }).click();
      await expect(undoBar(page)).toHaveText('Change undone.');
      await nav(page, 'Home').click();
      await expect(page.getByTestId('lowest-point')).toContainText('£4.53');

      await openCalculator(page);
      await fillIn(page, week26);
      await (await workOut(page))
        .getByRole('button', { name: 'Add to plan as the Fri 30 Oct estimate' })
        .click();
      await expect(undoBar(page)).toContainText('Pay on Fri 30 Oct is now £452.17, an estimate.');
      await nav(page, 'Home').click();
      const lowest = page.getByTestId('lowest-point');
      await expect(lowest.getByText(`${MINUS}£146.36`, { exact: true })).toBeVisible();
      await expect(lowest.getByText('Sun 1 Nov, after Rent', { exact: true })).toBeVisible();
      await expect(lowest.getByText('Short', { exact: true })).toBeVisible();
      await nav(page, 'Coming up').click();
      const friday = page.locator('[data-testid="period"][data-start="2026-10-30"]');
      await friday.locator(':scope > h3 > button').click();
      await expect(friday.getByRole('button', { name: /^Pay Fri 30 Oct, estimate/ })).toContainText(
        '+£452.17',
      );
    });

    test('test 5: Check my payslip on week 27 with tax as £105.40 lists only tax, 20p more', async ({
      page,
    }) => {
      await openCalculator(page);
      await fillIn(page, week27);
      await page.getByRole('button', { name: 'Check my payslip' }).click();
      await expect(page.getByRole('button', { name: 'Check my payslip' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      const check = page.getByTestId('payslip-check');
      for (const [label, value] of [
        ['Gross pay', '794.89'],
        ['Pension', '27.00'],
        ['Tax', '105.40'],
        ['National Insurance', '44.23'],
        ['Take-home pay', '618.46'],
        ['Gross for tax so far', '9231.32'],
        ['Tax paid so far', '539.80'],
      ] as const) {
        await box(check, label).fill(value);
      }
      await check.getByRole('button', { name: 'Check these figures' }).click();
      const outcome = page.getByTestId('payslip-outcome');
      await expect(outcome).toBeFocused();
      await expect(outcome).toContainText('These are different from what PrePenny worked out:');
      await expect(outcome.getByTestId('payslip-differences').locator('li')).toHaveText([
        "Tax: £105.40 on your payslip, £105.20 worked out by PrePenny. That's £0.20 more on your payslip.",
      ]);
      await expect(outcome.locator('p').last()).toHaveText('Ask your payroll team.');
      await expect(page.locator('main')).not.toContainText('wrong');
      await noAxeProblems(page);
      await noSidewaysScroll(page);

      // With the tax as on the payslip, nothing is listed.
      await box(check, 'Tax').fill('105.20');
      await check.getByRole('button', { name: 'Check these figures' }).click();
      await expect(outcome).toHaveText('Every figure you typed is what PrePenny worked out.');
    });
  });
}

test('Save as a pay week keeps the lines, to start from again', async ({ page }) => {
  await openCalculator(page);
  await fillIn(page, { ...week26, hours: '30' });
  const result = await workOut(page);
  await result.getByRole('button', { name: 'Save as a pay week' }).click();
  const sheet = page.getByRole('dialog', { name: 'Save as a pay week' });
  await sheet.getByLabel('Name this week').fill('Short week');
  await sheet.getByRole('button', { name: 'Save pay week' }).click();
  await expect(sheet).toBeHidden();
  await expect(undoBar(page)).toContainText('Short week saved as a pay week.');
  await expect(page.getByRole('button', { name: 'Use Short week' })).toBeVisible();
  await page.getByRole('button', { name: 'Use Rota week 2, 4 shifts' }).click();
  await expect(
    page.getByTestId('pay-line').first().getByLabel('Hours', { exact: true }),
  ).toHaveValue('46');
  await page.getByRole('button', { name: 'Use Short week' }).click();
  await expect(
    page.getByTestId('pay-line').first().getByLabel('Hours', { exact: true }),
  ).toHaveValue('30');
});

for (const colorScheme of ['light', 'dark'] as const) {
  fresh(
    `test 6: the public page works with nothing saved and sends nothing, in ${colorScheme} mode`,
    async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/pay-calculator/');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Take-home pay calculator' }),
      ).toBeVisible();
      await expect(
        page.getByText('It all happens on this phone: nothing you type is sent anywhere.', {
          exact: false,
        }),
      ).toBeVisible();
      // Everything the page needs has arrived, the offline helper included.
      await page.waitForLoadState('networkidle');
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        await document.fonts.ready;
      });
      await page.waitForLoadState('networkidle');
      const nothingSaved = async () =>
        page.evaluate(async () => ({
          stored: localStorage.length + sessionStorage.length,
          databases: (await indexedDB.databases()).length,
        }));
      expect(await nothingSaved()).toEqual({ stored: 0, databases: 0 });
      await noAxeProblems(page);

      const requests: string[] = [];
      page.on('request', (request) => requests.push(request.url()));
      page.context().on('request', (request) => requests.push(request.url()));
      await fillIn(page, { ...week26, payday: '2026-10-30' });
      const result = await workOut(page);
      await expect(result.getByTestId('take-home')).toHaveText('£452.17');
      await expect(result.getByTestId('breakdown')).toHaveText(
        'Tax £58.80, National Insurance £24.89, Pension £17.33',
      );
      await expect(result).toContainText('An estimate, not tax advice.');
      await page.getByRole('button', { name: 'Check my payslip' }).click();
      await box(page.getByTestId('payslip-check'), 'Tax').fill('58.80');
      await page.getByRole('button', { name: 'Check these figures' }).click();
      await expect(page.getByTestId('payslip-outcome')).toHaveText(
        'Every figure you typed is what PrePenny worked out.',
      );
      expect(requests).toEqual([]);
      expect(await nothingSaved()).toEqual({ stored: 0, databases: 0 });
      await noAxeProblems(page);
      await noSidewaysScroll(page);

      // "Start a free plan with this pay" opens setup with the pay filled in.
      await expect(result).toContainText(
        "Opens PrePenny's setup with £452.17 filled in as your pay, an estimate.",
      );
      await result.getByRole('button', { name: 'Start a free plan with this pay' }).click();
      await expect(page).toHaveURL(/\/setup\/$/);
      await page.getByRole('button', { name: 'Make my plan' }).click();
      await expectStep(page, 1, 'Your account');
      await fillAccount(lastForm(page, 'account'), {
        name: 'Current account',
        balance: '267.54',
        warning: '20',
      });
      await next(page);
      await expectStep(page, 2, "How you're paid");
      await expect(page.getByTestId('from-calculator')).toBeVisible();
      const income = lastForm(page, 'income');
      await expect(box(income, 'How much comes in, after tax')).toHaveValue('452.17');
      await expect(radio(income, 'Every week')).toBeChecked();
      await expect(income.getByRole('checkbox', { name: 'This is an estimate' })).toBeChecked();
    },
  );
}

test('stays readable with text at 200%, and every tap target is big enough', async ({ page }) => {
  await openCalculator(page);
  await fillIn(page, week26);
  await workOut(page);
  await page.getByRole('button', { name: 'Check my payslip' }).click();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(page.getByTestId('take-home')).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
});

fresh('the public page stays readable with text at 200%', async ({ page }) => {
  await page.goto('/pay-calculator/');
  await expect(page.getByRole('button', { name: 'Work out take-home pay' })).toBeVisible();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(await layoutProblems(page)).toEqual([]);
});
