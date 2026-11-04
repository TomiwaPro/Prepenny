// Screenshots for checking the look, at twice the pixels, as a phone shows
// them. Step 2b: Home at 360px wide in light and dark, and 320px in light.
// Step 2c: the Plan screen at 360px in light and dark, and the edit sheet
// open on Rent at 360px in light. Step 2d: each of the four sheets on Home
// at 360px in light, filled in as in the owner's tests, with the window as
// tall as the sheet so all of it shows. Step 2d-2: the Coming up page at
// 360px in light, on the first visit with "How to read this", and with Fri
// 6 Nov opened. Step 2e: setup's welcome and steps 1, 2 and 8 at 360px in
// light, filled in with Priya's answers. Step 2f: Debts, the Family loan,
// Budgets, Savings goals and Accounts at 360px in light; Budgets and
// Savings goals on the example with the owner's test 5 Travel budget and
// test 6 Holiday goal added, because the example has none (D180). Each
// page is as tall as the whole page, with the bottom navigation at the
// bottom. Step 2g: What if with the owner's test 1 change made, before
// keeping it; the pay calculator's result for test 3; and Check my payslip
// for test 5, at 360px in light. Run only when asked, one step at a time:
//
//   SCREENS=1 pnpm e2e --project phone-360 screens -g "Step 2d-2"

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { type PlanRecords, parsePounds } from '@prepenny/engine';
import { examplePlan } from '../data/example-plan.ts';
import { TEST_SETTING_KEY, type TestSetting } from '../lib/test-setting.ts';
import { openOnExample, settingScript } from './fixtures.ts';
import { setUpPriya } from './setup.ts';

const screens = join(import.meta.dirname, '..', '..', '..', 'docs', 'screens');
const folder = join(screens, '2b');

const shots = [
  { file: 'home-360-light.png', width: 360, colorScheme: 'light' },
  { file: 'home-360-dark.png', width: 360, colorScheme: 'dark' },
  { file: 'home-320-light.png', width: 320, colorScheme: 'light' },
] as const;

test.skip(process.env.SCREENS === undefined, 'Screenshots are taken only when asked.');

for (const shot of shots) {
  test(`Home at ${shot.width}px in ${shot.colorScheme} mode`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: shot.colorScheme,
      locale: 'en-GB',
    });
    await openOnExample(context);
    const page = await context.newPage();
    await page.goto('/app/');
    await expect(page.getByTestId('balance')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: shot.width, height });
    mkdirSync(folder, { recursive: true });
    await page.screenshot({ path: join(folder, shot.file) });
    await context.close();
  });
}

const planShots = [
  { file: 'plan-360-light.png', colorScheme: 'light', sheet: false },
  { file: 'plan-360-dark.png', colorScheme: 'dark', sheet: false },
  { file: 'edit-sheet-360-light.png', colorScheme: 'light', sheet: true },
] as const;

