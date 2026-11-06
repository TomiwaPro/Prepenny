// Sign up, sign in and sign out (brief 4.13, D19, D20, step 3b), at 320px and
// 360px wide (the sign-in-320 and sign-in-360 projects), in light and dark,
// checked by axe. Against the local Supabase that `supabase start` runs, with
// its emails caught by its test inbox: start it first (README.md, "Checks").
//
// The owner's six tests:
// 1. Sign up with an email code: the code arrives, typing it signs you in,
//    and the plan made before signing up is still there.
// 2. A wrong code says what to do, and an expired code asks for a new one.
// 3. Signing out from More takes two taps. Afterwards the phone holds no
//    plan, no practice changes and nothing else of the person's.
// 4. Signing in again on the same phone works.
// 5. The link backup works.
// 6. Google sign-in, as far as it can be tested without a real Google
//    account: the button starts the right steps.

import { expect, type Page, test } from '@playwright/test';
import { LOCAL_SUPABASE } from '../lib/sign-in-config.ts';
import { strings } from '../strings/en-GB.ts';
import { box, noAxeProblems, ownRecords, storedPlans } from './setup.ts';
import {
  askForCode,
  makeAPlan,
  makeCodeRunOut,
  newEmail,
  signInEmail,
  watchSupabase,
  whatThePhoneKeeps,
} from './sign-in-helpers.ts';

const t = strings.signIn;

/** Words from Sam's plan and the test plan that must never be sent at sign-in. */
const MONEY = ['267.54', '26754', 'Current account', '£'];

async function openMore(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'More', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
}

async function signUpFromMore(page: Page, address: string) {
  await openMore(page);
  const account = page.getByTestId('account');
  await expect(account.getByText(strings.account.signedOutLine)).toBeVisible();
  await account.getByRole('link', { name: 'Sign up or sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sign up' })).toBeVisible();
  await expect(page.getByText(t.planBecomesYours)).toBeVisible();
  await askForCode(page, address);
}

async function typeCode(page: Page, code: string, button: 'Sign up' | 'Sign in' = 'Sign up') {
  await box(page, '6-digit code').fill(code);
  await page.getByRole('button', { name: button, exact: true }).click();
}

async function expectSignedInOnMore(page: Page, address: string) {
  await expect(page).toHaveURL(/\/app\/more\/$/);
  const account = page.getByTestId('account');
  await expect(account.getByText(`Signed in as ${address}`)).toBeVisible();
  await expect(account.getByText(strings.account.onPhoneOnly)).toBeVisible();
}

