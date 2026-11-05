// Every check, across the whole app (step 2h), at 320px and 360px wide, in
// light and dark: every screen and every sheet, on Sam's example plan, is
// checked by axe against WCAG 2.2 AA (contrast included); says what it's for
// in one plain sentence (D213); stays readable with text at 200% with every
// tap target 44px or more; can be used with the keyboard alone, with focus
// always shown; gives every control a name screen readers say; and sends
// nothing anywhere: every request is PrePenny loading its own files, and no
// amount, payment name or note is written to the browser's console. With
// reduced motion on, nothing moves.

import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, type Request } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { AXE_TAGS, layoutProblems, openPeriod, period } from './coming-up.ts';
import { test } from './fixtures.ts';

async function noAxeProblems(page: Page, where?: string) {
  const builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  const found = (await (where === undefined ? builder : builder.include(where)).analyze())
    .violations;
  expect(
    found.map((one) => `${one.id}: ${one.nodes.map((node) => node.target).join(', ')}`),
  ).toEqual([]);
}

/**
 * Amounts, names and notes from Sam's example, and what the tests type, that
 * must never reach a log or a request (CLAUDE.md, brief 7.2): amounts as
 * people read them and as whole pence, as they're stored.
 */
const PRIVATE = [
  '267.54',
  '26754',
  '£4.53',
  '603.06',
  '60306',
  '54.85',
  '5485',
  '452.17',
  '45217',
  '503.06',
  'Family loan',
  'Driving lesson',
  'Rent',
  'Pay-later card',
  'Car MOT',
  'Warehouse job',
];

/** Notes any load the security policy blocks, from the page's very first moment. */
const WATCH_POLICY = () => {
  const blocked: string[] = [];
  Reflect.set(window, '__blocked', blocked);
  document.addEventListener('securitypolicyviolation', (event) => {
    blocked.push(`${event.violatedDirective} ${event.blockedURI}`);
  });
};

/**
 * Watches everything the browser sends and writes while a test runs: every
 * page and the offline helper too (the context, not one page), and every
 * console message, page error and blocked load.
 */
function watch(page: Page) {
  const requests: Request[] = [];
  const console: string[] = [];
  page.context().on('request', (request) => requests.push(request));
  page.on('console', (message) => console.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => console.push(`pageerror: ${error.message}`));
  void page.addInitScript(WATCH_POLICY);
  return {
    /** Every request is a GET or HEAD of PrePenny's own files, with nothing private in it. */
    async expectNothingSent({ notFound = false } = {}) {
      for (const request of requests) {
        const url = new URL(request.url());
        expect(url.origin, request.url()).toBe('http://127.0.0.1:4173');
        // GET for its files, and HEAD when Next.js checks a page it links to exists.
        expect(['GET', 'HEAD'], request.url()).toContain(request.method());
        expect(request.postData(), request.url()).toBeNull();
        for (const word of PRIVATE) {
          expect(decodeURIComponent(request.url()), request.url()).not.toContain(word);
        }
      }
      // PrePenny writes nothing to the console: no warning, no error, and so no amount or name.
      // The not-found page is answered "404, not found", which the browser notes itself.
      const own = (line: string) =>
        !line.startsWith('log: ') &&
        !line.startsWith('debug: ') &&
        !(notFound && line.includes('status of 404')) &&
        // The browser's own note when Next.js preloads a later screen's style sheet: no data in it.
        !/^warning: The resource \S+\/_next\/static\/\S+\.css was preloaded using link preload but not used/.test(
          line,
        );
      expect(console.filter(own)).toEqual([]);
      for (const line of console) {
        for (const word of PRIVATE) expect(line).not.toContain(word);
      }
      expect(await page.evaluate(() => Reflect.get(window, '__blocked') ?? [])).toEqual([]);
    },
  };
}

