// Brief 8.7 tests 1 to 6 (step 3i), in the brief's own words, each on two
// phones against the local Supabase (README.md, "Checks"), at 320px and
// 360px wide (the sign-in-320 and sign-in-360 projects), in light and dark,
// checked by axe. Jess makes a plan, shares her current account and invites
// Tom with "Can edit" on his own phone (e2e/jess-and-tom.ts).
//
// 1. Tom changes rent on his phone, and it appears on Jess's phone within 5
//    seconds, marked "Changed by Tom".
// 2. Jess's personal account is not shared: nothing of it reaches Tom's
//    phone or any screen of his. e2e/security.spec.ts tries every request he
//    could make, with her real ids.
// 3. Tom is changed to "Can view only". The server refuses his edits, not
//    just the screen: his phone's, and one sent straight to the server.
// 4. Both edit the same payment within a second. The newest change wins and
//    the other person is told.
// 5. Tom leaves and keeps a copy. Jess's plan is unchanged, and Tom's copy
//    no longer updates.
// 6. Signing out removes the plan from the device. "Sign out everywhere"
//    (since D394, "Sign out of all other devices") ends every other session
//    within 1 minute.

import { expect, type Page, test } from '@playwright/test';
import { LOCAL_SUPABASE } from '../lib/sign-in-config.ts';
import { strings } from '../strings/en-GB.ts';
import {
  addAccount,
  allSentOn,
  entries,
  jessAndTom,
  openActivity,
  openShare,
  planOf,
  rentDue,
} from './jess-and-tom.ts';
import { addPayment, noSidewaysScroll, openHome, undoBar } from './journeys.ts';
import { noAxeProblems, radio } from './setup.ts';
import { whatThePhoneKeeps } from './sign-in-helpers.ts';
import {
  everythingOnThePhone,
  openMore,
  personOn,
  quoted,
  secondPhone,
  signIn,
  sql,
} from './two-phones.ts';

const s = strings.share;
const g = strings.together;
const c = strings.clash;
const d = strings.devices;
const a = strings.account;
/** Brief 8.7 test 1. */
const FIVE_SECONDS = 5_000;
/** D21: another session ends within a minute. */
const A_MINUTE = 60_000;

/** The sign-in token kept on a phone. */
const tokenOn = (page: Page) =>
  page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem('prepenny-sign-in') ?? 'null') as { access_token: string })
        .access_token,
  );

/** A request straight to the server, past the phone's own screens. */
async function straightToServer(token: string, step: string, args: unknown) {
  const response = await fetch(`${LOCAL_SUPABASE.url}/rest/v1/rpc/${step}`, {
    method: 'POST',
    headers: {
      apikey: LOCAL_SUPABASE.key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-prepenny-version': sql('select app.database_version()'),
    },
    body: JSON.stringify(args),
  });
  return { status: response.status, text: await response.text() };
}

/** Opens Rent's edit sheet from Home's next three things due, and types a new amount. */
async function rentSheetWith(page: Page, amount: string) {
  await openHome(page);
  await rentDue(page).click();
  const sheet = page.getByRole('dialog', { name: 'Rent' });
  await sheet.getByLabel('Amount').fill(amount);
  await expect(sheet.getByRole('radio', { name: 'Just this one' })).toBeChecked();
  return sheet;
}

