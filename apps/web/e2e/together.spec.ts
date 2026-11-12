// Shared plans, living together (step 3g, brief 4.12, 4.14 and 8.7 tests 1
// and 3), at 320px and 360px wide (the sign-in-320 and sign-in-360
// projects), in light and dark, checked by axe, against the local Supabase
// with two people on two phones. Start it first (README.md, "Checks").
//
// Jess makes the plan, shares her current account and invites Tom with
// "Can edit", as in brief 8.7.
//
// 1. Tom changes Rent on his phone, and it shows on Jess's within 5
//    seconds, marked "Changed by Tom". Activity on both phones: Jess's
//    change from before she shared the account is nowhere on Tom's, nor
//    anything of her private account; Tom can undo his own change and not
//    hers, and the undo reaches Jess's phone.
// 2. A shared debt and a shared goal: Jess's debt is hers until she shares
//    it; Tom puts money from his own account into their shared goal, and
//    the goal shows what each of them has put in.
// 3. Changing a role: Jess makes Tom "Can view only", and the server refuses
//    his next change at once; then "Can edit" again.
// 4. Making a shared account private again: not while Tom has his own
//    payment in it; then Tom no longer sees it, nor anything of it in Activity.

import { type Browser, expect, type Page, type TestInfo, test } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { layoutProblems, named } from './coming-up.ts';
import { addPayment, noSidewaysScroll, openHome, undoBar } from './journeys.ts';
import { box, fillAccount, noAxeProblems, radio } from './setup.ts';
import { askForCode, makeAPlan, newEmail, signInEmail } from './sign-in-helpers.ts';
import { openMore, secondPhone, signUpFromMore, sql } from './two-phones.ts';

const s = strings.share;
const j = strings.join;
const g = strings.together;
const SCREENS = '../../docs/screens/3g';

/** True for the one run that saves the screenshots: 360px, light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  colorScheme === 'light' && info.project.name === 'sign-in-360';

async function openShare(page: Page) {
  await openMore(page);
  await page.getByRole('link', { name: new RegExp(`^${s.moreLink}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: s.heading })).toBeVisible();
  await expect(page.getByTestId('who')).toBeVisible();
}

async function openActivity(page: Page) {
  await openMore(page);
  await page.getByRole('link', { name: new RegExp(`^${g.activityLink}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: g.heading })).toBeVisible();
}

/** Every change in Activity, in words. */
const entries = (page: Page) => page.getByTestId('activity-entry');

/** Waits until nothing on this phone is waiting to be sent. */
async function allSentOn(page: Page) {
  await openMore(page);
  await expect(page.getByTestId('where-kept')).toHaveText(strings.account.savedInAccount, {
    timeout: 20_000,
  });
}

/** Adds an account from More, with what its bank shows. */
async function addAccount(page: Page, name: string, balance: string) {
  await page.goto('/app/accounts/');
  await page.getByRole('button', { name: strings.accounts.add, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: strings.accountSheet.addTitle });
  await fillAccount(sheet, { name, balance, warning: '20' });
  await sheet.getByRole('button', { name: strings.accountSheet.save }).click();
  await expect(sheet).toBeHidden();
}