for (const shot of planShots) {
  test(`Step 2c: ${shot.file}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: shot.colorScheme,
      reducedMotion: 'reduce',
      locale: 'en-GB',
    });
    await openOnExample(context);
    const page = await context.newPage();
    await page.goto('/app/coming-up/');
    await expect(page.getByTestId('period').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const step = join(screens, '2c');
    mkdirSync(step, { recursive: true });
    if (shot.sheet) {
      const fri30 = page.locator('[data-testid="period"][data-start="2026-10-30"]');
      await fri30.locator(':scope > h3 > button').click();
      await fri30.getByRole('button', { name: /^Rent / }).click();
      await expect(page.getByRole('dialog', { name: 'Rent' })).toBeVisible();
      await page.screenshot({ path: join(step, shot.file) });
    } else {
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: 360, height });
      await page.screenshot({ path: join(step, shot.file) });
    }
    await context.close();
  });
}

/** Sam's example with Travel at £25 a week and £4.00 spent on Sat 24 Oct (owner test 3). */
const withTravel: TestSetting = {
  plan: {
    ...examplePlan,
    budgets: [
      {
        id: 'travel',
        accountId: 'current',
        name: 'Travel',
        amount: parsePounds('25.00'),
        every: 'week',
        leaves: 'at-start',
        rollOver: false,
        startsOn: '2026-10-23',
        createdAt: '2026-10-23T09:00:00Z',
      },
    ],
    spends: [
      {
        id: 'bus-24-oct',
        budgetId: 'travel',
        amount: parsePounds('4.00'),
        spentOn: '2026-10-24',
        recordedAt: '2026-10-24T17:00:00Z',
      },
    ],
  },
};

const sheetShots: readonly {
  readonly file: string;
  readonly button: string;
  readonly setting: TestSetting | null;
  readonly fill: (page: Page) => Promise<void>;
}[] = [
  {
    // Brief 8.4 test 5 on Fri 30 Oct: step 3, with everything ticked.
    file: 'update-balance-360-light.png',
    button: 'Update balance',
    setting: { today: '2026-10-30' },
    fill: async (page) => {
      const sheet = page.getByRole('dialog');
      await sheet.getByLabel('Type what your bank shows now').fill('600');
      await sheet.getByRole('button', { name: 'Next' }).click();
      await sheet.getByRole('button', { name: 'Next' }).click();
      await sheet.getByRole('button', { name: 'Tick all' }).click();
    },
  },
  {
    file: 'i-spent-360-light.png',
    button: 'I spent',
    setting: withTravel,
    fill: async (page) => {
      const sheet = page.getByRole('dialog');
      await sheet.getByLabel('How much').fill('6.00');
      await expect(sheet.getByText('With this: £10.00 spent, £15.00 left.')).toBeVisible();
    },
  },
  {
    file: 'add-payment-360-light.png',
    button: 'Add a payment',
    setting: null,
    fill: async (page) => {
      const sheet = page.getByRole('dialog');
      await sheet.getByLabel('Name').fill('Car MOT');
      await sheet.getByLabel('Amount').fill('54.85');
      await sheet.getByLabel('Next payment').fill('2026-11-13');
    },
  },
  {
    file: 'overtime-360-light.png',
    button: 'I did overtime',
    setting: null,
    fill: async (page) => {
      const sheet = page.getByRole('dialog');
      await sheet.getByLabel('Day of the overtime').fill('2026-10-26');
      await sheet.getByLabel('Hours', { exact: true }).fill('11.5');
      await expect(sheet.getByTestId('shift-preview')).toContainText('£155.12');
    },
  },
];

for (const shot of sheetShots) {
  test(`Step 2d: ${shot.file}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      locale: 'en-GB',
      timezoneId: 'Europe/London',
    });
    await openOnExample(context);
    const page = await context.newPage();
    if (shot.setting !== null) {
      await page.addInitScript(settingScript, [TEST_SETTING_KEY, shot.setting] as const);
    }
    await page.goto('/app/');
    await expect(page.getByTestId('balance')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: shot.button, exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await shot.fill(page);
    // Tall enough for the whole sheet: it takes up to 90% of the window.
    const tall = await sheet.evaluate((dialog) => dialog.scrollHeight);
    await page.setViewportSize({ width: 360, height: Math.max(800, Math.ceil(tall / 0.9) + 8) });
    await page.waitForTimeout(200);
    const step = join(screens, '2d');
    mkdirSync(step, { recursive: true });
    await page.screenshot({ path: join(step, shot.file) });
    await context.close();
  });
}

const comingUpShots = [
  { file: 'coming-up-first-visit-360-light.png', open: null },
  { file: 'coming-up-fri-6-nov-open-360-light.png', open: '2026-11-06' },
] as const;

