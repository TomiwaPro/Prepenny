// The support dashboard and support's tools, for real against the local
// Supabase (step 4j, brief 4.16, D617 to D625, D640 to D642), at 320px and
// 360px wide, in light and dark, checked by axe. The dashboard is its own
// site (e2e/support-dashboard.spec.ts), with its own sign-in:
//
// 1. Only support's own account, signed in on the dashboard with two-step
//    sign-in passed, gets anything from its steps: not someone else signed
//    in (by the code from the email, whose link opens the dashboard), not
//    someone signed out, not support's own sign-in before its code, on the
//    dashboard or through the Data API. Support's own account, signed in on
//    the app, gets only "This is PrePenny support's account.", and never a
//    plan. Nothing about money and no email address reaches the console.
// 2. Replying, from a ready reply for someone in distress: the email from
//    hello@prepenny.co.uk, without their words, and the reply kept.
// 3. Support access: Jess starts it, support sees what she sees and never
//    Tom's private account, Tom is told in Activity, and when Jess ends it
//    support sees nothing more at once.
// 4. Each action and its email: signing out everywhere; the 7-day wait to
//    turn off two-step sign-in, stopped with its link, then finished; and
//    the link to a locked backup email, with its 24-hour wait and Stop it,
//    finishing through the get-back-in function.
// 5. The usage numbers, counts only, and the tax year check from 1 March.
// 6. PrePenny's status at the top (step 4k): the status page's four parts,
//    from the same status function, checked now.
//
// The database's own test, supabase/tests/database/40-support-tools.test.sql,
// proves every step refuses everyone else, each rule broken on purpose.

import { mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import { LOCAL_SUPABASE } from '../lib/sign-in-config.ts';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { strings } from '../strings/en-GB.ts';
import { supportStrings } from '../strings/support-en-GB.ts';
import { layoutProblems } from './coming-up.ts';
import { DASHBOARD } from './dashboard.ts';
import { openOnExample, settingScript } from './fixtures.ts';
import { addAccount, entries, jessAndTom, openActivity, planOf } from './jess-and-tom.ts';
import { box, noAxeProblems } from './setup.ts';
import { makeAPlan, newEmail, TODAY } from './sign-in-helpers.ts';
import { remindersJobRanJustNow, standInSite } from './status-site.ts';
import { appCode } from './totp.ts';
import {
  LOCAL_SECRET_KEY,
  openMore,
  personOn,
  quoted,
  secondPhone,
  signIn,
  sql,
} from './two-phones.ts';

const t = supportStrings.supportTools;
const a = strings.supportAccess;
const d = supportStrings.supportDashboard;
const INBOX = 'http://127.0.0.1:54324';
/** Support's own account in these tests: one for every test, as there's one support (D617). */
const SUPPORT = 'prepenny-support@example.com';

const test = base;

// ---------------------------------------------------------------------------
// Support's account.

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/** A sign-in token for an address, straight from the local Supabase (no email). */
async function tokenFor(address: string): Promise<string> {
  const link = await json(
    await fetch(`${LOCAL_SUPABASE.url}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { apikey: LOCAL_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email: address }),
    }),
  );
  const verified = await json(
    await fetch(`${LOCAL_SUPABASE.url}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: LOCAL_SUPABASE.key, 'Content-Type': 'application/json' },
      // A new account's first link is a sign-up one.
      body: JSON.stringify({ type: link.verification_type, token_hash: link.hashed_token }),
    }),
  );
  return verified.access_token as string;
}

/** Turns on two-step sign-in for an account, as its own phone would, and gives back its key. */
async function turnOnTwoStep(address: string): Promise<string> {
  const token = await tokenFor(address);
  const auth = {
    apikey: LOCAL_SUPABASE.key,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const factor = await json(
    await fetch(`${LOCAL_SUPABASE.url}/auth/v1/factors`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ factor_type: 'totp', friendly_name: `app-${Date.now()}` }),
    }),
  );
  const key = (factor.totp as { secret: string }).secret;
  const challenge = await json(
    await fetch(`${LOCAL_SUPABASE.url}/auth/v1/factors/${factor.id}/challenge`, {
      method: 'POST',
      headers: auth,
      body: '{}',
    }),
  );
  const verified = await fetch(`${LOCAL_SUPABASE.url}/auth/v1/factors/${factor.id}/verify`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ challenge_id: challenge.id, code: appCode(key) }),
  });
  expect(verified.ok, 'two-step sign-in is on').toBe(true);
  return key;
}

