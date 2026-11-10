// Shared plans: invite and join (step 3f, brief 4.14, PLAN.md items 26, 33
// and 34), at 320px and 360px wide (the sign-in-320 and sign-in-360
// projects), in light and dark, checked by axe, against the local Supabase
// with two people on two phones. Start it first (README.md, "Checks").
//
// 1. Invite by link, "Can edit", Allow: the joined phone brings the plan
//    down straight away; sharing an account; "From Jess, £600" on Tom's
//    phone, with nothing of Jess's own account.
// 2. Invite by email, "Can view only": the email holds the link and no
//    money; the server refuses Jess's change to shared rent; her own pay
//    can be claimed and looked after (D311, D418).
// 3. A forwarded link: whoever opens it first gets nothing until allowed;
//    "Don't allow" ends it, so the real partner finds it used; and someone
//    already in a shared plan is told they can't join another (D427).
// 4. Step 3f-2 (D426): Sam, with a plan of his own on other bank holidays,
//    joins Jess's and keeps every account, private to him: told before he
//    asks, brought in once she allows it, from the join page or from "Finish
//    joining" on Home, and Jess sees none of it.

import { type Browser, expect, type Page, type TestInfo, test } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { layoutProblems, named } from './coming-up.ts';
import { addPayment, noSidewaysScroll, openHome, undoBar } from './journeys.ts';
import { box, fillAccount, noAxeProblems, radio } from './setup.ts';
import { askForCode, makeAPlan, newEmail, signInEmail } from './sign-in-helpers.ts';
import { openMore, personOn, quoted, secondPhone, signUpFromMore, sql } from './two-phones.ts';

const s = strings.share;
const j = strings.join;
const SCREENS = '../../docs/screens/3f';
const SCREENS_2 = '../../docs/screens/3f-2';
const INBOX = 'http://127.0.0.1:54324';

/** True for the one run that saves the screenshots: 360px, light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  colorScheme === 'light' && info.project.name === 'sign-in-360';

async function openShare(page: Page) {
  await openMore(page);
  await page.getByRole('link', { name: new RegExp(`^${s.moreLink}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: s.heading })).toBeVisible();
  await expect(page.getByTestId('who')).toBeVisible();
}

/** Tom: a plan of his own, set up on the screens, saved in his account. */
async function tomWithAPlan(page: Page, colorScheme: 'light' | 'dark'): Promise<string> {
  await page.emulateMedia({ colorScheme });
  const address = newEmail('tom');
  await makeAPlan(page);
  await signUpFromMore(page, address);
  return address;
}

/** "Choose shared accounts": ticks one and shares it, saying yes in the sheet. */
async function shareAccount(page: Page, account: string, info: TestInfo, colorScheme: string) {
  await openShare(page);
  await page.getByRole('link', { name: s.chooseAccounts }).click();
  await expect(page.getByRole('heading', { level: 1, name: s.accountsTitle })).toBeVisible();
  await page.getByRole('checkbox', { name: account }).check();
  await noAxeProblems(page);
  await noSidewaysScroll(page);
  if (shoots(info, colorScheme)) {
    await page.screenshot({ path: `${SCREENS}/choose-shared-accounts-360-light.png` });
  }
  await page.getByRole('button', { name: s.shareThese }).click();
  const sheet = page.getByRole('dialog', { name: s.confirmTitle(account) });
  await expect(sheet).toBeVisible();
  await noAxeProblems(page);
  await sheet.getByRole('button', { name: s.confirmYes }).click();
  await expect(page.getByTestId('share-said')).toHaveText(s.sharedDone(account), {
    timeout: 20_000,
  });
  await expect(page.getByText(s.alreadyShared, { exact: true })).toBeVisible();
}