/** Each screen: where it is, its heading, and the sentence that says what it's for (D213). */
const SCREENS = [
  { path: '/app/', heading: 'Home', purpose: strings.home.purpose },
  { path: '/app/coming-up/', heading: 'Coming up', purpose: strings.comingUp.purpose },
  { path: '/app/debts/', heading: 'Debts', purpose: strings.debts.purpose },
  { path: '/app/debt/?id=family-loan', heading: 'Family loan', purpose: strings.debt.purpose },
  { path: '/app/debt/?id=credit-card', heading: 'Credit card', purpose: strings.debt.purpose },
  { path: '/app/more/', heading: 'More', purpose: strings.more.purpose },
  { path: '/app/accounts/', heading: 'Accounts', purpose: strings.accounts.purpose },
  { path: '/app/budgets/', heading: 'Budgets', purpose: strings.budgets.purpose },
  { path: '/app/goals/', heading: 'Savings goals', purpose: strings.goals.purpose },
  { path: '/app/pay/', heading: 'Pay calculator', purpose: strings.pay.purpose },
  { path: '/app/job/', heading: 'Your job', purpose: strings.job.purpose },
  { path: '/app/what-if/', heading: 'What if', purpose: strings.whatIf.purpose },
  {
    path: '/pay-calculator/',
    heading: 'Take-home pay calculator',
    purpose: strings.pay.publicPurpose,
  },
  {
    path: '/app/no-such-page/',
    heading: strings.notFound.heading,
    purpose: strings.notFound.purpose,
  },
] as const;

/** Opens a screen and waits for it to be drawn with the plan's own figures. */
async function openScreen(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeAttached();
  // Wait for the plan's figures, never a loading line.
  await expect(page.getByText(/^Working out/)).toHaveCount(0);
}

/**
 * Tabs through the page with the keyboard alone: every stop shows a focus
 * outline 2px or wider (WCAG 2.4.7), and focus goes all the way round, back
 * to the start, without getting stuck (WCAG 2.1.2).
 */
async function keyboardGoesRound(page: Page, within: Locator | null = null) {
  const stops: string[] = [];
  for (let tab = 0; tab < 150; tab += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (element === null || element === document.body)
        return { name: 'body', outlined: true, inDialog: false };
      // A date box's own calendar button, inside the box: the browser draws its focus.
      if (
        element instanceof HTMLInputElement &&
        element.type === 'date' &&
        !element.matches(':focus')
      ) {
        return {
          name: `calendar button of ${element.id}`,
          outlined: true,
          inDialog: element.closest('dialog[open]') !== null,
        };
      }
      // The outline is on the control or the box it sits in (DESIGN.md).
      let outlined = false;
      for (
        let at: HTMLElement | null = element, up = 0;
        at !== null && up < 3;
        at = at.parentElement, up += 1
      ) {
        const style = getComputedStyle(at);
        if (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2)
          outlined = true;
      }
      const name = `${element.getAttribute('type') ?? ''}#${element.id} ${
        element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 40) ?? ''
      }`;
      return {
        name: `${element.tagName} ${name}`,
        outlined,
        inDialog: element.closest('dialog[open]') !== null,
      };
    });
    // Past a sheet's last control, focus goes to the browser's own buttons, then
    // back to the sheet's first: a modal sheet never lets it reach the page behind.
    if (within !== null && stop.name === 'body') continue;
    expect(stop.outlined, `focus shows on ${stop.name}`).toBe(true);
    if (within !== null) expect(stop.inDialog, `focus stays in the sheet: ${stop.name}`).toBe(true);
    if (stops.length > 2 && stop.name === stops[0]) return stops;
    stops.push(stop.name);
  }
  throw new Error(`Focus never came back round: ${stops.slice(-5).join(' | ')}`);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Every screen, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    for (const screen of SCREENS) {
      test(`${screen.path} passes every check`, async ({ page }) => {
        const watching = watch(page);
        await openScreen(page, screen.path, screen.heading);
        // It says what it's for, in one plain sentence (D213).
        if (screen.purpose !== null) {
          await expect(page.getByText(screen.purpose, { exact: true }).first()).toBeVisible();
        }
        await noAxeProblems(page);
        await keyboardGoesRound(page);
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        expect(await layoutProblems(page)).toEqual([]);
        await watching.expectNothingSent({ notFound: screen.path === '/app/no-such-page/' });
      });
    }
  });
}

