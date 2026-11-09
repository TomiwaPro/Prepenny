// Email addresses (step 3e, brief 4.13), at 320px and 360px wide (the
// sign-in-320 and sign-in-360 projects), in light and dark, checked by axe,
// against the local Supabase, whose emails are caught by its test inbox.
//
// The owner's tests:
// 4. Changing the email address, confirmed from both the old and the new one.
// 5. The backup email: added with a code sent to it. On another phone,
//    signed out, an address that isn't anyone's backup gets the same words
//    and no email, and a wrong code changes nothing. Getting back in with it,
//    which takes 24 hours since step 3e hardening, is in recovery.spec.ts.

import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { noSidewaysScroll } from './journeys.ts';
import { box, noAxeProblems } from './setup.ts';
import { codeIn, countEmails, makeAPlan, newEmail } from './sign-in-helpers.ts';
import {
  DEVICES,
  openMore,
  personOn,
  quoted,
  secondPhone,
  signIn,
  signUpFromMore,
  sql,
} from './two-phones.ts';

const e = strings.emails;
const g = strings.getBackIn;
const s = strings.security;
const HARDENING = '../../docs/screens/3e-hardening';

const CHANGE_SUBJECT = 'Your PrePenny code to change your email address';
const ADD_SUBJECT = 'Your PrePenny code to add a backup email';
const ADDED_SUBJECT = 'A backup email was added to your PrePenny account';
const GET_IN_SUBJECT = 'Your PrePenny code to get back in';

