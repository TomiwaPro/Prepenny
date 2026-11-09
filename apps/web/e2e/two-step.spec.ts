// Two-step sign-in with an authenticator app (step 3e, brief 4.13), at
// 320px and 360px wide (the sign-in-320 and sign-in-360 projects), in light
// and dark, checked by axe, against the local Supabase. The authenticator
// app is played by e2e/totp.ts, which works out its codes from the key
// PrePenny shows, as the app does.
//
// The owner's test 3: turning two-step sign-in on, signing in with it, and a
// sign-in without the second step getting no data. Also: turning it on signs
// out the other devices; changing the email address and signing out of all
// other devices (step 3e hardening) ask for the app's code; turning it off
// needs a code too.

import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { LOCAL_SUPABASE } from '../lib/sign-in-config.ts';
import { strings } from '../strings/en-GB.ts';
import { openHome } from './journeys.ts';
import { box, noAxeProblems } from './setup.ts';
import { makeAPlan, newEmail, whatThePhoneKeeps } from './sign-in-helpers.ts';
import { appCode } from './totp.ts';
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

const t = strings.twoStep;
const s = strings.security;
const SCREENS = '../../docs/screens/3e';

/** True for the one run that saves the screenshots: 360px, light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  colorScheme === 'light' && info.project.name === 'sign-in-360';

test.use({ userAgent: DEVICES.androidChrome });

async function openTwoStep(page: Page) {
  await openMore(page);
  await page
    .getByTestId('security')
    .getByRole('link', { name: /Two-step sign-in/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: t.heading })).toBeVisible();
}

/** A code from the app that isn't the one it shows now, or in the 30 seconds either side. */
function wrongCode(key: string): string {
  const near = new Set([-30_000, 0, 30_000].map((ms) => appCode(key, Date.now() + ms)));
  for (let n = 0; ; n += 1) {
    const code = n.toString().padStart(6, '0');
    if (!near.has(code)) return code;
  }
}

/**
 * A code the app shows now or in the next 30 seconds that hasn't been typed
 * yet, waiting for a new one only when both have: Supabase takes the code
 * either side of now too, as authenticator apps' clocks drift, and each code
 * is typed once.
 */
