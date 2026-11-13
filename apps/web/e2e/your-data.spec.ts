// Download my data, import a backup and delete my account (step 3h, brief
// 4.12, 4.13, 7.2), at 320px and 360px wide (the sign-in-320 and
// sign-in-360 projects), in light and dark, checked by axe, against the
// local Supabase with its test inbox. Start it first (README.md, "Checks").
//
// The owner's tests:
// 1. Download both formats: a spreadsheet and a backup, with the plan, the
//    account and its history, and nothing of anyone else's.
// 2. Import a backup: the plan from the file takes the place of the plan,
//    in the account and on a second phone too.
// 3. A broken file is refused, in plain words, and nothing changes.
// 4. Delete an account on its own: a fresh code, "delete" typed, everything
//    gone from the database, an email to say so, and the other phone,
//    left open, removes everything too.
// 5. With two-step sign-in on, deleting needs the authenticator app's code.
// 6. Not signed in: "Remove everything from this phone".
// Deleting in a shared plan waits for the owner's choice (PLAN.md item 66).

import { readFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { noSidewaysScroll, openHome, updateBalance } from './journeys.ts';
import { box, noAxeProblems } from './setup.ts';
import {
  countEmails,
  makeAPlan,
  makeCodeRunOut,
  newEmail,
  signInEmail,
  TODAY,
} from './sign-in-helpers.ts';
import { appCode } from './totp.ts';
import {
  DEVICES,
  namedAnywhere,
  openMore,
  personOn,
  quoted,
  secondPhone,
  signIn,
  signUpFromMore,
  sql,
} from './two-phones.ts';

const t = strings.yourData;
const s = strings.security;
const SCREENS = '../../docs/screens/3h';
const DELETED_SUBJECT = 'Your PrePenny account has been deleted';

/** True for the one run that saves the screenshots: 360px, light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  colorScheme === 'light' && info.project.name === 'sign-in-360';

test.use({ userAgent: DEVICES.androidChrome });

/** Opens one of the Your data screens from More. */
async function openYourData(page: Page, label: string, heading: string) {
  await openMore(page);
  await page
    .getByTestId('your-data')
    .getByRole('link', { name: new RegExp(label) })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

/** Taps a button that saves a file, and gives the file's name and text. */
async function downloadFrom(page: Page, button: string): Promise<{ name: string; text: string }> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button }).click(),
  ]);
  const path = await file.path();
  return { name: file.suggestedFilename(), text: await readFile(path, 'utf8') };
}

/** A screenshot of the whole screen, as tall as what's on it, so the tabs at the bottom don't cover any of it. */
async function shootWhole(page: Page, name: string) {
  const size = page.viewportSize();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: 360, height: Math.max(size?.height ?? 780, height) });
  await page.screenshot({ path: `${SCREENS}/${name}`, fullPage: true });
  if (size !== null) await page.setViewportSize(size);
}

