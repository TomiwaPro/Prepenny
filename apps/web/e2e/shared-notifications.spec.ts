// Notifications in a shared plan (step 4f, brief 4.14, D575 to D581), at
// 320px and 360px wide (the sign-in-320 and sign-in-360 projects), in light
// and dark, checked by axe, against the local Supabase with its reminders
// function. Jess and Tom on two phones, each with a push address at a
// stand-in push service (e2e/push-service.ts); each test starts the real
// function itself with a test clock, as the database's job does every
// minute, and opens what arrives with the phone's own key.
//
// A change's time is when it reached the account, by the server's clock.
// So that each test's times are the same on any day it runs, the changes it
// makes are placed on a day of its own, tomorrow, at UK times (`uk`), and
// the function is started at moments on that day.
//
// 1. Shared warnings to both people; "When Tom changes something", off
//    until each turns it on; one change in Activity's words; changes close
//    together as one; never one's own; quiet hours; hidden amounts; and
//    turning it off and signing out stopping it at once.

import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { layoutProblems } from './coming-up.ts';
import { jessAndTom } from './jess-and-tom.ts';
import { addPayment, noSidewaysScroll } from './journeys.ts';
import { onTheServer, placeChanges, sayDay, serverNow, uk } from './partner-times.ts';
import {
  givePushAddress,
  type PhoneKeys,
  phoneKeys,
  type StandIn,
  signingKeyReady,
  standInPushService,
  startReminders,
  wordsFor,
} from './push-service.ts';
import { noAxeProblems } from './setup.ts';
import { DEVICES, openMore, personOn, quoted, sql } from './two-phones.ts';

const t = strings.reminders;
const SCREENS = '../../docs/screens/4f';

/** True for the one run that saves the screenshots: 360px, light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  colorScheme === 'light' && info.project.name === 'sign-in-360';

/** The test's day: tomorrow, from 10am UK time. */
const at = (minutes: number, seconds = 0) => uk(1, 10, minutes, seconds);

/** Starts the reminders function as the scheduled job does, at a moment, for one person only. */
async function run(person: string, moment: Date | string) {
  const response = await startReminders(
    person,
    typeof moment === 'string' ? moment : moment.toISOString(),
  );
  expect(response.status, 'the reminders function ran').toBe(200);
  const counts = (await response.json()) as { problems: number };
  expect(counts.problems, 'with no problems').toBe(0);
}

async function openReminders(page: Page) {
  await openMore(page);
  await page.getByTestId('reminders-card').getByRole('link', { name: t.more.link }).click();
  await expect(page.getByRole('heading', { level: 1, name: t.heading })).toBeVisible();
}

const box = (page: Page, name: string) => page.getByRole('checkbox', { name, exact: true });

/** Ticks or unticks a choice, and waits for it to be saved. */
async function choose(page: Page, name: string, on: boolean) {
  const tick = box(page, name);
  if (on) await tick.check();
  else await tick.uncheck();
  await expect(page.getByTestId('reminders-said')).toHaveText(t.saved);
  await expect(tick).toBeChecked({ checked: on });
}

/** The words of everything this phone has been sent so far, with plain spaces. */
const bodies = async (service: StandIn, endpoint: string, phone: PhoneKeys) =>
  (await wordsFor(service, endpoint, phone)).map((one) => one.body.replaceAll(' ', ' '));

/** A date as the notification says it, from the test's day. */
const day = (date: string) => sayDay(date, at(0).toISOString());

