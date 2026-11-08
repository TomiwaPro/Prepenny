// Your plan on the server (step 3c), at 320px and 360px wide (the sign-in-320
// and sign-in-360 projects), in light and dark, checked by axe. Against the
// local Supabase that `supabase start` runs, with sign-in, the Data API, live
// updates and its test inbox: start it first (README.md, "Checks").
//
// The owner's six tests:
// 1. Make a plan, sign up: it goes up. Sign in on a second phone (a fresh
//    browser): the same plan, the same figures on Home, Coming up and Debts.
// 2. A change on one phone reaches the other.
// 3. Two plans: "which one to keep" appears, and both choices work.
// 4. Sign out: the phone holds nothing. Sign in again: the plan comes back.
// 5. Sign out with a change not yet sent: the warning appears.
// 6. A partner's phone gets shared records only (the database tests try every
//    role; this one is end to end).
//
// And the owner's four tests for the step 3c fix (D351 to D354), on every
// screen, the welcome and setup included:
// 7. The owner's own case: a phone signed in part-way through setup before
//    the account had a plan; a second phone saves a finished plan; the first
//    phone opens and asks "which one to keep"; keeping the saved plan shows
//    Home with the same figures; a change on either phone reaches the other.
// 8. A phone part-way through setup, not signed in, signs in from the
//    welcome's "Already have an account? Sign in" and is asked which to keep.
// 9. A fresh phone signs in from the welcome, and the saved plan comes down.
// 10. Signing out from the welcome screen, and from a setup step.
// With two more, run once: an account that already has two plans of its own
// asks which to keep (11), and two phones sending their first copy at the
// same moment leave one plan (12).

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { type Browser, expect, type Page, type TestInfo, test } from '@playwright/test';
import { LOCAL_SUPABASE } from '../lib/sign-in-config.ts';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { strings } from '../strings/en-GB.ts';
import { settingScript } from './fixtures.ts';
import { openHome, updateBalance } from './journeys.ts';
import { SAM_TODAY, setUpSam } from './people.ts';
import {
  back,
  box,
  fillAccount,
  lastForm,
  next,
  noAxeProblems,
  skip,
  startSetup,
} from './setup.ts';
import {
  askForCode,
  makeAPlan,
  makeCodeRunOut,
  newEmail,
  signInEmail,
  TODAY,
  whatThePhoneKeeps,
} from './sign-in-helpers.ts';

const t = strings.account;
const s = strings.signIn;

/** A query on the local database, as Supabase's own administrator, for setting up and checking. */
function sql(query: string): string {
  return execFileSync('docker', [
    'exec',
    'supabase_db_prepenny',
    'psql',
    '--quiet',
    '--no-psqlrc',
    '-At',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-c',
    query,
  ])
    .toString()
    .trim();
}

const quoted = (text: string) => `'${text.replaceAll("'", "''")}'`;

/** A second phone: a fresh browser with nothing on it, the same size and colours as the first. */
async function secondPhone(
  browser: Browser,
  info: TestInfo,
  colorScheme: 'light' | 'dark',
  today = TODAY,
) {
  const use = info.project.use;
  const context = await browser.newContext({
    ...(use.viewport === undefined ? {} : { viewport: use.viewport }),
    ...(use.isMobile === undefined ? {} : { isMobile: use.isMobile }),
    ...(use.hasTouch === undefined ? {} : { hasTouch: use.hasTouch }),
    ...(use.deviceScaleFactor === undefined ? {} : { deviceScaleFactor: use.deviceScaleFactor }),
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    ...(use.baseURL === undefined ? {} : { baseURL: use.baseURL }),
    colorScheme,
  });
  const page = await context.newPage();
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today }] as const);
  return { context, page };
}