/** Lets the person ask for another code straight away, as if the minute between codes had passed. */
function codeAskedLongAgo(address: string) {
  makeCodeRunOut(address);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Your data, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('1. downloading both formats: the plan, the account and its history, and nothing else', async ({
      page,
    }, info) => {
      test.slow();
      const address = newEmail('sam');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      await updateBalance(page, {
        account: null,
        balance: '250.00',
        expected: '£267.54',
        difference: "That's £17.54 less.",
        toTick: 0,
      });

      await openYourData(page, t.download, t.download);
      await expect(page.getByText(t.whatsInAccount)).toBeVisible();
      await noAxeProblems(page);
      await noSidewaysScroll(page);

      const sheet = await downloadFrom(page, t.downloadSpreadsheet);
      expect(sheet.name).toBe(`prepenny-${TODAY}.csv`);
      await expect(page.getByTestId('download-said')).toHaveText(t.saved(sheet.name));
      expect(sheet.text.startsWith('﻿"PrePenny: your data, downloaded at')).toBe(true);
      expect(sheet.text).toContain(`\r\nYour account\r\n`);
      expect(sheet.text).toContain(address);
      expect(sheet.text).toContain('Current account,Current account,250.00,2026-10-25,');
      expect(sheet.text).toContain('\r\nHistory\r\n');
      expect(sheet.text).toMatch(/You updated the Current account balance to £250\.00/);
      if (shoots(info, colorScheme)) {
        await shootWhole(page, 'download-360-light.png');
      }

      const backup = await downloadFrom(page, t.downloadBackup);
      expect(backup.name).toBe(`prepenny-backup-${TODAY}.json`);
      const parsed = JSON.parse(backup.text) as {
        app: string;
        version: number;
        about: string;
        plan: { records: { accounts: unknown[]; balanceUpdates: { balance: number }[] } };
        account: { email: string; devices: unknown[] };
        history: { words: string }[];
      };
      expect(parsed.app).toBe('PrePenny');
      expect(parsed.version).toBe(1);
      expect(parsed.about).toBe(t.backupAbout);
      expect(parsed.plan.records.accounts).toHaveLength(1);
      expect(parsed.plan.records.balanceUpdates.map((one) => one.balance)).toContain(25000);
      expect(parsed.account.email).toBe(address);
      expect(parsed.account.devices).toHaveLength(1);
      expect(parsed.history.length).toBeGreaterThan(0);
      // Nothing that names a person: who a record belongs to is the database's.
      expect(backup.text).not.toContain(await personOn(page));
      await noAxeProblems(page);
    });

    test('2. importing a backup puts its plan in place of the plan, in the account and on a second phone', async ({
      page,
      browser,
    }, info) => {
      test.slow();
      const address = newEmail('sam');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      const person = await personOn(page);
      const before = sql(`select id from public.plans where owner = ${quoted(person)}`);

      await openYourData(page, t.download, t.download);
      const backup = await downloadFrom(page, t.downloadBackup);

      // The plan changes after the backup was made.
      await updateBalance(page, {
        account: null,
        balance: '300.00',
        expected: '£267.54',
        difference: "That's £32.46 more.",
        toTick: 0,
      });
      await expect(page.getByTestId('balance')).toContainText('£300.00');

      await openYourData(page, t.import, t.import);
      await expect(page.getByText(t.replacesPlan)).toBeVisible();
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: t.chooseFile }).click(),
      ]);
      await chooser.setFiles({
        name: backup.name,
        mimeType: 'application/json',
        buffer: Buffer.from(backup.text),
      });
      const sheet = page.getByRole('dialog', { name: t.confirmTitle });
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(t.holds(1, 0, 0, 0));
      await expect(sheet).toContainText(t.replaceWarning);
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/import-360-light.png` });
      }
      await sheet.getByRole('button', { name: t.confirmReplace }).click();
      await expect(page.getByTestId('imported')).toContainText(t.imported);
      await noAxeProblems(page);
      await page.getByRole('link', { name: t.goHome }).click();
      await expect(page.getByTestId('balance')).toContainText('£267.54');

      // In the account: a new plan, with new ids, in place of the old one.
      await expect
        .poll(() => sql(`select count(*) from public.plans where owner = ${quoted(person)}`))
        .toBe('1');
      const after = sql(`select id from public.plans where owner = ${quoted(person)}`);
      expect(after).not.toBe(before);
      await expect
        .poll(() =>
          sql(`select count(*) from public.balance_updates where plan_id = ${quoted(after)}`),
        )
        .toBe('1');
      expect(sql(`select count(*) from public.accounts where plan_id = ${quoted(before)}`)).toBe(
        '0',
      );

      // A second phone brings the imported plan down.
      const second = await secondPhone(browser, info, colorScheme, TODAY, DEVICES.iphoneSafari);
      await signIn(second.page, address);
      await expect(second.page.getByTestId('balance')).toContainText('£267.54');
      await second.context.close();
    });

    test('3. a broken file is refused in plain words, and nothing changes', async ({
      page,
    }, info) => {
      test.slow();
      const address = newEmail('sam');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      await openYourData(page, t.download, t.download);
      const backup = await downloadFrom(page, t.downloadBackup);
      await openYourData(page, t.import, t.import);

      const choose = async (name: string, text: string) => {
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser'),
          page.getByRole('button', { name: t.chooseFile }).click(),
        ]);
        await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
      };
      // A spreadsheet chosen by mistake.
      await choose('prepenny.csv', 'Name,Amount\nRent,550.00\n');
      await expect(page.getByText(t.problems['not-json'] ?? '')).toBeVisible();
      // A backup with a field changed by hand, to make an account someone else's.
      const forged = JSON.parse(backup.text) as {
        plan: { records: { accounts: Record<string, unknown>[] } };
      };
      const first = forged.plan.records.accounts[0];
      if (first !== undefined) first.privateTo = '00000000-0000-0000-0000-000000000000';
      await choose(backup.name, JSON.stringify(forged));
      await expect(page.getByText(t.problems['bad-record'] ?? '')).toBeVisible();
      await expect(page.getByText(t.problems['not-json'] ?? '')).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      if (shoots(info, colorScheme)) {
        await shootWhole(page, 'import-broken-file-360-light.png');
      }
      await openHome(page);
      await expect(page.getByTestId('balance')).toContainText('£267.54');
    });

    test('4. deleting an account on its own: a fresh code, "delete" typed, everything gone, an email, and the other phone forgets it too', async ({
      page,
      browser,
    }, info) => {
      test.slow();
      const address = newEmail('sam');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      const person = await personOn(page);
      const second = await secondPhone(browser, info, colorScheme, TODAY, DEVICES.iphoneSafari);
      await signIn(second.page, address);
      await expect(second.page.getByTestId('balance')).toContainText('£267.54');

      await openYourData(page, t.delete, t.deleteHeading);
      await expect(page.getByText(t.whenGone)).toBeVisible();
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      if (shoots(info, colorScheme)) {
        await shootWhole(page, 'delete-360-light.png');
      }
      codeAskedLongAgo(address);
      await page.getByRole('button', { name: t.sendCode }).click();
      await expect(page.getByTestId('delete-said')).toHaveText(t.codeSent(address));
      const { code } = await signInEmail(address, 2);
      const check = page.getByTestId('delete-check');
      await box(check, t.emailCodeLabel).fill(code);
      // Without "delete" typed, nothing happens.
      await check.getByRole('button', { name: t.deleteButton }).click();
      await expect(check.getByText(t.confirmMissing)).toBeVisible();
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await shootWhole(page, 'delete-check-360-light.png');
      }
      await box(check, t.confirmLabel).fill('delete');
      await check.getByRole('button', { name: t.deleteButton }).click();

      await expect(page).toHaveURL(/\/(\?.*)?$/);
      await expect(page.getByText(t.deleted)).toBeVisible();
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        await page.screenshot({ path: `${SCREENS}/deleted-360-light.png` });
      }

      // Nothing of the person is left in the database, in any table.
      expect(namedAnywhere(person)).toBe('');
      expect(namedAnywhere(address)).toBe('');
      // An email says it's done.
      await expect.poll(() => countEmails(address, DELETED_SUBJECT), { timeout: 20_000 }).toBe(1);
      // Nothing is left on this phone.
      expect(await page.evaluate(() => localStorage.length)).toBe(0);

      // The other phone, left open, gets nothing more, and removes everything
      // the next time it looks, within a minute.
      await expect(second.page.getByText(t.deletedElsewhere)).toBeVisible({ timeout: 70_000 });
      expect(await second.page.evaluate(() => localStorage.length)).toBe(0);
      await second.context.close();
    });

    test('4b. the phone looks at its account at the very moment it is deleted: it says "deleted", and nothing else (D504)', async ({
      page,
    }, info) => {
      // Once, at 360px in light: it's about timing, not about the screen.
      test.skip(
        info.project.name !== 'sign-in-360' || colorScheme !== 'light',
        'About timing: once, at 360px in light.',
      );
      test.slow();
      const address = newEmail('sam');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      await openYourData(page, t.delete, t.deleteHeading);
      codeAskedLongAgo(address);
      await page.getByRole('button', { name: t.sendCode }).click();
      await expect(page.getByTestId('delete-said')).toHaveText(t.codeSent(address));
      const { code } = await signInEmail(address, 2);
      const check = page.getByTestId('delete-check');
      await box(check, t.emailCodeLabel).fill(code);
      await box(check, t.confirmLabel).fill('delete');

      // Every time the server tells the phone its account is deleted.
      let toldDeleted = 0;
      page.on('response', async (response) => {
        if (!response.url().includes('/rest/v1/rpc/hello')) return;
        const text = await response.text().catch(() => '');
        if (/"sign_in"\s*:\s*"deleted"/.test(text)) toldDeleted += 1;
      });
      // The account is deleted on the server, and the answer held back.
      let deletedOnServer = () => {};
      const deleted = new Promise<void>((resolve) => {
        deletedOnServer = resolve;
      });
      let release = () => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/rest/v1/rpc/delete_my_account', async (route) => {
        const answer = await route.fetch();
        deletedOnServer();
        await released;
        await route.fulfill({ response: answer });
      });
      await check.getByRole('button', { name: t.deleteButton }).click();
      await deleted;
      // Meanwhile the phone looks at its account twice, as when the signal
      // comes back. Each look asks twice, once for "Stop it" and once before
      // keeping the plan in step, and the second look's step can only ask once
      // the first's is done: by the fourth "deleted", the phone has acted on one.
      for (const told of [2, 4]) {
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await expect.poll(() => toldDeleted, { timeout: 20_000 }).toBeGreaterThanOrEqual(told);
      }
      release();

      await expect(page.getByText(t.deleted)).toBeVisible();
      await expect(page.getByText(t.deletedElsewhere)).toHaveCount(0);
      await expect(page.getByText(strings.account.signInEnded)).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
    });

    test("5. with two-step sign-in on, deleting needs the authenticator app's code", async ({
      page,
    }) => {
      test.slow();
      const address = newEmail('sam');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      const person = await personOn(page);

      // Two-step sign-in on, as the Two-step sign-in screen does it.
      await openMore(page);
      await page
        .getByTestId('security')
        .getByRole('link', { name: /Two-step sign-in/ })
        .click();
      await page.getByRole('button', { name: strings.twoStep.turnOn }).click();
      const adding = page.getByTestId('two-step-adding');
      const key = ((await page.getByTestId('two-step-key').textContent()) ?? '').replace(/\s/g, '');
      const first = appCode(key);
      await box(adding, s.appCodeLabel).fill(first);
      await adding.getByRole('button', { name: strings.twoStep.finish, exact: true }).click();
      await expect(page.getByTestId('two-step')).toContainText(strings.twoStep.isOn);

      await openYourData(page, t.delete, t.deleteHeading);
      codeAskedLongAgo(address);
      await page.getByRole('button', { name: t.sendCode }).click();
      const { code } = await signInEmail(address, 2);
      const check = page.getByTestId('delete-check');
      await expect(box(check, s.appCodeLabel)).toBeVisible();
      await box(check, t.emailCodeLabel).fill(code);
      await box(check, t.confirmLabel).fill('delete');
      // No code from the app: nothing happens.
      await check.getByRole('button', { name: t.deleteButton }).click();
      await expect(check.getByText(s.appCodeMissing)).toBeVisible();
      await noAxeProblems(page);
      // A code the app shows a little later, as each code is typed once.
      let next = appCode(key, Date.now() + 30_000);
      if (next === first) next = appCode(key, Date.now() + 60_000);
      await box(check, s.appCodeLabel).fill(next);
      await check.getByRole('button', { name: t.deleteButton }).click();
      await expect(page.getByText(t.deleted)).toBeVisible();
      expect(namedAnywhere(person)).toBe('');
    });

    test('6. not signed in: "Remove everything from this phone"', async ({ page }) => {
      await makeAPlan(page);
      await openYourData(page, t.delete, t.deleteHeading);
      await expect(page.getByText(t.notSignedIn)).toBeVisible();
      await noAxeProblems(page);
      await page.getByRole('button', { name: t.removeHere }).click();
      const sheet = page.getByRole('dialog', { name: t.removeTitle });
      await expect(sheet).toContainText(t.removeIntro);
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: t.removeConfirm }).click();
      await expect(page.getByText(t.removed)).toBeVisible();
      // Back at the welcome with no plan of their own, and nothing kept in the small store.
      await expect(page.getByRole('button', { name: strings.welcome.makeMyPlan })).toBeVisible();
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
    });
  });
}