/** What Home and Coming up show, word for word, for comparing a plan before and after. */
async function twoScreens(page: Page) {
  await openHome(page);
  await expect(page.getByTestId('balance')).toBeVisible();
  // biome-ignore lint/performance/useDomNodeTextContent: Playwright's own innerText, the words as shown on screen
  const home = await page.locator('main').innerText();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Coming up' })
    .click();
  await expect(page.getByTestId('plan-lowest')).toBeVisible();
  await expect(page.getByTestId('plan-skeleton')).toHaveCount(0);
  // biome-ignore lint/performance/useDomNodeTextContent: Playwright's own innerText, the words as shown on screen
  const comingUp = await page.locator('main').innerText();
  return { home, comingUp };
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`brief 8.7, ${colorScheme}`, () => {
    test.beforeEach(({ page }) => page.emulateMedia({ colorScheme }));

    test('1. Jess invites Tom with "Can edit". Tom changes rent on his phone, and it appears on Jess\'s phone within 5 seconds, marked "Changed by Tom"', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(300_000);
      const tom = await jessAndTom(page, browser, info, colorScheme);
      await openShare(tom.page);
      await expect(tom.page.getByTestId('my-role')).toHaveText(g.youCanEdit);
      await noAxeProblems(tom.page);
      await openHome(page);
      await expect(rentDue(page)).toContainText('−£550.00');

      const sheet = await rentSheetWith(tom.page, '560');
      await noAxeProblems(tom.page);
      const tapped = Date.now();
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(rentDue(page)).toContainText('−£560.00', { timeout: FIVE_SECONDS });
      await expect(rentDue(page).getByTestId('changed-by')).toHaveText(
        g.changedBy('Tom', g.justNow),
        {
          timeout: FIVE_SECONDS,
        },
      );
      expect(Date.now() - tapped, "on Jess's phone within 5 seconds of Tom's tap").toBeLessThan(
        FIVE_SECONDS,
      );
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      await tom.context.close();
    });

    test("2. Jess's personal account is not shared: nothing of it reaches Tom's phone or any screen of his", async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(300_000);
      const tom = await jessAndTom(page, browser, info, colorScheme);
      await addAccount(page, 'Jess savings', '400');
      await addPayment(page, {
        name: 'Birthday present',
        amount: '45',
        date: '2026-11-20',
        account: 'Jess savings',
      });
      await allSentOn(page);
      const plan = await planOf(page);
      const jess = await personOn(page);
      const hers = sql(`select string_agg(id::text, ',') from (
          select id from public.accounts where plan_id = ${quoted(plan)} and private_to = ${quoted(jess)}
          union all select id from public.series where plan_id = ${quoted(plan)} and private_to = ${quoted(jess)}
          union all select id from public.balance_updates where plan_id = ${quoted(plan)} and private_to = ${quoted(jess)}) found`).split(
        ',',
      );
      expect(
        hers.length,
        'Jess has an account, a balance and a payment of her own',
      ).toBeGreaterThanOrEqual(3);

      // Tom's phone, brought up to date, and every screen that lists accounts or payments.
      await tom.page.reload();
      await allSentOn(tom.page);
      for (const path of [
        '/app/',
        '/app/coming-up/',
        '/app/accounts/',
        '/app/debts/',
        '/app/goals/',
      ]) {
        await tom.page.goto(path);
        await expect(tom.page.getByRole('heading', { level: 1 })).toBeVisible();
        // biome-ignore lint/performance/useDomNodeTextContent: Playwright's own innerText, the words as shown on screen
        const shown = await tom.page.locator('main').innerText();
        expect(shown, path).not.toMatch(/Jess savings|Birthday present|£400\.00|£45\.00/);
      }
      await tom.page.goto('/app/accounts/');
      await noAxeProblems(tom.page);
      await noSidewaysScroll(tom.page);
      await openActivity(tom.page);
      await expect(tom.page.getByText(/Jess savings|Birthday present/)).toHaveCount(0);
      await noAxeProblems(tom.page);
      // Nothing of it is kept anywhere on his phone, by name or by id.
      const kept = await everythingOnThePhone(tom.page);
      for (const secret of ['Jess savings', 'Birthday present', ...hers])
        expect(kept).not.toContain(secret);
      // And asking the server straight, he's given none of it.
      const changes = await straightToServer(await tokenOn(tom.page), 'plan_changes', {
        plan,
        shared_after: 0,
        mine_after: 0,
      });
      expect(changes.status).toBe(200);
      for (const secret of ['Jess savings', 'Birthday present', ...hers])
        expect(changes.text).not.toContain(secret);
      await tom.context.close();
    });

    test('3. Tom is changed to "Can view only". The server refuses his edits, not just the screen', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(300_000);
      const tom = await jessAndTom(page, browser, info, colorScheme);
      const plan = await planOf(page);
      await openShare(page);
      await page.getByRole('button', { name: g.changeRole('Tom') }).click();
      const role = page.getByRole('dialog', { name: g.roleTitle('Tom') });
      await radio(role, s.canView).check();
      await noAxeProblems(page);
      await role.getByRole('button', { name: g.saveRole }).click();
      await expect(page.getByTestId('role-said')).toHaveText(g.roleSavedView('Tom'), {
        timeout: 20_000,
      });
      await expect(async () => {
        await openShare(tom.page);
        await expect(tom.page.getByTestId('my-role')).toHaveText(g.youCanView('Jess'), {
          timeout: 5_000,
        });
      }).toPass({ timeout: 45_000 });
      await noAxeProblems(tom.page);

      // His change from his phone: the server refuses it, and his phone says so.
      const sheet = await rentSheetWith(tom.page, '999');
      await sheet.getByRole('button', { name: 'Save' }).click();
      const refused = tom.page.getByRole('dialog', { name: c.refusedTitle });
      await expect(refused).toBeVisible({ timeout: 20_000 });
      await expect(refused).toContainText(c.notAllowed);
      await noAxeProblems(tom.page);
      await refused.getByRole('button', { name: c.gotIt }).click();
      await expect(rentDue(tom.page)).toContainText('−£550.00');

      // And one sent straight to the server, past his phone's screens.
      const rent = sql(
        `select id || ',' || version from public.series where plan_id = ${quoted(plan)} and name = 'Rent'`,
      );
      const [rentId, version] = rent.split(',');
      const straight = await straightToServer(await tokenOn(tom.page), 'save_edit', {
        plan,
        edit: crypto.randomUUID(),
        made_at: new Date().toISOString(),
        kind: 'edit',
        writes: [{ table: 'series', id: rentId, version: Number(version), row: { amount: 99900 } }],
      });
      expect(straight.status, straight.text).toBeGreaterThanOrEqual(400);
      expect(straight.text).toContain('not-allowed');
      expect(
        sql(
          `select count(*) from public.series where plan_id = ${quoted(plan)} and amount = 99900`,
        ) +
          sql(
            `select count(*) from public.payment_changes where plan_id = ${quoted(plan)} and amount = 99900`,
          ),
      ).toBe('00');
      await openHome(page);
      await expect(rentDue(page)).toContainText('−£550.00');
      await tom.context.close();
    });

    test('4. Both edit the same payment within a second. The newest change wins and the other person is told', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(300_000);
      const tom = await jessAndTom(page, browser, info, colorScheme);
      const plan = await planOf(page);
      const tomsSheet = await rentSheetWith(tom.page, '570');
      const jessSheet = await rentSheetWith(page, '580');
      // Tom saves, then Jess, within a second: Jess's is the newest.
      const first = Date.now();
      await tomsSheet.getByRole('button', { name: 'Save' }).click();
      await jessSheet.getByRole('button', { name: 'Save' }).click();
      expect(Date.now() - first, 'both saved within a second').toBeLessThan(1_000);

      // The newest wins, on both phones and on the server.
      await expect(rentDue(page)).toContainText('−£580.00', { timeout: 20_000 });
      await expect(rentDue(tom.page)).toContainText('−£580.00', { timeout: 20_000 });
      await expect
        .poll(() =>
          sql(`select amount from public.payment_changes where plan_id = ${quoted(plan)}
            and original_date = '2026-11-01' and not deleted`),
        )
        .toBe('58000');
      // Tom is told, by name; Jess, whose change was kept, isn't.
      const told = tom.page.getByRole('dialog', { name: c.title });
      await expect(told).toBeVisible({ timeout: 20_000 });
      await expect(told.getByTestId('clash-message')).toHaveText(
        "Jess changed Rent on Sun 1 Nov to £580 after you changed it to £570. Jess's change is kept.",
      );
      await noAxeProblems(tom.page);
      await noSidewaysScroll(tom.page);
      await expect(page.getByRole('dialog', { name: c.title })).toHaveCount(0);
      await told.getByRole('button', { name: "Keep Jess's change" }).click();
      await expect(told).toBeHidden();
      await expect(rentDue(tom.page)).toContainText('−£580.00');
      await tom.context.close();
    });

    test("5. Tom leaves and keeps a copy. Jess's plan is unchanged, and Tom's copy no longer updates", async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(300_000);
      const tom = await jessAndTom(page, browser, info, colorScheme);
      const plan = await planOf(page);
      const jessBefore = await twoScreens(page);
      const recordsBefore =
        sql(`select string_agg(id::text || ':' || amount || ':' || deleted, ',' order by id)
        from public.series where plan_id = ${quoted(plan)}`);

      // Tom leaves from Share with my partner, taking a copy.
      await openShare(tom.page);
      await tom.page.getByTestId('leave').getByRole('link', { name: g.leave.link }).click();
      await expect(
        tom.page.getByRole('heading', { level: 1, name: g.leave.heading }),
      ).toBeVisible();
      await radio(tom.page, g.leave.copyYes).check();
      await noAxeProblems(tom.page);
      await tom.page.getByRole('button', { name: g.leave.leave }).click();
      const confirm = tom.page.getByRole('dialog', { name: g.leave.confirmTitle });
      await confirm.getByRole('button', { name: g.leave.confirmYes }).click();
      await expect(tom.page).toHaveURL(/\/app\/$/, { timeout: 30_000 });
      await expect(
        tom.page.getByTestId('left').getByText(g.leave.doneNote(g.leave.doneCopy)),
      ).toBeVisible({
        timeout: 30_000,
      });
      await noAxeProblems(tom.page);
      await expect(rentDue(tom.page)).toContainText('−£550.00');

      // Jess's plan is unchanged: every payment, and Home and Coming up word for word.
      expect(
        sql(`select string_agg(id::text || ':' || amount || ':' || deleted, ',' order by id)
          from public.series where plan_id = ${quoted(plan)}`),
      ).toBe(recordsBefore);
      await page.reload();
      expect(await twoScreens(page)).toEqual(jessBefore);
      await openActivity(page);
      await expect(entries(page).filter({ hasText: 'Tom left the plan.' })).toHaveCount(1);
      await noAxeProblems(page);

      // Jess changes Rent: Tom's copy stays as it was, however often it looks.
      const sheet = await rentSheetWith(page, '600');
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(undoBar(page)).toContainText('Rent changed for just this one.');
      await allSentOn(page);
      await tom.page.reload();
      await tom.page.evaluate(() => window.dispatchEvent(new Event('online')));
      await allSentOn(tom.page);
      await openHome(tom.page);
      await expect(rentDue(tom.page)).toContainText('−£550.00');
      const tomPlan = await planOf(tom.page);
      expect(tomPlan).not.toBe(plan);
      expect(
        sql(
          `select count(*) from public.payment_changes where plan_id = ${quoted(tomPlan)} and amount = 60000`,
        ),
      ).toBe('0');
      await openHome(page);
      await expect(rentDue(page)).toContainText('−£600.00');
      await tom.context.close();
    });

    test('6. Signing out removes the plan from the device. "Sign out everywhere" ends every other session within 1 minute', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(300_000);
      const tom = await jessAndTom(page, browser, info, colorScheme);

      // Tom signs out on his phone, in two taps: nothing of the plan is left on it.
      await openMore(tom.page);
      await tom.page.getByTestId('account').getByRole('button', { name: 'Sign out' }).click();
      const signOut = tom.page.getByRole('dialog', { name: 'Sign out' });
      await noAxeProblems(tom.page);
      await signOut.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(tom.page.getByRole('button', { name: 'Make my plan' })).toBeVisible();
      const left = await whatThePhoneKeeps(tom.page);
      expect(left.localStorage).toEqual([]);
      expect(left.sessionStorage).toEqual([]);
      for (const [store, rows] of Object.entries(left.rows)) expect(rows, store).toBe(0);

      // Jess on a laptop too. From her phone: Sign out of all other devices.
      const jessAddress = sql(
        `select email from auth.users where id = ${quoted(await personOn(page))}`,
      );
      const laptop = await secondPhone(browser, info, colorScheme);
      await signIn(laptop.page, jessAddress);
      await expect(laptop.page.getByTestId('balance')).toBeVisible();
      const laptopToken = await tokenOn(laptop.page);
      await openMore(page);
      await page
        .getByTestId('security')
        .getByRole('link', { name: /Signed-in devices/ })
        .click();
      await expect(page.getByTestId('device')).toHaveCount(2);
      const others = page.getByRole('region', { name: d.others });
      await others.getByRole('button', { name: d.others, exact: true }).click();
      const sheet = page.getByRole('dialog', { name: d.othersTitle });
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: d.othersYes }).click();
      const ended = Date.now();
      await expect(page.getByTestId('devices-said')).toHaveText(d.othersDone(1));
      await noSidewaysScroll(page);

      // The server refuses the laptop's next request at once, and the laptop
      // stops and removes the plan within a minute.
      const refused = await straightToServer(laptopToken, 'plan_changes', {
        plan: await planOf(page),
        shared_after: 0,
        mine_after: 0,
      });
      expect(refused.text, 'nothing of the plan for an ended session').not.toContain('Rent');
      await expect(laptop.page.getByText(a.signInEnded)).toBeVisible({ timeout: A_MINUTE });
      expect(Date.now() - ended, 'within a minute').toBeLessThan(A_MINUTE);
      const kept = await whatThePhoneKeeps(laptop.page);
      expect(kept.localStorage).not.toContain('prepenny-sign-in');
      expect(kept.rows['prepenny.plans'] ?? 0).toBe(0);
      await noAxeProblems(laptop.page);
      // Her phone stays signed in.
      await openMore(page);
      await expect(page.getByTestId('account')).toContainText(a.signedInAs(jessAddress));
      await laptop.context.close();
      await tom.context.close();
    });
  });
}