async function freshCode(key: string, used: Set<string>): Promise<string> {
  for (;;) {
    for (const ahead of [0, 30_000]) {
      const code = appCode(key, Date.now() + ahead);
      if (!used.has(code)) {
        used.add(code);
        return code;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Two-step sign-in, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('3. turning it on, signing in with it, and a sign-in without the second step gets no data', async ({
      page,
      browser,
    }, info) => {
      test.slow();
      const address = newEmail('sam');
      const used = new Set<string>();
      await makeAPlan(page);
      await signUpFromMore(page, address);
      const person = await personOn(page);
      const laptop = await secondPhone(browser, info, colorScheme, undefined, DEVICES.macSafari);
      await signIn(laptop.page, address);
      await expect(laptop.page.getByTestId('balance')).toContainText('£267.54');

      // Turn it on.
      await openTwoStep(page);
      await expect(page.getByTestId('two-step')).toContainText(t.isOff);
      await noAxeProblems(page);
      await page.getByRole('button', { name: t.turnOn }).click();
      const adding = page.getByTestId('two-step-adding');
      await expect(adding).toBeVisible();
      await expect(adding.getByRole('link', { name: t.openApp })).toHaveAttribute(
        'href',
        /^otpauth:\/\/totp\/PrePenny/,
      );
      await expect(adding.getByRole('img', { name: t.qrAlt })).toBeVisible();
      const key = (await page.getByTestId('two-step-key').textContent()) ?? '';
      expect(key.replace(/\s/g, '')).toMatch(/^[A-Z2-7]{16,}$/);
      await expect(adding).toContainText(t.otherDevices);
      await noAxeProblems(page);
      if (shoots(info, colorScheme)) {
        // Tall enough for the whole screen, so the tabs at the bottom don't cover the key.
        const size = page.viewportSize();
        await page.setViewportSize({ width: 360, height: 1200 });
        await page.screenshot({
          path: `${SCREENS}/two-step-turning-on-360-light.png`,
          fullPage: true,
        });
        if (size !== null) await page.setViewportSize(size);
      }
      // A wrong code is refused, and says what to do.
      await box(adding, s.appCodeLabel).fill(wrongCode(key));
      await adding.getByRole('button', { name: t.finish, exact: true }).click();
      await expect(adding.getByText(s.appCodeWrong)).toBeVisible();
      await box(adding, s.appCodeLabel).fill(await freshCode(key, used));
      await adding.getByRole('button', { name: t.finish, exact: true }).click();
      await expect(page.getByTestId('two-step')).toContainText(t.isOn);
      await expect(page.getByRole('status').filter({ hasText: t.turnedOn })).toBeVisible();
      await noAxeProblems(page);
      expect(
        sql(
          `select count(*) from auth.mfa_factors where user_id = ${quoted(person)} and status = 'verified'`,
        ),
      ).toBe('1');

      // Supabase signs the other devices out: the laptop stops and removes the plan.
      await expect(laptop.page.getByText(strings.account.signInEnded)).toBeVisible({
        timeout: 60_000,
      });

      // A new phone signs in with the email's code only: it's asked for the app's code, and gets nothing until then.
      const iphone = await secondPhone(browser, info, colorScheme, undefined, DEVICES.iphoneSafari);
      await signIn(iphone.page, address);
      await expect(
        iphone.page.getByRole('heading', { level: 1, name: strings.secondStep.heading }),
      ).toBeVisible();
      await expect(iphone.page.getByText(strings.secondStep.purpose)).toBeVisible();
      await noAxeProblems(iphone.page);
      // Its sign-in, as the browser keeps it, asking the database itself:
      // nothing of the plan, and nothing saved.
      const token = await iphone.page.evaluate(() => {
        const kept = JSON.parse(localStorage.getItem('prepenny-sign-in') ?? 'null') as {
          access_token: string;
        };
        return kept.access_token;
      });
      const plan = sql(`select id from public.plans where owner = ${quoted(person)}`);
      const ask = (path: string, body?: unknown) =>
        fetch(`${LOCAL_SUPABASE.url}/rest/v1/${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            apikey: LOCAL_SUPABASE.key,
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'x-prepenny-version': sql(
              'select max(version) from supabase_migrations.schema_migrations',
            ),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      const accounts = await ask('accounts?select=id');
      expect(await accounts.json()).toEqual([]);
      const members = await ask('plan_members?select=plan_id');
      expect(await members.json()).toEqual([]);
      const down = await ask('rpc/plan_changes', { plan, shared_after: 0, mine_after: 0 });
      expect(down.status).toBe(403);
      const devices = await ask('rpc/my_devices', {});
      expect(devices.status).toBe(403);
      const hello = await ask('rpc/hello', {});
      expect(((await hello.json()) as { sign_in: string }).sign_in).toBe('second-step');
      // And nothing of the plan came down to the phone.
      expect((await whatThePhoneKeeps(iphone.page)).rows['prepenny.records'] ?? 0).toBe(0);

      // Typing the app's code signs it in, and the plan comes down.
      await box(iphone.page, s.appCodeLabel).fill(wrongCode(key));
      await iphone.page
        .getByRole('button', { name: strings.secondStep.finish, exact: true })
        .click();
      await expect(iphone.page.getByText(s.appCodeWrong)).toBeVisible();
      await box(iphone.page, s.appCodeLabel).fill(await freshCode(key, used));
      await iphone.page
        .getByRole('button', { name: strings.secondStep.finish, exact: true })
        .click();
      await expect(iphone.page).toHaveURL(/\/app\/$/);
      await expect(iphone.page.getByTestId('balance')).toContainText('£267.54');

      // With it on, changing the email address asks for the app's code first.
      await openMore(page);
      await page
        .getByTestId('security')
        .getByRole('link', { name: /Email addresses/ })
        .click();
      const signInEmail = page.getByTestId('sign-in-email');
      await signInEmail.getByRole('button', { name: strings.emails.change }).click();
      await box(signInEmail, strings.emails.newLabel).fill(newEmail('newsam'));
      await expect(box(signInEmail, s.appCodeLabel)).toBeVisible();
      await signInEmail.getByRole('button', { name: strings.emails.sendCodes }).click();
      await expect(signInEmail.getByText(s.appCodeMissing)).toBeVisible();
      await signInEmail.getByRole('button', { name: strings.emails.cancel }).click();

      // And so does signing out of all other devices.
      await openMore(page);
      await page
        .getByTestId('security')
        .getByRole('link', { name: /Signed-in devices/ })
        .click();
      await page.getByRole('button', { name: strings.devices.others, exact: true }).click();
      const others = page.getByRole('dialog', { name: strings.devices.othersTitle });
      await expect(others).toContainText(strings.devices.othersCodeIntro);
      await expect(box(others, s.appCodeLabel)).toBeVisible();
      await others.getByRole('button', { name: strings.devices.othersNo }).click();
      await expect(others).toBeHidden();

      // Turning it off needs the app's code.
      await openTwoStep(page);
      await page.getByRole('button', { name: t.turnOff }).click();
      const off = page.getByRole('dialog', { name: t.turnOffTitle });
      await expect(off).toBeVisible();
      await noAxeProblems(page);
      await off.getByRole('button', { name: t.turnOffConfirm }).click();
      await expect(off.getByText(s.appCodeMissing)).toBeVisible();
      await box(off, s.appCodeLabel).fill(await freshCode(key, used));
      await off.getByRole('button', { name: t.turnOffConfirm }).click();
      await expect(off).toBeHidden();
      await expect(page.getByTestId('two-step')).toContainText(t.isOff);
      expect(
        sql(
          `select count(*) from auth.mfa_factors where user_id = ${quoted(person)} and status = 'verified'`,
        ),
      ).toBe('0');
      // Both phones carry on.
      await openHome(page);
      await expect(page.getByTestId('balance')).toContainText('£267.54');
      await laptop.context.close();
      await iphone.context.close();
    });
  });
}
