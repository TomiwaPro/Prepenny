// Jess and Tom with their own paydays, on two phones (step 4a): the set-up
// and the steps the shared-budget tests share. Jess is paid on the 28th into
// her own account, with a joint account she shares; Tom on the 15th into
// his. Used by shared-budgets.spec.ts and security.spec.ts.

import { type Browser, expect, type Page, type TestInfo } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { openShare } from './jess-and-tom.ts';
import { type Days, noSidewaysScroll, openNewPhone, phoneDays } from './journeys.ts';
import {
  type AccountAnswers,
  box,
  expectStep,
  fillAccount,
  lastForm,
  next,
  noAxeProblems,
  radio,
  SCREEN_TITLES,
  skip,
} from './setup.ts';
import { askForCode, newEmail, signInEmail } from './sign-in-helpers.ts';
import { secondPhone } from './two-phones.ts';

export const TODAY = '2026-10-25';
export const YEAR_ON = '2027-10-25';
const s = strings.share;
const j = strings.join;
const b = strings.budgets;
const sheetWords = strings.budgetSheet;
const spending = strings.setup.spending;
const leave = strings.together.leave;

export interface Person {
  readonly accounts: readonly AccountAnswers[];
  readonly pay: {
    readonly name: string;
    readonly payday: string;
    readonly amount: string;
    readonly into?: string;
  };
}

/** Setup with an account or two and a monthly pay, skipping the rest, ending on Home. */
export async function setUp(page: Page, person: Person) {
  await openNewPhone(page, TODAY);
  await page.getByRole('button', { name: 'Make my plan' }).click();
  await expectStep(page, 1, SCREEN_TITLES[0]);
  for (const [index, account] of person.accounts.entries()) {
    if (index > 0) await page.getByRole('button', { name: 'Add another account' }).click();
    await fillAccount(lastForm(page, 'account'), account);
  }
  await next(page);
  await expectStep(page, 2, SCREEN_TITLES[1]);
  const pay = lastForm(page, 'income');
  await box(pay, 'Name').fill(person.pay.name);
  await radio(pay, 'Monthly, on a date').check();
  await box(pay, 'Next payday').fill(person.pay.payday);
  await box(pay, 'How much comes in, after tax').fill(person.pay.amount);
  if (person.pay.into !== undefined) {
    await radio(pay.getByRole('group', { name: 'Into' }), person.pay.into).check();
  }
  await radio(
    page.getByRole('group', { name: 'Do you ever work extra hours or miss shifts?' }),
    'No',
  ).check();
  await next(page);
  for (const [index, title] of SCREEN_TITLES.slice(2, 5).entries()) {
    await expectStep(page, (index + 3) as 3, title);
    await skip(page);
  }
  await expectStep(page, 6, SCREEN_TITLES[5]);
  await page.getByRole('button', { name: 'Go to my plan' }).click();
  await expect(page.getByTestId('balance')).toBeVisible();
}

export const JESS: Person = {
  accounts: [
    { name: 'Jess current account', balance: '410', warning: '50' },
    { name: 'Joint account', kind: 'Joint account', balance: '1050', warning: '100' },
  ],
  pay: { name: 'Jess pay', payday: '2026-10-28', amount: '2100', into: 'Jess current account' },
};

export const TOM: Person = {
  accounts: [{ name: 'Tom current account', balance: '520', warning: '50' }],
  pay: { name: 'Tom pay', payday: '2026-11-15', amount: '2350' },
};

/** Opens Add a budget and fills it in, leaving it open so its words can be checked. */
export async function fillBudget(page: Page, name: string, amount: string, from: string) {
  await page.goto('/app/budgets/');
  await expect(page.getByRole('heading', { level: 1, name: b.heading })).toBeVisible();
  await page.getByRole('button', { name: b.add, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: sheetWords.addTitle });
  await box(sheet, spending.name).fill(name);
  await box(sheet, spending.amount).fill(amount);
  await radio(sheet.getByRole('group', { name: spending.every }), spending.month).check();
  await radio(sheet.getByRole('group', { name: spending.from }), from).check();
  return sheet;
}

export async function saveBudget(sheet: ReturnType<Page['getByRole']>) {
  await sheet.getByRole('button', { name: sheetWords.save }).click();
  await expect(sheet).toBeHidden();
}

/** Waits until nothing on this phone is waiting to be sent. */
export async function allSent(page: Page) {
  await page.goto('/app/more/');
  await expect(page.getByTestId('where-kept')).toHaveText(strings.account.savedInAccount, {
    timeout: 20_000,
  });
}

/** A budget's card on the Budgets screen. */
export const budgetCard = (page: Page, name: string) =>
  page.getByTestId('budget').and(page.locator(`[data-budget="${name}"]`));

/** Shares one of Jess's accounts, checking what the sheet that asks first says. */
export async function share(page: Page, account: string, says: string | null, screenshot?: string) {
  await page.goto('/app/share/accounts/');
  await expect(page.getByRole('heading', { level: 1, name: s.accountsTitle })).toBeVisible();
  await page.getByRole('checkbox', { name: account }).check();
  await page.getByRole('button', { name: s.shareThese }).click();
  const sheet = page.getByRole('dialog', { name: s.confirmTitle(account) });
  if (says === null) await expect(sheet.getByTestId('share-your-paydays')).toHaveCount(0);
  else await expect(sheet.getByTestId('share-your-paydays')).toHaveText(says);
  await noAxeProblems(page);
  if (screenshot !== undefined) await page.screenshot({ path: screenshot });
  await sheet.getByRole('button', { name: s.confirmYes }).click();
  await expect(page.getByTestId('share-said')).toHaveText(s.sharedDone(account), {
    timeout: 20_000,
  });
  return sheet;
}