/** A one-time sign-in key for an address's email link, straight from the local Supabase (no email). */
async function linkKeyFor(address: string): Promise<string> {
  const link = await json(
    await fetch(`${LOCAL_SUPABASE.url}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { apikey: LOCAL_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email: address }),
    }),
  );
  return link.hashed_token as string;
}

/**
 * Support's own account, made once for every test, and the database told
 * it's support, as the Database workflow does from the SUPPORT_EMAIL secret
 * (D640). One test at a time (a folder made atomically is the lock), as a
 * new sign-in link for an address ends the one before: the work given is
 * done while the lock is held.
 */
async function withSupport<T>(work: () => Promise<T>): Promise<T> {
  const lock = join(tmpdir(), 'prepenny-support-account.lock');
  for (let waited = 0; ; waited += 1) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      // A lock left by a test that stopped part-way is taken after a minute.
      try {
        if (Date.now() - statSync(lock).mtimeMs > 60_000) rmSync(lock, { recursive: true });
      } catch {
        // Gone already.
      }
      if (waited > 600) throw new Error('Support account lock never freed');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  try {
    // Its first sign-in makes the account and proves its address.
    if (sql(`select count(*) from auth.users where email = ${quoted(SUPPORT)}`) === '0') {
      await tokenFor(SUPPORT);
    }
    expect(sql(`select app.set_support(${quoted(SUPPORT)})`)).toBe('set');
    return await work();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

/** The authenticator app's key for support's account, once it's set up. */
const supportKey = () =>
  sql(`select f.secret from auth.mfa_factors f join auth.users u on u.id = f.user_id
    where u.email = ${quoted(SUPPORT)} and f.status = 'verified' order by f.created_at limit 1`);

/**
 * Signs support in on the dashboard, with the email's link, then the
 * authenticator app: set up through the dashboard the first time (its
 * screenshot then), its code every time after. The dashboard then shows
 * its first view.
 */
async function openAsSupport(page: Page, today = TODAY) {
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today }] as const);
  await withSupport(async () => {
    await page.goto(`${DASHBOARD}/#token_hash=${await linkKeyFor(SUPPORT)}&type=email`);
    await expect(page.getByRole('heading', { level: 1, name: d.linkHeading })).toBeVisible();
    await page.getByRole('button', { name: d.finishLink }).click();
    const setUp = page.getByRole('heading', { level: 1, name: d.setUpHeading });
    const second = page.getByRole('heading', { level: 1, name: d.secondHeading });
    await expect(setUp.or(second)).toBeVisible({ timeout: 20_000 });
    if (await setUp.isVisible()) {
      await checkView(page, 'dashboard-set-up-start');
      await page.getByRole('button', { name: d.setUp, exact: true }).click();
      const key = ((await page.getByTestId('dashboard-key').textContent()) ?? '').replace(
        /\s/g,
        '',
      );
      await checkView(page, 'dashboard-set-up');
      await box(page, d.appCodeLabel).fill(appCode(key));
      await page.getByRole('button', { name: d.turnOn, exact: true }).click();
    } else {
      await checkView(page, 'dashboard-second-step');
      await box(page, d.appCodeLabel).fill(appCode(supportKey()));
      await page.getByRole('button', { name: d.continue, exact: true }).click();
    }
    await expect(page.getByRole('heading', { level: 1, name: t.heading })).toBeVisible({
      timeout: 20_000,
    });
  });
  await expect(page.getByTestId('support-inbox').getByText(t.loading)).toHaveCount(0);
}