/** Each sheet: the screen it's on, how it opens, and its title. */
const SHEETS: readonly {
  readonly path: string;
  readonly heading: string;
  readonly open: (page: Page) => Promise<void>;
  readonly title: string;
}[] = [
  // Each button and the title of the sheet it opens (D282).
  ...(
    [
      ['Update balance', 'Update balance'],
      ['I spent', 'I spent'],
      ['Add a payment', 'Add a payment'],
      ['Extra/Missed shift', 'I did overtime'],
    ] as const
  ).map(([name, title]) => ({
    path: '/app/',
    heading: 'Home',
    title,
    open: (page: Page) => page.getByRole('button', { name, exact: true }).click(),
  })),
  {
    path: '/app/',
    heading: 'Home',
    title: 'Spending money until payday',
    open: (page) =>
      page
        .getByTestId('next-due')
        .getByRole('button', { name: /^Spending money until payday/ })
        .click(),
  },
  // "Change view" opens the sheet titled View (D277).
  ...(
    [
      ['Change view', 'View'],
      ['Switch account', 'Switch account'],
    ] as const
  ).map(([name, title]) => ({
    path: '/app/coming-up/',
    heading: 'Coming up',
    title,
    open: (page: Page) => page.getByRole('button', { name, exact: true }).click(),
  })),
  {
    path: '/app/coming-up/',
    heading: 'Coming up',
    title: 'Pay',
    open: async (page) => {
      await openPeriod(page, '2026-10-30');
      await period(page, '2026-10-30')
        .getByRole('button', { name: /^Pay Fri/ })
        .click();
    },
  },
  ...(
    [
      ['Update from statement', 'Update from statement'],
      ['Change the rate', 'Change the rate'],
      ['Add a payment', 'Add a payment'],
      ['Change its details', 'Change this debt'],
      ['Close this debt', 'Close this debt'],
    ] as const
  ).map(([name, title]) => ({
    path: '/app/debt/?id=family-loan',
    heading: 'Family loan',
    title,
    open: (page: Page) => page.getByRole('button', { name, exact: true }).click(),
  })),
  {
    path: '/app/more/',
    heading: 'More',
    title: 'Start again with the example',
    open: (page) => page.getByRole('button', { name: 'Start again with the example' }).click(),
  },
  ...(
    [
      ['Add an account', 'Add an account'],
      ['Change Current account', 'Change this account'],
      ['Change where you live', 'Where you live'],
    ] as const
  ).map(([name, title]) => ({
    path: '/app/accounts/',
    heading: 'Accounts',
    title,
    open: (page: Page) => page.getByRole('button', { name, exact: true }).click(),
  })),
  {
    path: '/app/budgets/',
    heading: 'Budgets',
    title: 'Add a budget',
    open: (page) => page.getByRole('button', { name: 'Add a budget' }).click(),
  },
  {
    path: '/app/goals/',
    heading: 'Savings goals',
    title: 'Add a savings goal',
    open: (page) => page.getByRole('button', { name: 'Add a savings goal' }).click(),
  },
  {
    path: '/app/pay/',
    heading: 'Pay calculator',
    title: 'Save as a usual week',
    open: async (page) => {
      await page.getByRole('button', { name: 'Work out take-home pay' }).click();
      await page.getByRole('button', { name: 'Save as a usual week' }).click();
    },
  },
  {
    path: '/app/job/',
    heading: 'Your job',
    title: 'Your job details',
    open: (page) => page.getByRole('button', { name: 'Change these details' }).click(),
  },
  ...(
    [
      ['Add a payment', 'Add a payment'],
      ['Extra/Missed shift', 'I did overtime'],
      ['Update balance', 'Update balance'],
    ] as const
  ).map(([name, title]) => ({
    path: '/app/what-if/',
    heading: 'What if',
    title,
    open: (page: Page) => page.getByRole('button', { name, exact: true }).click(),
  })),
];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Every sheet, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    for (const sheet of SHEETS) {
      test(`${sheet.title}, from ${sheet.path}, passes every check`, async ({ page }) => {
        const watching = watch(page);
        await openScreen(page, sheet.path, sheet.heading);
        await sheet.open(page);
        const dialog = page.locator('dialog[open]');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('heading').first()).toHaveText(sheet.title);
        // Its first line says what it's for (D213), and screen readers hear it.
        const describedBy = await dialog.getAttribute('aria-describedby');
        expect(describedBy).not.toBeNull();
        await expect(page.locator(`[id="${describedBy}"]`)).not.toHaveText('');
        // Focus goes into the sheet, stays there, and shows.
        await expect
          .poll(() => page.evaluate(() => document.activeElement?.closest('dialog[open]') !== null))
          .toBe(true);
        await noAxeProblems(page);
        await keyboardGoesRound(page, dialog);
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        expect(await layoutProblems(page)).toEqual([]);
        // Escape closes it, and focus goes back to what opened it (D188, WCAG 2.4.3).
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect
          .poll(() => page.evaluate(() => document.activeElement !== document.body))
          .toBe(true);
        await watching.expectNothingSent();
      });
    }
  });
}