/** Jess's invite link, "Can edit". */
export async function inviteLink(page: Page): Promise<string> {
  await openShare(page);
  const invite = page.getByTestId('invite');
  await box(invite, s.nameLabel).fill('Jess');
  await radio(invite, s.canEdit).check();
  await radio(invite, s.byLink).check();
  await invite.getByRole('button', { name: s.makeLink }).click();
  return page.getByTestId('invite-link').getByLabel(s.linkLabel).inputValue();
}

/**
 * Tom joins Jess's plan: with a plan of his own, signed up already, which
 * comes with him (D426), or as someone new. Jess allows it.
 */
export async function tomJoins(page: Page, tom: Page, link: string, withPlan: boolean) {
  await tom.goto(link);
  await expect(tom.getByRole('heading', { level: 1, name: j.heading })).toBeVisible();
  if (!withPlan) {
    const address = newEmail('tom');
    await tom.getByRole('link', { name: j.signIn }).click();
    await askForCode(tom, address);
    await box(tom, '6-digit code').fill((await signInEmail(address)).code);
    await tom.getByRole('button', { name: 'Sign up', exact: true }).click();
  }
  await expect(tom.getByTestId('join-message')).toHaveText(j.invitedBy('Jess'));
  await box(tom, j.nameLabel('Jess')).fill('Tom');
  await tom.getByRole('button', { name: j.ask }).click();
  const sheet = page.getByRole('dialog', { name: s.requestTitle('Tom') });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await sheet.getByRole('button', { name: s.allow, exact: true }).click();
  await sheet.getByRole('button', { name: s.gotIt }).click();
  // The same bank holidays: his plan comes in by itself (D426).
  await expect(tom).toHaveURL(/\/app\/$/, { timeout: 30_000 });
  await expect(tom.getByTestId('balance')).toBeVisible();
}

/** The accounts both phones have, with every day's balance a year ahead on each. */
export async function sharedDays(one: Page, other: Page): Promise<[Days, Days]> {
  const a = await phoneDays(one, TODAY, YEAR_ON);
  const c = await phoneDays(other, TODAY, YEAR_ON);
  const both = Object.keys(a).filter((name) => c[name] !== undefined);
  const pick = (days: Days) => Object.fromEntries(both.map((name) => [name, days[name] ?? {}]));
  return [pick(a), pick(c)];
}

/** The first few days the two phones differ on, as "Joint account 2026-10-28: 75000, not 105000". */
export function differences(one: Days, other: Days): string[] {
  const found: string[] = [];
  for (const [account, days] of Object.entries(one)) {
    for (const [date, balance] of Object.entries(days)) {
      const theirs = other[account]?.[date];
      if (theirs !== balance) found.push(`${account} ${date}: ${balance}, not ${theirs}`);
      if (found.length >= 4) return found;
    }
  }
  return found;
}

/**
 * Both phones show every shared account the same, every day for a year,
 * within 30 seconds: well inside the minute a phone that missed a nudge
 * would wait (D515).
 */
export async function sameOnBoth(one: Page, other: Page) {
  await expect
    .poll(
      async () => {
        const [a, c] = await sharedDays(one, other);
        return { accounts: Object.keys(a), differences: differences(a, c) };
      },
      { timeout: 30_000 },
    )
    .toEqual({ accounts: ['Joint account'], differences: [] });
  const [days] = await sharedDays(one, other);
  expect(Object.keys(days['Joint account'] ?? {})).toHaveLength(366);
  return days;
}

/** The money leaving the joint account on a day, in pence, as both phones see it. */
export const leftOn = (days: Days, date: string, dayBefore: string) =>
  (days['Joint account']?.[date] ?? 0) - (days['Joint account']?.[dayBefore] ?? 0);

/** Checks a screen the way every screen is checked: axe, and nothing wider than the phone. */
export async function screenChecks(page: Page) {
  await noAxeProblems(page);
  await noSidewaysScroll(page);
}

export async function newPhone(browser: Browser, info: TestInfo, colorScheme: 'light' | 'dark') {
  return secondPhone(browser, info, colorScheme, TODAY);
}

/** Jess leaves the plan with her own things only. */
export async function jessLeaves(page: Page) {
  await openShare(page);
  await page.getByTestId('leave').getByRole('link', { name: leave.link }).click();
  await expect(page.getByRole('heading', { level: 1, name: leave.heading })).toBeVisible();
  await radio(page, leave.copyNo).check();
  await page.getByRole('button', { name: leave.leave }).click();
  await page
    .getByRole('dialog', { name: leave.confirmTitle })
    .getByRole('button', { name: leave.confirmYes })
    .click();
  await expect(page).toHaveURL(/\/app\/$/, { timeout: 30_000 });
  await expect(page.getByTestId('left')).toBeVisible({ timeout: 30_000 });
}