/** Opens one of the dashboard's views, as a link in it does. */
async function openView(page: Page, view: string, heading: string) {
  await page.goto(`${DASHBOARD}/#${view}`);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

// ---------------------------------------------------------------------------
// The test inbox.

/** The newest email with this subject to exactly this address: its words. */
async function newestEmail(address: string, subject: string, after = 0): Promise<string> {
  let found = '';
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${INBOX}/api/v1/search?query=${encodeURIComponent(`to:"${address}" subject:"${subject}"`)}`,
        );
        const { messages } = (await response.json()) as {
          messages: { ID: string; Created: string }[];
        };
        for (const one of [...messages].sort((x, y) => y.Created.localeCompare(x.Created))) {
          if (Date.parse(one.Created) < after) continue;
          const message = (await (await fetch(`${INBOX}/api/v1/message/${one.ID}`)).json()) as {
            Subject: string;
            Text: string;
            To: { Address: string }[];
          };
          if (message.Subject === subject && message.To.some((to) => to.Address === address)) {
            found = message.Text;
            return true;
          }
        }
        return false;
      },
      { message: `"${subject}" to ${address}`, timeout: 20_000 },
    )
    .toBe(true);
  return found;
}

/** The newest sign-in email to an address since a time: its 6-digit code and its link. */
async function codeEmail(address: string, after: number): Promise<{ code: string; link: string }> {
  let found = { code: '', link: '' };
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${INBOX}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
        );
        const { messages } = (await response.json()) as {
          messages: { ID: string; Created: string }[];
        };
        for (const one of [...messages].sort((x, y) => y.Created.localeCompare(x.Created))) {
          if (Date.parse(one.Created) < after) continue;
          const message = (await (await fetch(`${INBOX}/api/v1/message/${one.ID}`)).json()) as {
            HTML: string;
          };
          const code = />\s*(\d{6})\s*</.exec(message.HTML)?.[1];
          const link = /href="([^"]*#token_hash=[^"]+)"/.exec(message.HTML)?.[1];
          if (code !== undefined && link !== undefined) {
            found = { code, link: link.replaceAll('&amp;', '&') };
            return true;
          }
        }
        return false;
      },
      { message: `a sign-in code to ${address}`, timeout: 20_000 },
    )
    .toBe(true);
  return found;
}

/** A link in an email's words. */
function linkIn(words: string, path: string): string {
  const found = new RegExp(`(https?://[^\\s]+${path.replaceAll('/', '\\/')}[^\\s]*)`).exec(words);
  expect(found, `a link to ${path}`).not.toBeNull();
  return (found?.[1] ?? '').replace('http://127.0.0.1:4173', '');
}

/** Everything written to the console, to check none of it is an address or money. */
function watchConsole(page: Page): string[] {
  const said: string[] = [];
  page.on('console', (message) => said.push(message.text()));
  return said;
}

const neverPersonal = (said: string[]) =>
  expect(said.filter((line) => /@|£/.test(line))).toEqual([]);

/** The screenshots for the owner (docs/screens/4j): 320px, light. */
const SHOTS = '../../docs/screens/4j';
/** Step 4k's, of PrePenny's status at the top of the dashboard. */
const STEP_4K_SHOTS = '../../docs/screens/4k';

/**
 * A view's checks: axe, then with text at 200% nothing outside the screen
 * or cut off and every tap target 44 by 44px (WCAG 1.4.4, 2.5.8), then the
 * text back as it was. At 320px in light, its screenshot for the owner.
 */
async function checkView(page: Page, name: string, shots = SHOTS) {
  await noAxeProblems(page);
  const style = await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(await layoutProblems(page), `${name} at 200% text`).toEqual([]);
  await style.evaluate((element) => (element as HTMLStyleElement).remove());
  const light = await page.evaluate(() => matchMedia('(prefers-color-scheme: light)').matches);
  if (light && page.viewportSize()?.width === 320) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/${name}-320-light.png`, fullPage: true });
  }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Support tools, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('1. Only support, with two-step sign-in passed, gets anything from the dashboard, and its account has no plan in the app', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(180_000);
      const said = watchConsole(page);
      // Signed out, the dashboard asks for nothing but the email address.
      await page.goto(`${DASHBOARD}/`);
      await expect(page.getByRole('heading', { level: 1, name: d.signInHeading })).toBeVisible();
      await expect(page.getByTestId('support-inbox')).toHaveCount(0);

      // Someone else signs in on the dashboard, with the code from the
      // email, as support will: the email's link opens the dashboard too.
      const someone = newEmail('someone');
      await box(page, d.emailLabel).fill(someone);
      const asked = Date.now();
      await page.getByRole('button', { name: d.sendCode }).click();
      await expect(page.getByTestId('dashboard-said')).toHaveText(d.sentTo(someone));
      await checkView(page, 'dashboard-code');
      const email = await codeEmail(someone, asked);
      expect(
        email.link.startsWith(`${DASHBOARD}/#token_hash=`),
        'the link opens the dashboard',
      ).toBe(true);
      await box(page, d.codeLabel).fill(email.code);
      await page.getByRole('button', { name: d.signIn, exact: true }).click();
      await expect(page.getByTestId('dashboard-card')).toHaveText(d.notSupport);
      await expect(page.getByTestId('support-inbox')).toHaveCount(0);
      await checkView(page, 'dashboard-not-support');
      // Their sign-in is kept for this tab only: nothing in the browser's lasting store.
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
      const someoneToken = await page.evaluate(
        () =>
          (
            JSON.parse(sessionStorage.getItem('prepenny-support-sign-in') ?? 'null') as {
              access_token: string;
            }
          ).access_token,
      );
      const someoneId = sql(`select id from auth.users where email = ${quoted(someone)}`);
      // Through the Data API, with their own sign-in, and signed out, every step is refused.
      const version = sql('select app.database_version()');
      const steps = {
        support_inbox: {},
        support_message: { message: '00000000-0000-0000-0000-000000000000' },
        support_find: { email: SUPPORT },
        support_account: { person: someoneId },
        support_plan: { person: someoneId },
        support_reply: { message: '00000000-0000-0000-0000-000000000000', words: 'Hello' },
        support_sign_out: { person: someoneId },
        support_start_two_step_wait: { person: someoneId },
        support_send_backup_link: { person: someoneId },
        support_usage: {},
      };
      for (const [step, args] of Object.entries(steps)) {
        for (const token of [someoneToken, null]) {
          const response = await fetch(`${LOCAL_SUPABASE.url}/rest/v1/rpc/${step}`, {
            method: 'POST',
            headers: {
              apikey: LOCAL_SUPABASE.key,
              ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
              'Content-Type': 'application/json',
              'x-prepenny-version': version,
            },
            body: JSON.stringify(args),
          });
          expect(response.ok, `${step} ${token === null ? 'signed out' : 'as someone else'}`).toBe(
            false,
          );
          const refusal = (await response.json()) as { message?: string };
          // A short code, never an address or anything about money.
          expect(refusal.message ?? '').not.toMatch(/@|£/);
        }
      }
      // And nobody reads support's records through the Data API's tables.
      for (const table of ['support_actions', 'support_access', 'error_codes', 'support_replies']) {
        const response = await fetch(`${LOCAL_SUPABASE.url}/rest/v1/${table}?select=*`, {
          headers: { apikey: LOCAL_SUPABASE.key, Authorization: `Bearer ${someoneToken}` },
        });
        expect(response.ok, `${table} isn't on the Data API`).toBe(false);
      }
      await page.getByRole('button', { name: d.signOut, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: d.signInHeading })).toBeVisible();
      expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

      // Support's own sign-in, before the authenticator app's code, gets nothing.
      const early = await withSupport(() => tokenFor(SUPPORT));
      const before = await fetch(`${LOCAL_SUPABASE.url}/rest/v1/rpc/support_inbox`, {
        method: 'POST',
        headers: {
          apikey: LOCAL_SUPABASE.key,
          Authorization: `Bearer ${early}`,
          'Content-Type': 'application/json',
          'x-prepenny-version': version,
        },
        body: '{}',
      });
      expect(before.ok).toBe(false);
      expect(((await before.json()) as { message?: string }).message).toBe('not-allowed');

      // Support, with the code typed: the inbox, the tax files and usage.
      const { page: support, context: supportComputer } = await secondPhone(
        browser,
        info,
        colorScheme,
      );
      const supportSaid = watchConsole(support);
      await openAsSupport(support);
      await expect(support.getByTestId('support-inbox')).toContainText(t.inboxHeading);
      await expect(support.getByTestId('support-tax-year')).toContainText(t.taxYearFine);
      await expect(support.getByTestId('support-usage').getByTestId('support-count')).toHaveCount(
        5,
      );
      await checkView(support, 'support');
      // Closing the tab signs out there: a new tab asks to sign in again.
      const another = await supportComputer.newPage();
      await another.goto(`${DASHBOARD}/`);
      await expect(another.getByRole('heading', { level: 1, name: d.signInHeading })).toBeVisible();
      neverPersonal(supportSaid);
      await supportComputer.close();

      // Support's own account, signed in on the app, gets only a line saying
      // so: no setup, no plan, and the database never gives it one (D640).
      // On a phone with a plan of its own, which never becomes support's.
      const { page: app, context: appPhone } = await secondPhone(browser, info, colorScheme);
      await makeAPlan(app);
      await withSupport(async () => {
        await app.goto(`/sign-in/#token_hash=${await linkKeyFor(SUPPORT)}&type=email`);
        await app.getByRole('button', { name: strings.signIn.finishLink }).click();
        await expect(app.getByTestId('support-account')).toBeVisible({ timeout: 20_000 });
      });
      await expect(
        app.getByRole('heading', { level: 1, name: strings.supportAccount.heading }),
      ).toBeVisible();
      await expect(app.getByTestId('support-account')).toContainText(strings.supportAccount.line);
      await expect(app.getByRole('navigation')).toHaveCount(0);
      await checkView(app, 'app-support-account');
      for (const path of ['/app/', '/setup/', '/app/more/']) {
        await app.goto(path);
        await expect(app.getByTestId('support-account')).toBeVisible();
      }
      // The phone's own plan is still nobody's, after opening it again too.
      const owners = () =>
        app.evaluate(
          () =>
            new Promise<string[]>((resolve, reject) => {
              const opened = indexedDB.open('prepenny');
              opened.onerror = () => reject(opened.error);
              opened.onsuccess = () => {
                const all = opened.result.transaction('plans').objectStore('plans').getAll();
                all.onsuccess = () =>
                  resolve(
                    (all.result as { isExample?: boolean; owner?: string }[])
                      .filter((plan) => plan.isExample !== true)
                      .map((plan) => plan.owner ?? 'nobody'),
                  );
              };
            }),
        );
      expect(await owners()).toEqual(['nobody']);
      expect(
        sql(`select count(*) from public.plan_members m join auth.users u on u.id = m.person_id
          where u.email = ${quoted(SUPPORT)}`),
      ).toBe('0');
      await app.getByRole('button', { name: strings.supportAccount.signOut, exact: true }).click();
      await expect(app.getByTestId('support-account')).toHaveCount(0);
      await expect(app).toHaveURL(/127\.0\.0\.1:4173\/$/);
      await appPhone.close();
      neverPersonal(said);
    });

    test('2. A reply from a ready reply goes from hello@prepenny.co.uk, without their words, and is kept', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const sam = newEmail('sam');
      const message =
        sql(`insert into app.support_messages (kind, email, words, screen, app_version,
          phone_type, file_kind, consent_at)
        values ('problem', ${quoted(sam)}, 'I can''t cope with the bills. Words only support reads',
          'home', 'b498ae820a00', 'Android, Chrome 131', 'picture', now())
        returning id`);
      // A real screenshot, as a phone sends one: the front page.
      await page.goto('/');
      // A part of it, small enough to hand to the database in one command.
      const png = await page.screenshot({ clip: { x: 0, y: 0, width: 160, height: 200 } });
      sql(`insert into app.support_files (message_id, kind, content_type, data, bytes, width, height)
        values (${quoted(message)}, 'picture', 'image/png', decode('${png.toString('hex')}', 'hex'),
          ${png.length}, ${png.readUInt32BE(16)}, ${png.readUInt32BE(20)})`);
      const said = watchConsole(page);
      await openAsSupport(page);
      await openView(page, `message=${message}`, t.kinds.problem ?? '');
      await expect(page.getByTestId('support-words')).toContainText('Words only support reads');
      await expect(page.getByTestId('support-about')).toContainText(t.fromChecked(sam));
      await expect(page.getByTestId('support-about')).toContainText(t.onScreen('home'));
      // The picture itself is drawn, not just its words.
      const picture = page.getByRole('img', { name: t.pictureAlt });
      await expect(picture).toBeVisible();
      await expect
        .poll(() => picture.evaluate((element) => (element as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      await expect(page.getByTestId('support-replies')).toContainText(t.noReply);
      await noAxeProblems(page);

      // The ready reply for someone in distress, changed a little, then sent.
      const form = page.getByTestId('support-reply-form');
      await form.getByRole('radio', { name: 'Someone in distress' }).check();
      const words = form.getByLabel(t.replyLabel);
      await expect(words).toHaveValue(/Call 116 123, free from any phone\./);
      await expect(words).toHaveValue(/StepChange: 0800 138 1111/);
      await expect(words).toHaveValue(/National Debtline: 0808 808 4000/);
      await expect(words).toHaveValue(/0800 240 4420/);
      await words.fill(`Hi Sam.\n${await words.inputValue()}`);
      await checkView(page, 'message-reply-ready');
      const after = Date.now();
      await form.getByRole('button', { name: t.sendReply }).click();
      await expect(page.getByTestId('support-reply-said')).toHaveText(t.replySent(sam));
      await expect(page.getByTestId('support-reply')).toHaveCount(1);
      await expect(page.getByTestId('support-reply')).toContainText('Hi Sam.');

      // The email: from hello@prepenny.co.uk, each line a paragraph, without Sam's words.
      const email = await newestEmail(sam, 'A reply from PrePenny support', after);
      expect(email).toContain('PrePenny support has replied to your message.');
      expect(email).toContain('Hi Sam.');
      expect(email).toContain('Call 116 123, free from any phone.');
      expect(email).not.toContain('Words only support reads');
      expect(
        sql(
          `select replied_at is not null from app.support_messages where id = ${quoted(message)}`,
        ),
      ).toBe('t');
      neverPersonal(said);
    });

    test('3. Support access shows only what Jess sees, Tom is told, and it stops at once when Jess ends it', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(240_000);
      const tom = await jessAndTom(page, browser, info, colorScheme);
      // Tom keeps an account of his own, private.
      await addAccount(tom.page, 'Tom private savings', '300');
      const tomId = await personOn(tom.page);
      await expect
        .poll(() =>
          sql(`select count(*) from public.accounts where name = 'Tom private savings'
            and private_to = ${quoted(tomId)}`),
        )
        .toBe('1');

      // Jess lets support see her plan.
      await openMore(page);
      await page
        .getByTestId('security')
        .getByRole('link', { name: new RegExp(`^${a.heading}`) })
        .click();
      await expect(page.getByRole('heading', { level: 1, name: a.heading })).toBeVisible();
      await expect(page.getByTestId('support-access')).toContainText(a.off);
      await noAxeProblems(page);
      await page.getByRole('button', { name: a.give }).click();
      await expect(page.getByTestId('support-access')).toContainText(
        /PrePenny support can see your plan until/,
      );
      await expect(page.getByTestId('support-access')).toContainText(a.notLooked);
      await checkView(page, 'support-access-on');
      const jess = await personOn(page);
      const until = sql(`select to_char((ends_at at time zone 'Europe/London')::date, 'Dy FMDD Mon')
        from app.support_access where person_id = ${quoted(jess)} and ended_at is null`);

      // Tom is told in Activity, with the day it ends by itself (a date's parts
      // are kept together with non-breaking spaces).
      const day = until.replaceAll(' ', '[ \\u00a0]');
      await openActivity(tom.page);
      await expect(entries(tom.page).first()).toContainText(
        new RegExp(`Jess let PrePenny support see the plan until ${day}\\.`),
        { timeout: 20_000 },
      );
      await checkView(tom.page, 'activity-tom-told');

      // Support sees Jess's plan, and nothing of Tom's private account.
      const { page: support, context: supportPhone } = await secondPhone(
        browser,
        info,
        colorScheme,
      );
      await openAsSupport(support);
      await openView(support, `account=${jess}`, t.accountHeading);
      await expect(support.getByTestId('support-account')).toContainText(t.plans.shared ?? '');
      await expect(support.getByTestId('support-their-plan')).toContainText(
        /They let support see their plan until/,
      );
      await checkView(support, 'account-with-access');
      await support.getByRole('link', { name: t.seePlan }).click();
      await expect(
        support.getByRole('heading', { level: 1, name: t.planViewHeading }),
      ).toBeVisible();
      await expect(support.getByTestId('read-only-account').first()).toContainText(
        'Current account',
      );
      await expect(support.getByTestId('read-only-row').first()).toBeVisible();
      await expect(support.getByText('Rent').first()).toBeVisible();
      await expect(support.getByText('Tom private savings')).toHaveCount(0);
      // Read only: nothing on it opens or changes anything.
      await expect(support.getByTestId('read-only-row').getByRole('button')).toHaveCount(0);
      await checkView(support, 'plan-read-only');
      expect(
        sql(
          `select count(*) from app.support_actions where person_id = ${quoted(jess)} and action = 'looked'`,
        ),
      ).toBe('1');

      // Jess sees when support looked, and ends it.
      await page.reload();
      await expect(page.getByTestId('support-access')).toContainText(/Support last looked at/);
      await page.getByRole('button', { name: a.end }).click();
      await expect(page.getByTestId('support-access-said')).toHaveText(a.ended);
      await expect(page.getByTestId('support-access')).toContainText(a.off);

      // Support sees nothing more, at once.
      await support.reload();
      await expect(support.getByTestId('support-plan-needs')).toHaveText(t.accessEnded);
      await expect(support.getByText('Rent')).toHaveCount(0);
      await checkView(support, 'plan-access-ended');
      // And Tom is told it ended.
      await tom.page.reload();
      await expect(entries(tom.page).first()).toContainText(
        'Jess stopped PrePenny support seeing the plan.',
        { timeout: 20_000 },
      );
      expect(await planOf(page)).toBe(await planOf(tom.page));
      await supportPhone.close();
      await tom.context.close();
    });

    test('4. Each action is recorded, and the person is emailed: signing out, the two-step wait, and the backup link', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(240_000);
      // Alex: an account with two-step sign-in, a backup email, and a phone signed in.
      const alex = newEmail('alex');
      const backup = newEmail('alex-backup');
      const alexKey = await turnOnTwoStep(alex);
      const alexId = sql(`select id from auth.users where email = ${quoted(alex)}`);
      sql(
        `insert into app.backup_emails (person_id, email) values (${quoted(alexId)}, ${quoted(backup)})`,
      );

      await openAsSupport(page);
      // Found by the address.
      const find = page.getByTestId('support-find');
      await find.getByLabel(t.findLabel).fill(alex.toUpperCase());
      await find.getByRole('button', { name: t.find }).click();
      await expect(page.getByRole('heading', { level: 1, name: t.accountHeading })).toBeVisible();
      await expect(page.getByTestId('support-account')).toContainText(t.signsInWith(alex));
      await expect(page.getByTestId('support-account')).toContainText(t.twoStepOn);
      await expect(page.getByTestId('support-account')).toContainText(t.backup(backup));
      await expect(page.getByTestId('support-account')).toContainText(t.plans.none ?? '');
      await checkView(page, 'account');

      // Sign out everywhere.
      let after = Date.now();
      await page.getByRole('button', { name: t.signOut }).click();
      const signOut = page.getByRole('dialog', { name: t.signOutTitle(alex) });
      await expect(signOut).toBeVisible();
      await checkView(page, 'sign-out-sheet');
      await signOut.getByRole('button', { name: t.signOutYes }).click();
      await expect(page.getByTestId('support-account-said')).toHaveText(
        /^Signed out of \d+ phones? or computers?\. They've been emailed\.$/,
      );
      expect(sql(`select count(*) from auth.sessions where user_id = ${quoted(alexId)}`)).toBe('0');
      const signedOut = await newestEmail(alex, 'PrePenny support signed you out', after);
      expect(signedOut).toContain(
        'PrePenny support signed your PrePenny account out of every phone and computer.',
      );
      await expect(page.getByTestId('support-did-entry').first()).toContainText(
        t.did['signed-out'] ?? '',
      );
      await expect(page.getByTestId('support-did-entry').first()).toContainText(t.emailed);

      // The 7-day wait to turn off two-step sign-in, stopped with its link.
      after = Date.now();
      await page.getByRole('button', { name: t.twoStep }).click();
      const wait = page.getByRole('dialog', { name: t.twoStepTitle });
      await wait.getByRole('button', { name: t.twoStepYes }).click();
      await expect(page.getByTestId('support-account-said')).toHaveText(
        /^The 7-day wait has started\./,
      );
      await expect(page.getByTestId('support-under-way')).toContainText(
        /Two-step sign-in is turned off at/,
      );
      const waitEmail = await newestEmail(
        alex,
        'PrePenny support is turning off two-step sign-in',
        after,
      );
      expect(waitEmail).toContain('Nothing changes for 7 days.');
      const stopLink = linkIn(waitEmail, '/stop-two-step-off/#');
      const { page: stopper, context: stopperPhone } = await secondPhone(
        browser,
        info,
        colorScheme,
      );
      await stopper.goto(stopLink);
      await expect(
        stopper.getByRole('heading', { level: 1, name: strings.stopTwoStepOff.heading }),
      ).toBeVisible();
      await noAxeProblems(stopper);
      await stopper.getByRole('button', { name: strings.stopTwoStepOff.stop }).click();
      await expect(
        stopper.getByRole('heading', { level: 1, name: strings.stopTwoStepOff.stoppedHeading }),
      ).toBeFocused();
      await expect(stopper.getByTestId('stop-outcome')).toContainText(
        strings.stopTwoStepOff.stopped,
      );
      await checkView(stopper, 'stop-two-step-off');
      await stopperPhone.close();
      expect(
        sql(`select stopped_how from app.two_step_waits where person_id = ${quoted(alexId)}`),
      ).toBe('link');

      // Alex, signed in on his own phone, sees the notice when it starts again,
      // and stops it there (D638).
      const { page: ownPhone, context: ownPhoneContext } = await secondPhone(
        browser,
        info,
        colorScheme,
      );
      await openOnExample(ownPhoneContext);
      await signIn(ownPhone, alex);
      await box(ownPhone, strings.security.appCodeLabel).fill(appCode(alexKey));
      await ownPhone.getByRole('button', { name: strings.secondStep.finish, exact: true }).click();
      await expect(ownPhone).toHaveURL(/\/app\//, { timeout: 20_000 });
      await page.reload();
      await page.getByRole('button', { name: t.twoStep }).click();
      await page
        .getByRole('dialog', { name: t.twoStepTitle })
        .getByRole('button', { name: t.twoStepYes })
        .click();
      await expect(page.getByTestId('support-account-said')).toHaveText(
        /^The 7-day wait has started\./,
      );
      const notice = ownPhone.getByTestId('two-step-off-notice');
      await expect(notice).toBeVisible({ timeout: 70_000 });
      await expect(notice).toContainText(strings.twoStepOffNotice.heading);
      await checkView(ownPhone, 'two-step-off-notice');
      await notice.getByRole('button', { name: strings.twoStepOffNotice.stop }).click();
      await expect(ownPhone.getByTestId('two-step-off-stopped')).toHaveText(
        new RegExp(strings.twoStepOffNotice.stopped.replace('.', '\\.')),
      );
      expect(
        sql(`select count(*) from app.two_step_waits where person_id = ${quoted(alexId)}
          and stopped_how = 'device'`),
      ).toBe('1');
      await ownPhoneContext.close();

      // Started a third time, and after 7 days it's turned off.
      await page.reload();
      await page.getByRole('button', { name: t.twoStep }).click();
      await page
        .getByRole('dialog', { name: t.twoStepTitle })
        .getByRole('button', { name: t.twoStepYes })
        .click();
      await expect(page.getByTestId('support-account-said')).toHaveText(
        /^The 7-day wait has started\./,
      );
      after = Date.now();
      // Seven days pass: for the wait, and for when Alex last used his app.
      sql(`update app.two_step_waits set started_at = started_at - interval '7 days'
        where person_id = ${quoted(alexId)} and stopped_at is null and done_at is null`);
      sql(`update auth.mfa_amr_claims set created_at = created_at - interval '7 days',
          updated_at = updated_at - interval '7 days'
        where session_id in (select id from auth.sessions where user_id = ${quoted(alexId)})`);
      sql(`update auth.mfa_challenges set created_at = created_at - interval '7 days',
          verified_at = verified_at - interval '7 days'
        where factor_id in (select id from auth.mfa_factors where user_id = ${quoted(alexId)})`);
      sql('select app.support_tools_tick()');
      expect(sql(`select app.two_step_on(${quoted(alexId)})`)).toBe('f');
      const offEmail = await newestEmail(alex, 'Two-step sign-in is off', after);
      expect(offEmail).toContain('you now sign in with this email address alone');
      await page.reload();
      await expect(page.getByTestId('support-account')).toContainText(t.twoStepOff);

      // The backup email kept locked by wrong codes: support's link still works.
      sql(`insert into app.code_locks (address_key, purpose, locked_until)
        values (app.address_key(${quoted(backup)}), 'get-in', now() + interval '24 hours')
        on conflict (address_key, purpose) do update set locked_until = excluded.locked_until`);
      after = Date.now();
      await page.getByRole('button', { name: t.backupLink }).click();
      const linkSheet = page.getByRole('dialog', { name: t.backupLinkTitle });
      await expect(linkSheet).toContainText(t.backupLinkIntro(backup));
      await linkSheet.getByRole('button', { name: t.backupLinkYes }).click();
      await expect(page.getByTestId('support-account-said')).toHaveText(t.backupLinkSent(backup));
      const startEmail = await newestEmail(
        backup,
        'A link from PrePenny support to get back in',
        after,
      );
      const startLink = linkIn(startEmail, '/get-back-in/#support=');

      // Alex opens it, signed out, on another phone: the 24-hour wait starts, and the sign-in address is told.
      const { page: phone, context: alexPhone } = await secondPhone(browser, info, colorScheme);
      await phone.goto(startLink);
      await expect(phone.getByTestId('get-back-in-link')).toBeVisible();
      await expect(phone).toHaveURL(/\/get-back-in\/$/);
      await checkView(phone, 'get-back-in-link');
      after = Date.now();
      await phone.getByRole('button', { name: strings.getBackIn.useLink }).click();
      await expect(phone.getByTestId('get-back-in-waiting')).toContainText(
        strings.getBackIn.linkThenWhat(backup),
      );
      await checkView(phone, 'get-back-in-waiting');
      const told = await newestEmail(
        alex,
        'Someone asked to get into your PrePenny account',
        after,
      );
      expect(linkIn(told, '/stop-get-back-in/#')).toMatch(
        /^\/stop-get-back-in\/#[A-Za-z0-9_-]{43}$/,
      );

      // After 24 hours, the link to finish is emailed, and it finishes through the get-back-in function.
      sql(`update app.get_back_in set started_at = started_at - interval '24 hours'
        where person_id = ${quoted(alexId)} and stopped_at is null and done_at is null`);
      after = Date.now();
      expect(JSON.parse(sql('select app.support_tools_tick()')).finish_links).toBe(1);
      const finishEmail = await newestEmail(
        backup,
        'A link from PrePenny support to finish getting back in',
        after,
      );
      await phone.goto(linkIn(finishEmail, '/get-back-in/#support='));
      await phone.getByRole('button', { name: strings.getBackIn.useLink }).click();
      await expect(phone.getByText(strings.getBackIn.signInNow)).toBeVisible({ timeout: 20_000 });
      expect(sql(`select email from auth.users where id = ${quoted(alexId)}`)).toBe(backup);
      await alexPhone.close();

      // Every action is recorded, with the time.
      await page.reload();
      await expect(page.getByTestId('support-did-entry')).toHaveCount(9);
      expect(
        sql(
          `select string_agg(action, ',' order by at) from app.support_actions where person_id = ${quoted(alexId)}`,
        ),
      ).toBe(
        'signed-out,two-step-wait,two-step-kept,two-step-wait,two-step-kept,two-step-wait,two-step-off,backup-link,backup-finish-link',
      );
      await checkView(page, 'account-after-actions');
    });

    test("5. Usage is counts only, and from 1 March the tax year check says next year's file is missing", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await openAsSupport(page, '2027-03-01');
      const tax = page.getByTestId('support-tax-year');
      await expect(tax).toContainText(
        'The pay calculator has no tax file for the 2027 to 2028 tax year, which starts on Tue',
      );
      await expect(tax).toContainText('6');
      const usage = page.getByTestId('support-usage');
      await expect(usage.getByTestId('support-count')).toHaveCount(5);
      for (const count of await usage.getByTestId('support-count').all()) {
        await expect(count).toHaveText(/^.+\d+$/);
      }
      // The last 8 weeks' sign-ups, newest first, each a count.
      await expect(usage.getByTestId('support-week')).toHaveCount(8);
      await expect(usage.getByTestId('support-week').first()).toHaveText(/^Week starting .+\d+$/);
      // Never a name, an address or money.
      await expect(usage).not.toContainText('@');
      await expect(usage).not.toContainText('£');
      await checkView(page, 'support-tax-missing');
      // The day before 1 March, there's nothing to say.
      await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today: '2027-02-28' }] as const);
      await page.reload();
      await expect(page.getByTestId('support-tax-year')).toContainText(t.taxYearFine);
    });

    test("6. PrePenny's status is at the top: the status page's four parts, checked now by the same function", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await openAsSupport(page);
      const status = page.getByTestId('support-status');
      // At the top: the first card under the dashboard's heading.
      await expect(page.locator('main section').first()).toHaveAttribute(
        'data-testid',
        'support-status',
      );
      const parts = status.getByTestId('support-status-part');
      const checkAgain = status.getByRole('button', { name: t.checkAgain });
      const words = (working: Readonly<Record<string, boolean>>) =>
        (['app', 'sign-in', 'saving', 'reminders'] as const).map(
          (part) => `${t.statusParts[part]}${working[part] ? t.working : t.notWorking}`,
        );
      await withSupport(async () => {
        // The app's site answering, and the reminders job just run, as on the real project.
        const site = await standInSite();
        const takeAway = remindersJobRanJustNow();
        try {
          await checkAgain.click();
          await expect(parts).toHaveText(
            words({ app: true, 'sign-in': true, saving: true, reminders: true }),
          );
          await expect(status).toContainText(/Checked at \d{1,2}:\d{2}(am|pm)\./);
          await expect(status).not.toHaveClass(/notice/);
          const statusPageLink = status.getByRole('link', {
            name: `${t.statusPage}, ${t.statusPageOpens}`,
          });
          await expect(statusPageLink).toHaveAttribute(
            'href',
            'https://stats.uptimerobot.com/prepenny-test',
          );
          await expect(statusPageLink).toHaveAttribute('target', '_blank');
          await checkView(page, 'support-status', STEP_4K_SHOTS);

          // The app's site stops answering: only the app isn't working.
          site.working = false;
          await checkAgain.click();
          await expect(parts).toHaveText(
            words({ app: false, 'sign-in': true, saving: true, reminders: true }),
          );
          await expect(status).toHaveClass(/notice/);
          await checkView(page, 'support-status-app-down', STEP_4K_SHOTS);
        } finally {
          takeAway();
          await site.close();
        }
        // The reminders job stopped: reminders aren't working either.
        await checkAgain.click();
        await expect(parts).toHaveText(
          words({ app: false, 'sign-in': true, saving: true, reminders: false }),
        );

        // PrePenny's server doesn't answer at all: nothing could be checked.
        await page.route(`${LOCAL_SUPABASE.url}/functions/v1/status`, (route) =>
          route.abort('connectionrefused'),
        );
        await checkAgain.click();
        await expect(status.getByRole('status')).toHaveText(t.noAnswer);
        await expect(status).toHaveClass(/notice/);
        await noAxeProblems(page);
      });
    });
  });
}