/** "Invite your partner": makes an invite link and gives it back. */
async function makeLink(
  page: Page,
  role: string,
  info?: TestInfo,
  colorScheme = 'dark',
  name = 'Tom',
) {
  await openShare(page);
  const invite = page.getByTestId('invite');
  await box(invite, s.nameLabel).fill(name);
  await radio(invite, role).check();
  await radio(invite, s.byLink).check();
  await invite.getByRole('button', { name: s.makeLink }).click();
  const link = page.getByTestId('invite-link').getByLabel(s.linkLabel);
  await expect(link).toHaveValue(/\/join\/#[A-Za-z0-9_-]{40,}$/);
  await noAxeProblems(page);
  await noSidewaysScroll(page);
  if (info !== undefined && shoots(info, colorScheme)) {
    await page.screenshot({ path: `${SCREENS}/invite-360-light.png` });
  }
  return link.inputValue();
}

/** A new person's phone: opens the link, signs up from the join page and asks to join. */
async function askWithLink(
  page: Page,
  link: string,
  address: string,
  name: string,
  /** Which email to this address has the sign-in code: the second when the invite came by email. */
  codeEmail = 1,
  inviter = 'Tom',
) {
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: j.heading })).toBeVisible();
  // The secret leaves the address at once.
  await expect(page).toHaveURL(/\/join\/$/);
  await expect(page.getByText(j.signInFirst)).toBeVisible();
  await noAxeProblems(page);
  await page.getByRole('link', { name: j.signIn }).click();
  await askForCode(page, address);
  await box(page, '6-digit code').fill((await signInEmail(address, codeEmail)).code);
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page).toHaveURL(/\/join\/$/);
  await expect(page.getByTestId('join-message')).toHaveText(j.invitedBy(inviter));
  await noAxeProblems(page);
  await noSidewaysScroll(page);
  await box(page, j.nameLabel(inviter)).fill(name);
  await page.getByRole('button', { name: j.ask }).click();
  await expect(page.getByTestId('join-message')).toHaveText(j.waiting(inviter));
  await noAxeProblems(page);
}