/** True for the one run that saves the screenshots: 360px, light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  colorScheme === 'light' && info.project.name === 'sign-in-360';

test.use({ userAgent: DEVICES.androidChrome });

async function openEmails(page: Page) {
  await openMore(page);
  await page
    .getByTestId('security')
    .getByRole('link', { name: /Email addresses/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: e.heading })).toBeVisible();
}

const emailOf = (person: string) =>
  sql(`select email from auth.users where id = ${quoted(person)}`);

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Email addresses, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('4. changing the email address takes a code from the old address and one from the new', async ({
      page,
      browser,
    }, info) => {
      test.slow();
      const old = newEmail('sam');
      const next = newEmail('newsam');
      await makeAPlan(page);
      await signUpFromMore(page, old);
      const person = await personOn(page);

      await openEmails(page);
      const card = page.getByTestId('sign-in-email');
      await expect(card).toContainText(e.signInIs(old));
      await noAxeProblems(page);
      await card.getByRole('button', { name: e.change }).click();
      // Its own address is refused, and so is one that isn't an address.
      await box(card, e.newLabel).fill(old);
      await card.getByRole('button', { name: e.sendCodes }).click();
      await expect(card.getByText(e.sameAsNow)).toBeVisible();
      await box(card, e.newLabel).fill('not an address');
      await card.getByRole('button', { name: e.sendCodes }).click();
      await expect(card.getByText(e.newMissing)).toBeVisible();
      const asked = Date.now() - 1000;
      await box(card, e.newLabel).fill(next);
      await card.getByRole('button', { name: e.sendCodes }).click();
      await expect(card.getByText(e.codesSent(old, next))).toBeVisible();
      await noAxeProblems(page);
      await noSidewaysScroll(page);

      const fromOld = await codeIn(old, CHANGE_SUBJECT, asked);
      const fromNew = await codeIn(next, CHANGE_SUBJECT, asked);
      expect(fromOld).not.toBe(fromNew);
      // The new address's code alone, twice, can't change it.
      await box(card, e.currentCodeLabel(old)).fill(fromNew);
      await box(card, e.newCodeLabel(next)).fill(fromNew);
      await card.getByRole('button', { name: e.finishChange }).click();
      await expect(card.getByText(s.emailCodeWrong)).toBeVisible();
      expect(emailOf(person)).toBe(old);

      await box(card, e.currentCodeLabel(old)).fill(fromOld);
      await box(card, e.newCodeLabel(next)).fill(fromNew);
      await card.getByRole('button', { name: e.finishChange }).click();
      await expect(page.getByTestId('emails-said')).toHaveText(e.changed(next));
      await expect(card).toContainText(e.signInIs(next));
      expect(emailOf(person)).toBe(next);
      // No extra device was left behind by checking the codes.
      expect(sql(`select count(*) from auth.sessions where user_id = ${quoted(person)}`)).toBe('1');
      await openMore(page);
      await expect(page.getByTestId('account')).toContainText(strings.account.signedInAs(next));

      // Another phone signs in with the new address and gets the same plan.
      const laptop = await secondPhone(browser, info, colorScheme, undefined, DEVICES.macSafari);
      await signIn(laptop.page, next);
      await expect(laptop.page).toHaveURL(/\/app\/$/);
      await expect(laptop.page.getByTestId('balance')).toContainText('£267.54');
      expect(await personOn(laptop.page)).toBe(person);
      await laptop.context.close();
    });

    test("5. adding a backup email, and the same words for an address that isn't one", async ({
      page,
      browser,
    }, info) => {
      test.slow();
      const main = newEmail('sam');
      const backup = newEmail('backup');
      await makeAPlan(page);
      await signUpFromMore(page, main);
      const person = await personOn(page);

      // Add the backup email.
      await openEmails(page);
      const card = page.getByTestId('backup-email');
      await expect(card).toContainText(e.backupNone);
      await card.getByRole('button', { name: e.backupAdd }).click();
      await box(card, e.backupLabel).fill(main);
      await card.getByRole('button', { name: e.backupSend }).click();
      await expect(card.getByText(e.backupSameAsSignIn)).toBeVisible();
      const asked = Date.now() - 1000;
      await box(card, e.backupLabel).fill(backup);
      await card.getByRole('button', { name: e.backupSend }).click();
      await expect(card.getByText(e.backupSent(backup))).toBeVisible();
      await card.getByLabel(e.backupCodeLabel).fill(await codeIn(backup, ADD_SUBJECT, asked));
      await card.getByRole('button', { name: e.backupFinish }).click();
      await expect(page.getByTestId('emails-said')).toHaveText(e.backupAdded(backup));
      await expect(card).toContainText(e.backupIs(backup));
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      // The sign-in address is told.
      await expect.poll(() => countEmails(main, ADDED_SUBJECT), { timeout: 20_000 }).toBe(1);

      // On another phone, signed out, the main address can't be reached.
      const phone = await secondPhone(browser, info, colorScheme, undefined, DEVICES.iphoneSafari);
      await phone.page.goto('/sign-in/');
      await phone.page.getByRole('link', { name: g.link }).click();
      await expect(phone.page.getByRole('heading', { level: 1, name: g.heading })).toBeVisible();
      await expect(phone.page.getByText(g.emailHint)).toBeVisible();
      await noAxeProblems(phone.page);
      await noSidewaysScroll(phone.page);
      if (shoots(info, colorScheme)) {
        await phone.page.screenshot({
          path: `${HARDENING}/get-back-in-360-light.png`,
          fullPage: true,
        });
      }

      // An address that's nobody's backup gets the same words, and no email.
      const nobody = newEmail('nobody');
      await box(phone.page, g.emailLabel).fill(nobody);
      await phone.page.getByRole('button', { name: g.send }).click();
      await expect(phone.page.getByText(g.sent(nobody))).toBeVisible();
      await expect(phone.page.getByText(g.whatHappens)).toBeVisible();
      await box(phone.page, g.codeLabel).fill('123456');
      await phone.page.getByRole('button', { name: g.useCode }).click();
      await expect(phone.page.getByText(g.codeWrong)).toBeVisible();
      expect(await countEmails(nobody, GET_IN_SUBJECT)).toBe(0);
      await noAxeProblems(phone.page);

      // The backup's address gets the same words, and a wrong code changes nothing.
      await phone.page.getByRole('button', { name: g.otherEmail }).click();
      const gettingIn = Date.now() - 1000;
      await box(phone.page, g.emailLabel).fill(backup);
      await phone.page.getByRole('button', { name: g.send }).click();
      await expect(phone.page.getByText(g.sent(backup))).toBeVisible();
      const code = await codeIn(backup, GET_IN_SUBJECT, gettingIn);
      await box(phone.page, g.codeLabel).fill(code === '000000' ? '111111' : '000000');
      await phone.page.getByRole('button', { name: g.useCode }).click();
      await expect(phone.page.getByText(g.codeWrong)).toBeVisible();
      expect(emailOf(person)).toBe(main);
      expect(
        Number(sql(`select count(*) from app.get_back_in where person_id = ${quoted(person)}`)),
      ).toBe(0);
      await phone.context.close();
    });
  });
}
