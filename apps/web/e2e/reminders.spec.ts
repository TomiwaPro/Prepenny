// Reminders (step 4e, brief 4.11, D560 to D566), at 320px and 360px wide (the
// sign-in-320 and sign-in-360 projects), in light and dark, checked by axe,
// against the local Supabase with its reminders function.
//
// The phone's browser gets a push address at a stand-in push service here
// (e2e/push-service.ts), and each test starts the reminders function itself
// with a test clock, as the database's scheduled job does every 15 minutes.
// What arrives is opened with the phone's own key: the words the person
// would see, after the real encryption.
//
// 1. Every reminder off at the start; turning each on and off; this phone
//    gets them; the words and times, on the day the clocks go back (Sun 25 Oct
//    2026): the weekly summary at 6pm GMT, not 5pm; the evening one; hiding
//    amounts; a shortfall that appears in quiet hours waits until 8am;
//    turning one off stops it; signing out stops them all, at once.
// 2. Jess and Tom: Tom's reminders never name Jess's private account or its
//    payments; Jess's do.
// 3. On an iPhone in Safari: reminders need PrePenny on the Home Screen, said
//    plainly, with the steps; and signed out, they need an account.

import { randomUUID } from 'node:crypto';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { LOCAL_SUPABASE } from '../lib/sign-in-config.ts';
import { strings } from '../strings/en-GB.ts';
import { layoutProblems } from './coming-up.ts';
import { addAccount, jessAndTom } from './jess-and-tom.ts';
import { addPayment, noSidewaysScroll } from './journeys.ts';
import {
  givePushAddress,
  phoneKeys,
  type StandIn,
  standInPushService,
  UNSUBSCRIBED,
  wordsFor,
} from './push-service.ts';
import { noAxeProblems } from './setup.ts';
import { makeAPlan, newEmail } from './sign-in-helpers.ts';
import {
  DEVICES,
  openMore,
  personOn,
  quoted,
  secondPhone,
  signUpFromMore,
  sql,
} from './two-phones.ts';

const t = strings.reminders;
const SCREENS = '../../docs/screens/4e';

/** True for the one run that saves the screenshots: 360px, light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  colorScheme === 'light' && info.project.name === 'sign-in-360';

/** Starts the reminders function as the scheduled job does, at a test time, for one person only. */
async function runReminders(person: string, at: string) {
  const tick = sql('select tick from app.reminder_server');
  const response = await fetch(`${LOCAL_SUPABASE.url}/functions/v1/reminders`, {
    method: 'POST',
    headers: {
      'x-prepenny-tick': tick,
      'x-prepenny-wait': 'yes',
      'x-prepenny-test-now': at,
      'x-prepenny-test-person': person,
    },
  });
  expect(response.status, 'the reminders function ran').toBe(200);
  const counts = (await response.json()) as { problems: number };
  expect(counts.problems, 'with no problems').toBe(0);
  return counts;
}

/** Sam's example plan on a new phone, so PrePenny's screens open. */
async function lookAtTheExample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Look at an example plan' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByTestId('balance')).toBeVisible();
}

async function openReminders(page: Page) {
  await openMore(page);
  await page.getByTestId('reminders-card').getByRole('link', { name: t.more.link }).click();
  await expect(page.getByRole('heading', { level: 1, name: t.heading })).toBeVisible();
}

const box = (page: Page, name: string) => page.getByRole('checkbox', { name, exact: true });

/** Ticks or unticks a reminder, and waits for it to be saved. */
async function choose(page: Page, name: string, on: boolean) {
  const tick = box(page, name);
  if (on) await tick.check();
  else await tick.uncheck();
  await expect(page.getByTestId('reminders-said')).toHaveText(t.saved);
  await expect(tick).toBeChecked({ checked: on });
}

const choicesOf = (person: string) =>
  sql(
    `select concat_ws(',', payday, evening, shortfall, weekly, hide_amounts) from app.reminder_choices where person_id = ${quoted(person)}`,
  );