for (const shot of comingUpShots) {
  test(`Step 2d-2: ${shot.file}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      locale: 'en-GB',
      timezoneId: 'Europe/London',
    });
    await openOnExample(context);
    const page = await context.newPage();
    await page.goto('/app/coming-up/');
    await expect(page.getByTestId('period').first()).toBeVisible();
    await expect(page.getByTestId('how-to-read')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (shot.open !== null) {
      await page.getByRole('button', { name: 'Got it' }).click();
      const payday = page.locator(`[data-testid="period"][data-start="${shot.open}"]`);
      await payday.locator(':scope > h3 > button').click();
      await expect(payday).toHaveAttribute('data-open', 'true');
      // Nothing is focused, so the picture shows the page as it looks.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    }
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 360, height });
    const step = join(screens, '2d-2');
    mkdirSync(step, { recursive: true });
    await page.screenshot({ path: join(step, shot.file) });
    await context.close();
  });
}

test('Step 2e: setup, with Priya’s answers', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  });
  const page = await context.newPage();
  const folder2e = join(screens, '2e');
  mkdirSync(folder2e, { recursive: true });
  const names: Record<number, string> = {
    0: 'welcome-360-light.png',
    1: 'step-1-your-account-360-light.png',
    2: 'step-2-how-you-are-paid-360-light.png',
    8: 'step-8-your-plan-360-light.png',
  };
  await setUpPriya(page, async (step) => {
    const file = names[step];
    if (file === undefined) return;
    await page.evaluate(() => document.fonts.ready);
    // The step's title has focus, which shows no outline; the page is drawn as it is.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 360, height: Math.max(height, 780) });
    await page.screenshot({ path: join(folder2e, file) });
    await page.setViewportSize({ width: 360, height: 780 });
  });
  await context.close();
});

/**
 * The example with the owner's test 5 Travel budget, roll-over on and £18.00
 * spent the week before, and test 6's Holiday goal with £50.00 moved every
 * Friday from Fri 30 Oct (step 2f).
 */
const withBudgetAndGoal: PlanRecords = {
  ...examplePlan,
  budgets: [
    {
      id: 'travel',
      accountId: 'current',
      name: 'Travel',
      amount: parsePounds('25.00'),
      every: 'week',
      leaves: 'at-start',
      rollOver: true,
      startsOn: '2026-10-16',
      createdAt: '2026-10-16T09:00:00Z',
    },
  ],
  spends: [
    {
      id: 'week-before',
      budgetId: 'travel',
      amount: parsePounds('18.00'),
      spentOn: '2026-10-20',
      recordedAt: '2026-10-20T17:00:00Z',
    },
    {
      id: 'bus-24-oct',
      budgetId: 'travel',
      amount: parsePounds('4.00'),
      spentOn: '2026-10-24',
      recordedAt: '2026-10-24T17:00:00Z',
    },
  ],
  goals: [
    {
      id: 'holiday',
      name: 'Holiday',
      target: parsePounds('1200.00'),
      accountId: 'savings',
      startingAmount: 0,
    },
  ],
  series: [
    ...examplePlan.series,
    {
      id: 'to-holiday',
      accountId: 'current',
      toAccountId: 'savings',
      name: 'Saving for Holiday',
      direction: 'transfer',
      amount: parsePounds('50.00'),
      start: '2026-10-30',
      schedule: { kind: 'weekly', every: 1 },
      end: { kind: 'never' },
      holidayRule: 'keep',
      type: 'savings',
      goalId: 'holiday',
      isEstimate: false,
      familyId: 'to-holiday',
      familyCreatedAt: '2026-10-25T12:00:00Z',
    },
  ],
};

const moneyShots = [
  { file: 'debts-360-light.png', path: '/app/debts/', ready: 'owed-now', plan: null },
  {
    file: 'family-loan-360-light.png',
    path: '/app/debt/?id=family-loan',
    ready: 'left-now',
    plan: null,
  },
  {
    file: 'budgets-360-light.png',
    path: '/app/budgets/',
    ready: 'budget',
    plan: withBudgetAndGoal,
  },
  {
    file: 'savings-goals-360-light.png',
    path: '/app/goals/',
    ready: 'goal',
    plan: withBudgetAndGoal,
  },
  { file: 'accounts-360-light.png', path: '/app/accounts/', ready: 'account', plan: null },
] as const;

for (const shot of moneyShots) {
  test(`Step 2f: ${shot.file}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      locale: 'en-GB',
      timezoneId: 'Europe/London',
    });
    await openOnExample(context);
    if (shot.plan !== null) {
      await context.addInitScript(settingScript, [
        TEST_SETTING_KEY,
        { plan: shot.plan } satisfies TestSetting,
      ] as const);
    }
    const page = await context.newPage();
    await page.goto(shot.path);
    await expect(page.getByTestId(shot.ready).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 360, height });
    const step = join(screens, '2f');
    mkdirSync(step, { recursive: true });
    await page.screenshot({ path: join(step, shot.file) });
    await context.close();
  });
}