/** The id Supabase gave the person, from the sign-in kept on the phone. */
async function signedInId(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem('prepenny-sign-in') ?? 'null') as {
      user?: { id?: string };
    } | null;
    return kept?.user?.id ?? null;
  });
  expect(id, 'a sign-in is kept on the phone').not.toBeNull();
  return id as string;
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Signing in, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('1. sign up with an email code: the code arrives, typing it signs you in, and the plan made before signing up is still there', async ({
      page,
    }) => {
      const address = newEmail('sam');
      const sent = watchSupabase(page);
      await makeAPlan(page);
      // Before signing up, PrePenny sends nothing to Supabase at all.
      expect(sent).toEqual([]);

      await signUpFromMore(page, address);
      await noAxeProblems(page);

      const email = await signInEmail(address);
      expect(email.subject).toBe('Your PrePenny sign-in code');
      expect(email.html).toContain('It lasts 10 minutes.');
      await typeCode(page, email.code);

      await expectSignedInOnMore(page, address);
      await noAxeProblems(page);

      // The plan is still there, and it's the person's now.
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Home', exact: true })
        .click();
      await expect(page.getByTestId('balance')).toContainText('£267.54');
      const id = await signedInId(page);
      const own = (await storedPlans(page)).find(
        (plan) => (plan as { isExample: boolean }).isExample === false,
      ) as { owner?: string } | undefined;
      expect(own?.owner).toBe(id);
      expect((await ownRecords(page)).accounts.map((account) => account.name)).toEqual([
        'Current account',
      ]);

      // Only the email address and the code went to Supabase: nothing about money.
      expect(
        sent.map((request) => `${request.method()} ${new URL(request.url()).pathname}`),
      ).toEqual(['POST /auth/v1/otp', 'POST /auth/v1/verify']);
      for (const request of sent) {
        for (const word of MONEY) expect(request.postData() ?? '').not.toContain(word);
      }
    });

    test('2. a wrong code says what to do, and an expired code asks for a new one', async ({
      page,
    }) => {
      const address = newEmail('dee');
      await page.clock.install();
      await makeAPlan(page);
      await signUpFromMore(page, address);
      const first = await signInEmail(address);

      // A wrong code.
      const wrong = `${first.code.slice(0, 5)}${(Number(first.code[5]) + 1) % 10}`;
      await typeCode(page, wrong);
      const codeBox = box(page, '6-digit code');
      await expect(page.getByText(t.codeWrong)).toBeVisible();
      await expect(codeBox).toHaveAttribute('aria-invalid', 'true');
      await expect(codeBox).toBeFocused();
      await noAxeProblems(page);

      // Not 6 numbers.
      await typeCode(page, '12ab');
      await expect(page.getByText(t.codeMissing)).toBeVisible();

      // 11 minutes later, the right code has run out.
      makeCodeRunOut(address);
      await page.clock.fastForward('11:00');
      await typeCode(page, first.code);
      await expect(page.getByText(t.codeRanOut)).toBeVisible();
      await noAxeProblems(page);

      // A new code, as it asks.
      await page.getByRole('button', { name: 'Send a new code', exact: true }).click();
      await expect(
        page.getByText(`We've sent a new code to ${address}. It lasts 10 minutes.`),
      ).toBeVisible();
      const second = await signInEmail(address, 2);
      expect(second.code).toMatch(/^\d{6}$/);

      // Asking again straight away hits Supabase's limit, and says so plainly.
      await page.getByRole('button', { name: 'Send a new code', exact: true }).click();
      await expect(page.getByTestId('sign-in-problem')).toHaveText(
        /^You can ask for a new code in \d+ seconds?\.$/,
      );
      await noAxeProblems(page);

      await typeCode(page, second.code);
      await expectSignedInOnMore(page, address);
    });

    test('3. signing out from More takes two taps, and leaves nothing of the person on the phone', async ({
      page,
    }) => {
      const address = newEmail('jess');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      await typeCode(page, (await signInEmail(address)).code);
      await expectSignedInOnMore(page, address);

      // Things PrePenny keeps outside the plan: Light or Dark, and a practice change in What if.
      await page.getByRole('radio', { name: 'Dark', exact: true }).check();
      const planId = ((await storedPlans(page)) as { id: string; isExample: boolean }[]).find(
        (plan) => !plan.isExample,
      )?.id;
      await page.evaluate(
        (key) =>
          new Promise<void>((resolve, reject) => {
            const request = indexedDB.open('prepenny');
            request.onsuccess = () => {
              const db = request.result;
              const put = db
                .transaction('device', 'readwrite')
                .objectStore('device')
                .put({ key, value: [{ commands: [{ kind: 'skip' }], message: 'Rent skipped.' }] });
              put.onsuccess = () => {
                db.close();
                resolve();
              };
              put.onerror = () => reject(put.error);
            };
          }),
        `what-if|${planId}`,
      );
      const before = await whatThePhoneKeeps(page);
      expect(before.localStorage).toEqual(
        expect.arrayContaining(['prepenny-sign-in', 'prepenny-colours']),
      );
      expect(before.rows['prepenny.plans']).toBeGreaterThan(0);
      expect(before.rows['prepenny.device']).toBeGreaterThan(0);

      // Tap 1: Sign out on More.
      await page.getByTestId('account').getByRole('button', { name: 'Sign out' }).click();
      const sheet = page.getByRole('dialog', { name: 'Sign out' });
      await expect(sheet.getByText(strings.account.signOutIntro)).toBeVisible();
      await expect(sheet.getByText(strings.account.signOutWarning)).toBeVisible();
      await noAxeProblems(page);
      // Tap 2: Sign out in the sheet.
      await sheet.getByRole('button', { name: 'Sign out', exact: true }).click();

      await expect(page).toHaveURL(/\/$/);
      await expect(
        page.getByRole('status').filter({ hasText: strings.account.signedOut }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Make my plan' })).toBeVisible();
      await noAxeProblems(page);

      const after = await whatThePhoneKeeps(page);
      expect(after.localStorage).toEqual([]);
      expect(after.sessionStorage).toEqual([]);
      // The welcome opens the phone's database again, empty.
      for (const [store, rows] of Object.entries(after.rows)) expect(rows, store).toBe(0);

      // Opening PrePenny again starts afresh: no plan, nobody signed in.
      await page.goto('/app/');
      await expect(page).toHaveURL(/\/setup\/$/);
      await expect(
        page.getByRole('link', { name: 'Already have an account? Sign in' }),
      ).toBeVisible();
    });

    test('3, with no signal: signing out still leaves nothing of the person on the phone', async ({
      page,
      context,
    }) => {
      // Saving every file of the app for no signal can take a while on a busy machine.
      test.slow();
      const address = newEmail('ali');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      await typeCode(page, (await signInEmail(address)).code);
      await expectSignedInOnMore(page, address);
      // The offline helper has every file of the app on the phone, as in e2e/offline.spec.ts.
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        if (registration.active?.state !== 'activated') {
          await new Promise<void>((resolve) =>
            registration.active?.addEventListener('statechange', () => resolve()),
          );
        }
      });
      await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
          timeout: 60_000,
        })
        .toBe(true);

      await context.setOffline(true);
      await page.getByTestId('account').getByRole('button', { name: 'Sign out' }).click();
      await page
        .getByRole('dialog', { name: 'Sign out' })
        .getByRole('button', { name: 'Sign out', exact: true })
        .click();
      await expect(
        page.getByRole('status').filter({ hasText: strings.account.signedOut }),
      ).toBeVisible();
      const after = await whatThePhoneKeeps(page);
      expect(after.localStorage).toEqual([]);
      expect(after.sessionStorage).toEqual([]);
      for (const [store, rows] of Object.entries(after.rows)) expect(rows, store).toBe(0);
      await context.setOffline(false);
    });

    test('4. signing in again on the same phone works', async ({ page }) => {
      const address = newEmail('tom');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      await typeCode(page, (await signInEmail(address)).code);
      await expectSignedInOnMore(page, address);
      await page.getByTestId('account').getByRole('button', { name: 'Sign out' }).click();
      await page
        .getByRole('dialog', { name: 'Sign out' })
        .getByRole('button', { name: 'Sign out', exact: true })
        .click();
      await expect(page.getByRole('button', { name: 'Make my plan' })).toBeVisible();

      await page.getByRole('link', { name: 'Already have an account? Sign in' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
      await expect(page.getByText(t.signInPurpose)).toBeVisible();
      await noAxeProblems(page);
      await askForCode(page, address);
      const again = await signInEmail(address, 2);
      expect(again.subject).toBe('Your PrePenny sign-in code');
      await typeCode(page, again.code, 'Sign in');

      // Signed in, on a phone with no plan yet: the welcome says who's signed in.
      await expect(page).toHaveURL(/\/setup\/$/);
      await expect(page.getByText(strings.account.signedInWelcome(address))).toBeVisible();
      await noAxeProblems(page);
    });

    test('5. the link in the email signs you in too, once, and only when "Finish signing in" is tapped', async ({
      page,
    }) => {
      const address = newEmail('priya');
      const sent = watchSupabase(page);
      await makeAPlan(page);
      await signUpFromMore(page, address);
      const email = await signInEmail(address);
      expect(email.link).toMatch(
        /^http:\/\/127\.0\.0\.1:4173\/sign-in\/#token_hash=[^&]+&type=email$/,
      );

      // The link opens PrePenny's own sign-in page, which waits for a tap (D312).
      await page.goto(email.link);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Finish signing in' }),
      ).toBeVisible();
      await expect(page.getByText(t.linkPurpose)).toBeVisible();
      // Its one-time key is taken out of the address straight away, and nothing is sent yet.
      expect(new URL(page.url()).hash).toBe('');
      expect(sent.filter((request) => request.url().includes('/verify'))).toEqual([]);
      await noAxeProblems(page);

      await page.getByRole('button', { name: 'Finish signing in', exact: true }).click();
      await expect(page).toHaveURL(/\/app\/$/);
      await expect(page.getByTestId('balance')).toContainText('£267.54');
      await openMore(page);
      await expect(page.getByTestId('account').getByText(`Signed in as ${address}`)).toBeVisible();
      // The one-time key, after the "#", was never sent to PrePenny's site: only to Supabase.
      const verify = sent.find((request) => new URL(request.url()).pathname === '/auth/v1/verify');
      expect(verify?.postDataJSON()).toMatchObject({
        token_hash: new URLSearchParams(new URL(email.link).hash.slice(1)).get('token_hash'),
        type: 'email',
      });

      // The same link a second time says what to do.
      await page.goto(email.link);
      await page.getByRole('button', { name: 'Finish signing in', exact: true }).click();
      await expect(page.getByTestId('sign-in-problem')).toHaveText(t.linkRanOut);
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
      await noAxeProblems(page);
    });

    test('5, checked by an email service: a link opened by something else uses nothing up', async ({
      page,
      browser,
    }) => {
      const address = newEmail('kofi');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      const email = await signInEmail(address);

      // An email service opens the link by itself to check it, in a browser of its own.
      const checker = await browser.newContext();
      const checking = await checker.newPage();
      const checkerSent = watchSupabase(checking);
      await checking.goto(email.link);
      await expect(
        checking.getByRole('heading', { level: 1, name: 'Finish signing in' }),
      ).toBeVisible();
      await checking.waitForTimeout(500);
      expect(checkerSent).toEqual([]);
      await checker.close();

      // The code from the same email still works.
      await typeCode(page, email.code);
      await expectSignedInOnMore(page, address);
    });

    test("nobody can plant a password: a stranger signs up with my address and a password, I sign in with a code, and their password doesn't work", async ({
      page,
    }) => {
      const address = newEmail('jess');
      const password = 'a-stranger-chose-this-1';
      const api = (path: string, body: object) =>
        fetch(`${LOCAL_SUPABASE.url}/auth/v1/${path}`, {
          method: 'POST',
          headers: { apikey: LOCAL_SUPABASE.key, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });

      // A stranger signs up with my address and a password of theirs.
      const planted = await api('signup', { email: address, password });
      expect(planted.status).toBe(200);
      const before = await api('token?grant_type=password', { email: address, password });
      expect(before.status).toBe(400);

      // I sign up with a code, a while later.
      makeCodeRunOut(address);
      await makeAPlan(page);
      await signUpFromMore(page, address);
      const mine = await signInEmail(address, 2);
      await typeCode(page, mine.code);
      await expectSignedInOnMore(page, address);

      // The stranger's password doesn't sign in to my account.
      const after = await api('token?grant_type=password', { email: address, password });
      expect(after.status).toBe(400);
      expect(((await after.json()) as { error_code?: string }).error_code).toBe(
        'invalid_credentials',
      );
    });

    test('6. "Continue with Google" starts the right steps', async ({ page }) => {
      // Supabase's answer is kept, and the browser stops there, before Google.
      let toGoogle: URL | null = null;
      let authorize: URL | null = null;
      await page.route('http://127.0.0.1:54321/auth/v1/authorize**', async (route) => {
        authorize = new URL(route.request().url());
        const response = await route.fetch({ maxRedirects: 0 });
        toGoogle = new URL(response.headers().location ?? 'about:blank');
        await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Google' });
      });
      await page.goto('/sign-in/?to=sign-up&from=more');
      await expect(page.getByRole('heading', { level: 1, name: 'Sign up' })).toBeVisible();
      const google = page.getByRole('button', { name: 'Continue with Google' });
      await expect(google).toHaveAccessibleDescription(t.googleHint);
      await noAxeProblems(page);
      await google.click();

      await expect.poll(() => toGoogle?.origin ?? null).toBe('https://accounts.google.com');
      const asked = authorize as unknown as URL;
      expect(asked.searchParams.get('provider')).toBe('google');
      // Google comes back to PrePenny's sign-in page, with a one-time code
      // checked against a secret only this browser holds (PKCE).
      expect(asked.searchParams.get('redirect_to')).toBe(
        'http://127.0.0.1:4173/sign-in/?to=sign-up&from=more',
      );
      expect(asked.searchParams.get('code_challenge_method')).toBe('s256');
      expect(asked.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const kept = (await page.context().storageState()).origins.find(
        (origin) => origin.origin === 'http://127.0.0.1:4173',
      );
      expect(kept?.localStorage.map((item) => item.name)).toContain(
        'prepenny-sign-in-code-verifier',
      );
      const google2 = toGoogle as unknown as URL;
      expect(google2.pathname).toBe('/o/oauth2/v2/auth');
      expect(google2.searchParams.get('client_id')).toBe(
        'prepenny-local-test.apps.googleusercontent.com',
      );
      expect(google2.searchParams.get('redirect_uri')).toBe(
        'http://127.0.0.1:54321/auth/v1/callback',
      );
      expect(google2.searchParams.get('response_type')).toBe('code');
      expect(google2.searchParams.get('scope')?.split(' ')).toContain('email');

      // Coming back from Google without signing in says what to do.
      await page.goto('/sign-in/?to=sign-up&from=more&error=access_denied');
      await expect(page.getByTestId('sign-in-problem')).toHaveText(t.googleCancelled);
      await expect(page).toHaveURL(/\/sign-in\/\?to=sign-up&from=more$/);
      await noAxeProblems(page);
      // And so does a code from Google that doesn't work.
      await page.goto('/sign-in/?code=not-a-real-code');
      await expect(page.getByTestId('sign-in-problem')).toHaveText(t.googleCancelled);
    });

    test('6, before Google is set up: "Continue with Google" says so, and stays on PrePenny', async ({
      page,
    }) => {
      // Supabase's public settings, as before the owner has done README.md's part C.
      await page.route('http://127.0.0.1:54321/auth/v1/settings', async (route) => {
        const response = await route.fetch();
        const settings = (await response.json()) as { external: Record<string, boolean> };
        await route.fulfill({
          response,
          json: { ...settings, external: { ...settings.external, google: false } },
        });
      });
      let toAuthorize = false;
      page.on('request', (request) => {
        if (request.url().includes('/auth/v1/authorize')) toAuthorize = true;
      });
      await page.goto('/sign-in/');
      await page.getByRole('button', { name: 'Continue with Google' }).click();
      await expect(page.getByTestId('sign-in-problem')).toHaveText(t.googleOff);
      await expect(page).toHaveURL(/\/sign-in\/$/);
      expect(toAuthorize).toBe(false);
      await noAxeProblems(page);
    });
  });
}