test('with reduced motion, nothing on screen moves', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/coming-up/');
  await expect(page.getByTestId('period').first()).toBeVisible();
  await page.getByRole('button', { name: 'Change view', exact: true }).click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.getAnimations().filter((one) => one.playState === 'running').length,
    ),
  ).toBe(0);
  // Without it, the sheet rises into place.
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Change view', exact: true }).click();
  expect(
    await page.evaluate(
      () => getComputedStyle(document.querySelector('dialog[open]') as Element).animationName,
    ),
  ).not.toBe('none');
});

test('making changes sends nothing anywhere', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByTestId('balance')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const sent: string[] = [];
  page.on('request', (request) => sent.push(`${request.method()} ${request.url()}`));
  // A new payment, I spent with a new budget, a tick, and an undo.
  await page.getByRole('button', { name: 'Add a payment', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add a payment' });
  await add.getByLabel('Name', { exact: true }).fill('Car MOT');
  await add.getByLabel('Amount', { exact: true }).fill('54.85');
  await add.getByRole('button', { name: 'Add payment' }).click();
  await expect(add).toBeHidden();
  await page.getByTestId('undo-bar').getByRole('button', { name: 'Undo' }).click();
  await page
    .getByTestId('next-due')
    .getByRole('button', { name: /^Spending money until payday/ })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark as paid' }).click();
  await expect(page.getByTestId('undo-bar')).toContainText('marked as paid');
  // Pages the app opens next are its own files (Next.js fetches each screen's part as a file).
  for (const line of sent) expect(line).toMatch(/^GET http:\/\/127\.0\.0\.1:4173\//);
  expect(sent).toEqual([]);
});

test("every page is sent with its security rules: only PrePenny's own files, and no referrer", async ({
  request,
}) => {
  for (const path of ['/', '/setup/', '/app/', '/app/debt/?id=family-loan', '/pay-calculator/']) {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers['content-security-policy'], path).toContain("default-src 'self'");
    expect(headers['content-security-policy'], path).toContain("connect-src 'self'");
    expect(headers['content-security-policy'], path).toContain("font-src 'self'");
    expect(headers['referrer-policy'], path).toBe('no-referrer');
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['permissions-policy'], path).toContain('camera=()');
  }
});

