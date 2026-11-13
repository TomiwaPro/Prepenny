// Getting back in with a backup email, with a 24-hour wait and a way to stop
// it (step 3e hardening), at 320px and 360px wide (the sign-in-320 and
// sign-in-360 projects), in light and dark, checked by axe, against the local
// Supabase with its get-back-in function and its test inbox. Start it first
// (README.md, "Checks").
//
// The owner's tests:
// 1. Start getting back in, see the notice on a signed-in device and stop it
//    there; start again, let 24 hours pass (the clock is moved: the
//    database's times back 24 hours, and the phone's clock on 24 hours),
//    finish, and sign in with the backup address.
// 2. The stop link in the email to the sign-in address stops it, once, and
//    does nothing else.
// 3. Two-step sign-in still applies after getting back in: signing in with
//    the backup address asks for the authenticator app's code.
// 4. From the owner's report (step 3e-2, D404): the notice shows on a
//    signed-in phone within a minute without reloading, even after one of its
//    requests never got an answer and with its live updates gone.
// "Sign out of all other devices" is devices.spec.ts test 2.

import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { noSidewaysScroll } from './journeys.ts';
import { box, noAxeProblems } from './setup.ts';
import { codeIn, countEmails, makeAPlan, newEmail } from './sign-in-helpers.ts';
import { appCode } from './totp.ts';
import {
  DEVICES,
  openMore,
  personOn,
  quoted,
  secondPhone,
  signUpFromMore,
  sql,
} from './two-phones.ts';

const g = strings.getBackIn;
const n = strings.getBackInNotice;
const st = strings.stopGetBackIn;
const SCREENS = '../../docs/screens/3e-hardening';
/** D21: a signed-out device stops within a minute; the notice shows as fast. */
const A_MINUTE = 60_000;

const CODE_SUBJECT = 'Your PrePenny code to get back in';
const FINISH_SUBJECT = 'Your PrePenny code to finish getting back in';
const ASKED_SUBJECT = 'Someone asked to get into your PrePenny account';
const STOPPED_SUBJECT = 'Getting back into PrePenny was stopped';
const CHANGED_SUBJECT = 'Your PrePenny sign-in email has changed';

/** True for the one run that saves the screenshots: 360px, light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  colorScheme === 'light' && info.project.name === 'sign-in-360';

test.use({ userAgent: DEVICES.androidChrome });

/** Everything about the account getting back in could change, from the local database. */
function accountOf(person: string): string {
  return sql(`select concat_ws(' | ',
      (select email from auth.users where id = ${quoted(person)}),
      (select string_agg(provider || ':' || coalesce(email, ''), ',' order by provider)
        from auth.identities where user_id = ${quoted(person)}),
      (select string_agg(id::text, ',' order by id) from auth.sessions where user_id = ${quoted(person)}),
      (select email from app.backup_emails where person_id = ${quoted(person)}))`);
}

/** A backup email for the person, as adding one with its code leaves it (emails.spec.ts test 5). */
function addBackup(person: string, backup: string) {
  sql(
    `insert into app.backup_emails (person_id, email) values (${quoted(person)}, ${quoted(backup)})`,
  );
}

/**
 * Lets the next code to an address be asked for straight away, as if a
 * minute had passed: PrePenny sends one a minute.
 */
function aMinuteLater(address: string) {
  sql(`update app.email_codes set sent_at = sent_at - interval '61 seconds'
    where email = ${quoted(address)}`);
}

/** 24 hours pass, for the database: the request and its codes move back a day. */
function aDayPasses(person: string) {
  sql(`update app.get_back_in set started_at = started_at - interval '24 hours 1 minute'
      where person_id = ${quoted(person)};
    update app.email_codes set sent_at = sent_at - interval '24 hours 1 minute',
      used_at = used_at - interval '24 hours 1 minute'
      where person_id = ${quoted(person)};`);
}

