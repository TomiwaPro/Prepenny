// Offline changes and clashes (step 3d, D59), at 320px and 360px wide (the
// sign-in-320 and sign-in-360 projects), in light and dark, checked by axe,
// against the local Supabase with two phones. Start it first (README.md, "Checks").
//
// The owner's six tests:
// 1. Phone offline: three changes, then back online: all three arrive on the
//    other phone, in order.
// 2. Both phones change the same payment while one is offline: the newest
//    wins, the other phone shows the message, and "Put mine back" works.
//    For one person's two phones ("your other phone"), for two people in a
//    shared plan, by name, and when the other phone removed the payment;
//    and when they changed different parts of it, both are kept.
// 3. A wrong phone clock, an hour fast or a day slow, doesn't decide who wins.
// 4. The same change sent twice after a dropped signal changes nothing.
// 5. A refused change: the person is told, and nothing after it is lost.
// 6. Signing out with changes still waiting: the warning appears, and
//    they're sent first when the signal is there.

import { randomUUID } from 'node:crypto';
import { type Browser, expect, type Page, type TestInfo, test } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { named, openPeriod, rowIn } from './coming-up.ts';
import { addPayment, comingUp, openHome, undoBar, updateBalance } from './journeys.ts';
import { noAxeProblems } from './setup.ts';
import { makeAPlan, newEmail } from './sign-in-helpers.ts';
import {
  accountFor,
  openMore,
  personOn,
  quoted,
  secondPhone,
  signIn,
  signUpFromMore,
  sql,
} from './two-phones.ts';

const t = strings.account;
const c = strings.clash;
/** Dates are joined with non-breaking spaces, so they never split across two lines. */
const words = (text: string | null) => (text ?? '').replaceAll(' ', ' ');
const SCREENS = '../../docs/screens/3d';

/** True for the one run that saves the screenshots: 360px, light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  colorScheme === 'light' && info.project.name === 'sign-in-360';

/** Every file of the app on the phone, so it keeps working with no signal (e2e/offline.spec.ts). */
async function readyForNoSignal(page: Page) {
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 30_000,
    })
    .toBe(true);
}