/** The keys in the browser's two small stores, and the phone database's device settings. */
async function keptOnPhone(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const keys = [
      ...Object.keys(localStorage).map((key) => `local: ${key}`),
      ...Object.keys(sessionStorage).map((key) => `session: ${key}`),
    ];
    const device = await new Promise<string[]>((resolve) => {
      const open = indexedDB.open('prepenny');
      open.onerror = () => resolve([]);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('device')) {
          db.close();
          resolve([]);
          return;
        }
        const all = db.transaction('device').objectStore('device').getAllKeys();
        all.onsuccess = () => {
          db.close();
          resolve((all.result as string[]).map((key) => `device: ${key}`));
        };
      };
    });
    return [...keys, ...device];
  });
}

test.describe("what's kept on the phone", () => {
  test("the public calculator's pay is forgotten once setup has it, or when the example is chosen instead", async ({
    browser,
  }) => {
    for (const next of ['setup', 'example'] as const) {
      // A phone with nothing on it, not the example.
      const context = await browser.newContext({ viewport: { width: 360, height: 780 } });
      const page = await context.newPage();
      const watching = watch(page);
      await page.goto('/pay-calculator/');
      await page.getByLabel('Hours', { exact: true }).fill('34.5');
      await page.getByLabel('Pay an hour', { exact: true }).fill('12.71');
      await page.getByRole('button', { name: 'Work out take-home pay' }).click();
      await page.getByRole('button', { name: 'Start a free plan with this pay' }).click();
      await expect(page.getByRole('button', { name: 'Make my plan' })).toBeVisible();
      // Kept for this tab only, never in the web address.
      expect(await keptOnPhone(page)).toContain('session: prepenny-pay-draft');
      expect(page.url()).not.toContain('438');
      if (next === 'setup') {
        await page.getByRole('button', { name: 'Make my plan' }).click();
        await page.getByLabel('Type what your bank shows today').fill('100');
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(
          page.getByText('Your take-home pay from the calculator is filled in below'),
        ).toBeVisible();
      } else {
        await page.getByRole('button', { name: 'Look at an example plan' }).click();
        await expect(page.getByTestId('balance')).toBeVisible();
      }
      const kept = await keptOnPhone(page);
      expect(kept.filter((key) => key.includes('pay-draft'))).toEqual([]);
      await watching.expectNothingSent();
      await context.close();
    }
  });

  test("practice changes are forgotten once they're kept, thrown away, or the example starts again", async ({
    page,
  }) => {
    const practiseOnce = async (amount: string) => {
      await page.goto('/app/what-if/');
      await expect(page.getByTestId('side-by-side')).toBeVisible();
      await openPeriod(page, '2026-10-30');
      await period(page, '2026-10-30')
        .getByRole('button', { name: /^Pay Fri/ })
        .click();
      const sheet = page.getByRole('dialog', { name: 'Pay' });
      await sheet.getByLabel('Amount').fill(amount);
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByTestId('practice-list')).toBeVisible();
      await expect.poll(() => keptOnPhone(page)).toContain('device: what-if|example');
    };
    const gone = async () =>
      expect
        .poll(async () => (await keptOnPhone(page)).filter((key) => key.includes('what-if')))
        .toEqual([]);

    await practiseOnce('503.06');
    await page.getByRole('button', { name: 'Throw them away' }).click();
    await page
      .getByRole('dialog', { name: 'Throw them away' })
      .getByRole('button', { name: 'Throw them away' })
      .click();
    await gone();

    await practiseOnce('503.06');
    await page.getByRole('button', { name: 'Keep these changes' }).click();
    await expect(page.getByTestId('undo-bar')).toBeVisible();
    await gone();

    await practiseOnce('490');
    await page.goto('/app/more/');
    await page.getByRole('button', { name: 'Start again with the example' }).click();
    await page
      .getByRole('dialog', { name: 'Start again with the example' })
      .getByRole('button', { name: 'Start again', exact: true })
      .click();
    await gone();
  });
});
