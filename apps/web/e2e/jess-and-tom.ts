// Jess and Tom on two phones, as in brief 8.7 (steps 3g and 3i): the set-up
// and the steps the shared-plan tests share. Jess makes a plan, shares her
// current account and invites Tom with "Can edit"; Tom joins on his own phone.
// Used by together.spec.ts, brief-8-7.spec.ts and security.spec.ts.

import { type Browser, expect, type Page, type TestInfo } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { named } from './coming-up.ts';
import { addPayment, undoBar } from './journeys.ts';
import { box, fillAccount, radio } from './setup.ts';
import { askForCode, makeAPlan, newEmail, signInEmail } from './sign-in-helpers.ts';
import { openMore, personOn, quoted, secondPhone, signUpFromMore, sql } from './two-phones.ts';

const s = strings.share;
const j = strings.join;
const g = strings.together;

export async function openShare(page: Page) {
  await openMore(page);
  await page.getByRole('link', { name: new RegExp(`^${s.moreLink}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: s.heading })).toBeVisible();
  await expect(page.getByTestId('who')).toBeVisible();
}

export async function openActivity(page: Page) {
  await openMore(page);
  await page.getByRole('link', { name: new RegExp(`^${g.activityLink}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: g.heading })).toBeVisible();
}

/** Every change in Activity, in words. */
export const entries = (page: Page) => page.getByTestId('activity-entry');

/** Waits until nothing on this phone is waiting to be sent. */
export async function allSentOn(page: Page) {
  await openMore(page);
  await expect(page.getByTestId('where-kept')).toHaveText(strings.account.savedInAccount, {
    timeout: 20_000,
  });
}

/** Adds an account from More, with what its bank shows. */
export async function addAccount(page: Page, name: string, balance: string) {
  await page.goto('/app/accounts/');
  await page.getByRole('button', { name: strings.accounts.add, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: strings.accountSheet.addTitle });
  await fillAccount(sheet, { name, balance, warning: '20' });
  await sheet.getByRole('button', { name: strings.accountSheet.save }).click();
  await expect(sheet).toBeHidden();
}

/** "Choose shared accounts": ticks one and shares it. */
export async function shareAccount(page: Page, account: string) {
  await page.goto('/app/share/accounts/');
  await expect(page.getByRole('heading', { level: 1, name: s.accountsTitle })).toBeVisible();
  await page.getByRole('checkbox', { name: account }).check();
  await page.getByRole('button', { name: s.shareThese }).click();
  const sheet = page.getByRole('dialog', { name: s.confirmTitle(account) });
  await sheet.getByRole('button', { name: s.confirmYes }).click();
  await expect(page.getByTestId('share-said')).toHaveText(s.sharedDone(account), {
    timeout: 20_000,
  });
}

/**
 * Jess and Tom, as in brief 8.7: Jess makes a plan with Rent, shares her
 * current account, and invites Tom with "Can edit"; Tom joins on his own
 * phone, with no plan of his own. Jess's phone is `page`.
 */
export async function jessAndTom(
  page: Page,
  browser: Browser,
  info: TestInfo,
  colorScheme: 'light' | 'dark',
  /** The name Tom gives: one found nowhere else, to look for it after he's gone (step 3h). */
  tomName = 'Tom',
) {
  await page.emulateMedia({ colorScheme });
  await makeAPlan(page);
  await signUpFromMore(page, newEmail('jess'));
  // Before she shares it: Dentist, added and removed while the account is hers alone.
  await addPayment(page, { name: 'Dentist', amount: '65', date: '2026-11-05' });
  await undoBar(page).getByRole('button', { name: strings.undo.undo }).click();
  await addPayment(page, {
    name: 'Rent',
    amount: '550',
    date: '2026-11-01',
    often: 'Every month, or every few months',
  });
  await allSentOn(page);
  await shareAccount(page, 'Current account');

  await openShare(page);
  const invite = page.getByTestId('invite');
  await box(invite, s.nameLabel).fill('Jess');
  await radio(invite, s.canEdit).check();
  await radio(invite, s.byLink).check();
  await invite.getByRole('button', { name: s.makeLink }).click();
  const link = await page.getByTestId('invite-link').getByLabel(s.linkLabel).inputValue();

  const tom = await secondPhone(browser, info, colorScheme);
  const address = newEmail('tom');
  await tom.page.goto(link);
  await expect(tom.page.getByRole('heading', { level: 1, name: j.heading })).toBeVisible();
  await tom.page.getByRole('link', { name: j.signIn }).click();
  await askForCode(tom.page, address);
  await box(tom.page, '6-digit code').fill((await signInEmail(address)).code);
  await tom.page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(tom.page.getByTestId('join-message')).toHaveText(j.invitedBy('Jess'));
  await box(tom.page, j.nameLabel('Jess')).fill(tomName);
  await tom.page.getByRole('button', { name: j.ask }).click();

  const sheet = page.getByRole('dialog', { name: s.requestTitle(tomName) });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await sheet.getByRole('button', { name: s.allow, exact: true }).click();
  await sheet.getByRole('button', { name: s.gotIt }).click();
  await expect(tom.page).toHaveURL(/\/app\/$/, { timeout: 20_000 });
  await expect(tom.page.getByTestId('balance')).toBeVisible();
  return tom;
}

/** Rent's sheet's History list, shown. */
export async function historyOf(sheet: ReturnType<Page['getByRole']>) {
  const history = sheet.getByTestId('history');
  await history.getByRole('button', { name: g.history.show }).click();
  await expect(history.getByTestId('history-line').first()).toBeVisible({ timeout: 20_000 });
  return history;
}

/** The plan of the person signed in on this phone, as the database's own id, for checks of it alone. */
export async function planOf(page: Page): Promise<string> {
  const person = await personOn(page);
  return sql(
    `select plan_id from public.plan_members where person_id = ${quoted(person)} and left_at is null`,
  );
}

/** Rent on Sun 1 Nov in Home's next three things due. */
export const rentDue = (page: Page) =>
  page
    .getByTestId('next-due')
    .getByRole('button', { name: named('Rent') })
    .first();
