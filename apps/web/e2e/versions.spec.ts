// Versions, clocks and a notice for another phone (step 3e), at 320px and
// 360px wide (the sign-in-320 and sign-in-360 projects), in light and dark,
// checked by axe, against the local Supabase.
//
// The owner's test 7: a phone on an old version meets a newer server, and
// updates itself at a safe moment, never with a form half filled in,
// keeping its waiting change; then the plans on both phones agree. The
// phone plays the old version with the tests' own setting (D201,
// lib/test-setting.ts): it says it was built for the database from before
// step 3e, and is on another build, until it has updated itself.
//
// Also D378: a phone an hour fast writes the times inside the plan by the
// server's clock. And PLAN.md item 39: a change replaced after the phone
// that made it signed out is told on another of the person's phones.

import { expect, type Page, test } from '@playwright/test';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { strings } from '../strings/en-GB.ts';
import { named } from './coming-up.ts';
import { settingScript } from './fixtures.ts';
import { addPayment, openHome, undoBar, updateBalance } from './journeys.ts';
import { helperInCharge } from './offline-helper.ts';
import { noAxeProblems } from './setup.ts';
import { makeAPlan, newEmail } from './sign-in-helpers.ts';
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

const a = strings.account;
const c = strings.clash;

test.use({ userAgent: DEVICES.androidChrome });

/** Every file of the app on the phone, so it keeps working with no signal. */
async function readyForNoSignal(page: Page) {
  await helperInCharge(page);
}

/** Moves this phone's clock, as a phone set to the wrong time. */
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

async function allSent(page: Page) {
  await openMore(page);
  await expect(page.getByTestId('where-kept')).toHaveText(a.savedInAccount, { timeout: 20_000 });
}

