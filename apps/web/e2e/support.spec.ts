// Contact us, Something looks wrong and Suggest a feature, sent for real to
// the local Supabase (step 4i, brief 4.16, D601 to D613), at 320px and 360px
// wide, in light and dark, checked by axe:
//
// 1. each kind, signed out, with the code that proves the address, and the
//    automatic reply and the note to hello@prepenny.co.uk with none of the
//    words; a screenshot kept with its hidden details taken out;
// 2. each kind, signed in, replied to only at the address they sign in with;
// 3. the caps: 3 codes a day for an address, 5 messages a day from a person;
// 4. nobody reads anyone else's message or picture, and nobody can make
//    PrePenny send their words to someone else's address.
//
// The tidy-up after 30 days and 12 months is the database's own test,
// supabase/tests/database/39-support-messages.test.sql.

import { test as base, type Page } from '@playwright/test';
import { LOCAL_SUPABASE } from '../lib/sign-in-config.ts';
import { strings } from '../strings/en-GB.ts';
import { expect, openOnExample } from './fixtures.ts';
import { noAxeProblems } from './setup.ts';
import { codeIn, countEmails, makeAPlan, newEmail } from './sign-in-helpers.ts';
import { jpegWithDetails } from './support-files.ts';
import { quoted, signUpFromMore, sql } from './two-phones.ts';

const t = strings.support;
const p = t.problem;
const INBOX = 'http://127.0.0.1:54324';
const CODE_SUBJECT = 'Your PrePenny code to send your message';
const REPLY_SUBJECT = 'PrePenny has your message';
const NOTICE_SUBJECT = "A message is waiting in PrePenny's support inbox";
const SUPPORT = 'hello@prepenny.co.uk';

const test = base;