/** Moves this phone's clock, as a phone set to the wrong time: `ms` ahead, or behind when below 0. */
async function wrongClock(page: Page, ms: number) {
  await page.addInitScript((shift: number) => {
    const RealDate = Date;
    class PhoneDate extends RealDate {
      constructor(...args: unknown[]) {
        super(...((args.length === 0 ? [RealDate.now() + shift] : args) as [number]));
      }
      static override now() {
        return RealDate.now() + shift;
      }
    }
    Reflect.set(window, 'Date', PhoneDate);
  }, ms);
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Rent, £550 on the 1st of each month from Sun 1 Nov, added from Home. */
async function addRent(page: Page) {
  await addPayment(page, {
    name: 'Rent',
    amount: '550',
    date: '2026-11-01',
    often: 'Every month, or every few months',
  });
}

/** Every payment with this name in Home's next three things due. */
const allDue = (page: Page, name: string) =>
  page.getByTestId('next-due').getByRole('button', { name: named(name) });
/** The first of them: Rent on Sun 1 Nov. */
const due = (page: Page, name: string) => allDue(page, name).first();

/** Changes a payment in Home's next three things due, just this one. */
async function changeOnHome(page: Page, name: string, amount: string) {
  await openHome(page);
  await due(page, name).click();
  const sheet = page.getByRole('dialog', { name });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Amount').fill(amount);
  await expect(sheet.getByRole('radio', { name: 'Just this one' })).toBeChecked();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(undoBar(page)).toContainText(`${name} changed for just this one.`);
}

/** Waits until nothing on this phone is waiting to be sent. */
async function allSent(page: Page) {
  await openMore(page);
  await expect(page.getByTestId('where-kept')).toHaveText(t.savedInAccount, { timeout: 20_000 });
}

/** The clash sheet, once it has opened by itself. */
async function clashSheet(page: Page, title: string = c.title) {
  const sheet = page.getByRole('dialog', { name: title });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  return sheet;
}

/**
 * Sam's two phones, both signed in with the same plan, Rent on it. The
 * first is ready to work with no signal.
 */
async function samsTwoPhones(
  page: Page,
  browser: Browser,
  info: TestInfo,
  colorScheme: 'light' | 'dark',
  options: { readonly secondClock?: number } = {},
) {
  const address = newEmail('sam');
  await makeAPlan(page);
  await signUpFromMore(page, address);
  await readyForNoSignal(page);
  await addRent(page);
  await allSent(page);
  const second = await secondPhone(browser, info, colorScheme);
  if (options.secondClock !== undefined) await wrongClock(second.page, options.secondClock);
  await signIn(second.page, address);
  await expect(second.page).toHaveURL(/\/app\/$/);
  await expect(due(second.page, 'Rent')).toContainText('£550.00');
  await readyForNoSignal(second.page);
  return { address, second, person: await personOn(page) };
}

/** The amount Rent on Sun 1 Nov has on the server, from its one-off change, or null. */
function rentOnServer(person: string): string | null {
  const found =
    sql(`select c.amount from public.payment_changes c join public.series s on s.id = c.series_id
    where s.created_by = ${quoted(person)} and s.name = 'Rent' and c.original_date = '2026-11-01' and not c.deleted`);
  return found === '' ? null : found;
}

/**
 * Jess's plan with a joint account Tom is in: Jess signs up, shares "Joint
 * bills" with "Joint rent" (sharing on screen comes in step 3f), and Tom
 * joins with `role` (invites are step 3f). Both have nicknames.
 */
async function jessAndTom(
  page: Page,
  browser: Browser,
  info: TestInfo,
  colorScheme: 'light' | 'dark',
  role: 'editor' | 'viewer',
) {
  const jessAddress = newEmail('jess');
  await makeAPlan(page);
  await signUpFromMore(page, jessAddress);
  await readyForNoSignal(page);
  const jess = await personOn(page);
  const plan = sql(`select id from public.plans where owner = ${quoted(jess)}`);
  const joint = randomUUID();
  const rent = randomUUID();
  sql(`
    begin;
    select set_config('request.jwt.claims', json_build_object('sub', ${quoted(jess)}, 'role', 'authenticated',
      'session_id', (select id from auth.sessions where user_id = ${quoted(jess)} order by created_at desc limit 1))::text, true);
    insert into public.accounts (id, plan_id, name, kind, warning_level, list_order)
      values (${quoted(joint)}, ${quoted(plan)}, 'Joint bills', 'joint', 2000, 1);
    insert into public.balance_updates (id, plan_id, account_id, balance, checked_on, checked_at, list_order)
      values (${quoted(randomUUID())}, ${quoted(plan)}, ${quoted(joint)}, 180000, '2026-10-25', '2026-10-25T09:00:00Z', 1);
    insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule, end_rule,
      holiday_rule, family_id, family_created_at, list_order)
      values (${quoted(rent)}, ${quoted(plan)}, ${quoted(joint)}, 'Joint rent', 'out', 'rent', 110000, '2026-11-01',
      '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}', '{"kind":"never"}', 'keep', ${quoted(rent)},
      '2026-10-25T08:31:00Z', 9);
    commit;`);
  const tomAddress = newEmail('tom');
  const tomId = await accountFor(tomAddress);
  sql(`insert into public.people (id, nickname) values (${quoted(tomId)}, 'Tom') on conflict (id) do update set nickname = 'Tom';
    update public.people set nickname = 'Jess' where id = ${quoted(jess)};
    insert into public.plan_members (plan_id, person_id, role) values (${quoted(plan)}, ${quoted(tomId)}, ${quoted(role)});`);
  // Jess's phone brings the joint account down, with Tom's nickname.
  await page.goto('/app/');
  await comingUp(page, 'Joint bills');
  const tom = await secondPhone(browser, info, colorScheme);
  await signIn(tom.page, tomAddress);
  await expect(tom.page).toHaveURL(/\/app\/$/);
  await expect(due(tom.page, 'Joint rent')).toContainText('£1,100.00');
  await readyForNoSignal(tom.page);
  return { jess, tom, plan, rent, tomId };
}

/** Jess changes Joint rent on Sun 1 Nov, just this one, from Coming up. */
async function changeJointRent(page: Page, amount: string) {
  await comingUp(page, 'Joint bills');
  await openPeriod(page, '2026-11-01');
  await rowIn(page, '2026-11-01', 'Joint rent').first().click();
  const sheet = page.getByRole('dialog', { name: 'Joint rent' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Amount').fill(amount);
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(undoBar(page)).toContainText('Joint rent changed for just this one.');
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Offline changes and clashes, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('1. three changes with no signal wait on the phone, then arrive on the other phone in order', async ({
      page,
      context,
      browser,
    }, info) => {
      test.slow();
      const { second, person } = await samsTwoPhones(page, browser, info, colorScheme);

      await context.setOffline(true);
      await updateBalance(page, {
        account: null,
        balance: '250.00',
        expected: '£267.54',
        difference: "That's £17.54 less.",
        toTick: 0,
      });
      await addPayment(page, { name: 'Car MOT', amount: '54.85', date: '2026-10-26' });
      await changeOnHome(page, 'Rent', '560');
      await expect(page.getByTestId('offline-note')).toHaveText(strings.banners.offlineSending);
      // More says how many are waiting, in plain words.
      await openMore(page);
      await expect(page.getByTestId('where-kept')).toHaveText(t.unsent(3));
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await page.getByTestId('account').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SCREENS}/more-changes-waiting-360-light.png` });
      }

      await context.setOffline(false);
      await allSent(page);
      // All three reach the other phone, left open on Home.
      await expect(second.page.getByTestId('balance')).toContainText('£250.00', {
        timeout: 20_000,
      });
      await expect(due(second.page, 'Car MOT')).toContainText('£54.85');
      await expect(due(second.page, 'Rent')).toContainText('£560.00');
      // In the order they were made.
      const kinds = sql(`select string_agg(kind, ',' order by saved_at) from public.edits
        where person_id = ${quoted(person)} and kind in ('update-balance', 'add-payment', 'just-this-one')
          and saved_at > (select max(saved_at) from public.edits where person_id = ${quoted(person)} and kind = 'first-copy')`);
      expect(kinds).toBe('add-payment,update-balance,add-payment,just-this-one');
      const made = sql(`select string_agg(made_at, ',' order by saved_at) from public.edits
        where person_id = ${quoted(person)} and kind <> 'first-copy'`).split(',');
      expect([...made].sort()).toEqual(made);
      await noAxeProblems(second.page);
      await second.context.close();
    });

    test('2. the same payment changed on two phones, one offline: the newest wins, the other phone is told, and "Put mine back" works', async ({
      page,
      context,
      browser,
    }, info) => {
      test.slow();
      const { second, person } = await samsTwoPhones(page, browser, info, colorScheme);

      // This phone, with no signal, changes Rent first...
      await context.setOffline(true);
      await changeOnHome(page, 'Rent', '640');
      // ...then the other phone, with a signal, changes it after.
      await changeOnHome(second.page, 'Rent', '650');
      await allSent(second.page);
      await openHome(second.page);

      // Back online: the other phone's change is newer, so it's kept, and this phone is told.
      await context.setOffline(false);
      const sheet = await clashSheet(page);
      await expect(sheet.getByText(c.purpose)).toBeVisible();
      expect(words(await sheet.getByTestId('clash-message').textContent())).toBe(
        "Your other phone changed Rent on Sun 1 Nov to £650 after you changed it to £640 on this phone. Your other phone's change is kept.",
      );
      await expect(sheet.getByRole('button', { name: c.putBack })).toBeVisible();
      await expect(
        sheet.getByRole('button', { name: "Keep your other phone's change" }),
      ).toBeVisible();
      expect(rentOnServer(person)).toBe('65000');
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/clash-your-other-phone-360-light.png` });
      }

      // One tap puts it back: this phone, then the other, show £640.
      await sheet.getByRole('button', { name: c.putBack }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText(c.putBackDone);
      await openHome(page);
      await expect(due(page, 'Rent')).toContainText('£640.00');
      await expect(due(second.page, 'Rent')).toContainText('£640.00', { timeout: 20_000 });
      await allSent(page);
      expect(rentOnServer(person)).toBe('64000');
      // The other phone isn't told anything: the change put back was made after it saw its own.
      await expect(second.page.getByRole('dialog', { name: c.title })).toHaveCount(0);
      await second.context.close();
    });

    test('2, for two people: the newer change, made offline, wins; the partner is told by name, and puts theirs back', async ({
      page,
      context,
      browser,
    }, info) => {
      test.slow();
      const { tom, plan } = await jessAndTom(page, browser, info, colorScheme, 'editor');

      // Jess has no signal. Tom changes Joint rent first; Jess, still offline, after him.
      await context.setOffline(true);
      await changeOnHome(tom.page, 'Joint rent', '1150');
      await allSent(tom.page);
      await openHome(tom.page);
      await changeJointRent(page, '1200');

      // Jess's signal comes back: hers is newer, so it's kept, and Tom is told.
      await context.setOffline(false);
      await allSent(page);
      const sheet = await clashSheet(tom.page);
      expect(words(await sheet.getByTestId('clash-message').textContent())).toBe(
        "Jess changed Joint rent on Sun 1 Nov to £1,200 after you changed it to £1,150. Jess's change is kept.",
      );
      await expect(sheet.getByRole('button', { name: "Keep Jess's change" })).toBeVisible();
      await expect(due(tom.page, 'Joint rent')).toContainText('£1,200.00');
      // Nothing of Jess's private account is in Tom's message, or anywhere on his phone.
      await expect(sheet).not.toContainText('Current account');
      const kept = await tom.page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('prepenny');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const all: unknown[] = [];
        for (const store of Array.from(db.objectStoreNames)) {
          all.push(
            await new Promise<unknown[]>((resolve, reject) => {
              const got = db.transaction(store).objectStore(store).getAll();
              got.onsuccess = () => resolve(got.result);
              got.onerror = () => reject(got.error);
            }),
          );
        }
        db.close();
        return JSON.stringify(all);
      });
      expect(kept).not.toContain('Current account');
      expect(kept).not.toContain('26754');
      await noAxeProblems(tom.page);
      if (shoots(info, colorScheme)) {
        await tom.page.screenshot({ path: `${SCREENS}/clash-partner-360-light.png` });
      }
      // Jess isn't told anything: her change was kept.
      await expect(page.getByRole('dialog', { name: c.title })).toHaveCount(0);

      // Tom puts his back, and Jess sees it.
      await sheet.getByRole('button', { name: c.putBack }).click();
      await expect(sheet).toBeHidden();
      await expect(due(tom.page, 'Joint rent')).toContainText('£1,150.00');
      await allSent(tom.page);
      await comingUp(page, 'Joint bills');
      await openPeriod(page, '2026-11-01');
      await expect(rowIn(page, '2026-11-01', 'Joint rent').first()).toContainText('£1,150.00', {
        timeout: 20_000,
      });
      expect(
        sql(`select amount from public.payment_changes where plan_id = ${quoted(plan)}
          and original_date = '2026-11-01' and not deleted`),
      ).toBe('115000');
      await tom.context.close();
    });

    test("2, when the other phone removed the payment: this phone's change can't be made, and it says so", async ({
      page,
      context,
      browser,
    }, info) => {
      test.slow();
      const { second, person } = await samsTwoPhones(page, browser, info, colorScheme);
      await context.setOffline(true);
      await changeOnHome(page, 'Rent', '640');
      await openHome(second.page);
      await due(second.page, 'Rent').click();
      const remove = second.page.getByRole('dialog', { name: 'Rent' });
      await remove.getByRole('button', { name: 'Skip this one' }).click();
      await expect(undoBar(second.page)).toContainText('Rent skipped.');
      await allSent(second.page);

      await context.setOffline(false);
      const sheet = await clashSheet(page);
      expect(words(await sheet.getByTestId('clash-message').textContent())).toBe(
        "Your other phone removed Rent on Sun 1 Nov, so your change to it can't be made. Make it again if you still want it.",
      );
      await expect(sheet.getByRole('button', { name: c.putBack })).toHaveCount(0);
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/clash-removed-360-light.png` });
      }
      await sheet.getByRole('button', { name: c.gotIt }).click();
      await expect(sheet).toBeHidden();
      expect(
        sql(`select skipped from public.payment_changes c join public.series s on s.id = c.series_id
          where s.created_by = ${quoted(person)} and c.original_date = '2026-11-01'`),
      ).toBe('t');
      await allSent(page);
      await second.context.close();
    });

    test('2, when the two phones changed different parts of the same payment: both are kept, on both phones, and nobody is told', async ({
      page,
      context,
      browser,
    }, info) => {
      test.slow();
      const { second, person } = await samsTwoPhones(page, browser, info, colorScheme);
      // This phone, with no signal, changes Rent's amount; the other moves it to Mon 2 Nov.
      await context.setOffline(true);
      await changeOnHome(page, 'Rent', '640');
      await openHome(second.page);
      await due(second.page, 'Rent').click();
      const move = second.page.getByRole('dialog', { name: 'Rent' });
      await move.getByLabel('Date', { exact: true }).fill('2026-11-02');
      await move.getByRole('button', { name: 'Save' }).click();
      await expect(move).toBeHidden();
      await allSent(second.page);

      await context.setOffline(false);
      await allSent(page);
      // Both phones show both: £640 on Mon 2 Nov.
      await openHome(page);
      await expect(due(page, 'Rent')).toContainText('Mon 2 Nov');
      await expect(due(page, 'Rent')).toContainText('£640.00');
      await openHome(second.page);
      await expect(due(second.page, 'Rent')).toContainText('£640.00', { timeout: 20_000 });
      await expect(due(second.page, 'Rent')).toContainText('Mon 2 Nov');
      expect(rentOnServer(person)).toBe('64000');
      await expect(page.getByRole('dialog', { name: c.title })).toHaveCount(0);
      await expect(second.page.getByRole('dialog', { name: c.title })).toHaveCount(0);
      await noAxeProblems(page);
      await second.context.close();
    });

    for (const [clock, ms] of [
      ['an hour fast', HOUR],
      ['a day slow', -DAY],
    ] as const) {
      test(`3. a phone ${clock} doesn't decide who wins: the change made last does`, async ({
        page,
        context,
        browser,
      }) => {
        test.slow();
        // This phone's clock is wrong from the start.
        await wrongClock(page, ms);
        const info = test.info();
        const { second, person } = await samsTwoPhones(page, browser, info, colorScheme);
        await context.setOffline(true);
        if (ms > 0) {
          // An hour fast: its change is made first, though its clock says an hour later.
          await changeOnHome(page, 'Rent', '640');
          await changeOnHome(second.page, 'Rent', '650');
          await allSent(second.page);
          await openHome(second.page);
          await context.setOffline(false);
          const sheet = await clashSheet(page);
          await expect(sheet.getByTestId('clash-message')).toContainText(
            "Your other phone's change is kept.",
          );
          expect(rentOnServer(person)).toBe('65000');
        } else {
          // A day slow: its change is made last, though its clock says a day earlier.
          await changeOnHome(second.page, 'Rent', '650');
          await allSent(second.page);
          await openHome(second.page);
          await changeOnHome(page, 'Rent', '640');
          await context.setOffline(false);
          await allSent(page);
          expect(rentOnServer(person)).toBe('64000');
          // The other phone, whose change was replaced, is told.
          const sheet = await clashSheet(second.page);
          expect(words(await sheet.getByTestId('clash-message').textContent())).toBe(
            "Your other phone changed Rent on Sun 1 Nov to £640 after you changed it to £650 on this phone. Your other phone's change is kept.",
          );
          // Its change was saved with the time it was really made, not its clock's.
          const made = sql(`select made_at from public.edits where person_id = ${quoted(person)}
            and kind = 'just-this-one' order by saved_at desc limit 1`);
          expect(Math.abs(Date.parse(made) - Date.now())).toBeLessThan(5 * 60_000);
        }
        await second.context.close();
      });
    }

    test('4. the same change sent twice after a dropped signal changes nothing', async ({
      page,
      browser,
    }, info) => {
      test.slow();
      const { second, person } = await samsTwoPhones(page, browser, info, colorScheme);
      // The first save reaches the server, but its answer is lost on the way back.
      const sent: string[] = [];
      let dropped = false;
      await page.route('**/rest/v1/rpc/save_edit', async (route) => {
        const body = route.request().postDataJSON() as { edit: string; kind: string };
        if (body.kind !== 'add-payment') return route.continue();
        sent.push(body.edit);
        if (dropped) return route.continue();
        dropped = true;
        await route.fetch();
        await route.abort('connectionreset');
      });
      await addPayment(page, { name: 'Car MOT', amount: '54.85', date: '2026-10-26' });
      await expect.poll(() => sent.length).toBe(1);
      expect(
        Number(sql(`select count(*) from public.edits where id = ${quoted(sent[0] ?? '')}`)),
      ).toBe(1);
      // The phone doesn't know it arrived, so it sends it again when it next looks.
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await allSent(page);
      expect(sent).toHaveLength(2);
      expect(sent[1]).toBe(sent[0]);
      // Nothing changed the second time: one edit, one Car MOT, saved once.
      expect(
        Number(sql(`select count(*) from public.edits where id = ${quoted(sent[0] ?? '')}`)),
      ).toBe(1);
      expect(
        sql(`select count(*) || ',' || max(version) from public.series
          where created_by = ${quoted(person)} and name = 'Car MOT'`),
      ).toBe('1,1');
      await expect(allDue(second.page, 'Car MOT')).toHaveCount(1, { timeout: 20_000 });
      await openHome(page);
      await expect(allDue(page, 'Car MOT')).toHaveCount(1);
      await expect(page.getByRole('dialog', { name: c.title })).toHaveCount(0);
      await noAxeProblems(page);
      await second.context.close();
    });

    test('5. a change the account refuses is taken off with a plain message, and nothing after it is lost', async ({
      page,
      browser,
    }, info) => {
      test.slow();
      // Tom can only view Jess's plan, so the server refuses his change to Joint rent.
      const { tom, plan, tomId } = await jessAndTom(page, browser, info, colorScheme, 'viewer');
      await tom.context.setOffline(true);
      await changeOnHome(tom.page, 'Joint rent', '1000');
      // His own pay into the joint account, which he may add (D311), made after it.
      await addPayment(tom.page, {
        kind: 'Coming in',
        name: 'Tom pay',
        amount: '1800',
        date: '2026-10-30',
        type: 'Pay',
      });
      await tom.context.setOffline(false);

      const sheet = await clashSheet(tom.page, c.refusedTitle);
      await expect(sheet.getByText(c.refusedPurpose)).toBeVisible();
      expect(words(await sheet.getByTestId('clash-message').textContent())).toBe(
        "Your change to Joint rent on Sun 1 Nov wasn't saved in your account, so it has been taken off this phone. You can look at this plan but not change it.",
      );
      await noAxeProblems(tom.page);
      if (shoots(info, colorScheme)) {
        await tom.page.screenshot({ path: `${SCREENS}/change-refused-360-light.png` });
      }
      await sheet.getByRole('button', { name: c.gotIt }).click();
      await expect(sheet).toBeHidden();
      // Taken off this phone: Joint rent is as the account has it, and Tom's pay went.
      await openHome(tom.page);
      await expect(due(tom.page, 'Joint rent')).toContainText('£1,100.00');
      await allSent(tom.page);
      expect(
        sql(`select count(*) from public.series where plan_id = ${quoted(plan)} and name = 'Tom pay'
          and paid_to = ${quoted(tomId)}`),
      ).toBe('1');
      expect(
        sql(`select count(*) from public.payment_changes where plan_id = ${quoted(plan)}`),
      ).toBe('0');
      // Seen once, it isn't shown again.
      await tom.page.reload();
      await openHome(tom.page);
      await expect(tom.page.getByRole('dialog', { name: c.refusedTitle })).toHaveCount(0);
      await tom.context.close();
    });

    test('6. signing out with changes waiting: the warning appears, and they are sent first when the signal is there', async ({
      page,
      context,
      browser,
    }, info) => {
      test.slow();
      const { second, address } = await samsTwoPhones(page, browser, info, colorScheme);
      await second.context.close();
      await context.setOffline(true);
      await changeOnHome(page, 'Rent', '575');
      await addPayment(page, { name: 'Car MOT', amount: '54.85', date: '2026-10-26' });
      await openMore(page);
      await expect(page.getByTestId('where-kept')).toHaveText(t.unsent(2));
      await page.getByTestId('account').getByRole('button', { name: 'Sign out' }).click();
      const sheet = page.getByRole('dialog', { name: 'Sign out' });
      await expect(sheet.getByTestId('unsent-warning')).toHaveText(t.signOutUnsent(2));
      await noAxeProblems(page);

      // The signal is back: they're sent first, then the phone signs out.
      await context.setOffline(false);
      await sheet.getByRole('button', { name: t.signOutWhenSent(false) }).click();
      await expect(page.getByRole('status').filter({ hasText: t.signedOut })).toBeVisible({
        timeout: 30_000,
      });
      // Both reached the account.
      const third = await secondPhone(browser, info, colorScheme);
      await signIn(third.page, address);
      await expect(due(third.page, 'Rent')).toContainText('£575.00');
      await expect(due(third.page, 'Car MOT')).toContainText('£54.85');
      await third.context.close();
    });
  });
}