/** The first payment with this name in Home's next three things due. */
const due = (page: Page, name: string) =>
  page
    .getByTestId('next-due')
    .getByRole('button', { name: named(name) })
    .first();

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Versions, clocks and other phones, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('7. a phone on an old version meets a newer server, updates itself at a safe moment, and keeps its waiting change', async ({
      page,
      context,
      browser,
    }, info) => {
      test.slow();
      const address = newEmail('sam');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      const person = await personOn(page);
      await readyForNoSignal(page);
      const laptop = await secondPhone(browser, info, colorScheme, undefined, DEVICES.macSafari);
      await signIn(laptop.page, address);
      await expect(laptop.page.getByTestId('balance')).toContainText('£267.54');

      // The phone is on the version from before; meanwhile the server is newer.
      await context.setOffline(true);
      await page.addInitScript(settingScript, [
        TEST_SETTING_KEY,
        { version: { database: '20261109100000', build: 'step-3d' } },
      ] as const);
      await page.reload();
      await openHome(page);
      await expect(page.getByTestId('balance')).toContainText('£267.54');

      // A change made on it waits on the phone.
      await updateBalance(page, {
        account: null,
        balance: '250.00',
        expected: '£267.54',
        difference: "That's £17.54 less.",
        toTick: 0,
      });
      // And a form is half filled in, in a sheet left open.
      await openHome(page);
      await page.getByRole('button', { name: 'Update balance', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Update balance' });
      await expect(sheet).toBeVisible();
      await sheet.getByLabel('Type what your bank shows now').fill('24');
      await page.evaluate(() => Reflect.set(window, '__stillTheOldPage', true));

      // The laptop changes the plan on the server meanwhile.
      await addPayment(laptop.page, { name: 'Car MOT', amount: '54.85', date: '2026-11-13' });
      await allSent(laptop.page);

      // The signal comes back. The phone asks the server first: it's told it's
      // out of date, so it sends nothing and brings nothing down, and waits
      // for a safe moment to load the new version.
      await context.setOffline(false);
      await expect(page.getByTestId('update-note')).toHaveText(strings.banners.updated, {
        timeout: 30_000,
      });
      await page.waitForTimeout(3000);
      expect(await page.evaluate(() => Reflect.get(window, '__stillTheOldPage'))).toBe(true);
      await expect(sheet.getByLabel('Type what your bank shows now')).toHaveValue('24');
      expect(
        sql(
          `select count(*) from public.balance_updates where created_by = ${quoted(person)} and balance = 25000`,
        ),
      ).toBe('0');

      // The sheet is closed: that's a safe moment. The phone loads the new
      // version, and sends the change that was waiting.
      await sheet.getByRole('button', { name: strings.sheet.close }).click();
      await expect
        .poll(
          async () => {
            try {
              return await page.evaluate(() => Reflect.get(window, '__stillTheOldPage') ?? false);
            } catch {
              // Asked in the very moment the page loads afresh: not yet.
              return 'loading';
            }
          },
          { timeout: 30_000 },
        )
        .toBe(false);
      await allSent(page);
      expect(
        sql(
          `select count(*) from public.balance_updates where created_by = ${quoted(person)} and balance = 25000`,
        ),
      ).toBe('1');
      await noAxeProblems(page);

      // The plans agree: both phones show the new balance and the laptop's payment.
      for (const phone of [page, laptop.page]) {
        await openHome(phone);
        await expect(phone.getByTestId('balance')).toContainText('£250.00', { timeout: 60_000 });
        await expect(due(phone, 'Car MOT')).toContainText('£54.85');
      }
      await laptop.context.close();
    });

    test("D378: a phone an hour fast writes the times inside the plan by the server's clock", async ({
      page,
    }) => {
      test.slow();
      await wrongClock(page, HOUR);
      await makeAPlan(page);
      await signUpFromMore(page, newEmail('sam'));
      const person = await personOn(page);
      // A balance update, and a payment marked as paid, once the phone has heard the server's time.
      await updateBalance(page, {
        account: null,
        balance: '260.00',
        expected: '£267.54',
        difference: "That's £7.54 less.",
        toTick: 0,
      });
      await addPayment(page, { name: 'Phone bill', amount: '12', date: '2026-10-25' });
      await openHome(page);
      await due(page, 'Phone bill').click();
      const sheet = page.getByRole('dialog', { name: 'Phone bill' });
      await sheet.getByRole('button', { name: 'Mark as paid' }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toBeVisible();
      await allSent(page);
      const behind = (time: string) =>
        Number(sql(`select extract(epoch from now() - ${quoted(time)}::timestamptz)`));
      const checked = sql(
        `select checked_at from public.balance_updates where created_by = ${quoted(person)} and balance = 26000`,
      );
      const ticked = sql(
        `select t.ticked_at from public.ticks t where t.created_by = ${quoted(person)}`,
      );
      // Written within the last few minutes by the server's clock, not an hour ahead of it.
      for (const time of [checked, ticked]) {
        expect(behind(time)).toBeGreaterThan(-60);
        expect(behind(time)).toBeLessThan(300);
      }
    });

    test('item 39: a change replaced after the phone that made it signed out is told on another phone of the same person', async ({
      page,
      browser,
    }, info) => {
      test.slow();
      const address = newEmail('sam');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      await addPayment(page, {
        name: 'Rent',
        amount: '550',
        date: '2026-11-01',
        often: 'Every month, or every few months',
      });
      await allSent(page);
      const iphone = await secondPhone(browser, info, colorScheme, undefined, DEVICES.iphoneSafari);
      await signIn(iphone.page, address);
      await expect(due(iphone.page, 'Rent')).toContainText('£550.00');
      await readyForNoSignal(iphone.page);

      // The iPhone loses its signal. This phone changes Rent, then the iPhone does, later.
      await iphone.context.setOffline(true);
      const change = async (phone: Page, amount: string) => {
        await openHome(phone);
        await due(phone, 'Rent').click();
        const sheet = phone.getByRole('dialog', { name: 'Rent' });
        await sheet.getByLabel('Amount').fill(amount);
        await sheet.getByRole('button', { name: 'Save' }).click();
        await expect(sheet).toBeHidden();
      };
      await change(page, '640');
      await allSent(page);
      await change(iphone.page, '650');

      // This phone signs out before it hears that its change was replaced.
      await openMore(page);
      await page.getByTestId('account').getByRole('button', { name: a.signOut }).click();
      await page
        .getByRole('dialog', { name: a.signOut })
        .getByRole('button', { name: a.signOutConfirm })
        .click();
      await expect(page.getByText(a.signedOut)).toBeVisible();

      // The iPhone's newer change wins when its signal is back.
      await iphone.context.setOffline(false);
      await allSent(iphone.page);

      // On a laptop, the person is told, with the device the replaced change was made on.
      const laptop = await secondPhone(browser, info, colorScheme, undefined, DEVICES.macSafari);
      await signIn(laptop.page, address);
      const told = laptop.page.getByRole('dialog', { name: c.title });
      await expect(told).toBeVisible({ timeout: 30_000 });
      await expect(told).toContainText(
        `${c.elsewhere(c.otherPhone, 'Rent on Sun 1 Nov', 'Chrome on an Android phone')} ${c.kept("Your other phone's")}`.replaceAll(
          ' ',
          ' ',
        ),
      );
      await noAxeProblems(laptop.page);
      await told.getByRole('button', { name: c.gotIt }).click();
      await expect(told).toBeHidden();
      await expect(due(laptop.page, 'Rent')).toContainText('£650.00');
      // The iPhone, whose change it was, isn't told anything.
      await expect(iphone.page.getByRole('dialog', { name: c.title })).toHaveCount(0);
      await iphone.context.close();
      await laptop.context.close();
    });
  });
}