/** The sheet that opens by itself on Tom's phone. */
async function requestSheet(page: Page, name: string) {
  const sheet = page.getByRole('dialog', { name: s.requestTitle(name) });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  return sheet;
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

async function newPhone(browser: Browser, info: TestInfo, colorScheme: 'light' | 'dark') {
  return secondPhone(browser, info, colorScheme);
}

/** "Where you live", under More, Accounts. */
async function setNation(page: Page, nation: string) {
  await page.goto('/app/accounts/');
  await page.getByRole('button', { name: strings.accounts.changeNation }).click();
  const sheet = page.getByRole('dialog', { name: strings.nation.title });
  await radio(sheet, nation).check();
  await sheet.getByRole('button', { name: strings.nation.save }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByText(strings.accounts.holidaysLine(nation), { exact: true }),
  ).toBeVisible();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`sharing a plan, ${colorScheme}`, () => {
    test('1. by link with "Can edit": Allow, the plan comes down at once, a shared account and "From Jess, £600"', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(240_000);
      await tomWithAPlan(page, colorScheme);
      await shareAccount(page, 'Current account', info, colorScheme);
      await openShare(page);
      await expect(page.getByTestId('shared-accounts')).toContainText(
        s.accountsShared('Current account'),
      );
      const link = await makeLink(page, s.canEdit, info, colorScheme);

      const jess = await newPhone(browser, info, colorScheme);
      const jessAddress = newEmail('jess');
      await askWithLink(jess.page, link, jessAddress, 'Jess');

      // Tom's phone asks him, by itself, within seconds of Jess asking.
      const sheet = await requestSheet(page, 'Jess');
      await expect(sheet.getByTestId('join-request-email')).toHaveText(s.requestEmail(jessAddress));
      await expect(sheet.getByText(s.requestCanEdit)).toBeVisible();
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/jess-wants-to-join-360-light.png` });
      }
      // With text at 200%, the sheet still fits at this width.
      const big = await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      expect(await layoutProblems(page)).toEqual([]);
      await big.evaluate((node) => (node as Element).remove());
      // Until he allows it, Jess's phone has nothing of his plan.
      await expect(jess.page.getByTestId('join-message')).toHaveText(j.waiting('Tom'));

      const allowedAt = Date.now();
      await sheet.getByRole('button', { name: s.allow, exact: true }).click();
      await expect(sheet.getByTestId('join-answered')).toHaveText(s.allowed('Jess'));
      // The plan comes down to Jess's phone straight away (PLAN.md item 33).
      await expect(jess.page).toHaveURL(/\/app\/$/, { timeout: 15_000 });
      await expect(jess.page.getByTestId('balance')).toContainText('£267.54');
      expect(Date.now() - allowedAt).toBeLessThan(15_000);
      await noAxeProblems(jess.page);
      await sheet.getByRole('button', { name: s.gotIt }).click();
      await expect(sheet).toBeHidden();

      // Who's in it now, on Tom's phone.
      await openShare(page);
      await expect(page.getByTestId('member')).toHaveText([
        `${s.you('Tom')}${s.roles.owner}`,
        `Jess${s.roles.editor}`,
      ]);
      await expect(page.getByTestId('invite')).toContainText(s.full);

      // Jess adds her own account, private to her, and moves £600 from it to the shared one.
      await addAccount(jess.page, "Jess's account", '1000');
      await addPayment(jess.page, {
        kind: 'Between accounts',
        name: 'To our account',
        amount: '600',
        date: '2026-10-30',
        account: "Jess's account",
        to: 'Current account',
        often: 'Once',
      });
      await expect(undoBar(jess.page)).toContainText('To our account added.');

      // Tom sees "From Jess, £600" arrive in the shared account, and nothing else.
      await expect(async () => {
        await page.goto('/app/coming-up/');
        await expect(page.getByRole('button', { name: named('From Jess') })).toBeVisible({
          timeout: 2_000,
        });
      }).toPass({ timeout: 30_000 });
      const row = page.getByRole('button', { name: named('From Jess') });
      await expect(row).toContainText('+£600.00');
      await expect(page.getByText("Jess's account")).toHaveCount(0);
      await expect(page.getByText('To our account')).toHaveCount(0);
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      if (shoots(info, colorScheme)) {
        await row.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SCREENS}/from-jess-360-light.png` });
      }
      // Only Jess can change it.
      await row.click();
      const locked = page.getByRole('dialog', { name: 'From Jess' });
      await expect(locked.getByTestId('locked-to')).toHaveText(s.lockedTo('Jess'));
      await noAxeProblems(page);
      await locked.getByRole('button', { name: strings.sheet.close }).click();

      // With text at 200%, Share with my partner still fits at this width.
      await openShare(page);
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      expect(await layoutProblems(page)).toEqual([]);

      // Tom's accounts: his own, shared, and never Jess's.
      await page.goto('/app/accounts/');
      await expect(
        page.getByRole('heading', { level: 1, name: strings.accounts.heading }),
      ).toBeVisible();
      await expect(page.getByText("Jess's account")).toHaveCount(0);
      // The server holds Jess's account and her half of the £600 private to her.
      const jessId = sql(`select id from public.people where nickname = 'Jess'
        and id in (select person_id from public.plan_members where role = 'editor')
        order by created_at desc limit 1`);
      expect(
        sql(`select count(*) from public.accounts where name = 'Jess''s account'
          and private_to = ${quoted(jessId)}`),
      ).toBe('1');
      expect(
        sql(`select count(*) from public.series where name = 'From Jess' and private_to is null
          and locked_to = ${quoted(jessId)} and note is null`),
      ).toBe('1');
      await jess.context.close();
    });

    test('2. by email with "Can view only": the server refuses her change to shared rent, and she can claim her own pay', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(240_000);
      await tomWithAPlan(page, colorScheme);
      await addPayment(page, {
        name: 'Rent',
        amount: '550',
        date: '2026-11-01',
        often: 'Every month, or every few months',
      });
      // Jess's pay into the shared account, typed in by Tom before she joins.
      await addPayment(page, {
        kind: 'Coming in',
        name: 'Jess pay',
        amount: '1800',
        date: '2026-10-30',
        type: 'Pay',
      });
      await shareAccount(page, 'Current account', info, 'dark');

      // By email.
      const jessAddress = newEmail('jess');
      await openShare(page);
      const invite = page.getByTestId('invite');
      await box(invite, s.nameLabel).fill('Tom');
      await radio(invite, s.canView).check();
      await radio(invite, s.byEmail).check();
      await box(invite, s.emailLabel).fill(jessAddress);
      await noAxeProblems(page);
      await invite.getByRole('button', { name: s.sendEmail }).click();
      await expect(page.getByTestId('invite-said')).toHaveText(s.emailSent(jessAddress));
      await expect(page.getByTestId('invite-open')).toContainText(jessAddress);
      await expect(page.getByTestId('invite-open')).toContainText(s.canView);

      const email = await inviteEmail(jessAddress);
      expect(email.subject).toBe('Tom has invited you to share a plan in PrePenny');
      expect(email.text).toContain('Tom has invited you to share their plan in PrePenny.');
      expect(email.text).toContain('The invite lasts 7 days');
      expect(email.text).not.toMatch(/£|Rent|Jess pay/);

      const jess = await newPhone(browser, info, colorScheme);
      await askWithLink(jess.page, email.link, jessAddress, 'Jess', 2);
      const sheet = await requestSheet(page, 'Jess');
      await expect(sheet.getByText(s.requestCanView)).toBeVisible();
      await sheet.getByRole('button', { name: s.allow, exact: true }).click();
      await sheet.getByRole('button', { name: s.gotIt }).click();
      await expect(jess.page).toHaveURL(/\/app\/$/, { timeout: 15_000 });

      // With "Can view only", the server refuses her change to the shared rent (D51).
      await openHome(jess.page);
      await jess.page
        .getByTestId('next-due')
        .getByRole('button', { name: named('Rent') })
        .first()
        .click();
      const rent = jess.page.getByRole('dialog', { name: 'Rent' });
      await rent.getByLabel('Amount').fill('1000');
      await rent.getByRole('button', { name: 'Save' }).click();
      const refused = jess.page.getByRole('dialog', { name: strings.clash.refusedTitle });
      await expect(refused).toBeVisible({ timeout: 20_000 });
      await expect(refused.getByTestId('clash-message')).toContainText(strings.clash.notAllowed);
      await refused.getByRole('button', { name: strings.clash.gotIt }).click();
      await expect(
        jess.page
          .getByTestId('next-due')
          .getByRole('button', { name: named('Rent') })
          .first(),
      ).toContainText('£550.00');

      // Her pay was typed in by Tom, so it's his until she claims it (D418).
      await jess.page
        .getByRole('button', { name: named('Jess pay') })
        .first()
        .click();
      const pay = jess.page.getByRole('dialog', { name: 'Jess pay' });
      await expect(pay.getByTestId('claim-pay')).toContainText(s.paidBy('Tom'));
      await noAxeProblems(jess.page);
      await pay.getByRole('button', { name: s.claim }).click();
      await expect(pay.getByTestId('claimed')).toHaveText(s.claimed);
      await pay.getByRole('button', { name: strings.sheet.close }).click();
      // Now hers: with "Can view only" she can still type its real amount (D311).
      await expect(async () => {
        await openHome(jess.page);
        await jess.page
          .getByRole('button', { name: named('Jess pay') })
          .first()
          .click();
        await expect(
          jess.page.getByRole('dialog', { name: 'Jess pay' }).getByTestId('claim-pay'),
        ).toHaveCount(0, { timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      const own = jess.page.getByRole('dialog', { name: 'Jess pay' });
      await own.getByLabel('Amount').fill('1850');
      await own.getByRole('button', { name: 'Save' }).click();
      await expect(own).toBeHidden();
      await expect(async () => {
        await openHome(page);
        await expect(page.getByRole('button', { name: named('Jess pay') }).first()).toContainText(
          '£1,850.00',
          { timeout: 2_000 },
        );
      }).toPass({ timeout: 30_000 });
      await expect(jess.page.getByRole('dialog', { name: strings.clash.refusedTitle })).toHaveCount(
        0,
      );
      await jess.context.close();
    });

    test('3. a forwarded link gets nothing until allowed, "Don\'t allow" ends it, and a plan of one\'s own waits', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(300_000);
      await tomWithAPlan(page, colorScheme);
      await shareAccount(page, 'Current account', info, 'dark');
      const link = await makeLink(page, s.canEdit);

      // Someone else got the link first, and gives Jess's name.
      const stranger = await newPhone(browser, info, colorScheme);
      const strangerAddress = newEmail('alex');
      await askWithLink(stranger.page, link, strangerAddress, 'Jess');
      const sheet = await requestSheet(page, 'Jess');
      // Tom sees the address isn't Jess's.
      await expect(sheet.getByTestId('join-request-email')).toHaveText(
        s.requestEmail(strangerAddress),
      );
      await sheet.getByRole('button', { name: s.dontAllow }).click();
      await expect(sheet.getByTestId('join-answered')).toHaveText(s.notAllowed('Jess'));
      await sheet.getByRole('button', { name: s.gotIt }).click();
      await expect(stranger.page.getByTestId('join-message')).toHaveText(j.notAllowed('Tom'), {
        timeout: 15_000,
      });
      await noAxeProblems(stranger.page);
      // Nothing of Tom's plan reached the stranger's phone.
      await stranger.page.goto('/app/');
      await expect(stranger.page).toHaveURL(/\/setup\/$/);
      expect(
        sql(`select count(*) from public.plan_members m join auth.users u on u.id = m.person_id
          where u.email = ${quoted(strangerAddress)}`),
      ).toBe('0');
      await stranger.context.close();

      // The real Jess, with the same link: it's been used.
      const jess = await newPhone(browser, info, colorScheme);
      await jess.page.goto(link);
      await jess.page.getByRole('link', { name: j.signIn }).click();
      const jessAddress = newEmail('jess');
      await askForCode(jess.page, jessAddress);
      await box(jess.page, '6-digit code').fill((await signInEmail(jessAddress)).code);
      await jess.page.getByRole('button', { name: 'Sign up', exact: true }).click();
      await expect(jess.page.getByTestId('join-message')).toHaveText(j.used);
      await noAxeProblems(jess.page);
      await jess.context.close();

      // Someone already in a shared plan is told plainly they can't join
      // another (D427). Since step 3f-2, a plan of one's own with nobody
      // else in it comes along instead (test 4).
      const fresh = await makeLink(page, s.canEdit);
      const sam = await newPhone(browser, info, colorScheme);
      await makeAPlan(sam.page);
      await signUpFromMore(sam.page, newEmail('sam'));
      const samsLink = await makeLink(sam.page, s.canEdit, undefined, 'dark', 'Sam');
      const priya = await newPhone(browser, info, colorScheme);
      await askWithLink(priya.page, samsLink, newEmail('priya'), 'Priya', 1, 'Sam');
      const samSheet = await requestSheet(sam.page, 'Priya');
      await samSheet.getByRole('button', { name: s.allow, exact: true }).click();
      await expect(priya.page).toHaveURL(/\/app\/$/, { timeout: 15_000 });
      await priya.context.close();
      await samSheet.getByRole('button', { name: s.gotIt }).click();
      await sam.page.goto(fresh);
      await expect(sam.page.getByTestId('join-message')).toHaveText(j.hasAPlan('Tom'));
      await expect(sam.page.getByRole('button', { name: j.ask })).toHaveCount(0);
      await noAxeProblems(sam.page);
      await noSidewaysScroll(sam.page);
      await sam.page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      expect(await layoutProblems(sam.page)).toEqual([]);
      await sam.context.close();
    });

    test("4. Sam, with a plan of his own, joins Jess's and keeps every account, private to him", async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(300_000);
      await page.emulateMedia({ colorScheme });
      // Jess's plan: Scotland's bank holidays, and a joint account she shares.
      await makeAPlan(page);
      await setNation(page, 'Scotland');
      await addAccount(page, 'Joint', '800');
      await signUpFromMore(page, newEmail('jess'));
      await shareAccount(page, 'Joint', info, 'dark');
      const link = await makeLink(page, s.canEdit, undefined, 'dark', 'Jess');

      // Sam's own plan on his phone: his current account, his savings and a
      // phone bill, on England and Wales's bank holidays, saved in his account.
      const sam = await newPhone(browser, info, colorScheme);
      await makeAPlan(sam.page);
      await addAccount(sam.page, "Sam's savings", '500');
      await addPayment(sam.page, {
        name: 'Phone bill',
        amount: '20',
        date: '2026-10-30',
        account: 'Current account',
        often: 'Once',
      });
      const samAddress = newEmail('sam');
      await signUpFromMore(sam.page, samAddress);
      const samId = await personOn(sam.page);
      const ownPlan = sql(
        `select plan_id from public.plan_members where person_id = ${quoted(samId)}`,
      );

      // Before he asks, he's told what comes with him, and what the bank holidays change.
      await sam.page.goto(link);
      await expect(sam.page.getByTestId('join-message')).toHaveText(j.invitedBy('Jess'));
      await expect(sam.page.getByTestId('join-brings')).toHaveText(j.bringsLine('Jess'));
      await expect(sam.page.getByText(j.bringsPrivate('Jess'))).toBeVisible();
      await expect(sam.page.getByTestId('join-holidays')).toHaveText(
        j.nationDiffers('Jess', 'Scotland', 'England and Wales'),
      );
      await noAxeProblems(sam.page);
      await noSidewaysScroll(sam.page);
      if (shoots(info, colorScheme)) {
        await sam.page.screenshot({
          path: `${SCREENS_2}/bring-your-plan-ask-360-light.png`,
          fullPage: true,
        });
      }
      const big = await sam.page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      expect(await layoutProblems(sam.page)).toEqual([]);
      await big.evaluate((node) => (node as Element).remove());
      await box(sam.page, j.nameLabel('Jess')).fill('Sam');
      await sam.page.getByRole('button', { name: j.ask }).click();
      await expect(sam.page.getByTestId('join-message')).toHaveText(j.waiting('Jess'));
      // In light, he goes back to his plan meanwhile, and finishes from Home;
      // in dark, he keeps the join page open.
      const fromHome = colorScheme === 'light';
      if (fromHome) {
        await sam.page.goto('/app/');
        await expect(sam.page.getByTestId('balance')).toBeVisible();
      }

      // Jess allows it. Nothing of his has moved yet.
      const sheet = await requestSheet(page, 'Sam');
      await sheet.getByRole('button', { name: s.allow, exact: true }).click();
      await expect(sheet.getByTestId('join-answered')).toHaveText(s.allowedBringing('Sam'));
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: s.gotIt }).click();
      expect(
        sql(`select count(*) from public.plan_members where person_id = ${quoted(samId)}`),
      ).toBe('1');
      expect(sql(`select count(*) from public.plans where id = ${quoted(ownPlan)}`)).toBe('1');
      await openShare(page);
      await expect(page.getByTestId('invite-open')).toContainText(s.allowedBringing('Sam'));

      if (fromHome) {
        // "Finish joining" shows on his Home by itself.
        const card = sam.page.getByTestId('finish-joining');
        await expect(card).toBeVisible({ timeout: 70_000 });
        await expect(card.getByRole('heading')).toHaveText(strings.joining.heading('Jess'));
        await noAxeProblems(sam.page);
        await noSidewaysScroll(sam.page);
        if (shoots(info, colorScheme)) {
          await sam.page.screenshot({ path: `${SCREENS_2}/finish-joining-360-light.png` });
        }
        await card.getByRole('link', { name: strings.joining.finish }).click();
        await expect(sam.page).toHaveURL(/\/join\/$/);
      }
      // The bank holidays differ, so he's told again, and chooses.
      await expect(sam.page.getByTestId('join-holidays')).toBeVisible({ timeout: 20_000 });
      const bring = sam.page.getByRole('button', { name: j.bringAndJoin });
      await expect(bring).toBeVisible();
      await noAxeProblems(sam.page);
      await noSidewaysScroll(sam.page);
      if (shoots(info, colorScheme)) {
        await sam.page.screenshot({
          path: `${SCREENS_2}/bring-your-plan-allowed-360-light.png`,
          fullPage: true,
        });
      }
      await bring.click();
      await expect(sam.page).toHaveURL(/\/app\/$/, { timeout: 20_000 });

      // Everything of his came with him: Home, his accounts and his phone bill.
      await expect(sam.page.getByRole('heading', { name: 'Current account' })).toBeVisible();
      await expect(sam.page.getByTestId('balance')).toContainText('£267.54');
      await sam.page.goto('/app/accounts/');
      for (const name of ['Current account', "Sam's savings", 'Joint']) {
        await expect(sam.page.getByText(name, { exact: true }).first()).toBeVisible();
      }
      await expect(
        sam.page.getByText(strings.accounts.holidaysLine('Scotland'), { exact: true }),
      ).toBeVisible();
      await noAxeProblems(sam.page);
      if (shoots(info, colorScheme)) {
        await sam.page.screenshot({
          path: `${SCREENS_2}/sams-accounts-after-joining-360-light.png`,
        });
      }
      await sam.page.goto('/app/coming-up/');
      await expect(sam.page.getByRole('button', { name: named('Phone bill') })).toBeVisible();
      // His accounts are his to share, when he chooses.
      await openShare(sam.page);
      await sam.page.getByRole('link', { name: s.chooseAccounts }).click();
      await expect(sam.page.getByRole('checkbox', { name: 'Current account' })).toBeVisible();
      await expect(sam.page.getByRole('checkbox', { name: "Sam's savings" })).toBeVisible();

      // On the server: he's in her plan only, his old plan is gone, and
      // everything he brought is private to him.
      expect(
        sql(`select count(*) from public.plan_members where person_id = ${quoted(samId)}`),
      ).toBe('1');
      expect(sql(`select count(*) from public.plans where id = ${quoted(ownPlan)}`)).toBe('0');
      expect(
        sql(`select count(*) from public.accounts where private_to = ${quoted(samId)}
          and name in ('Current account', 'Sam''s savings')`),
      ).toBe('2');
      expect(
        sql(
          `select count(*) from public.series where created_by = ${quoted(samId)} and private_to is null`,
        ),
      ).toBe('0');

      // Jess sees that Sam joined, and nothing of his.
      await openShare(page);
      await expect(page.getByTestId('member')).toHaveText([
        `${s.you('Jess')}${s.roles.owner}`,
        `Sam${s.roles.editor}`,
      ]);
      await page.goto('/app/accounts/');
      await expect(page.getByText("Sam's savings")).toHaveCount(0);
      await page.goto('/app/coming-up/');
      await expect(page.getByText('Phone bill')).toHaveCount(0);
      await noAxeProblems(page);
      await sam.context.close();
    });
  });
}

/** The invite email to an address: its subject, its words and its link. */
async function inviteEmail(address: string) {
  let found: { ID: string }[] = [];
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${INBOX}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
        );
        found = ((await response.json()) as { messages: { ID: string }[] }).messages;
        return found.length;
      },
      { message: `the invite email to ${address}`, timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  const response = await fetch(`${INBOX}/api/v1/message/${found[0]?.ID}`);
  const message = (await response.json()) as { Subject: string; HTML: string; Text: string };
  const link = /href="([^"]*\/join\/#[A-Za-z0-9_-]+)"/.exec(message.HTML)?.[1];
  if (link === undefined) throw new Error('The invite email should have the link.');
  return { subject: message.Subject, text: message.Text, link };
}