/** The newest email with this subject to exactly this address: its words and its HTML. */
async function newestEmail(
  address: string,
  subject: string,
): Promise<{ text: string; html: string }> {
  let found: { text: string; html: string } | null = null;
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${INBOX}/api/v1/search?query=${encodeURIComponent(`to:"${address}" subject:"${subject}"`)}`,
        );
        const { messages } = (await response.json()) as {
          messages: { ID: string; Created: string }[];
        };
        for (const one of [...messages].sort((a, b) => b.Created.localeCompare(a.Created))) {
          const message = (await (await fetch(`${INBOX}/api/v1/message/${one.ID}`)).json()) as {
            Subject: string;
            Text: string;
            HTML: string;
            To: { Address: string }[];
          };
          if (message.Subject === subject && message.To.some((to) => to.Address === address)) {
            found = { text: message.Text, html: message.HTML };
            return true;
          }
        }
        return false;
      },
      { message: `"${subject}" to ${address}`, timeout: 20_000 },
    )
    .toBe(true);
  return found as unknown as { text: string; html: string };
}

/** The main part of the screen: its own form, not the one in Something looks wrong's closed sheet. */
const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page) => page.locator('dialog[open]');

/** Types a code from the email into a form and sends it. */
async function sendWithCode(where: ReturnType<Page['locator']>, address: string, after: number) {
  await expect(where.getByText(t.codeSent(address))).toBeVisible();
  await where.getByLabel(t.codeLabel).fill(await codeIn(address, CODE_SUBJECT, after));
  await where.getByRole('button', { name: t.sendWithCode }).click();
  await expect(where.getByRole('heading', { name: t.sentTitle })).toBeVisible();
}

/** "Fri 20 Nov", the day the database aims to answer a message by. */
function answerBy(condition: string): string {
  return sql(`select to_char(answer_by, 'Dy FMDD Mon') from app.support_messages where ${condition}
    order by sent_at desc limit 1`);
}

// The day's words are kept on one line with non-breaking spaces, as every date in PrePenny.
const ANSWER_LINE =
  /^Thanks\. We aim to answer within 1 working day, so by the end of [A-Z][a-z]{2}[ \u00a0]\d{1,2}[ \u00a0][A-Z][a-z]{2}([ \u00a0]\d{4})?\.$/;

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Writing to PrePenny support, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test('1. Signed out, each kind goes only with the code sent to the address, and no email holds the words', async ({
      page,
    }) => {
      await openOnExample(page.context());
      const address = newEmail('sam');
      // hello@prepenny.co.uk is told at most once every 4 hours: as if 4 hours had passed.
      sql('update app.support_told set told_at = null where only_one');

      // Contact us, on the website.
      let after = Date.now();
      await page.goto('/contact/');
      await main(page)
        .getByLabel(t.contact.wordsLabel)
        .fill('I lost my phone. Words only support reads');
      await main(page).getByLabel(t.emailLabel).fill(address);
      await main(page).getByRole('button', { name: t.send, exact: true }).click();
      await noAxeProblems(page);
      // A wrong code first: nothing goes.
      await expect(main(page).getByText(t.codeSent(address))).toBeVisible();
      const code = await codeIn(address, CODE_SUBJECT, after);
      await main(page)
        .getByLabel(t.codeLabel)
        .fill(code === '000000' ? '111111' : '000000');
      await main(page).getByRole('button', { name: t.sendWithCode }).click();
      await expect(main(page).getByText(t.codeWrong)).toBeVisible();
      expect(
        sql(`select count(*) from app.support_messages where email = ${quoted(address)}`),
      ).toBe('0');
      await main(page).getByLabel(t.codeLabel).fill(code);
      await main(page).getByRole('button', { name: t.sendWithCode }).click();
      await expect(main(page).getByRole('heading', { name: t.sentTitle })).toBeFocused();
      const day = answerBy(`email = ${quoted(address)}`);
      await expect(main(page).getByTestId('support-sent').locator('p')).toHaveText([
        ANSWER_LINE,
        t.sentEmailed(address),
      ]);
      await expect(main(page).getByTestId('support-sent').locator('p').first()).toContainText(
        day.replaceAll(' ', '\u00a0'),
      );
      await noAxeProblems(page);

      // The automatic reply: when to expect an answer, and none of the words.
      const reply = await newestEmail(address, REPLY_SUBJECT);
      // Its date is kept on one line with non-breaking spaces, as on screen.
      expect(reply.text.replaceAll('\u00a0', ' ')).toContain(
        `We aim to answer within 1 working day, so by the end of ${day}`,
      );
      expect(reply.text).toContain("For your privacy, this email doesn't repeat what you wrote.");
      for (const email of [reply.text, reply.html]) {
        expect(email).not.toContain('Words only support reads');
        expect(email).not.toContain('lost my phone');
      }
      // hello@prepenny.co.uk is told a message is waiting, with none of its words, and not who sent it.
      const notice = await newestEmail(SUPPORT, NOTICE_SUBJECT);
      expect(notice.text).toMatch(/^\d+ messages? (is|are) waiting\./);
      expect(notice.text).not.toContain('Words only support reads');
      expect(notice.text).not.toContain(address);

      // Kept with the address the code proved, the version and the phone's type.
      expect(
        sql(`select kind || '|' || words || '|' || phone_type || '|' || (person_id is null)
          from app.support_messages where email = ${quoted(address)}`),
      ).toMatch(/^contact\|I lost my phone\. Words only support reads\|Linux, Chrome \d+\|true$/);

      // Something looks wrong, on Home of Sam's example, with a screenshot that names a place.
      await page.goto('/app/');
      await expect(page.getByTestId('lowest-point')).toContainText('£4.53');
      const picture = await jpegWithDetails(page);
      await page.getByRole('button', { name: t.somethingWrong, exact: true }).click();
      await sheet(page).getByLabel(p.wordsLabel).fill('The lowest point looks wrong');
      await sheet(page).getByRole('radio', { name: p.picture }).check();
      const chooser = page.waitForEvent('filechooser');
      await sheet(page).getByRole('button', { name: p.choosePicture }).click();
      await (await chooser).setFiles({
        name: 'IMG_0412.jpg',
        mimeType: 'image/jpeg',
        buffer: picture,
      });
      await expect(sheet(page).getByTestId('file-chosen')).toHaveText(/^Picture chosen: /);
      await sheet(page).getByLabel(t.emailLabel).fill(address);
      after = Date.now();
      // The once-a-minute wait between codes to one address, passed.
      sql(
        `update app.support_codes set sent_at = sent_at - interval '61 seconds' where email = ${quoted(address)}`,
      );
      await sheet(page).getByRole('button', { name: t.send, exact: true }).click();
      await sendWithCode(sheet(page), address, after);
      await noAxeProblems(page);
      // Its hidden details were taken out on the phone: what's kept has no place in it.
      expect(
        sql(`select f.content_type || '|' || m.screen || '|' || position('GPS'::bytea in f.data)
            || '|' || position('Exif'::bytea in f.data) || '|' || (m.consent_at is not null)
          from app.support_files f join app.support_messages m on m.id = f.message_id
          where m.email = ${quoted(address)}`),
      ).toBe('image/jpeg|home|0|0|true');

      // Suggest a feature: kept, with no automatic reply.
      await page.goto('/app/suggest/');
      await main(page).getByLabel(t.idea.wordsLabel).fill('Remind me before my phone bill');
      await main(page).getByLabel(t.emailLabel).fill(address);
      sql(
        `update app.support_codes set sent_at = sent_at - interval '61 seconds' where email = ${quoted(address)}`,
      );
      after = Date.now();
      await main(page).getByRole('button', { name: t.send, exact: true }).click();
      await sendWithCode(main(page), address, after);
      await expect(main(page).getByTestId('support-sent').locator('p')).toHaveText([t.sentIdea]);
      expect(
        sql(
          `select string_agg(kind, ',' order by kind) from app.support_messages where email = ${quoted(address)}`,
        ),
      ).toBe('contact,idea,problem');
      // One automatic reply a day: the second and the idea got none.
      expect(await countEmails(address, REPLY_SUBJECT)).toBe(1);
    });

    test("2. Signed in, each kind is the person's own, and the reply goes only to the address they sign in with", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const address = newEmail('jess');
      await makeAPlan(page);
      await signUpFromMore(page, address);
      const person = sql(`select id from auth.users where email = ${quoted(address)}`);

      // Contact us under More: no address to type, so none can be someone else's.
      await page.goto('/app/contact/');
      await expect(page.getByRole('heading', { level: 1, name: t.contact.heading })).toBeVisible();
      await expect(main(page).getByLabel(t.emailLabel)).toHaveCount(0);
      await noAxeProblems(page);
      await main(page).getByLabel(t.contact.wordsLabel).fill('Signed in and writing');
      await main(page).getByRole('button', { name: t.send, exact: true }).click();
      await expect(main(page).getByTestId('support-sent').locator('p')).toHaveText([
        ANSWER_LINE,
        t.sentEmailed(address),
      ]);
      const reply = await newestEmail(address, REPLY_SUBJECT);
      expect(reply.text).not.toContain('Signed in and writing');

      // Something looks wrong on Coming up, with a copy of the plan.
      await page.goto('/app/coming-up/');
      await expect(page.getByRole('heading', { level: 1, name: 'Coming up' })).toBeVisible();
      await page.getByRole('button', { name: t.somethingWrong, exact: true }).click();
      await sheet(page).getByLabel(p.wordsLabel).fill('My balance is out');
      await sheet(page).getByRole('radio', { name: p.plan }).check();
      await expect(sheet(page).getByText(p.planConsent)).toBeVisible();
      const backup = Buffer.from(
        JSON.stringify({
          app: 'PrePenny',
          kind: 'backup',
          version: 1,
          about: 'A copy',
          plan: { records: {} },
        }),
      );
      const chooser = page.waitForEvent('filechooser');
      await sheet(page).getByRole('button', { name: p.choosePlan }).click();
      await (await chooser).setFiles({
        name: 'prepenny-backup.json',
        mimeType: 'application/json',
        buffer: backup,
      });
      await expect(sheet(page).getByTestId('file-chosen')).toHaveText(p.planChosen('1 KB'));
      await sheet(page).getByRole('button', { name: t.send, exact: true }).click();
      await expect(sheet(page).getByTestId('support-sent').locator('p')).toHaveText([
        ANSWER_LINE,
        t.sentReplyTo(address),
      ]);
      await noAxeProblems(page);

      // Suggest a feature.
      await page.goto('/app/suggest/');
      await main(page).getByLabel(t.idea.wordsLabel).fill('Card limits, please');
      await main(page).getByRole('button', { name: t.send, exact: true }).click();
      await expect(main(page).getByTestId('support-sent').locator('p')).toHaveText([t.sentIdea]);

      expect(
        sql(`select string_agg(kind || ':' || coalesce(screen, '-') || ':' || coalesce(file_kind, '-'), ','
            order by kind) || '|' || bool_and(email is null)
          from app.support_messages where person_id = ${quoted(person)}`),
      ).toBe('contact:-:-,idea:-:-,problem:coming-up:plan|true');
      expect(
        sql(`select f.content_type || '|' || (convert_from(f.data, 'UTF8')::jsonb ->> 'app')
          from app.support_files f join app.support_messages m on m.id = f.message_id
          where m.person_id = ${quoted(person)}`),
      ).toBe('application/json|PrePenny');
      expect(await countEmails(address, REPLY_SUBJECT)).toBe(1);
      expect(await countEmails(address, CODE_SUBJECT)).toBe(0);

      // A sign-in that isn't finished, or has ended before this phone has
      // heard: the server refuses it, as it does then (39-support-messages),
      // and the phone writes with the address and a code instead (D615),
      // which carry no sign-in and go to the real server.
      await page.route('**/rest/v1/rpc/send_support', (route) =>
        route.request().headers().authorization === undefined
          ? route.continue()
          : route.fulfill({ status: 401, json: { code: '42501', message: 'not-allowed' } }),
      );
      await page.goto('/app/contact/');
      await main(page).getByLabel(t.contact.wordsLabel).fill('After my sign-in ended');
      await main(page).getByRole('button', { name: t.send, exact: true }).click();
      await expect(main(page).getByRole('alert')).toHaveText(t.notAllowed);
      await expect(main(page).getByLabel(t.emailLabel)).toBeFocused();
      const after = Date.now();
      await main(page).getByLabel(t.emailLabel).fill(address);
      await main(page).getByRole('button', { name: t.send, exact: true }).click();
      await sendWithCode(main(page), address, after);
      expect(
        sql(`select count(*) from app.support_messages
          where email = ${quoted(address)} and words = 'After my sign-in ended'`),
      ).toBe('1');
    });

    test('3. The caps: 3 codes a day for an address, and 5 messages a day from one person', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      // Codes: 3 a day for one address, each a minute apart.
      const address = newEmail('kim');
      await page.goto('/contact/');
      await main(page).getByLabel(t.contact.wordsLabel).fill('Hello');
      await main(page).getByLabel(t.emailLabel).fill(address);
      await main(page).getByRole('button', { name: t.send, exact: true }).click();
      await expect(main(page).getByText(t.codeSent(address))).toBeVisible();
      // Too soon for another.
      await main(page).getByRole('button', { name: t.newCode }).click();
      await expect(main(page).getByRole('alert')).toHaveText(
        /^You can ask for a new code in \d+ seconds?\.$/,
      );
      for (const _ of [2, 3]) {
        sql(
          `update app.support_codes set sent_at = sent_at - interval '61 seconds' where email = ${quoted(address)}`,
        );
        await main(page).getByRole('button', { name: t.newCode }).click();
        await expect(main(page).getByRole('alert')).toBeEmpty();
      }
      sql(
        `update app.support_codes set sent_at = sent_at - interval '61 seconds' where email = ${quoted(address)}`,
      );
      await main(page).getByRole('button', { name: t.newCode }).click();
      await expect(main(page).getByRole('alert')).toHaveText(t.tooManyCodes);
      await expect.poll(() => countEmails(address, CODE_SUBJECT)).toBe(3);
      await noAxeProblems(page);

      // Messages: 5 a day from one person, of every kind together.
      const jess = newEmail('jess');
      await makeAPlan(page);
      await signUpFromMore(page, jess);
      await page.goto('/app/suggest/');
      for (const n of [1, 2, 3, 4, 5]) {
        await main(page).getByLabel(t.idea.wordsLabel).fill(`Idea ${n}`);
        await main(page).getByRole('button', { name: t.send, exact: true }).click();
        await expect(main(page).getByTestId('support-sent')).toBeVisible();
        await main(page).getByRole('button', { name: t.writeAnother }).click();
      }
      await main(page).getByLabel(t.idea.wordsLabel).fill('Idea 6');
      await main(page).getByRole('button', { name: t.send, exact: true }).click();
      await expect(main(page).getByRole('alert')).toHaveText(t.tooMany);
      // What was typed is still there, and nothing more was kept.
      await expect(main(page).getByLabel(t.idea.wordsLabel)).toHaveValue('Idea 6');
      expect(
        sql(`select count(*) from app.support_messages m join auth.users u on u.id = m.person_id
          where u.email = ${quoted(jess)}`),
      ).toBe('5');
      await noAxeProblems(page);
    });

    test("4. Nobody reads anyone else's message or picture, or sends their words to someone else's address", async ({
      page,
      browser,
    }) => {
      test.setTimeout(120_000);
      // Jess writes, signed in.
      const jess = newEmail('jess');
      await makeAPlan(page);
      await signUpFromMore(page, jess);
      await page.goto('/app/contact/');
      await main(page).getByLabel(t.contact.wordsLabel).fill("Jess's private words");
      await main(page).getByRole('button', { name: t.send, exact: true }).click();
      await expect(main(page).getByTestId('support-sent')).toBeVisible();

      // Tom, signed in on his own phone, asks for every message every way he can.
      const tomPhone = await browser.newContext({ viewport: page.viewportSize() });
      const tom = await tomPhone.newPage();
      const tomAddress = newEmail('tom');
      await makeAPlan(tom);
      await signUpFromMore(tom, tomAddress);
      const answers = await tom.evaluate(
        async ({ url, key }) => {
          const kept = JSON.parse(localStorage.getItem('prepenny-sign-in') ?? '{}') as {
            access_token: string;
          };
          const headers = { apikey: key, Authorization: `Bearer ${kept.access_token}` };
          const ask = async (path: string, more: Record<string, string> = {}, body?: unknown) => {
            const response = await fetch(`${url}${path}`, {
              method: body === undefined ? 'GET' : 'POST',
              headers: { ...headers, ...more, 'Content-Type': 'application/json' },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            return `${response.status} ${await response.text()}`;
          };
          return [
            await ask('/rest/v1/support_messages?select=*'),
            await ask('/rest/v1/support_files?select=*'),
            await ask('/rest/v1/support_messages?select=*', { 'Accept-Profile': 'app' }),
            await ask('/rest/v1/support_files?select=*', { 'Accept-Profile': 'app' }),
            await ask('/rest/v1/rpc/tidy_support', { 'Content-Profile': 'app' }, {}),
            await ask('/graphql/v1', {}, { query: '{ __typename }' }),
          ];
        },
        { url: LOCAL_SUPABASE.url, key: LOCAL_SUPABASE.key },
      );
      for (const answer of answers) {
        expect(answer).not.toContain("Jess's private words");
        expect(answer).not.toMatch(/^2\d\d \[\{/);
      }

      // Signed out, Tom types Jess's address: the code goes to Jess, so
      // without her inbox nothing is sent, and nothing of his reaches her.
      const tomOut = await browser.newContext({ viewport: page.viewportSize() });
      const stranger = await tomOut.newPage();
      const before = await countEmails(jess, CODE_SUBJECT);
      await stranger.goto('/contact/');
      await main(stranger).getByLabel(t.contact.wordsLabel).fill('Words Tom wants Jess to get');
      await main(stranger).getByLabel(t.emailLabel).fill(jess);
      await main(stranger).getByRole('button', { name: t.send, exact: true }).click();
      await expect(main(stranger).getByText(t.codeSent(jess))).toBeVisible();
      await main(stranger).getByLabel(t.codeLabel).fill('123456');
      await main(stranger).getByRole('button', { name: t.sendWithCode }).click();
      await expect(main(stranger).getByText(t.codeWrong)).toBeVisible();
      await expect.poll(() => countEmails(jess, CODE_SUBJECT)).toBe(before + 1);
      const code = await newestEmail(jess, CODE_SUBJECT);
      expect(code.text).not.toContain('Words Tom wants Jess to get');
      expect(
        sql(`select count(*) from app.support_messages where words like '%Tom wants Jess%'`),
      ).toBe('0');
      expect(await countEmails(jess, REPLY_SUBJECT)).toBe(1);
      await tomPhone.close();
      await tomOut.close();
    });
  });
}