/** A plan of the phone's own, set up to the end: one account with this balance today. */
async function makePlanWith(page: Page, balance: string) {
  await startSetup(page, TODAY);
  await fillAccount(lastForm(page, 'account'), { name: 'Current account', balance, warning: '20' });
  await next(page);
  for (let step = 2; step <= 7; step += 1) {
    await expect(page.getByText(`Step ${step} of 8`, { exact: true })).toBeVisible();
    await skip(page);
  }
  await expect(page.getByText('Step 8 of 8', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go to my plan' }).click();
  await expect(page.getByTestId('balance')).toContainText(`£${balance}`);
}

async function openMore(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'More', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
}

/** Signs up from More, with the plan on this phone, and waits for it to be saved in the account. */
async function signUpFromMore(page: Page, address: string) {
  await openMore(page);
  await page.getByTestId('account').getByRole('link', { name: 'Sign up or sign in' }).click();
  await expect(page.getByText(s.planBecomesYours)).toBeVisible();
  await askForCode(page, address);
  await box(page, '6-digit code').fill((await signInEmail(address)).code);
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/more\/$/);
  await expect(page.getByTestId('where-kept')).toHaveText(t.savedInAccount);
}

/** The local Supabase's own key for its administrator (supabase/config.toml): the same on every machine, and local only. */
const LOCAL_SECRET_KEY = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';

/** A sign-in link from the local Supabase, for an account it makes if there isn't one yet. */
async function signInLink(address: string): Promise<{ id: string; hashed_token: string }> {
  const response = await fetch(`${LOCAL_SUPABASE.url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: LOCAL_SECRET_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: address }),
  });
  expect(response.ok, 'the local Supabase makes a sign-in link').toBe(true);
  return (await response.json()) as { id: string; hashed_token: string };
}

/** An account for this address, as signing up makes one, and its id. */
async function accountFor(address: string): Promise<string> {
  return (await signInLink(address)).id;
}

/**
 * Signs in on a phone with the sign-in link the email would have, made by
 * the local Supabase straight away (no email is sent), so a second phone
 * needn't wait the minute Supabase leaves between codes to one address
 * (D305). The page opens on "Finish signing in", as the email's link does (D312).
 */
async function signIn(page: Page, address: string) {
  const { hashed_token: key } = await signInLink(address);
  await page.goto(`/sign-in/#token_hash=${key}`);
  await expect(page.getByRole('heading', { level: 1, name: s.linkHeading })).toBeVisible();
  await page.getByRole('button', { name: s.finishLink }).click();
}

/** What Home, Coming up and Debts show, word for word, once each has worked its figures out. */
async function threeScreens(page: Page) {
  const nav = (name: string) =>
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });
  await nav('Home').click();
  await expect(page.getByTestId('balance')).toBeVisible();
  // biome-ignore lint/performance/useDomNodeTextContent: Playwright's own innerText, the words as shown on screen
  const home = await page.locator('main').innerText();
  await nav('Coming up').click();
  await expect(page.getByTestId('plan-lowest')).toBeVisible();
  await expect(page.getByTestId('plan-skeleton')).toHaveCount(0);
  // biome-ignore lint/performance/useDomNodeTextContent: Playwright's own innerText, the words as shown on screen
  const comingUp = await page.locator('main').innerText();
  await nav('Debts').click();
  await expect(page.getByTestId('owed-now').or(page.getByTestId('no-debts'))).toBeVisible();
  // biome-ignore lint/performance/useDomNodeTextContent: Playwright's own innerText, the words as shown on screen
  const debts = await page.locator('main').innerText();
  return { home, comingUp, debts };
}

/** The person's id, from the sign-in kept on the phone. */
async function personOn(page: Page): Promise<string> {
  return page.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem('prepenny-sign-in') ?? 'null') as {
      user: { id: string };
    };
    return kept.user.id;
  });
}

/** Every piece of text kept in the phone's database, for checking nothing of someone else's is there. */
async function everythingKept(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('prepenny');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const out: unknown[] = [];
    for (const store of Array.from(db.objectStoreNames)) {
      out.push(
        await new Promise<unknown[]>((resolve, reject) => {
          const all = db.transaction(store).objectStore(store).getAll();
          all.onsuccess = () => resolve(all.result);
          all.onerror = () => reject(all.error);
        }),
      );
    }
    db.close();
    return JSON.stringify(out);
  });
}

/** The local Supabase's Data API: everything about plans, but not signing in. */
const DATA_API = `${LOCAL_SUPABASE.url}/rest/v1/**`;

/**
 * A plan part-way through setup, as the owner's phone had: one account with
 * this balance today, a look at step 2, then Back to the welcome, which says
 * "Carry on making my plan".
 */
async function startAPlan(page: Page, balance: string) {
  await startSetup(page, TODAY);
  await fillAccount(lastForm(page, 'account'), { name: 'Current account', balance, warning: '20' });
  await next(page);
  await expect(page.getByText('Step 2 of 8', { exact: true })).toBeVisible();
  await back(page);
  await expect(page.getByText('Step 1 of 8', { exact: true })).toBeVisible();
  await back(page);
  await expect(page.getByRole('button', { name: strings.welcome.carryOn })).toBeVisible();
}