/** The stop link in the email to an address, as the email has it. */
async function stopLinkTo(address: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const found = await fetch(
          `http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
        );
        const { messages } = (await found.json()) as {
          messages: { ID: string; Subject: string }[];
        };
        for (const message of messages) {
          if (message.Subject !== ASKED_SUBJECT) continue;
          const read = await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`);
          const { HTML } = (await read.json()) as { HTML: string };
          link = /href="([^"]*\/stop-get-back-in\/#[A-Za-z0-9_-]{43})"/.exec(HTML)?.[1];
          if (link !== undefined) return true;
        }
        return false;
      },
      { message: `the stop link to ${address}`, timeout: 20_000 },
    )
    .toBe(true);
  return link as string;
}

/** On a signed-out phone: asks for a code at the backup email, and types it. */
async function useBackup(phone: Page, backup: string, subject: string) {
  const asked = Date.now() - 1000;
  await box(phone, g.emailLabel).fill(backup);
  await phone.getByRole('button', { name: g.send }).click();
  await expect(phone.getByText(g.sent(backup))).toBeVisible();
  await box(phone, g.codeLabel).fill(await codeIn(backup, subject, asked));
  await phone.getByRole('button', { name: g.useCode }).click();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Getting back in, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('1. getting back in waits 24 hours: a signed-in phone shows the notice and stops it; started again, 24 hours later a new code finishes it and the backup signs in', async ({
      page,
      browser,
    }, info) => {
      test.slow();
      const main = newEmail('sam');
      const backup = newEmail('backup');
      await makeAPlan(page);
      await signUpFromMore(page, main);
      const person = await personOn(page);
      addBackup(person, backup);
      // Sam signs in with Google too (D402).
      sql(`insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
        values (${quoted(`google-${person}`)}, ${quoted(person)},
          jsonb_build_object('sub', ${quoted(`google-${person}`)}, 'email', ${quoted(main)}, 'email_verified', true),
          'google', now(), now());
        update auth.users set raw_app_meta_data = raw_app_meta_data
          || '{"providers": ["email", "google"]}'::jsonb where id = ${quoted(person)};`);
      const before = accountOf(person);
      expect(before).toContain('google:');

      // Another phone, signed out: the main address can't be reached. Its
      // clock is under the test's control, to let 24 hours pass.
      const phone = await secondPhone(browser, info, colorScheme, undefined, DEVICES.iphoneSafari);
      await phone.page.clock.install();
      await phone.page.goto('/get-back-in/');
      await useBackup(phone.page, backup, CODE_SUBJECT);
      const waiting = phone.page.getByTestId('get-back-in-waiting');
      await expect(
        phone.page.getByRole('heading', { level: 1, name: g.waitingHeading }),
      ).toBeVisible();
      await expect(phone.page.getByText(g.waitingPurpose)).toBeVisible();
      await expect(waiting).toContainText(/You can finish from \d{1,2}:\d\d(am|pm) on /);
      await expect(waiting).toContainText(g.thenWhat(backup));
      await expect(waiting).toContainText(g.told);
      await noAxeProblems(phone.page);
      await noSidewaysScroll(phone.page);
      if (shoots(info, colorScheme)) {
        await phone.page.screenshot({ path: `${SCREENS}/waiting-360-light.png`, fullPage: true });
      }

      // Nothing on the account has changed, and the sign-in address is told.
      expect(accountOf(person)).toBe(before);
      await expect.poll(() => countEmails(main, ASKED_SUBJECT), { timeout: 20_000 }).toBe(1);

      // The signed-in phone shows the notice, on every screen, within a minute.
      const notice = page.getByTestId('get-back-in-notice');
      await expect(notice).toBeVisible({ timeout: A_MINUTE });
      await expect(notice.getByRole('heading', { name: n.heading })).toBeVisible();
      await expect(notice).toContainText(/Unless it's stopped, from \d{1,2}:\d\d(am|pm) on /);
      await expect(notice).toContainText(n.whatToDo);
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/notice-360-light.png`, fullPage: true });
      }
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Home', exact: true })
        .click();
      await expect(page.getByTestId('get-back-in-notice')).toBeVisible();

      // "Stop it", on the signed-in phone.
      await notice.getByRole('button', { name: n.stop }).click();
      const stopped = page.getByTestId('get-back-in-stopped');
      await expect(stopped).toContainText(n.stopped);
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/notice-stopped-360-light.png`, fullPage: true });
      }
      await stopped.getByRole('button', { name: n.gotIt }).click();
      await expect(stopped).toBeHidden();
      await expect(page.getByTestId('get-back-in-notice')).toBeHidden();
      await expect.poll(() => countEmails(backup, STOPPED_SUBJECT), { timeout: 20_000 }).toBe(1);
      expect(accountOf(person)).toBe(before);

      // Started again.
      await phone.page.getByRole('button', { name: g.otherEmail }).click();
      aMinuteLater(backup);
      await useBackup(phone.page, backup, CODE_SUBJECT);
      await expect(waiting).toBeVisible();
      await expect(page.getByTestId('get-back-in-notice')).toBeVisible({ timeout: A_MINUTE });
      expect(accountOf(person)).toBe(before);

      // 24 hours pass, for the database and for the phone, and nobody stops it.
      aDayPasses(person);
      await phone.page.clock.fastForward('24:01:00');
      await expect(waiting).toContainText(g.finishNow);
      expect(accountOf(person)).toBe(before);

      // A new code finishes it, and the backup is the address it signs in with.
      const finishing = Date.now() - 1000;
      await waiting.getByRole('button', { name: g.sendFinishCode }).click();
      await expect(phone.page.getByText(g.sent(backup))).toBeVisible();
      await box(phone.page, g.codeLabel).fill(await codeIn(backup, FINISH_SUBJECT, finishing));
      await phone.page.getByRole('button', { name: g.useCode }).click();
      await expect(phone.page.getByText(g.signInNow)).toBeVisible();
      await expect(
        phone.page.getByRole('heading', { level: 1, name: strings.signIn.codeHeading }),
      ).toBeVisible();
      expect(sql(`select email from auth.users where id = ${quoted(person)}`)).toBe(backup);
      expect(
        sql(
          `select email from auth.identities where user_id = ${quoted(person)} and provider = 'email'`,
        ),
      ).toBe(backup);
      // The Google sign-in is removed, and the screen says how to use Google again (D402).
      expect(
        sql(
          `select string_agg(provider, ',') from auth.identities where user_id = ${quoted(person)}`,
        ),
      ).toBe('email');
      expect(
        sql(`select raw_app_meta_data -> 'providers' from auth.users where id = ${quoted(person)}`),
      ).toBe('["email"]');

      // Signing in with the backup address, as usual, brings the plan.
      await box(phone.page, strings.signIn.codeLabel).fill(
        await codeIn(backup, 'Your PrePenny sign-in code', finishing),
      );
      await phone.page
        .getByRole('button', { name: strings.signIn.finishSignIn, exact: true })
        .click();
      await expect(phone.page).toHaveURL(/\/app\/$/);
      await expect(phone.page.getByTestId('balance')).toContainText('£267.54');
      expect(await personOn(phone.page)).toBe(person);
      await openMore(phone.page);
      await expect(phone.page.getByTestId('account')).toContainText(
        strings.account.signedInAs(backup),
      );

      // The old address is told, and the first phone was signed out.
      await expect.poll(() => countEmails(main, CHANGED_SUBJECT), { timeout: 20_000 }).toBe(1);
      await expect(page.getByText(strings.account.signInEnded)).toBeVisible({ timeout: A_MINUTE });
      await phone.context.close();
    });

    test('2. the stop link in the email stops it, once, and does nothing else', async ({
      page,
      browser,
    }, info) => {
      test.slow();
      const main = newEmail('sam');
      const backup = newEmail('backup');
      await makeAPlan(page);
      await signUpFromMore(page, main);
      const person = await personOn(page);
      addBackup(person, backup);
      const before = accountOf(person);

      // Someone with the backup starts getting in, on another phone.
      const phone = await secondPhone(browser, info, colorScheme, undefined, DEVICES.iphoneSafari);
      await phone.page.goto('/get-back-in/');
      await useBackup(phone.page, backup, CODE_SUBJECT);
      await expect(phone.page.getByTestId('get-back-in-waiting')).toBeVisible();
      await expect(page.getByTestId('get-back-in-notice')).toBeVisible({ timeout: A_MINUTE });

      // The link in the email to the sign-in address, opened on a laptop.
      const link = await stopLinkTo(main);
      const laptop = await secondPhone(browser, info, colorScheme, undefined, DEVICES.macSafari);
      await laptop.page.goto(link);
      await expect(laptop.page.getByRole('heading', { level: 1, name: st.heading })).toBeVisible();
      await expect(laptop.page.getByText(st.purpose)).toBeVisible();
      // The token is taken out of the address bar straight away.
      await expect(laptop.page).toHaveURL(/\/stop-get-back-in\/$/);
      // Opening the link stops nothing by itself.
      expect(
        sql(
          `select count(*) from app.get_back_in where person_id = ${quoted(person)} and stopped_at is null`,
        ),
      ).toBe('1');
      await noAxeProblems(laptop.page);
      await noSidewaysScroll(laptop.page);
      if (shoots(info, colorScheme)) {
        await laptop.page.screenshot({
          path: `${SCREENS}/stop-link-360-light.png`,
          fullPage: true,
        });
      }
      // Loaded again, with the token gone from the address, it still works.
      await laptop.page.reload();
      await expect(laptop.page.getByRole('button', { name: st.stop })).toBeVisible();
      await laptop.page.getByRole('button', { name: st.stop }).click();
      await expect(
        laptop.page.getByRole('heading', { level: 1, name: st.stoppedHeading }),
      ).toBeVisible();
      await expect(laptop.page.getByTestId('stop-outcome')).toContainText(st.stopped);
      await noAxeProblems(laptop.page);
      if (shoots(info, colorScheme)) {
        await laptop.page.screenshot({
          path: `${SCREENS}/stop-link-stopped-360-light.png`,
          fullPage: true,
        });
      }
      expect(
        sql(`select stopped_how from app.get_back_in where person_id = ${quoted(person)}`),
      ).toBe('link');
      await expect.poll(() => countEmails(backup, STOPPED_SUBJECT), { timeout: 20_000 }).toBe(1);

      // It did nothing else: nobody signed in or out, nothing changed, and
      // the signed-in phone's notice goes.
      expect(accountOf(person)).toBe(before);
      await expect(page.getByTestId('get-back-in-notice')).toBeHidden({ timeout: A_MINUTE });

      // It works once: opened again from the email, in a new tab.
      const again = await laptop.context.newPage();
      await again.goto(link);
      await again.getByRole('button', { name: st.stop }).click();
      await expect(again.getByTestId('stop-outcome')).toContainText(st.notStopped);
      await noAxeProblems(again);
      // Without the whole link, the page asks for it, and stops nothing.
      const bare = await laptop.context.newPage();
      await bare.goto('/stop-get-back-in/');
      await expect(bare.getByTestId('stop-outcome')).toContainText(st.noLink);
      await expect(bare.getByRole('button', { name: st.stop })).toHaveCount(0);
      expect(accountOf(person)).toBe(before);
      await laptop.context.close();
      await phone.context.close();
    });

    test('3. two-step sign-in still applies after getting back in', async ({
      page,
      browser,
    }, info) => {
      test.slow();
      const main = newEmail('sam');
      const backup = newEmail('backup');
      await makeAPlan(page);
      await signUpFromMore(page, main);
      const person = await personOn(page);
      addBackup(person, backup);
      // Two-step sign-in is on, with an authenticator app whose key the test knows.
      const key = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
      sql(`insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
        values (gen_random_uuid(), ${quoted(person)}, 'PrePenny', 'totp', 'verified', now(), now(), ${quoted(key)})`);

      // Someone with the backup asks to get back in, and 24 hours pass.
      const phone = await secondPhone(browser, info, colorScheme, undefined, DEVICES.iphoneSafari);
      await phone.page.goto('/get-back-in/');
      await useBackup(phone.page, backup, CODE_SUBJECT);
      await expect(phone.page.getByTestId('get-back-in-waiting')).toBeVisible();
      aDayPasses(person);

      // They come back, ask for a code again, and it finishes.
      await phone.page.getByRole('button', { name: g.otherEmail }).click();
      await useBackup(phone.page, backup, FINISH_SUBJECT);
      await expect(phone.page.getByText(g.signInNow)).toBeVisible();
      expect(sql(`select email from auth.users where id = ${quoted(person)}`)).toBe(backup);

      // Signing in with the backup address still needs the authenticator app.
      const signingIn = Date.now() - 60_000;
      await box(phone.page, strings.signIn.codeLabel).fill(
        await codeIn(backup, 'Your PrePenny sign-in code', signingIn),
      );
      await phone.page
        .getByRole('button', { name: strings.signIn.finishSignIn, exact: true })
        .click();
      await expect(
        phone.page.getByRole('heading', { level: 1, name: strings.secondStep.heading }),
      ).toBeVisible();
      expect(
        Number(sql(`select count(*) from auth.mfa_factors where user_id = ${quoted(person)}`)),
      ).toBe(1);
      await noAxeProblems(phone.page);
      await box(phone.page, strings.security.appCodeLabel).fill(appCode(key));
      await phone.page
        .getByRole('button', { name: strings.secondStep.finish, exact: true })
        .click();
      await expect(phone.page).toHaveURL(/\/app\/$/);
      await expect(phone.page.getByTestId('balance')).toContainText('£267.54');
      await phone.context.close();
    });

    test('4. the notice shows within a minute without reloading, even when a request never got an answer and live updates have dropped', async ({
      page,
      browser,
    }, info) => {
      // A slow test's 90 seconds, and the minute it waits on purpose, with
      // live updates cut off (PLAN.md item 71): 66 seconds on its own.
      test.setTimeout(90_000 + A_MINUTE);
      const main = newEmail('sam');
      const backup = newEmail('backup');
      // No live updates on this phone, as when its connection has dropped:
      // only its look every minute can find out (D404).
      await page.routeWebSocket(/\/realtime\//, (socket) => socket.close());
      await makeAPlan(page);
      await signUpFromMore(page, main);
      const person = await personOn(page);
      addBackup(person, backup);
      const before = accountOf(person);

      // The phone's next request to bring the plan down never gets an
      // answer, as when it slept part-way through it (the owner's report).
      let held = 0;
      await page.route('**/rest/v1/rpc/plan_changes', async (route) => {
        held += 1;
        if (held === 1) return;
        await route.continue();
      });
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect.poll(() => held, { message: 'a request left with no answer' }).toBe(1);
      // Anything that loads the page again would lose this.
      await page.evaluate(() => Reflect.set(window, 'notLoadedAgain', true));

      // Someone with the backup starts getting in, on another phone.
      const phone = await secondPhone(browser, info, colorScheme, undefined, DEVICES.iphoneSafari);
      await phone.page.goto('/get-back-in/');
      await useBackup(phone.page, backup, CODE_SUBJECT);
      await expect(phone.page.getByTestId('get-back-in-waiting')).toBeVisible();
      await phone.context.close();

      // The signed-in phone shows the notice by itself: the look every
      // minute, and the time that look takes.
      const notice = page.getByTestId('get-back-in-notice');
      await expect(notice).toBeVisible({ timeout: A_MINUTE + 10_000 });
      await expect(notice.getByRole('heading', { name: n.heading })).toBeVisible();
      expect(await page.evaluate(() => Reflect.get(window, 'notLoadedAgain'))).toBe(true);
      await noAxeProblems(page);

      // "Stop it" works from there, as on any screen.
      await notice.getByRole('button', { name: n.stop }).click();
      await expect(page.getByTestId('get-back-in-stopped')).toContainText(n.stopped);
      expect(accountOf(person)).toBe(before);
    });
  });
}