/** "Choose shared accounts": ticks one and shares it. */
async function shareAccount(page: Page, account: string) {
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
async function jessAndTom(
  page: Page,
  browser: Browser,
  info: TestInfo,
  colorScheme: 'light' | 'dark',
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
  await box(tom.page, j.nameLabel('Jess')).fill('Tom');
  await tom.page.getByRole('button', { name: j.ask }).click();

  const sheet = page.getByRole('dialog', { name: s.requestTitle('Tom') });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await sheet.getByRole('button', { name: s.allow, exact: true }).click();
  await sheet.getByRole('button', { name: s.gotIt }).click();
  await expect(tom.page).toHaveURL(/\/app\/$/, { timeout: 20_000 });
  await expect(tom.page.getByTestId('balance')).toBeVisible();
  return tom;
}

/** Rent on Sun 1 Nov in Home's next three things due. */
const rentDue = (page: Page) =>
  page
    .getByTestId('next-due')
    .getByRole('button', { name: named('Rent') })
    .first();

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`living together, ${colorScheme}`, () => {
    test('1. "Changed by Tom" within 5 seconds, and Activity with undo for his own change only', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(300_000);
      const tom = await jessAndTom(page, browser, info, colorScheme);
      // Jess's own account, private to her, with a payment in it.
      await addAccount(page, 'Jess savings', '400');
      await addPayment(page, {
        name: 'Birthday present',
        amount: '45',
        date: '2026-11-20',
        account: 'Jess savings',
      });
      await allSentOn(page);
      await openHome(page);
      await expect(rentDue(page)).toBeVisible();
      await expect(rentDue(page).getByTestId('changed-by')).toHaveCount(0);

      // Tom changes Rent on Sun 1 Nov to £560, just this one, on his phone.
      await openHome(tom.page);
      await rentDue(tom.page).click();
      const edit = tom.page.getByRole('dialog', { name: 'Rent' });
      await edit.getByLabel('Amount').fill('560');
      const saved = Date.now();
      await edit.getByRole('button', { name: 'Save' }).click();
      await expect(undoBar(tom.page)).toContainText('Rent changed for just this one.');

      // On Jess's phone, left open on Home, within 5 seconds (brief 8.7 test 1).
      await expect(rentDue(page).getByTestId('changed-by')).toHaveText(
        g.changedBy('Tom', g.justNow),
        { timeout: 5_000 },
      );
      expect(Date.now() - saved).toBeLessThan(5_000);
      await expect(rentDue(page)).toContainText('−£560.00');
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/changed-by-on-home-360-light.png` });
      }
      // The edit sheet says so too, and Tom's own row says nothing about himself.
      await rentDue(page).click();
      const jessEdit = page.getByRole('dialog', { name: 'Rent' });
      await expect(jessEdit.getByTestId('sheet-changed-by')).toHaveText(
        g.changedBy('Tom', g.justNow),
      );
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/changed-by-in-the-sheet-360-light.png` });
      }
      await jessEdit.getByRole('button', { name: strings.sheet.close }).click();
      await expect(rentDue(tom.page).getByTestId('changed-by')).toHaveCount(0);

      // Tom's Activity: his change with Undo, Jess's shared ones without, and
      // nothing from before she shared the account, nor of her own account.
      await openActivity(tom.page);
      await expect(tom.page.getByText(g.purposeShared('Jess'))).toBeVisible();
      const tomsChange = entries(tom.page).filter({
        hasText: 'You changed Rent on Sun 1 Nov to £560.00.',
      });
      await expect(tomsChange).toHaveCount(1);
      await expect(tomsChange.getByRole('button', { name: g.undo })).toBeVisible();
      await expect(
        entries(tom.page).filter({ hasText: 'Jess shared Current account.' }),
      ).toHaveCount(1);
      const jessEntries = entries(tom.page).filter({ hasText: /^Jess / });
      await expect(jessEntries.getByRole('button', { name: g.undo })).toHaveCount(0);
      for (const hidden of ['Dentist', 'Jess savings', 'Birthday present', '£65.00', '£45.00']) {
        await expect(tom.page.getByText(hidden)).toHaveCount(0);
      }
      await noAxeProblems(tom.page);
      await noSidewaysScroll(tom.page);
      if (shoots(info, colorScheme)) {
        await tom.page.screenshot({ path: `${SCREENS}/activity-tom-360-light.png` });
      }
      // With text at 200%, Activity still fits at this width.
      const big = await tom.page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      expect(await layoutProblems(tom.page)).toEqual([]);
      await big.evaluate((node) => (node as Element).remove());

      // Jess's Activity has her own changes, Dentist included, and Tom's without Undo.
      await openActivity(page);
      await expect(
        entries(page).filter({ hasText: 'Tom changed Rent on Sun 1 Nov to £560.00.' }),
      ).toHaveCount(1);
      await expect(
        entries(page).filter({ hasText: 'Tom changed Rent' }).getByRole('button', { name: g.undo }),
      ).toHaveCount(0);
      await expect(entries(page).filter({ hasText: 'Dentist' }).first()).toBeVisible();
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/activity-jess-360-light.png` });
      }

      // Tom undoes his own change; it's undone on Jess's phone too.
      await tomsChange.getByRole('button', { name: g.undo }).click();
      await expect(tom.page.getByTestId('activity-said')).toHaveText(g.undoneDone, {
        timeout: 20_000,
      });
      await expect(
        entries(tom.page).filter({ hasText: 'You changed Rent on Sun 1 Nov to £560.00.' }),
      ).toContainText(g.undone);
      await expect(
        entries(tom.page).filter({ hasText: 'You undid a change to Rent.' }),
      ).toHaveCount(1);
      await openHome(page);
      await expect(rentDue(page)).toContainText('−£550.00', { timeout: 10_000 });
      // The server holds Rent's own amount again, and Jess's history of it.
      expect(
        sql(`select count(*) from public.payment_changes c join public.series s on s.id = c.series_id
          where s.name = 'Rent' and c.amount = 56000 and not c.deleted
            and s.plan_id = (select plan_id from public.plan_members m join public.people p on p.id = m.person_id
              where p.nickname = 'Tom' and m.role = 'editor' order by m.joined_at desc limit 1)`),
      ).toBe('0');
      await tom.context.close();
    });

    test('2. a shared debt and a shared goal, with what each person has put in', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(300_000);
      const tom = await jessAndTom(page, browser, info, colorScheme);

      // Jess's debt is hers until she shares it.
      await page.goto('/app/debts/');
      await page.getByRole('button', { name: 'Add a debt' }).click();
      const debtSheet = page.getByRole('dialog', { name: 'Add a debt' });
      await debtSheet.getByLabel('Name', { exact: true }).fill('Car loan');
      await debtSheet.getByRole('radio', { name: 'Loan', exact: true }).check();
      await debtSheet.getByLabel('What you owe now', { exact: true }).fill('1200');
      await debtSheet
        .getByRole('checkbox', { name: "I don't have payments planned for it yet" })
        .check();
      await debtSheet.getByRole('button', { name: 'Add this debt' }).click();
      await expect(debtSheet).toBeHidden();
      await expect(page.getByTestId('debt-who-sees')).toHaveText(g.onlyYou);
      await allSentOn(page);
      await tom.page.goto('/app/debts/');
      await expect(tom.page.getByText('Car loan')).toHaveCount(0);

      await page.goto('/app/debts/');
      await page.locator('[data-debt="Car loan"]').getByRole('link').click();
      const who = page.getByTestId('who-sees');
      await expect(who).toContainText(g.onlyYou);
      await who.getByRole('button', { name: g.shareDebt('Tom') }).click();
      const share = page.getByRole('dialog', { name: g.shareDebtTitle('Car loan', 'Tom') });
      await expect(share.getByText(g.shareDebtIntro('Car loan', 'Tom'))).toBeVisible();
      await noAxeProblems(page);
      await share.getByRole('button', { name: g.shareYes }).click();
      await expect(who).toContainText(g.sharedWith('Tom'), { timeout: 20_000 });
      await expect(who.getByRole('button', { name: g.makeItPrivate })).toBeVisible();
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await who.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SCREENS}/shared-debt-360-light.png` });
      }
      await expect(async () => {
        await tom.page.goto('/app/debts/');
        await expect(tom.page.locator('[data-debt="Car loan"]')).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 45_000 });
      await expect(tom.page.getByTestId('debt-who-sees')).toHaveText(g.sharedWith('Jess'));
      await tom.page.locator('[data-debt="Car loan"]').getByRole('link').click();
      await expect(tom.page.getByTestId('who-sees')).toContainText(g.sharedByThem('Jess'));
      await expect(
        tom.page.getByTestId('who-sees').getByRole('button', { name: g.makeItPrivate }),
      ).toHaveCount(0);

      // A goal kept in the shared account, £100 saved already, shared with Tom,
      // with £30 planned from Jess's own account: "From Jess" goes towards it (D464).
      await addAccount(page, 'Jess savings', '400');
      await page.goto('/app/goals/');
      await page.getByRole('button', { name: 'Add a savings goal' }).click();
      const goalSheet = page.getByRole('dialog', { name: 'Add a savings goal' });
      await goalSheet.getByLabel('What are you saving for?').fill('Holiday');
      await goalSheet.getByLabel('Target').fill('1200');
      await radio(goalSheet.getByRole('group', { name: 'Kept in' }), 'Current account').check();
      await goalSheet.getByLabel('Already saved towards it').fill('100');
      await goalSheet.getByLabel('Move into it').fill('30');
      await goalSheet.getByLabel('Next payment').fill('2026-11-02');
      await radio(goalSheet, 'Once').check();
      await radio(goalSheet.getByRole('group', { name: 'From' }), 'Jess savings').check();
      await goalSheet.getByRole('button', { name: 'Add goal' }).click();
      await expect(goalSheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Holiday added.');
      const jessGoal = page.locator('[data-goal="Holiday"]');
      await expect(jessGoal.getByTestId('who-sees')).toContainText(g.sharedWith('Tom'));
      await allSentOn(page);
      // Saved in the account as two halves, the shared one going towards the goal.
      expect(
        sql(`select count(*) from public.series s join public.goals g on g.id = s.goal_id
          where g.name = 'Holiday' and s.name = 'From Jess' and s.private_to is null
            and s.locked_to is not null and s.created_at > now() - interval '10 minutes'`),
      ).toBe('1');
      await expect(page.getByText(strings.clash.refusedTitle)).toHaveCount(0);

      // Tom puts £50 into it from his own account, today, and marks it as arrived.
      await addAccount(tom.page, "Tom's account", '300');
      await expect(async () => {
        await tom.page.goto('/app/goals/');
        await expect(tom.page.locator('[data-goal="Holiday"]')).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 45_000 });
      await tom.page
        .locator('[data-goal="Holiday"]')
        .getByRole('button', { name: strings.goals.addMove('Holiday') })
        .click();
      const move = tom.page.getByRole('dialog', { name: 'Add a payment' });
      await radio(move.getByRole('group', { name: 'From' }), "Tom's account").check();
      await radio(move.getByRole('group', { name: 'To' }), 'Current account').check();
      await box(move, 'Amount').fill('50');
      await box(move, 'Next payment').fill('2026-10-25');
      await move.getByRole('button', { name: strings.addPayment.save }).click();
      await expect(move).toBeHidden();
      await openHome(tom.page);
      const fromTom = tom.page
        .getByTestId('next-due')
        .getByRole('button', { name: named('From Tom') })
        .first();
      await fromTom.click();
      const tick = tom.page.getByRole('dialog', { name: 'From Tom' });
      await tick.getByRole('button', { name: strings.edit.markAsArrived }).click();
      await expect(tick).toBeHidden();
      await allSentOn(tom.page);

      // What each of them has put in, on both phones.
      await tom.page.goto('/app/goals/');
      const tomGoal = tom.page.locator('[data-goal="Holiday"]');
      await expect(tomGoal.getByTestId('put-in-line')).toHaveText([
        `${g.putInStart}£100.00`,
        `${g.putInYou}£50.00`,
      ]);
      await expect(tomGoal).toContainText('£150.00 saved of £1,200.00');
      // Jess's phone, left open on her goals, hears of it by itself.
      await page.goto('/app/goals/');
      await expect(page.locator('[data-goal="Holiday"]').getByTestId('put-in-line')).toHaveText(
        [`${g.putInStart}£100.00`, 'Tom£50.00'],
        { timeout: 30_000 },
      );
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      if (shoots(info, colorScheme)) {
        await page.locator('[data-goal="Holiday"]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SCREENS}/shared-goal-360-light.png` });
      }
      // Nothing of Tom's own account reaches Jess's phone.
      await page.goto('/app/accounts/');
      await expect(page.getByText("Tom's account")).toHaveCount(0);
      await tom.context.close();
    });

    test('3. changing a role: "Can view only" is refused by the server at once, then "Can edit" again', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(300_000);
      const tom = await jessAndTom(page, browser, info, colorScheme);

      await openShare(page);
      await page.getByRole('button', { name: g.changeRole('Tom') }).click();
      const sheet = page.getByRole('dialog', { name: g.roleTitle('Tom') });
      await expect(sheet.getByText(g.roleIntro('Tom'))).toBeVisible();
      await radio(sheet, s.canView).check();
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/change-what-tom-can-do-360-light.png` });
      }
      await sheet.getByRole('button', { name: g.saveRole }).click();
      await expect(page.getByTestId('role-said')).toHaveText(g.roleSavedView('Tom'), {
        timeout: 20_000,
      });
      await expect(page.getByTestId('member')).toHaveText([
        `${s.you('Jess')}${s.roles.owner}`,
        `Tom${s.roles.viewer}${g.changeRole('Tom')}`,
      ]);

      // Tom's phone hears it, and says what he can do.
      await expect(async () => {
        await openShare(tom.page);
        await expect(tom.page.getByTestId('my-role')).toHaveText(g.youCanView('Jess'), {
          timeout: 5_000,
        });
      }).toPass({ timeout: 45_000 });
      await noAxeProblems(tom.page);

      // His change to shared Rent is refused by the server, not just the screen.
      await openHome(tom.page);
      await rentDue(tom.page).click();
      const edit = tom.page.getByRole('dialog', { name: 'Rent' });
      await edit.getByLabel('Amount').fill('999');
      await edit.getByRole('button', { name: 'Save' }).click();
      const refused = tom.page.getByRole('dialog', { name: strings.clash.refusedTitle });
      await expect(refused).toBeVisible({ timeout: 20_000 });
      await expect(refused).toContainText(strings.clash.notAllowed);
      await refused.getByRole('button', { name: strings.clash.gotIt }).click();
      expect(sql(`select count(*) from public.payment_changes where amount = 99900`)).toBe('0');
      await openActivity(tom.page);
      await expect(
        entries(tom.page).filter({
          hasText: `Jess changed what you can do to ${s.roles.viewer}.`,
        }),
      ).toHaveCount(1);

      // "Can edit" again: his change is saved.
      await openShare(page);
      await page.getByRole('button', { name: g.changeRole('Tom') }).click();
      const again = page.getByRole('dialog', { name: g.roleTitle('Tom') });
      await radio(again, s.canEdit).check();
      await again.getByRole('button', { name: g.saveRole }).click();
      await expect(page.getByTestId('role-said')).toHaveText(g.roleSavedEdit('Tom'), {
        timeout: 20_000,
      });
      await expect(async () => {
        await openShare(tom.page);
        await expect(tom.page.getByTestId('my-role')).toHaveText(g.youCanEdit, { timeout: 5_000 });
      }).toPass({ timeout: 45_000 });
      await openHome(tom.page);
      await rentDue(tom.page).click();
      const edit2 = tom.page.getByRole('dialog', { name: 'Rent' });
      await edit2.getByLabel('Amount').fill('575');
      await edit2.getByRole('button', { name: 'Save' }).click();
      await allSentOn(tom.page);
      await openHome(page);
      await expect(rentDue(page)).toContainText('−£575.00', { timeout: 10_000 });
      await tom.context.close();
    });

    test('4. making a shared account private again: not while Tom has his own payment in it, then gone from his phone', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(300_000);
      const tom = await jessAndTom(page, browser, info, colorScheme);
      await addAccount(page, 'Joint savings', '800');
      await allSentOn(page);
      await shareAccount(page, 'Joint savings');
      // Jess's own payment in it, which Tom sees while it's shared.
      await addPayment(page, {
        name: 'Top-up',
        amount: '40',
        date: '2026-11-25',
        account: 'Joint savings',
      });
      await allSentOn(page);

      // Tom adds his own payment from it, and has an account of his own.
      await addAccount(tom.page, "Tom's account", '300');
      await expect(async () => {
        await tom.page.goto('/app/accounts/');
        await expect(tom.page.getByText('Joint savings').first()).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 45_000 });
      await openActivity(tom.page);
      await expect(entries(tom.page).filter({ hasText: /^Jess added Top-up, / })).toHaveCount(1);
      await addPayment(tom.page, {
        name: 'Gym',
        amount: '25',
        date: '2026-11-20',
        account: 'Joint savings',
      });
      await allSentOn(tom.page);
      // Tom sees the current account is Jess's to make private.
      await tom.page.goto('/app/share/accounts/');
      await expect(tom.page.getByTestId('already-shared')).toContainText(g.onlyTheyCan('Jess'));

      // Jess can't while Gym is there.
      await page.goto('/app/share/accounts/');
      await page.getByRole('button', { name: g.makePrivate('Joint savings') }).click();
      const sheet = page.getByRole('dialog', { name: g.privateTitle('Joint savings') });
      await expect(sheet.getByText(g.privateIntro('Joint savings', 'Tom'))).toBeVisible();
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/make-private-360-light.png` });
      }
      await sheet.getByRole('button', { name: g.privateYes }).click();
      await expect(sheet.getByText(g.partnerThings('Tom', 'Joint savings', 'Gym'))).toBeVisible({
        timeout: 20_000,
      });
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: g.privateNo }).click();

      // Tom takes Gym out again, with Undo in his Activity; then she can.
      await openActivity(tom.page);
      const added = entries(tom.page).filter({ hasText: /^You added Gym, / });
      await expect(added).toHaveCount(1);
      await added.getByRole('button', { name: g.undo }).click();
      await expect(tom.page.getByTestId('activity-said')).toHaveText(g.undoneDone, {
        timeout: 20_000,
      });
      await allSentOn(tom.page);

      await page.goto('/app/share/accounts/');
      await page.getByRole('button', { name: g.makePrivate('Joint savings') }).click();
      const again = page.getByRole('dialog', { name: g.privateTitle('Joint savings') });
      await again.getByRole('button', { name: g.privateYes }).click();
      await expect(page.getByTestId('share-said')).toHaveText(g.privateDone('Joint savings'), {
        timeout: 20_000,
      });
      // Back among the accounts she can share.
      await expect(page.getByRole('checkbox', { name: 'Joint savings' })).toBeVisible();

      // Gone from Tom's phone, and from his Activity but for one line that names nothing.
      await expect(async () => {
        await tom.page.goto('/app/accounts/');
        await expect(tom.page.getByText('Joint savings')).toHaveCount(0, { timeout: 5_000 });
      }).toPass({ timeout: 45_000 });
      await openActivity(tom.page);
      await expect(
        entries(tom.page).filter({ hasText: `Jess ${g.what.madeSomethingPrivate('account')}.` }),
      ).toHaveCount(1);
      await expect(tom.page.getByText(/Joint savings|Top-up|£40\.00/)).toHaveCount(0);
      // Only his own Gym, which he took out before it was made private, stays his to see.
      await expect(entries(tom.page).filter({ hasText: /^You added Gym, / })).toHaveCount(1);
      await noAxeProblems(tom.page);
      // The server holds it private to Jess, with everything on it.
      expect(
        sql(`select count(*) from public.accounts a where a.name = 'Joint savings' and a.private_to is null
          and a.created_at > now() - interval '10 minutes'`),
      ).toBe('0');
      expect(
        sql(`select count(*) from public.series s join public.accounts a on a.id = s.account_id
          where a.name = 'Joint savings' and not s.deleted and s.private_to is distinct from a.private_to
            and a.created_at > now() - interval '10 minutes'`),
      ).toBe('0');
      await tom.context.close();
    });
  });
}