/** The welcome's "Already have an account? Sign in", then the code from the email. */
async function signInFromWelcome(page: Page, address: string) {
  await page.getByRole('link', { name: `${t.haveAccount} ${t.signIn}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: s.signInHeading })).toBeVisible();
  await askForCode(page, address);
  await box(page, '6-digit code').fill((await signInEmail(address)).code);
  await page.getByRole('button', { name: s.finishSignIn, exact: true }).click();
}

/** A second phone with a plan of its own, finished and saved in the account. */
async function phoneWithSavedPlan(
  browser: Browser,
  info: TestInfo,
  colorScheme: 'light' | 'dark',
  address: string,
) {
  const phone = await secondPhone(browser, info, colorScheme);
  await makeAPlan(phone.page);
  await signIn(phone.page, address);
  await expect(phone.page).toHaveURL(/\/app\/$/);
  await openMore(phone.page);
  await expect(phone.page.getByTestId('where-kept')).toHaveText(t.savedInAccount);
  return phone;
}

/** How many plans the person owns in the database. */
const plansOwnedBy = (person: string) =>
  Number(sql(`select count(*) from public.plans where owner = ${quoted(person)}`));

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Your plan on the server, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('1. make a plan, sign up: it goes up. Sign in on a second phone: the same plan, the same figures on Home, Coming up and Debts', async ({
      page,
      browser,
    }, info) => {
      // Sam's whole plan, made through setup, with his pay, rent, bills, debts and savings.
      test.slow();
      const address = newEmail('sam');
      await setUpSam(page);
      // Opened afresh, so no payday is left open from setup on either phone (D187).
      await page.goto('/app/');
      const before = await threeScreens(page);
      await signUpFromMore(page, address);
      await noAxeProblems(page);
      const person = await personOn(page);
      expect(
        Number(sql(`select count(*) from public.series where created_by = ${quoted(person)}`)),
      ).toBeGreaterThan(10);

      const second = await secondPhone(browser, info, colorScheme, SAM_TODAY);
      await signIn(second.page, address);
      await expect(second.page).toHaveURL(/\/app\/$/);
      await expect(second.page.getByTestId('balance')).toContainText('£267.54');
      const after = await threeScreens(second.page);
      expect(after.home).toBe(before.home);
      expect(after.comingUp).toBe(before.comingUp);
      expect(after.debts).toBe(before.debts);
      await noAxeProblems(second.page);
      await second.context.close();
    });

    test('2. a change on one phone reaches the other', async ({ page, browser }, info) => {
      const address = newEmail('dee');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      const second = await secondPhone(browser, info, colorScheme);
      await signIn(second.page, address);
      await expect(second.page.getByTestId('balance')).toContainText('£267.54');

      // The first phone's balance changes; the second, left open on Home, shows it.
      await updateBalance(page, {
        account: null,
        balance: '301.25',
        expected: '£267.54',
        difference: "That's £33.71 more.",
        toTick: 0,
      });
      await expect(second.page.getByTestId('balance')).toContainText('£301.25', {
        timeout: 20_000,
      });

      // And back the other way: the second phone's change reaches the first.
      await updateBalance(second.page, {
        account: null,
        balance: '299.00',
        expected: '£301.25',
        difference: "That's £2.25 less.",
        toTick: 0,
      });
      await expect(page.getByTestId('balance')).toContainText('£299.00', { timeout: 20_000 });
      await noAxeProblems(page);
      await second.context.close();
    });

    for (const kept of ['saved', 'phone'] as const) {
      test(`3. two plans: "which one to keep" appears, and keeping the ${kept === 'saved' ? 'saved plan' : 'plan on this phone'} works`, async ({
        page,
        browser,
      }, info) => {
        const address = newEmail('priya');
        await makeAPlan(page);
        await signUpFromMore(page, address);

        // A second phone with a plan of its own: £111.11.
        const second = await secondPhone(browser, info, colorScheme);
        await makePlanWith(second.page, '111.11');
        await signIn(second.page, address);

        const choose = second.page.getByTestId('choose-plan');
        await expect(
          second.page.getByRole('heading', { level: 1, name: s.chooseHeading }),
        ).toBeVisible();
        await expect(second.page.getByText(s.choosePurpose)).toBeVisible();
        const saved = choose.getByRole('radio', { name: s.savedPlan(s.today) });
        const phone = choose.getByRole('radio', { name: s.phonePlan(s.today) });
        await expect(saved).not.toBeChecked();
        await expect(phone).not.toBeChecked();
        await noAxeProblems(second.page);
        if (colorScheme === 'light' && info.project.name === 'sign-in-360' && kept === 'saved') {
          await second.page.screenshot({
            path: '../../docs/screens/3c/which-plan-to-keep-360-light.png',
            fullPage: true,
          });
        }

        // Nothing chosen yet: it says so.
        await choose.getByRole('button', { name: s.keepThisPlan }).click();
        await expect(choose.getByText(s.chooseFirst)).toBeVisible();

        await (kept === 'saved' ? saved : phone).check();
        await choose.getByRole('button', { name: s.keepThisPlan }).click();
        const confirm = second.page.getByRole('dialog', {
          name: kept === 'saved' ? s.keepSavedTitle : s.keepPhoneTitle,
        });
        await expect(
          confirm.getByText(kept === 'saved' ? s.keepSavedIntro : s.keepPhoneIntro),
        ).toBeVisible();
        await noAxeProblems(second.page);
        await confirm.getByRole('button', { name: s.removeIt }).click();
        await expect(second.page).toHaveURL(/\/app\/$/);
        const wanted = kept === 'saved' ? '£267.54' : '£111.11';
        await expect(second.page.getByTestId('balance')).toContainText(wanted);

        // A third phone signing in gets the plan that was kept.
        const third = await secondPhone(browser, info, colorScheme);
        await signIn(third.page, address);
        await expect(third.page.getByTestId('balance')).toContainText(wanted);
        expect(plansOwnedBy(await personOn(third.page))).toBe(1);

        // The first phone, opened again, has the plan that was kept too, even
        // when its own was the one removed (D352).
        await page.goto('/app/');
        await expect(page.getByTestId('balance')).toContainText(wanted);
        await second.context.close();
        await third.context.close();
      });
    }

    test('4. sign out: the phone holds nothing. Sign in again: the plan comes back', async ({
      page,
    }, info) => {
      const address = newEmail('kofi');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      await noAxeProblems(page);
      if (colorScheme === 'light' && info.project.name === 'sign-in-360') {
        await page.getByTestId('account').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: '../../docs/screens/3c/more-signed-in-360-light.png',
          fullPage: true,
        });
      }
      await page.getByTestId('account').getByRole('button', { name: 'Sign out' }).click();
      const sheet = page.getByRole('dialog', { name: 'Sign out' });
      await expect(sheet.getByText(t.signOutIntro)).toBeVisible();
      await expect(sheet.getByTestId('unsent-warning')).toHaveCount(0);
      await noAxeProblems(page);
      if (colorScheme === 'light' && info.project.name === 'sign-in-360') {
        await page.screenshot({ path: '../../docs/screens/3c/sign-out-360-light.png' });
      }
      await sheet.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: t.signedOut })).toBeVisible();
      const left = await whatThePhoneKeeps(page);
      expect(left.localStorage).toEqual([]);
      expect(left.sessionStorage).toEqual([]);
      for (const [store, rows] of Object.entries(left.rows)) expect(rows, store).toBe(0);

      await signIn(page, address);
      await expect(page).toHaveURL(/\/app\/$/);
      await expect(page.getByTestId('balance')).toContainText('£267.54');
    });

    test('5. sign out with a change not yet sent: the warning appears, and signing out waits for it to be sent', async ({
      page,
      context,
      browser,
    }, info) => {
      test.slow();
      const address = newEmail('ali');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      // Every file of the app on the phone, so it works with no signal (e2e/offline.spec.ts).
      await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
          timeout: 60_000,
        })
        .toBe(true);

      await context.setOffline(true);
      await updateBalance(page, {
        account: null,
        balance: '250.00',
        expected: '£267.54',
        difference: "That's £17.54 less.",
        toTick: 0,
      });
      await expect(page.getByTestId('offline-note')).toHaveText(strings.banners.offlineSending);
      await openMore(page);
      await expect(page.getByTestId('where-kept')).toHaveText(t.unsent(1));
      await page.getByTestId('account').getByRole('button', { name: 'Sign out' }).click();
      const sheet = page.getByRole('dialog', { name: 'Sign out' });
      await expect(sheet.getByTestId('unsent-warning')).toHaveText(t.signOutUnsent(1));
      await expect(sheet.getByRole('button', { name: t.signOutAnyway(true) })).toBeVisible();
      await noAxeProblems(page);
      if (colorScheme === 'light' && info.project.name === 'sign-in-360') {
        await page.screenshot({ path: '../../docs/screens/3c/sign-out-unsent-360-light.png' });
      }

      // Signed out once it's sent: it waits for a signal, then sends it, then signs out.
      await sheet.getByRole('button', { name: t.signOutWhenSent(true) }).click();
      await expect(sheet.getByText(t.waitingForSignal)).toBeVisible();
      await context.setOffline(false);
      await expect(page.getByRole('status').filter({ hasText: t.signedOut })).toBeVisible({
        timeout: 30_000,
      });

      // The change reached the account.
      const second = await secondPhone(browser, info, colorScheme);
      await signIn(second.page, address);
      await expect(second.page.getByTestId('balance')).toContainText('£250.00');
      await second.context.close();
    });

    test("6. a partner's phone gets shared records only", async ({ page, browser }, info) => {
      const jessAddress = newEmail('jess');
      await makeAPlan(page);
      await signUpFromMore(page, jessAddress);
      const jess = await personOn(page);
      const plan = sql(`select id from public.plans where owner = ${quoted(jess)}`);
      const jessPrivate = sql(
        `select string_agg(id::text, ',') from public.accounts where plan_id = ${quoted(plan)} and private_to = ${quoted(jess)}`,
      ).split(',');
      expect(jessPrivate.length).toBeGreaterThan(0);

      // Jess shares a joint account with rent on it (sharing on screen comes in step 3f).
      const joint = randomUUID();
      const rent = randomUUID();
      sql(`
        begin;
        select set_config('request.jwt.claims', json_build_object('sub', ${quoted(jess)}, 'role', 'authenticated',
          'session_id', (select id from auth.sessions where user_id = ${quoted(jess)} order by created_at desc limit 1))::text, true);
        insert into public.accounts (id, plan_id, name, kind, warning_level, list_order)
          values (${quoted(joint)}, ${quoted(plan)}, 'Joint bills', 'joint', 2000, 1);
        insert into public.balance_updates (id, plan_id, account_id, balance, checked_on, checked_at, list_order)
          values (${quoted(randomUUID())}, ${quoted(plan)}, ${quoted(joint)}, 80000, '2026-10-25', '2026-10-25T09:00:00Z', 1);
        insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule, end_rule,
          holiday_rule, family_id, family_created_at, list_order)
          values (${quoted(rent)}, ${quoted(plan)}, ${quoted(joint)}, 'Joint rent', 'out', 'rent', 110000, '2026-11-01',
          '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}', '{"kind":"never"}', 'keep', ${quoted(rent)},
          '2026-10-25T08:31:00Z', 9);
        commit;`);

      // Tom has an account, and joins Jess's plan (invites come in step 3f).
      const tomAddress = newEmail('tom');
      const tomId = await accountFor(tomAddress);
      sql(`insert into public.people (id) values (${quoted(tomId)}) on conflict do nothing;
        insert into public.plan_members (plan_id, person_id, role) values (${quoted(plan)}, ${quoted(tomId)}, 'editor');`);

      // Tom signs in on his own phone.
      const tom = await secondPhone(browser, info, colorScheme);
      await signIn(tom.page, tomAddress);
      await expect(tom.page).toHaveURL(/\/app\/$/);
      await expect(tom.page.getByTestId('balance')).toContainText('£800.00');
      await openHome(tom.page);
      await expect(tom.page.locator('main')).toContainText('Joint bills');
      await noAxeProblems(tom.page);

      // Nothing of Jess's private account is on Tom's phone, not even its id.
      const kept = await everythingKept(tom.page);
      expect(kept).toContain('Joint rent');
      for (const id of jessPrivate) expect(kept, "Jess's private account").not.toContain(id);
      expect(kept).not.toContain('267.54');
      expect(kept).not.toContain('26754');
      await tom.context.close();
    });

    test("7. the owner's case: a phone signed in part-way through setup before the account had a plan is asked which to keep, and keeping the saved plan keeps both phones in step", async ({
      page,
      browser,
    }, info) => {
      test.slow();
      const address = newEmail('owner');
      // The first phone, part-way through setup, signs in as it did in step
      // 3b, when nothing of the plan was sent: here the server answers
      // signing in, and nothing else.
      await startAPlan(page, '111.11');
      await page.context().route(DATA_API, (route) => route.abort());
      await signIn(page, address);
      // Supabase's own code tries a few times before it gives up on the server.
      await expect(page).toHaveURL(/\/setup\/$/, { timeout: 30_000 });
      await expect(page.getByTestId('signed-in')).toContainText(t.signedInWelcome(address));
      await expect(page.getByRole('button', { name: strings.welcome.carryOn })).toBeVisible();

      // A second phone finishes its plan and saves it in the account.
      const second = await phoneWithSavedPlan(browser, info, colorScheme, address);
      const saved = await threeScreens(second.page);

      // The first phone opens PrePenny again, and its server answers now: it
      // goes to setup, looks at the account, and asks.
      await page.context().unroute(DATA_API);
      await page.goto('/app/');
      await expect(page.getByRole('heading', { level: 1, name: s.chooseHeading })).toBeVisible();
      const choose = page.getByTestId('choose-plan');
      await expect(choose.getByRole('radio', { name: s.savedPlan(s.today) })).not.toBeChecked();
      await expect(choose.getByRole('radio', { name: s.phonePlan(s.today) })).not.toBeChecked();
      await expect(choose.getByText(s.phonePlanUnfinishedHint)).toBeVisible();
      await noAxeProblems(page);
      if (colorScheme === 'light' && info.project.name === 'sign-in-360') {
        await page.screenshot({
          path: '../../docs/screens/3c-fix/which-plan-to-keep-unfinished-360-light.png',
          fullPage: true,
        });
      }
      await choose.getByRole('radio', { name: s.savedPlan(s.today) }).check();
      await choose.getByRole('button', { name: s.keepThisPlan }).click();
      await page
        .getByRole('dialog', { name: s.keepSavedTitle })
        .getByRole('button', { name: s.removeIt })
        .click();

      // Home, with the same figures as the second phone, and one plan in the account.
      await expect(page).toHaveURL(/\/app\/$/);
      await expect(page.getByTestId('balance')).toContainText('£267.54');
      expect(await threeScreens(page)).toEqual(saved);
      expect(plansOwnedBy(await personOn(page))).toBe(1);
      await noAxeProblems(page);

      // A change on either phone reaches the other, left open on Home.
      await openHome(second.page);
      await updateBalance(page, {
        account: null,
        balance: '301.25',
        expected: '£267.54',
        difference: "That's £33.71 more.",
        toTick: 0,
      });
      await expect(second.page.getByTestId('balance')).toContainText('£301.25', {
        timeout: 20_000,
      });
      await updateBalance(second.page, {
        account: null,
        balance: '299.00',
        expected: '£301.25',
        difference: "That's £2.25 less.",
        toTick: 0,
      });
      await expect(page.getByTestId('balance')).toContainText('£299.00', { timeout: 20_000 });
      await second.context.close();
    });

    test('8. a phone part-way through setup, not signed in, signs in from the welcome and is asked which plan to keep', async ({
      page,
      browser,
    }, info) => {
      const address = newEmail('priya');
      const second = await phoneWithSavedPlan(browser, info, colorScheme, address);

      await startAPlan(page, '111.11');
      // The second phone signed in a moment ago: Supabase leaves a minute between emails (D305).
      makeCodeRunOut(address);
      await signInFromWelcome(page, address);
      await expect(page.getByRole('heading', { level: 1, name: s.chooseHeading })).toBeVisible();
      const choose = page.getByTestId('choose-plan');
      await expect(choose.getByRole('radio', { name: s.savedPlan(s.today) })).not.toBeChecked();
      await expect(choose.getByRole('radio', { name: s.phonePlan(s.today) })).not.toBeChecked();
      await noAxeProblems(page);

      // Keeping the plan on this phone: setup carries on where it was, and
      // it's the account's only plan.
      await choose.getByRole('radio', { name: s.phonePlan(s.today) }).check();
      await choose.getByRole('button', { name: s.keepThisPlan }).click();
      await page
        .getByRole('dialog', { name: s.keepPhoneTitle })
        .getByRole('button', { name: s.removeIt })
        .click();
      await expect(page).toHaveURL(/\/setup\/$/);
      await expect(page.getByRole('button', { name: strings.welcome.carryOn })).toBeVisible();
      const person = await personOn(page);
      expect(plansOwnedBy(person)).toBe(1);
      expect(
        sql(
          `select string_agg(b.balance::text, ',') from public.balance_updates b
             join public.plans p on p.id = b.plan_id where p.owner = ${quoted(person)}`,
        ),
      ).toBe('11111');

      // The second phone, whose plan was removed from the account, has the
      // kept one once it opens PrePenny again, part-way through setup.
      await second.page.reload();
      await expect(second.page).toHaveURL(/\/setup\/$/);
      await second.page.getByRole('button', { name: strings.welcome.carryOn }).click();
      await expect(second.page.getByTestId('added')).toContainText('£111.11');
      await noAxeProblems(second.page);
      await second.context.close();
    });

    test('9. a fresh phone signs in from the welcome, and the saved plan comes down', async ({
      page,
      browser,
    }, info) => {
      const address = newEmail('kofi');
      const second = await phoneWithSavedPlan(browser, info, colorScheme, address);
      const saved = await threeScreens(second.page);

      await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today: TODAY }] as const);
      await page.goto('/');
      await expect(page.getByRole('button', { name: strings.welcome.makeMyPlan })).toBeVisible();
      makeCodeRunOut(address);
      await signInFromWelcome(page, address);
      await expect(page).toHaveURL(/\/app\/$/);
      await expect(page.getByTestId('balance')).toContainText('£267.54');
      expect(await threeScreens(page)).toEqual(saved);
      await noAxeProblems(page);

      // And a fresh phone signed in before its account has a plan: left open
      // on the welcome, it brings the plan down once another phone has saved one.
      const later = newEmail('kofi-later');
      const third = await secondPhone(browser, info, colorScheme);
      await signIn(third.page, later);
      await expect(third.page).toHaveURL(/\/setup\/$/);
      await expect(third.page.getByTestId('signed-in')).toContainText(t.signedInWelcome(later));
      await expect(
        third.page.getByRole('button', { name: strings.welcome.makeMyPlan }),
      ).toBeVisible();
      const fourth = await phoneWithSavedPlan(browser, info, colorScheme, later);
      // The signal comes back on the third phone, which looks at the account.
      await third.page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(third.page).toHaveURL(/\/app\/$/);
      await expect(third.page.getByTestId('balance')).toContainText('£267.54');
      await second.context.close();
      await third.context.close();
      await fourth.context.close();
    });

    test('10. signing out from the welcome screen, and from a setup step', async ({
      page,
    }, info) => {
      const address = newEmail('dee');
      await startAPlan(page, '111.11');
      await signInFromWelcome(page, address);
      // The account had no plan, so the one on this phone went up, unfinished.
      await expect(page).toHaveURL(/\/setup\/$/);
      const person = await personOn(page);
      await expect.poll(() => plansOwnedBy(person)).toBe(1);

      const who = page.getByTestId('signed-in');
      await expect(who).toContainText(t.signedInWelcome(address));
      await expect(who.getByRole('button', { name: t.signOut })).toBeVisible();
      await noAxeProblems(page);
      if (colorScheme === 'light' && info.project.name === 'sign-in-360') {
        await page.screenshot({
          path: '../../docs/screens/3c-fix/welcome-signed-in-360-light.png',
          fullPage: true,
        });
      }

      // On a setup step too, under the step.
      await page.getByRole('button', { name: strings.welcome.carryOn }).click();
      await expect(page.getByText('Step 1 of 8', { exact: true })).toBeVisible();
      await expect(page.getByTestId('signed-in')).toContainText(t.signedInWelcome(address));
      await page.getByTestId('signed-in').getByRole('button', { name: t.signOut }).click();
      const onStep = page.getByRole('dialog', { name: t.signOut });
      await expect(onStep.getByText(t.signOutIntro)).toBeVisible();
      await noAxeProblems(page);
      await onStep.getByRole('button', { name: t.staySignedIn }).click();
      await expect(onStep).toBeHidden();
      await back(page);
      await expect(page.getByRole('button', { name: strings.welcome.carryOn })).toBeVisible();

      // The same sheet as on More: nothing waits to be sent, so no warning.
      await who.getByRole('button', { name: t.signOut }).click();
      const sheet = page.getByRole('dialog', { name: t.signOut });
      await expect(sheet.getByText(t.signOutIntro)).toBeVisible();
      await expect(sheet.getByTestId('unsent-warning')).toHaveCount(0);
      await noAxeProblems(page);
      if (colorScheme === 'light' && info.project.name === 'sign-in-360') {
        await page.screenshot({ path: '../../docs/screens/3c-fix/welcome-sign-out-360-light.png' });
      }
      await sheet.getByRole('button', { name: t.signOutConfirm, exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: t.signedOut })).toBeVisible();
      const left = await whatThePhoneKeeps(page);
      expect(left.localStorage).toEqual([]);
      expect(left.sessionStorage).toEqual([]);
      for (const [store, rows] of Object.entries(left.rows)) expect(rows, store).toBe(0);

      // Signing in again brings the unfinished plan back, still in setup.
      await signIn(page, address);
      await expect(page).toHaveURL(/\/setup\/$/);
      await page.getByRole('button', { name: strings.welcome.carryOn }).click();
      await expect(page.getByTestId('added')).toContainText('£111.11');
    });
  });
}

test('11. an account that already has two plans of its own: the phone asks which to keep, and the other is removed', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'sign-in-360', 'Once, at 360px.');
  const address = newEmail('ali');
  await makeAPlan(page);
  await signUpFromMore(page, address);
  const person = await personOn(page);

  // A second plan of the same person's, as two phones could leave before the
  // database refused it (D352): one account with £800.00.
  const other = randomUUID();
  const account = randomUUID();
  sql(`
    begin;
    alter table public.plans disable trigger one_plan_each;
    select set_config('request.jwt.claims', json_build_object('sub', ${quoted(person)}, 'role', 'authenticated',
      'session_id', (select id from auth.sessions where user_id = ${quoted(person)} order by created_at desc limit 1))::text, true);
    insert into public.plans (id) values (${quoted(other)});
    alter table public.plans enable trigger one_plan_each;
    insert into public.accounts (id, plan_id, private_to, name, kind, warning_level, belongs_to, list_order)
      values (${quoted(account)}, ${quoted(other)}, ${quoted(person)}, 'Older account', 'current', 2000, ${quoted(person)}, 0);
    insert into public.balance_updates (id, plan_id, account_id, balance, checked_on, checked_at, list_order)
      values (${quoted(randomUUID())}, ${quoted(other)}, ${quoted(account)}, 80000, '2026-10-25', '2026-10-25T09:00:00Z', 0);
    commit;`);
  expect(plansOwnedBy(person)).toBe(2);

  // Opened again, the phone asks: its own plan, or the other saved one.
  await page.goto('/app/');
  await expect(page.getByRole('heading', { level: 1, name: s.chooseHeading })).toBeVisible();
  const choose = page.getByTestId('choose-plan');
  await expect(choose.getByRole('radio', { name: s.phonePlan(s.today) })).toBeVisible();
  await choose.getByRole('radio', { name: s.savedPlan(s.today) }).check();
  await choose.getByRole('button', { name: s.keepThisPlan }).click();
  await page
    .getByRole('dialog', { name: s.keepSavedTitle })
    .getByRole('button', { name: s.removeIt })
    .click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByTestId('balance')).toContainText('£800.00');
  // The plan that was on the phone is gone from the account too: one plan is left, the one kept.
  expect(
    sql(`select string_agg(id::text, ',') from public.plans where owner = ${quoted(person)}`),
  ).toBe(other);
});

test('12. two phones sending their first copy at the same moment leave one plan in the account', async ({
  browserName: _browser,
}, info) => {
  test.skip(info.project.name !== 'sign-in-360', 'Once, at 360px.');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const address = newEmail('race');
    const { hashed_token: key } = await signInLink(address);
    const verified = await fetch(`${LOCAL_SUPABASE.url}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: LOCAL_SUPABASE.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email', token_hash: key }),
    });
    expect(verified.ok, 'the local Supabase signs the person in').toBe(true);
    const { access_token: token, user } = (await verified.json()) as {
      access_token: string;
      user: { id: string };
    };
    const startPlan = () =>
      fetch(`${LOCAL_SUPABASE.url}/rest/v1/rpc/start_plan`, {
        method: 'POST',
        headers: {
          apikey: LOCAL_SUPABASE.key,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: randomUUID(), nation: null }),
      });
    const answers = await Promise.all([startPlan(), startPlan()]);
    const made = answers.filter((answer) => answer.ok);
    expect(made, 'one phone gets its plan').toHaveLength(1);
    const refused = answers.find((answer) => !answer.ok);
    expect(((await refused?.json()) as { message?: string } | undefined)?.message).toBe(
      'has-a-plan',
    );
    expect(plansOwnedBy(user.id)).toBe(1);
  }
});