/** A context for a step 2g screenshot: 360px wide, light, on the example. */
async function step2gPage(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  });
  await openOnExample(context);
  return { context, page: await context.newPage() };
}

/** The whole page, as tall as it is, into docs/screens/2g. */
async function shoot2g(page: Page, file: string) {
  await page.evaluate(() => document.fonts.ready);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: 360, height });
  const step = join(screens, '2g');
  mkdirSync(step, { recursive: true });
  await page.screenshot({ path: join(step, file) });
}

test('Step 2g: what-if-360-light.png', async ({ browser }) => {
  const { context, page } = await step2gPage(browser);
  await page.goto('/app/what-if/?from=coming-up');
  await expect(page.getByTestId('side-by-side')).toBeVisible();
  const friday = page.locator('[data-testid="period"][data-start="2026-10-30"]');
  await friday.locator(':scope > h3 > button').click();
  await friday.getByRole('button', { name: /^Pay Fri/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Pay' });
  await sheet.getByLabel('Amount').fill('503.06');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('practice-short')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot2g(page, 'what-if-360-light.png');
  await context.close();
});

/** Fills in the calculator with one of brief 8.6's payslips, as the owner's tests 3 and 5 say. */
async function fillPayslip(
  page: Page,
  slip: {
    hours: string;
    premium: string;
    payday: string;
    week: string;
    gross: string;
    tax: string;
  },
) {
  const line = page.getByTestId('pay-line').first();
  await line.getByLabel('Hours', { exact: true }).fill(slip.hours);
  await line.getByLabel('Pay an hour').fill('12.71');
  await page.getByTestId('extra').first().getByLabel('Amount').fill(slip.premium);
  await page.getByLabel('Payday').fill(slip.payday);
  await page.getByLabel('The tax week on it').fill(slip.week);
  await page.getByLabel('From your last payslip: gross for tax so far').fill(slip.gross);
  await page.getByLabel('From your last payslip: tax paid so far').fill(slip.tax);
}

test('Step 2g: pay-calculator-360-light.png', async ({ browser }) => {
  const { context, page } = await step2gPage(browser);
  await page.goto('/app/pay/');
  await expect(page.getByRole('button', { name: 'Work out take-home pay' })).toBeVisible();
  await fillPayslip(page, {
    hours: '34.5',
    premium: '114.69',
    payday: '2026-10-30',
    week: '25',
    gross: '7927.57',
    tax: '375.80',
  });
  await page.getByRole('button', { name: 'Work out take-home pay' }).click();
  await expect(page.getByTestId('take-home')).toHaveText('£452.17');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot2g(page, 'pay-calculator-360-light.png');
  await context.close();
});

test('Step 2g: check-my-payslip-360-light.png', async ({ browser }) => {
  const { context, page } = await step2gPage(browser);
  await page.goto('/app/pay/');
  await expect(page.getByRole('button', { name: 'Work out take-home pay' })).toBeVisible();
  await fillPayslip(page, {
    hours: '46',
    premium: '210.23',
    payday: '2026-10-09',
    week: '26',
    gross: '8463.43',
    tax: '434.60',
  });
  await page.getByRole('button', { name: 'Check my payslip' }).click();
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
    await check.getByLabel(label, { exact: true }).fill(value);
  }
  await check.getByRole('button', { name: 'Check these figures' }).click();
  await expect(page.getByTestId('payslip-differences')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot2g(page, 'check-my-payslip-360-light.png');
  await context.close();
});