const addressesOf = (person: string) =>
  Number(sql(`select count(*) from app.push_addresses where person_id = ${quoted(person)}`));

/** The words of every reminder this phone has been sent so far. */
const bodies = async (
  service: StandIn,
  endpoint: string,
  phone: Awaited<ReturnType<typeof phoneKeys>>,
) => (await wordsFor(service, endpoint, phone)).map((one) => one.body.replaceAll(' ', ' '));

// The function makes PrePenny's signing key the first time it runs, as it
// does when the Database workflow sets it up (README.md, "Reminders"), so a
// phone can be given the public half. Nobody is looked at.
test.beforeAll(async () => {
  await runReminders(randomUUID(), '2026-10-25T12:00:00Z');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Reminders, in ${colorScheme} mode`, () => {
    test.use({ userAgent: DEVICES.androidChrome });

    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('1. each reminder on and off, the words and times across the clock change, quiet hours, hiding amounts and signing out', async ({
      page,
      context,
    }, info) => {
      test.setTimeout(240_000);
      const service = await standInPushService();
      try {
        const phone = await phoneKeys();
        const endpoint = service.address(`sam-${info.project.name}-${colorScheme}`);
        await givePushAddress(context, endpoint, phone);

        // Sam's plan, today Sun 25 Oct 2026, the day the clocks go back:
        // £267.54, Rent £200.00 tomorrow and a phone bill £30.00 on Tuesday.
        await makeAPlan(page);
        await addPayment(page, { name: 'Rent', amount: '200', date: '2026-10-26' });
        await addPayment(page, { name: 'Phone bill', amount: '30', date: '2026-10-27' });
        await signUpFromMore(page, newEmail('sam'));
        const person = await personOn(page);

        // Every reminder is off until it's turned on (D560).
        await openReminders(page);
        await expect(page.getByText(t.purpose)).toBeVisible();
        for (const name of [t.payday, t.evening, t.shortfall, t.weekly, t.hideAmounts]) {
          await expect(box(page, name)).not.toBeChecked();
        }
        await expect(page.getByTestId('reminders-phone')).toContainText(t.phoneAllOff);
        await expect(page.getByText(t.quiet)).toBeVisible();
        await noSidewaysScroll(page);
        await noAxeProblems(page);
        if (shoots(info, colorScheme)) {
          await page.screenshot({ path: `${SCREENS}/reminders-off-360-light.png`, fullPage: true });
        }

        // Each one on, then off again, saved in the account.
        await choose(page, t.payday, true);
        await expect(page.getByTestId('reminders-phone')).toContainText(t.phoneOn);
        expect(addressesOf(person), 'this phone gets them').toBe(1);
        expect(
          sql(`select endpoint from app.push_addresses where person_id = ${quoted(person)}`),
        ).toBe(endpoint);
        await choose(page, t.evening, true);
        await choose(page, t.shortfall, true);
        await choose(page, t.weekly, true);
        expect(choicesOf(person)).toBe('t,t,t,t,f');
        if (shoots(info, colorScheme)) {
          await page.screenshot({ path: `${SCREENS}/reminders-on-360-light.png`, fullPage: true });
        }
        await noAxeProblems(page);
        // With text at 200%, nothing is cut off or wider than the screen.
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        expect(await layoutProblems(page)).toEqual([]);
        await page.reload();
        await expect(box(page, t.payday)).toBeChecked();
        for (const name of [t.payday, t.evening, t.shortfall]) await choose(page, name, false);
        expect(choicesOf(person)).toBe('f,f,f,t,f');
        await choose(page, t.weekly, false);
        expect(choicesOf(person)).toBe('f,f,f,f,f');
        expect(addressesOf(person), 'with every one off, its phones are forgotten').toBe(0);
        await expect(page.getByTestId('reminders-phone')).toContainText(t.phoneAllOff);

        // The weekly summary, on the day the clocks go back: 5pm GMT is not 6pm.
        await choose(page, t.weekly, true);
        await runReminders(person, '2026-10-25T17:00:00Z');
        expect(await bodies(service, endpoint, phone)).toEqual([]);
        await runReminders(person, '2026-10-25T18:00:00Z');
        expect(await bodies(service, endpoint, phone)).toEqual([
          'This week: 2 payments going out, £230.00 in all. Lowest point ahead: £37.54 on Tue 27 Oct.',
        ]);
        // Sealed for this phone: its push service sees only a sealed message, all one size.
        const sealed = service.arrived[0];
        expect(sealed?.headers['content-encoding']).toBe('aes128gcm');
        expect(sealed?.body.length).toBe(86 + 2048 + 16);
        expect(Buffer.from(sealed?.body ?? []).toString('latin1')).not.toContain('Rent');
        expect(String(sealed?.headers.authorization)).toMatch(/^vapid t=/);
        // Never twice.
        await runReminders(person, '2026-10-25T18:15:00Z');
        expect(await bodies(service, endpoint, phone)).toHaveLength(1);

        // The evening before money goes out, at 7pm.
        await choose(page, t.evening, true);
        await runReminders(person, '2026-10-25T19:00:00Z');
        expect((await bodies(service, endpoint, phone)).at(-1)).toBe(
          "Rent goes out tomorrow. You'll have £67.54 left.",
        );

        // Amounts hidden: Monday evening, the phone bill on Tuesday.
        await choose(page, t.hideAmounts, true);
        await runReminders(person, '2026-10-26T19:00:00Z');
        expect((await bodies(service, endpoint, phone)).at(-1)).toBe(
          'Phone bill goes out tomorrow.',
        );

        // A shortfall that appears in quiet hours waits until 8am: £100.00 on
        // Wednesday takes the account to −£62.46.
        await choose(page, t.shortfall, true);
        await addPayment(page, { name: 'Repairs', amount: '100', date: '2026-10-28' });
        await expect
          .poll(() =>
            sql(
              `select count(*) from public.series s join public.plan_members m on m.plan_id = s.plan_id where m.person_id = ${quoted(person)} and s.name = 'Repairs'`,
            ),
          )
          .toBe('1');
        const before = (await bodies(service, endpoint, phone)).length;
        await runReminders(person, '2026-10-26T21:30:00Z');
        await runReminders(person, '2026-10-27T07:59:00Z');
        expect(await bodies(service, endpoint, phone)).toHaveLength(before);
        await runReminders(person, '2026-10-27T08:00:00Z');
        expect((await bodies(service, endpoint, phone)).at(-1)).toBe(
          "You'll be short on Wed 28 Oct.",
        );
        // One a day at most: the day-before warning at 9am isn't another.
        await runReminders(person, '2026-10-27T09:00:00Z');
        expect(await bodies(service, endpoint, phone)).toHaveLength(before + 1);

        // Turning one off stops it straight away: no evening reminder for Wednesday's repairs.
        await openReminders(page);
        await choose(page, t.evening, false);
        await runReminders(person, '2026-10-27T19:00:00Z');
        expect(await bodies(service, endpoint, phone)).toHaveLength(before + 1);

        // Signing out stops them all, at once: the phone forgets its address
        // with PrePenny's server and with its browser.
        await page.evaluate(() => {
          window.name = '';
        });
        await openMore(page);
        await page.getByTestId('account').getByRole('button', { name: 'Sign out' }).click();
        await page
          .getByRole('dialog', { name: 'Sign out' })
          .getByRole('button', { name: 'Sign out', exact: true })
          .click();
        await expect(page.getByRole('button', { name: 'Make my plan' })).toBeVisible();
        expect(addressesOf(person)).toBe(0);
        expect(await page.evaluate(() => window.name)).toBe(UNSUBSCRIBED);
        await runReminders(person, '2026-11-01T08:00:00Z');
        expect(await bodies(service, endpoint, phone)).toHaveLength(before + 1);
      } finally {
        await service.close();
      }
    });

    test("2. a partner's reminders never name the other's private account", async ({
      page,
      browser,
      context,
    }, info) => {
      test.setTimeout(300_000);
      const service = await standInPushService();
      try {
        const jessPhone = await phoneKeys();
        const jessAddress = service.address(`jess-${info.project.name}-${colorScheme}`);
        await givePushAddress(context, jessAddress, jessPhone);
        const tom = await jessAndTom(page, browser, info, colorScheme);
        const tomPhone = await phoneKeys();
        const tomAddress = service.address(`tom-${info.project.name}-${colorScheme}`);
        await givePushAddress(tom.context, tomAddress, tomPhone);
        // Its browser has the push address from the next page it loads.
        await tom.page.reload();
        await expect(tom.page.getByTestId('balance')).toBeVisible();

        // Jess's own account, private to her, with her gym tomorrow; and a
        // phone bill tomorrow from the shared current account.
        await addAccount(page, 'Jess own', '100');
        await addPayment(page, {
          name: 'Gym',
          amount: '35',
          date: '2026-10-26',
          account: 'Jess own',
        });
        await addPayment(page, {
          name: 'Phone bill',
          amount: '30',
          date: '2026-10-26',
          account: 'Current account',
        });
        const jess = await personOn(page);
        const tomPerson = await personOn(tom.page);
        await expect
          .poll(() =>
            sql(
              `select count(*) from public.series s join public.plan_members m on m.plan_id = s.plan_id where m.person_id = ${quoted(jess)} and s.name in ('Gym', 'Phone bill')`,
            ),
          )
          .toBe('2');

        for (const [who, pagePhone] of [
          [jess, page],
          [tomPerson, tom.page],
        ] as const) {
          await openReminders(pagePhone);
          await choose(pagePhone, t.evening, true);
          await runReminders(who, '2026-10-25T19:00:00Z');
        }
        const toTom = await bodies(service, tomAddress, tomPhone);
        expect(toTom).toEqual(["Phone bill goes out tomorrow. You'll have £237.54 left."]);
        for (const words of toTom) expect(words).not.toMatch(/Gym|Jess own|£100|£35/);
        expect(await bodies(service, jessAddress, jessPhone)).toEqual([
          'Gym and 1 more go out tomorrow. Jess own will have £65.00 left.',
        ]);
        await noAxeProblems(tom.page);
        await tom.context.close();
      } finally {
        await service.close();
      }
    });

    test('3. on an iPhone in Safari, reminders need PrePenny on the Home Screen; signed out, an account', async ({
      browser,
      page,
    }, info) => {
      const iphone = await secondPhone(browser, info, colorScheme, undefined, DEVICES.iphoneSafari);
      await lookAtTheExample(iphone.page);
      await iphone.page.goto('/app/reminders/');
      await expect(iphone.page.getByRole('heading', { level: 1, name: t.heading })).toBeVisible();
      const needs = iphone.page.getByTestId('reminders-needs');
      await expect(needs).toHaveText(new RegExp(t.iphone));
      await expect(iphone.page.getByRole('checkbox')).toHaveCount(0);
      await noSidewaysScroll(iphone.page);
      await noAxeProblems(iphone.page);
      if (shoots(info, colorScheme)) {
        await iphone.page.screenshot({
          path: `${SCREENS}/reminders-iphone-360-light.png`,
          fullPage: true,
        });
      }
      await needs.getByRole('link', { name: t.iphoneSteps }).click();
      await expect(iphone.page).toHaveURL(/\/app\/home-screen\/$/);
      await expect(
        iphone.page.getByText('Open as Web App', { exact: false }).first(),
      ).toBeVisible();
      await iphone.context.close();

      // On Android, signed out: an account first, with the way to get one.
      await lookAtTheExample(page);
      await page.goto('/app/reminders/');
      const signedOut = page.getByTestId('reminders-needs');
      await expect(signedOut).toContainText(t.signedOut);
      await expect(signedOut.getByRole('link', { name: t.signIn })).toHaveAttribute(
        'href',
        '/sign-in/?to=sign-up&from=more',
      );
      await noAxeProblems(page);
    });
  });
}