test.beforeAll(signingKeyReady);

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Notifications in a shared plan, in ${colorScheme} mode`, () => {
    test.use({ userAgent: DEVICES.androidChrome });

    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test("1. shared warnings to both; a partner's changes, on and off, one and many, never one's own, quiet hours, hidden amounts and signing out", async ({
      page,
      browser,
      context,
    }, info) => {
      test.setTimeout(420_000);
      const service = await standInPushService();
      try {
        const jessPhone = await phoneKeys();
        const jessAddress = service.address(`jess-4f-${info.project.name}-${colorScheme}`);
        await givePushAddress(context, jessAddress, jessPhone);
        const tom = await jessAndTom(page, browser, info, colorScheme);
        const tomPhone = await phoneKeys();
        const tomAddress = service.address(`tom-4f-${info.project.name}-${colorScheme}`);
        await givePushAddress(tom.context, tomAddress, tomPhone);
        // Its browser has the push address from the next page it loads.
        await tom.page.reload();
        await expect(tom.page.getByTestId('balance')).toBeVisible();
        const jess = await personOn(page);
        const tomPerson = await personOn(tom.page);
        const toJess = () => bodies(service, jessAddress, jessPhone);
        const toTom = () => bodies(service, tomAddress, tomPhone);

        // In a shared plan, Reminders says what the partner choice does, off at the start.
        await openReminders(page);
        await expect(page.getByText(t.purposeShared('Tom'))).toBeVisible();
        await expect(page.getByText(t.shortfallLineShared('Tom'))).toBeVisible();
        await expect(box(page, t.partner('Tom'))).not.toBeChecked();
        await expect(page.getByText(t.partnerLine('Tom', 'Tom'))).toBeVisible();
        await noSidewaysScroll(page);
        await noAxeProblems(page);

        // Shared warnings: each with "When you'd be short" on is told about
        // the shared account, by its name, in the same words (D580).
        await choose(page, t.shortfall, true);
        await openReminders(tom.page);
        await expect(box(tom.page, t.partner('Jess'))).not.toBeChecked();
        await choose(tom.page, t.shortfall, true);
        await run(jess, '2026-10-26T10:00:00Z');
        await run(tomPerson, '2026-10-26T10:00:00Z');
        const warning = 'Current account will be £282.46 short on Sun 1 Nov.';
        expect(await toJess()).toEqual([warning]);
        expect(await toTom()).toEqual([warning]);
        // Off again, so the rest is about the partner's changes alone.
        await choose(page, t.shortfall, false);
        await choose(tom.page, t.shortfall, false);

        // Each turns "When … changes something" on, on their own phone.
        await choose(page, t.partner('Tom'), true);
        await expect(page.getByTestId('reminders-phone')).toContainText(t.phoneOn);
        await choose(tom.page, t.partner('Jess'), true);
        // Every change from here on is the test's own, placed on its day.
        const from = serverNow();
        expect(
          sql(
            `select string_agg(partner::text, ',' order by person_id) from app.reminder_choices where person_id in (${quoted(jess)}, ${quoted(tomPerson)})`,
          ),
        ).toBe('true,true');
        if (shoots(info, colorScheme)) {
          await page.screenshot({
            path: `${SCREENS}/reminders-shared-360-light.png`,
            fullPage: true,
          });
        }
        await noAxeProblems(page);
        // With text at 200%, nothing is cut off or wider than the screen.
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        expect(await layoutProblems(page)).toEqual([]);
        await page.reload();
        await expect(box(page, t.partner('Tom'))).toBeChecked();

        // One change, 2 minutes after it, in Activity's words, and never to Tom himself.
        await addPayment(tom.page, { name: 'Car MOT', amount: '54.85', date: '2026-11-13' });
        await onTheServer(tomPerson, 'Car MOT');
        placeChanges(tomPerson, from, at(0));
        await run(jess, at(1));
        expect(await toJess()).toHaveLength(1);
        await run(jess, at(2));
        await run(tomPerson, at(2));
        expect(await toJess()).toEqual([
          warning,
          `Tom added Car MOT, −£54.85 on ${day('2026-11-13')}.`,
        ]);
        expect(await toTom()).toEqual([warning]);
        const opened = (await wordsFor(service, jessAddress, jessPhone)).at(-1);
        expect(opened).toMatchObject({
          title: 'PrePenny',
          tag: 'prepenny-partner',
          url: '/app/activity/',
        });
        // Sealed for her phone: its push service sees only a sealed message, all one size.
        const sealed = service.arrived.at(-1);
        expect(sealed?.headers['content-encoding']).toBe('aes128gcm');
        expect(sealed?.body.length).toBe(86 + 2048 + 16);
        expect(Buffer.from(sealed?.body ?? []).toString('latin1')).not.toContain('Car MOT');
        // Never twice.
        await run(jess, at(4));
        expect(await toJess()).toHaveLength(2);

        // Changes close together come as one, once he's stopped for 2 minutes.
        for (const [minute, name, amount, date] of [
          [30, 'Window cleaner', '12', '2026-11-16'],
          [31, 'Gym', '25', '2026-11-17'],
          [32, 'Phone', '30', '2026-11-18'],
        ] as const) {
          await addPayment(tom.page, { name, amount, date });
          await onTheServer(tomPerson, name);
          placeChanges(tomPerson, from, at(minute));
        }
        await run(jess, at(33));
        await run(jess, at(33, 59));
        expect(await toJess()).toHaveLength(2);
        await run(jess, at(34, 30));
        expect((await toJess()).at(-1)).toBe('Tom made 3 changes, including Phone, −£30.00.');
        expect(await toTom()).toEqual([warning]);

        // Jess's own change goes to Tom, never to her.
        await addPayment(page, { name: 'Dentist', amount: '65', date: '2026-11-20' });
        await onTheServer(jess, 'Dentist');
        placeChanges(jess, from, at(40));
        await run(jess, at(43));
        await run(tomPerson, at(43));
        expect(await toJess()).toHaveLength(3);
        expect(await toTom()).toEqual([
          warning,
          `Jess added Dentist, −£65.00 on ${day('2026-11-20')}.`,
        ]);

        // Quiet hours: a change at 9:15pm waits until 8am.
        await addPayment(tom.page, { name: 'Taxi', amount: '15', date: '2026-11-21' });
        await onTheServer(tomPerson, 'Taxi');
        placeChanges(tomPerson, from, uk(1, 21, 15));
        await run(jess, uk(1, 21, 30));
        await run(jess, uk(2, 7, 59));
        expect(await toJess()).toHaveLength(3);
        await run(jess, uk(2, 8, 0));
        expect((await toJess()).at(-1)).toBe(`Tom added Taxi, −£15.00 on ${day('2026-11-21')}.`);

        // Hide amounts in notifications: no amount at all.
        await openReminders(page);
        await choose(page, t.hideAmounts, true);
        await addPayment(tom.page, { name: 'Parking', amount: '8', date: '2026-11-23' });
        await onTheServer(tomPerson, 'Parking');
        placeChanges(tomPerson, from, uk(2, 9, 0));
        await run(jess, uk(2, 9, 3));
        expect((await toJess()).at(-1)).toBe(`Tom added Parking on ${day('2026-11-23')}.`);
        for (const words of await toJess()) expect(words).not.toContain('£8');

        // Turned off, it stops at once: nothing about Lunch.
        await openReminders(page);
        await choose(page, t.partner('Tom'), false);
        await expect(page.getByTestId('reminders-phone')).toContainText(t.phoneAllOff);
        await addPayment(tom.page, { name: 'Lunch', amount: '9', date: '2026-11-24' });
        await onTheServer(tomPerson, 'Lunch');
        placeChanges(tomPerson, from, uk(2, 10, 0));
        await run(jess, uk(2, 10, 3));
        expect(await toJess()).toHaveLength(5);

        // On again: only Tom's changes from then. Then signing out stops them at once.
        await choose(page, t.partner('Tom'), true);
        await addPayment(tom.page, { name: 'Window', amount: '40', date: '2026-11-25' });
        await onTheServer(tomPerson, 'Window');
        placeChanges(tomPerson, from, uk(2, 11, 0));
        await openMore(page);
        await page.getByTestId('account').getByRole('button', { name: 'Sign out' }).click();
        await page
          .getByRole('dialog', { name: 'Sign out' })
          .getByRole('button', { name: 'Sign out', exact: true })
          .click();
        await expect(page.getByRole('button', { name: 'Make my plan' })).toBeVisible();
        expect(
          sql(`select count(*) from app.push_addresses where person_id = ${quoted(jess)}`),
        ).toBe('0');
        await run(jess, uk(2, 11, 3));
        expect(await toJess()).toHaveLength(5);
        await tom.context.close();
      } finally {
        await service.close();
      }
    });
  });
}