test('13. a first copy cut off part-way is sent again from where it stopped, and signing out warns until it has gone', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'sign-in-360', 'Once, at 360px.');
  const address = newEmail('jess');
  await makeAPlan(page);
  // The server answers signing in and starting the plan, but nothing it saves arrives.
  const saving = `${LOCAL_SUPABASE.url}/rest/v1/rpc/save_edit`;
  await page.context().route(saving, (route) => route.abort());
  await openMore(page);
  await page.getByTestId('account').getByRole('link', { name: 'Sign up or sign in' }).click();
  await askForCode(page, address);
  await box(page, '6-digit code').fill((await signInEmail(address)).code);
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/more\/$/, { timeout: 30_000 });
  await expect(page.getByTestId('where-kept')).toHaveText(t.notSavedYet);
  const person = await personOn(page);
  const accountsSaved = () =>
    Number(
      sql(`select count(*) from public.accounts a join public.plans p on p.id = a.plan_id
        where p.owner = ${quoted(person)}`),
    );
  expect(plansOwnedBy(person)).toBe(1);
  expect(accountsSaved()).toBe(0);

  // Until it has all gone, signing out says the plan would be lost.
  await page.getByTestId('account').getByRole('button', { name: 'Sign out' }).click();
  const sheet = page.getByRole('dialog', { name: 'Sign out' });
  await expect(sheet.getByTestId('unsent-warning')).toHaveText(t.signOutNotSaved);
  await sheet.getByRole('button', { name: t.staySignedIn }).click();

  // The signal comes back: the rest goes up.
  await page.context().unroute(saving);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByTestId('where-kept')).toHaveText(t.savedInAccount, { timeout: 20_000 });
  expect(accountsSaved()).toBe(1);
});
