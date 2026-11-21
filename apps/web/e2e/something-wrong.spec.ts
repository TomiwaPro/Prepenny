// Something looks wrong, Contact us and Suggest a feature on the phone (step
// 4i, brief 4.16, D601 to D613), at 320px and 360px wide, in light and dark,
// checked by axe. These need no server: the two steps the phone calls are
// answered here, so each test can read exactly what the phone would send.
// support.spec.ts sends them for real, to the local Supabase.

import { mkdirSync } from 'node:fs';
import type { Page, Request } from '@playwright/test';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { strings } from '../strings/en-GB.ts';
import { expect, settingScript, test } from './fixtures.ts';
import { noAxeProblems } from './setup.ts';
import { GIF_CALLED_PNG, jpegWithDetails, partsOf, pngWithDetails } from './support-files.ts';

const t = strings.support;
const p = t.problem;
const SCREENS = '../../docs/screens/4i';
const day = (words: string) => words.replaceAll(' ', ' ');
const PHONE_TYPE =
  /^(Android|iPhone|iPad|Windows|Mac|Linux|Chromebook|Another device), (Chrome|Safari|Firefox|Edge|Samsung Internet|Opera|Another browser)( [0-9]{1,4})?$/;

/** The sheet, once open. */
const sheet = (page: Page) => page.locator('dialog[open]');

async function openSomethingWrong(page: Page) {
  await page.getByRole('button', { name: t.somethingWrong, exact: true }).click();
  await expect(sheet(page).getByRole('heading', { name: p.title })).toBeVisible();
}

/**
 * Answers the phone's two steps here, as the database would, and keeps what
 * each request sent: the code, then the message.
 */
async function answerAsTheServer(
  page: Page,
  answer: { readonly answerBy?: string | null; readonly replied?: boolean } = {},
): Promise<{ readonly codes: Request[]; readonly messages: Request[] }> {
  const codes: Request[] = [];
  const messages: Request[] = [];
  await page.route('**/rest/v1/rpc/support_code', (route) => {
    codes.push(route.request());
    return route.fulfill({ json: { sent: true } });
  });
  await page.route('**/rest/v1/rpc/send_support', (route) => {
    messages.push(route.request());
    const body = route.request().postDataJSON() as { kind: string; code: string | null };
    if (body.code === '000000') return route.fulfill({ json: { sent: false, why: 'code-wrong' } });
    return route.fulfill({
      json: {
        sent: true,
        answer_by: body.kind === 'idea' ? null : (answer.answerBy ?? '2026-10-26'),
        replied: body.kind === 'idea' ? false : (answer.replied ?? true),
      },
    });
  });
  return { codes, messages };
}

async function choosePicture(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent('filechooser');
  await sheet(page)
    .getByRole('button', { name: /^Choose (a|another) picture$/ })
    .click();
  await (await chooser).setFiles(file);
}

/** Each part of the screen's main column, top to bottom, with the footer's place among them. */
async function footerIsLast(page: Page) {
  const footer = page.locator('[data-support-footer]');
  await expect(footer).toBeVisible();
  const links = footer.locator(':scope > a, :scope > button');
  await expect(links).toHaveText([t.help, t.somethingWrong]);
  // After everything else on the screen: nothing in the column ends below its top.
  const { footerTop, lowest } = await footer.evaluate((element) => {
    const column = element.parentElement as HTMLElement;
    const others = [...column.querySelectorAll('main *')].filter(
      (one) => one.getBoundingClientRect().height > 0,
    );
    return {
      footerTop: element.getBoundingClientRect().top,
      lowest: Math.max(...others.map((one) => one.getBoundingClientRect().bottom)),
    };
  });
  expect(footerTop).toBeGreaterThanOrEqual(lowest);
  return footer;
}

for (const colorScheme of ['light', 'dark'] as const) {
  const shoots = (page: Page) => colorScheme === 'light' && page.viewportSize()?.width === 320;

  test.describe(`Something looks wrong, Contact us and Suggest a feature, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      mkdirSync(SCREENS, { recursive: true });
    });

    test('1. "Something looks wrong" is at the end of every screen, beside Help, and never moves Home\'s lowest point', async ({
      page,
    }) => {
      // The same place on every screen (WCAG 3.2.6): last, with Help first.
      for (const [path, heading] of [
        ['/app/', 'Home'],
        ['/app/coming-up/', 'Coming up'],
        ['/app/debts/', 'Debts'],
        ['/app/more/', 'More'],
        ['/app/accounts/', 'Accounts'],
        ['/app/help/', 'Help'],
        ['/app/contact/', t.contact.heading],
      ] as const) {
        await page.goto(path);
        await expect(
          page.getByRole('heading', { level: 1, name: heading, exact: true }),
        ).toBeVisible();
        const footer = await footerIsLast(page);
        await expect(footer.getByRole('link', { name: t.help })).toHaveAttribute(
          'href',
          '/app/help/',
        );
        for (const control of await footer.locator(':scope > a, :scope > button').all()) {
          expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
        }
      }

      // Home on a 320 by 568 phone still shows the lowest point first (D442).
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto('/app/');
      const lowest = page.getByTestId('lowest-point');
      await expect(lowest).toContainText('£4.53');
      const where = () => lowest.evaluate((element) => element.getBoundingClientRect().top);
      const withIt = await where();
      await page.locator('[data-support-footer]').evaluate((element) => {
        (element as HTMLElement).style.display = 'none';
      });
      expect(await where()).toBe(withIt);
      expect(withIt).toBeLessThan(568);
      // Setup's screens have it too, with the website's help, as setup can't reach the app's.
      await page.addInitScript(settingScript, [TEST_SETTING_KEY, { example: false }] as const);
      await page.goto('/setup/');
      await expect(page.getByRole('button', { name: 'Make my plan' })).toBeVisible();
      const welcomeFooter = page.locator('[data-support-footer]');
      await expect(welcomeFooter.getByRole('link', { name: t.help })).toHaveAttribute(
        'href',
        '/help/',
      );
      await expect(welcomeFooter.getByRole('button', { name: t.somethingWrong })).toBeVisible();
    });

    test('2. The consent message comes first: no picture or plan copy can be chosen before it', async ({
      page,
    }) => {
      await page.goto('/app/coming-up/');
      await expect(page.getByRole('heading', { level: 1, name: 'Coming up' })).toBeVisible();
      await openSomethingWrong(page);
      const dialog = sheet(page);
      await expect(dialog).toHaveAccessibleDescription(p.intro);
      await expect(dialog.getByRole('group', { name: p.attachLegend })).toBeVisible();
      await expect(dialog.getByRole('radio', { name: p.none })).toBeChecked();
      // Nothing to choose a file with, and no consent message, yet.
      await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
      await expect(dialog.getByText(p.pictureConsent)).toHaveCount(0);
      if (shoots(page)) await page.screenshot({ path: `${SCREENS}/sheet-320-light.png` });

      await dialog.getByRole('radio', { name: p.picture }).check();
      const consent = dialog.getByTestId('picture-consent');
      // The owner's words, word for word (D602), then what to do, then the button.
      await expect(consent.locator('p').nth(0)).toHaveText(
        "This picture may show your balances and payments. Only PrePenny support sees it, and it's deleted after 30 days.",
      );
      await expect(consent.locator('p').nth(1)).toHaveText(p.pictureHow);
      const order = await consent.evaluate((element) =>
        [...element.children].map((one) => one.tagName + (one.getAttribute('type') ?? '')),
      );
      expect(order.slice(0, 4)).toEqual(['P', 'P', 'INPUTfile', 'BUTTONbutton']);
      await expect(consent.locator('input[type="file"]')).toHaveAttribute(
        'accept',
        'image/png,image/jpeg',
      );
      await noAxeProblems(page);
      if (shoots(page)) {
        await consent.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SCREENS}/consent-picture-320-light.png` });
      }

      await dialog.getByRole('radio', { name: p.plan }).check();
      const planConsent = dialog.getByTestId('plan-consent');
      await expect(planConsent.locator('p').nth(0)).toHaveText(p.planConsent);
      await expect(planConsent.locator('p').nth(1)).toHaveText(p.planHow);
      await expect(dialog.getByTestId('picture-consent')).toHaveCount(0);
      await noAxeProblems(page);

      // Choosing "A screenshot" and sending without one says what to do.
      await dialog.getByRole('radio', { name: p.picture }).check();
      await dialog.getByLabel(p.wordsLabel).fill('Rent looks wrong');
      await dialog.getByRole('button', { name: t.send, exact: true }).click();
      await expect(dialog.getByText(p.pictureMissing)).toBeVisible();
      await expect(dialog.getByRole('button', { name: p.choosePicture })).toBeFocused();
    });

    test("3. A screenshot is chosen from the photos, and its hidden details are taken out before it's sent", async ({
      page,
    }) => {
      await page.goto('/app/');
      await expect(page.getByTestId('lowest-point')).toContainText('£4.53');
      const withDetails = await jpegWithDetails(page);
      expect(withDetails.toString('latin1')).toContain('GPS 51.5072N');
      const sent = await answerAsTheServer(page);
      await openSomethingWrong(page);
      const dialog = sheet(page);
      await dialog.getByLabel(p.wordsLabel).fill('The lowest point should be after Rent');
      await dialog.getByRole('radio', { name: p.picture }).check();

      // A GIF named as a PNG is known by its contents, and refused.
      await choosePicture(page, GIF_CALLED_PNG);
      await expect(dialog.getByText(p.notAPicture)).toBeVisible();
      await expect(dialog.getByRole('button', { name: p.choosePicture })).toBeFocused();

      await choosePicture(page, {
        name: 'IMG_0412.jpg',
        mimeType: 'image/jpeg',
        buffer: withDetails,
      });
      const viewport = page.viewportSize() ?? { width: 0, height: 0 };
      await expect(dialog.getByTestId('file-chosen')).toHaveText(
        new RegExp(
          `^Picture chosen: ${viewport.width * 2} by ${viewport.height * 2}, \\d+ KB\\. Its hidden details have been taken out\\.$`,
        ),
      );
      await expect(dialog.getByText(p.notAPicture)).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: p.chooseAnotherPicture })).toBeVisible();
      await noAxeProblems(page);
      if (shoots(page)) {
        await dialog.getByTestId('file-chosen').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SCREENS}/picture-chosen-320-light.png` });
      }

      // What the phone adds by itself, in words (D610).
      const version = await dialog.getByTestId('support-added').textContent();
      expect(version).toMatch(
        /^PrePenny adds its version \([A-Za-z0-9._-]+\), your phone type \(.+\) and which screen you're on, and nothing about your money\.$/,
      );

      // Signed out: the address, then the code (D605).
      await dialog.getByLabel(t.emailLabel).fill('sam@example.com');
      await dialog.getByRole('button', { name: t.send, exact: true }).click();
      await expect(dialog.getByText(t.codeSent('sam@example.com'))).toBeFocused();
      expect(sent.codes).toHaveLength(1);
      expect(sent.codes[0]?.postDataJSON()).toEqual({ email: 'sam@example.com' });
      expect(sent.messages).toHaveLength(0);
      await noAxeProblems(page);
      if (shoots(page)) await page.screenshot({ path: `${SCREENS}/code-320-light.png` });

      await dialog.getByLabel(t.codeLabel).fill('000000');
      await dialog.getByRole('button', { name: t.sendWithCode }).click();
      await expect(dialog.getByText(t.codeWrong)).toBeVisible();
      await dialog.getByLabel(t.codeLabel).fill('123456');
      await dialog.getByRole('button', { name: t.sendWithCode }).click();
      await expect(dialog.getByRole('heading', { name: t.sentTitle })).toBeFocused();
      await expect(dialog.getByTestId('support-sent').locator('p')).toHaveText([
        t.sentAnswerBy(day('Mon 26 Oct')),
        t.sentEmailed('sam@example.com'),
      ]);
      await noAxeProblems(page);
      if (shoots(page)) await page.screenshot({ path: `${SCREENS}/sent-320-light.png` });

      // Exactly what went: the words, the screen's name, the version, the
      // phone's type (never its whole description), the picture, and nothing else.
      const body = sent.messages.at(-1)?.postDataJSON() as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(
        [
          'app_version',
          'code',
          'consent',
          'email',
          'file_data',
          'file_kind',
          'kind',
          'phone_type',
          'screen',
          'words',
        ].sort(),
      );
      expect(body).toMatchObject({
        kind: 'problem',
        words: 'The lowest point should be after Rent',
        screen: 'home',
        file_kind: 'picture',
        consent: true,
        email: 'sam@example.com',
        code: '123456',
      });
      expect(body.phone_type).toMatch(PHONE_TYPE);
      expect(body.phone_type).not.toBe(await page.evaluate(() => navigator.userAgent));
      const picture = Buffer.from(body.file_data as string, 'base64');
      expect(picture.subarray(0, 3).toString('hex')).toBe('ffd8ff');
      expect(picture.toString('latin1')).not.toContain('GPS');
      expect(picture.toString('latin1')).not.toContain('Exif');
      // Before the picture data, only its tables and size: no application data, no comments.
      for (const part of partsOf(picture)) {
        expect(['ffdb', 'ffc4', 'ffc0', 'ffc2', 'ffdd', 'ffda']).toContain(part);
      }
      // Sam's money is in the picture, which he chose to send; nowhere else.
      const rest = JSON.stringify({ ...body, file_data: null });
      for (const figure of ['267.54', '237.54', '4.53', 'Rent goes', 'Family loan']) {
        expect(rest).not.toContain(figure);
      }
    });

    test('4. A PNG keeps only what a picture needs, and a plan copy is the backup file, by its contents', async ({
      page,
    }) => {
      await page.goto('/app/more/');
      await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
      const withDetails = await pngWithDetails(page);
      const sent = await answerAsTheServer(page);
      await openSomethingWrong(page);
      const dialog = sheet(page);
      await dialog.getByLabel(p.wordsLabel).fill('A screenshot of More');
      await dialog.getByRole('radio', { name: p.picture }).check();
      await choosePicture(page, {
        name: 'Screenshot.png',
        mimeType: 'image/png',
        buffer: withDetails,
      });
      await expect(dialog.getByTestId('file-chosen')).toHaveText(/^Picture chosen: /);

      // A plan copy: a file that isn't PrePenny's backup is refused, whatever it's called.
      await dialog.getByRole('radio', { name: p.plan }).check();
      const choosePlan = async (file: { name: string; mimeType: string; buffer: Buffer }) => {
        const chooser = page.waitForEvent('filechooser');
        await dialog
          .getByRole('button', { name: /^Choose (the backup file|another file)$/ })
          .click();
        await (await chooser).setFiles(file);
      };
      await choosePlan({
        name: 'prepenny-backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{"app":"Something else","kind":"backup","version":1,"plan":{}}'),
      });
      await expect(dialog.getByText(p.notAPlan)).toBeVisible();
      const backup = Buffer.from(
        JSON.stringify({
          app: 'PrePenny',
          kind: 'backup',
          version: 1,
          about: 'A copy',
          madeAt: '2026-10-25T10:00:00Z',
          plan: { nation: 'england-and-wales', records: {} },
          account: null,
          people: null,
          history: null,
        }),
      );
      await choosePlan({
        name: 'prepenny-backup-2026-10-25.json',
        mimeType: 'application/json',
        buffer: backup,
      });
      await expect(dialog.getByTestId('file-chosen')).toHaveText(p.planChosen('1 KB'));
      await expect(dialog.getByText(p.notAPlan)).toHaveCount(0);
      await noAxeProblems(page);

      // Back to the screenshot: the one chosen is still there, and that's what goes.
      await dialog.getByRole('radio', { name: p.picture }).check();
      await expect(dialog.getByTestId('file-chosen')).toHaveText(/^Picture chosen: /);
      await dialog.getByLabel(t.emailLabel).fill('sam@example.com');
      await dialog.getByRole('button', { name: t.send, exact: true }).click();
      await dialog.getByLabel(t.codeLabel).fill('123456');
      await dialog.getByRole('button', { name: t.sendWithCode }).click();
      await expect(dialog.getByRole('heading', { name: t.sentTitle })).toBeVisible();
      const body = sent.messages.at(-1)?.postDataJSON() as Record<string, unknown>;
      expect(body).toMatchObject({ kind: 'problem', screen: 'more', file_kind: 'picture' });
      const picture = Buffer.from(body.file_data as string, 'base64');
      expect(picture.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(partsOf(picture)).toEqual(expect.arrayContaining(['IHDR', 'IDAT', 'IEND']));
      for (const part of partsOf(picture))
        expect(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']).toContain(part);
      expect(picture.toString('latin1')).not.toContain('GPS');

      // Closed after it's sent, the next one starts afresh.
      await dialog.getByRole('button', { name: strings.sheet.close }).click();
      await openSomethingWrong(page);
      await expect(sheet(page).getByLabel(p.wordsLabel)).toHaveValue('');
      await expect(sheet(page).getByRole('radio', { name: p.none })).toBeChecked();

      // And the plan copy goes as it was chosen.
      await sheet(page).getByLabel(p.wordsLabel).fill('My plan');
      await sheet(page).getByRole('radio', { name: p.plan }).check();
      await choosePlan({
        name: 'prepenny-backup-2026-10-25.json',
        mimeType: 'application/json',
        buffer: backup,
      });
      await sheet(page).getByLabel(t.emailLabel).fill('sam@example.com');
      await sheet(page).getByRole('button', { name: t.send, exact: true }).click();
      await sheet(page).getByLabel(t.codeLabel).fill('123456');
      await sheet(page).getByRole('button', { name: t.sendWithCode }).click();
      await expect(sheet(page).getByRole('heading', { name: t.sentTitle })).toBeVisible();
      const planBody = sent.messages.at(-1)?.postDataJSON() as Record<string, unknown>;
      expect(planBody.file_kind).toBe('plan');
      expect(Buffer.from(planBody.file_data as string, 'base64').equals(backup)).toBe(true);
    });

    test('5. Closing the sheet to take a screenshot keeps what was typed, and nothing is kept on the phone', async ({
      page,
    }) => {
      await page.goto('/app/');
      await expect(page.getByTestId('lowest-point')).toContainText('£4.53');
      const kept = () =>
        page.evaluate(() => ({
          local: Object.keys(localStorage).sort(),
          session: Object.keys(sessionStorage).sort(),
        }));
      const before = await kept();
      await openSomethingWrong(page);
      await sheet(page).getByLabel(p.wordsLabel).fill('Typed before the screenshot');
      await sheet(page).getByRole('radio', { name: p.picture }).check();
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      // Focus is back on what opened it.
      await expect(page.getByRole('button', { name: t.somethingWrong })).toBeFocused();
      await openSomethingWrong(page);
      await expect(sheet(page).getByLabel(p.wordsLabel)).toHaveValue('Typed before the screenshot');
      await expect(sheet(page).getByRole('radio', { name: p.picture })).toBeChecked();
      // The browser is told not to remember it either.
      await expect(sheet(page).getByLabel(p.wordsLabel)).toHaveAttribute('autocomplete', 'off');
      expect(await kept()).toEqual(before);
      // Nothing typed is in the phone's own database.
      const stored = await page.evaluate(async () => {
        const found: string[] = [];
        for (const { name } of await indexedDB.databases()) {
          if (name === undefined) continue;
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const opening = indexedDB.open(name);
            opening.onsuccess = () => resolve(opening.result);
            opening.onerror = () => reject(opening.error);
          });
          for (const store of Array.from(db.objectStoreNames)) {
            const all = await new Promise<unknown[]>((resolve, reject) => {
              const reading = db.transaction(store).objectStore(store).getAll();
              reading.onsuccess = () => resolve(reading.result);
              reading.onerror = () => reject(reading.error);
            });
            found.push(JSON.stringify(all));
          }
          db.close();
        }
        return found.join('');
      });
      expect(stored).not.toContain('Typed before the screenshot');
    });

    test('6. Contact us and Suggest a feature under More, and Contact us on the website for someone signed out', async ({
      page,
    }) => {
      // Under More's Help card.
      await page.goto('/app/more/');
      const help = page.getByRole('navigation', { name: 'Help' });
      await expect(
        help.getByRole('link', { name: new RegExp(`^${t.contact.heading}`) }),
      ).toHaveAttribute('href', '/app/contact/');
      await expect(
        help.getByRole('link', { name: new RegExp(`^${t.idea.heading}`) }),
      ).toHaveAttribute('href', '/app/suggest/');

      const sent = await answerAsTheServer(page);
      // The screen's own form, not the one in Something looks wrong's closed sheet.
      const main = page.getByRole('main');
      await page.goto('/app/suggest/');
      await expect(page.getByRole('heading', { level: 1, name: t.idea.heading })).toBeVisible();
      await expect(page.getByText(t.idea.purpose)).toBeVisible();
      await main.getByRole('button', { name: t.send, exact: true }).click();
      await expect(main.getByText(t.idea.wordsMissing)).toBeVisible();
      await expect(main.getByText(t.emailMissing)).toBeVisible();
      await expect(main.getByLabel(t.idea.wordsLabel)).toBeFocused();
      await noAxeProblems(page);
      if (shoots(page))
        await page.screenshot({ path: `${SCREENS}/suggest-320-light.png`, fullPage: true });
      await main.getByLabel(t.idea.wordsLabel).fill('Remind me before my phone bill');
      await main.getByLabel(t.emailLabel).fill('sam@example.com');
      await main.getByRole('button', { name: t.send, exact: true }).click();
      await main.getByLabel(t.codeLabel).fill('123456');
      await main.getByRole('button', { name: t.sendWithCode }).click();
      await expect(main.getByRole('heading', { name: t.sentTitle })).toBeFocused();
      await expect(main.getByTestId('support-sent').locator('p')).toHaveText([t.sentIdea]);
      expect(sent.messages.at(-1)?.postDataJSON()).toMatchObject({
        kind: 'idea',
        words: 'Remind me before my phone bill',
        screen: null,
        file_kind: null,
        file_data: null,
      });
      // "Write another message" starts afresh.
      await main.getByRole('button', { name: t.writeAnother }).click();
      await expect(main.getByLabel(t.idea.wordsLabel)).toHaveValue('');
      await expect(main.getByLabel(t.idea.wordsLabel)).toBeFocused();

      // On the website, with nothing on the phone at all.
      await page.goto('/contact/');
      await expect(page.getByRole('heading', { level: 1, name: t.contact.heading })).toBeVisible();
      await expect(page.getByText(t.contact.purpose)).toBeVisible();
      await expect(page.getByText(t.contact.wordsHint)).toBeVisible();
      await expect(page.getByText(t.contact.or)).toBeVisible();
      await noAxeProblems(page);
      if (shoots(page))
        await page.screenshot({ path: `${SCREENS}/contact-site-320-light.png`, fullPage: true });
      await main.getByLabel(t.contact.wordsLabel).fill('I lost my phone and my email');
      await main.getByLabel(t.emailLabel).fill('Sam@Example.com ');
      await main.getByRole('button', { name: t.send, exact: true }).click();
      await expect(main.getByText(t.codeSent('sam@example.com'))).toBeVisible();
      await main.getByLabel(t.codeLabel).fill('654321');
      await main.getByRole('button', { name: t.sendWithCode }).click();
      await expect(main.getByTestId('support-sent').locator('p')).toHaveText([
        t.sentAnswerBy(day('Mon 26 Oct')),
        t.sentEmailed('sam@example.com'),
      ]);
      expect(sent.messages.at(-1)?.postDataJSON()).toMatchObject({
        kind: 'contact',
        words: 'I lost my phone and my email',
        email: 'sam@example.com',
        code: '654321',
      });
      if (shoots(page)) await page.screenshot({ path: `${SCREENS}/contact-sent-320-light.png` });

      // The sign-in page points there, for someone who can't sign in.
      await page.goto('/sign-in/');
      await expect(page.getByRole('link', { name: t.contact.cantSignIn })).toHaveAttribute(
        'href',
        '/contact/',
      );
    });

    test('7. Every problem says what to do, and a message too long is caught before it goes', async ({
      page,
    }) => {
      const main = page.getByRole('main');
      await page.goto('/app/contact/');
      await expect(page.getByRole('heading', { level: 1, name: t.contact.heading })).toBeVisible();
      await page.route('**/rest/v1/rpc/support_code', (route) =>
        route.fulfill({ status: 400, json: { code: 'P0001', message: 'too-many' } }),
      );
      await main.getByLabel(t.contact.wordsLabel).fill('x'.repeat(2001));
      await main.getByLabel(t.emailLabel).fill('sam@example.com');
      await main.getByRole('button', { name: t.send, exact: true }).click();
      await expect(main.getByText(t.tooLong('2,001'))).toBeVisible();
      await main.getByLabel(t.contact.wordsLabel).fill('Hello');
      await main.getByRole('button', { name: t.send, exact: true }).click();
      await expect(main.getByRole('alert')).toHaveText(t.tooManyCodes);
      await page.unroute('**/rest/v1/rpc/support_code');
      await page.route('**/rest/v1/rpc/support_code', (route) =>
        route.fulfill({ status: 400, json: { code: 'P0001', message: 'busy' } }),
      );
      await main.getByRole('button', { name: t.send, exact: true }).click();
      await expect(main.getByRole('alert')).toHaveText(t.busy);
      await page.unroute('**/rest/v1/rpc/support_code');
      await page.context().setOffline(true);
      await main.getByRole('button', { name: t.send, exact: true }).click();
      await expect(main.getByRole('alert')).toHaveText(t.offline);
      // What was typed is still there.
      await expect(main.getByLabel(t.contact.wordsLabel)).toHaveValue('Hello');
      await page.context().setOffline(false);
    });

    test("8. A picture gets ready off the screen, so a busy screen can't hold it up", async ({
      page,
    }) => {
      // Step 4k: on the screen's own thread, Chrome saves a drawing as a file
      // only while the screen is idle, and can wait over 5 seconds when it
      // isn't. Every time the screen's thread saves a drawing is counted: the
      // picture must be got ready in the background worker, never there.
      await page.addInitScript(() => {
        const counted = { encodes: 0 };
        Reflect.set(window, '__screenEncodes', counted);
        const toBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (...args) {
          counted.encodes += 1;
          return toBlob.apply(this, args);
        };
        const convertToBlob = OffscreenCanvas.prototype.convertToBlob;
        OffscreenCanvas.prototype.convertToBlob = function (...args) {
          counted.encodes += 1;
          return convertToBlob.apply(this, args);
        };
      });
      await page.goto('/app/more/');
      await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
      const png = await pngWithDetails(page);
      const jpeg = await jpegWithDetails(page);
      await openSomethingWrong(page);
      const dialog = sheet(page);
      await dialog.getByRole('radio', { name: p.picture }).check();

      // The screen is kept busy, as a slow phone's is: every frame takes all
      // of its time, so the screen is never idle.
      await page.evaluate(() => {
        const busy = { on: true };
        Reflect.set(window, '__busy', busy);
        const frame = () => {
          if (!busy.on) return;
          const end = performance.now() + 16;
          while (performance.now() < end) {
            // Working, as a slow phone's screen is.
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      for (const [name, file] of [
        ['Screenshot.png', { mimeType: 'image/png', buffer: png }],
        ['IMG_0413.jpg', { mimeType: 'image/jpeg', buffer: jpeg }],
      ] as const) {
        await choosePicture(page, { name, ...file });
        // Well inside the 5 seconds Chrome can wait on the screen's thread.
        await expect(dialog.getByTestId('file-chosen')).toHaveText(/^Picture chosen: /, {
          timeout: 3000,
        });
      }
      await page.evaluate(() => {
        (Reflect.get(window, '__busy') as { on: boolean }).on = false;
      });
      expect(
        await page.evaluate(
          () => (Reflect.get(window, '__screenEncodes') as { encodes: number }).encodes,
        ),
      ).toBe(0);
      await expect(dialog.getByText(p.unreadable)).toHaveCount(0);
      await noAxeProblems(page);
    });
  });
}
