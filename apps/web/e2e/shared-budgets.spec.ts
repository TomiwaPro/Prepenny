// Step 4a: a shared budget leaves on the payday of the person who added it,
// on both phones (D508, D512 to D514), with two people on two phones,
// against the local Supabase, at 320px and 360px in light and dark, with axe.
//
// 1. Each partner adds a budget to their joint account. Jess is paid on the
//    28th, into her own account; Tom, who brings his own plan when he joins,
//    on the 15th, into his. Before saving, each is told plainly that the
//    other will see the money leave on their paydays. Both phones then show
//    the joint account the same on every day for a year, and Tom's phone
//    keeps nothing of Jess's pay but its dates. Jess then leaves: her food
//    month follows Tom's paydays, and his phone says so.
// 2. Jess adds the food month while the joint account is still hers alone,
//    and sharing it says first who will see it leave on her paydays. Tom has
//    no main pay. When Jess leaves, each month starts on the 1st, and his
//    phone says so.

import { type Browser, expect, type Page, type TestInfo, test } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { openShare } from './jess-and-tom.ts';
import { type Days, noSidewaysScroll, openHome, openNewPhone, phoneDays } from './journeys.ts';
import {
  type AccountAnswers,
  box,
  expectStep,
  fillAccount,
  lastForm,
  next,
  noAxeProblems,
  radio,
  SCREEN_TITLES,
  skip,
} from './setup.ts';
import { askForCode, newEmail, signInEmail } from './sign-in-helpers.ts';
import {
  everythingOnThePhone,
  personOn,
  quoted,
  secondPhone,
  signUpFromMore,
  sql,
} from './two-phones.ts';

const SCREENS = '../../docs/screens/4a';
const TODAY = '2026-10-25';
const YEAR_ON = '2027-10-25';
const s = strings.share;
const j = strings.join;
const b = strings.budgets;
const sheetWords = strings.budgetSheet;
const spending = strings.setup.spending;
const leave = strings.together.leave;

/** Screenshots once, at 360px in light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  info.project.name === 'sign-in-360' && colorScheme === 'light';

interface Person {
  readonly accounts: readonly AccountAnswers[];
  readonly pay: {
    readonly name: string;
    readonly payday: string;
    readonly amount: string;
    readonly into?: string;
  };
}

/** Setup with an account or two and a monthly pay, skipping the rest, ending on Home. */
async function setUp(page: Page, person: Person) {
  await openNewPhone(page, TODAY);
  await page.getByRole('button', { name: 'Make my plan' }).click();
  await expectStep(page, 1, SCREEN_TITLES[0]);
  for (const [index, account] of person.accounts.entries()) {
    if (index > 0) await page.getByRole('button', { name: 'Add another account' }).click();
    await fillAccount(lastForm(page, 'account'), account);
  }
  await next(page);
  await expectStep(page, 2, SCREEN_TITLES[1]);
  const pay = lastForm(page, 'income');
  await box(pay, 'Name').fill(person.pay.name);
  await radio(pay, 'Monthly, on a date').check();
  await box(pay, 'Next payday').fill(person.pay.payday);
  await box(pay, 'How much comes in, after tax').fill(person.pay.amount);
  if (person.pay.into !== undefined) {
    await radio(pay.getByRole('group', { name: 'Into' }), person.pay.into).check();
  }
  await radio(
    page.getByRole('group', { name: 'Do you ever work extra hours or miss shifts?' }),
    'No',
  ).check();
  await next(page);
  for (const [index, title] of SCREEN_TITLES.slice(2, 5).entries()) {
    await expectStep(page, (index + 3) as 3, title);
    await skip(page);
  }
  await expectStep(page, 6, SCREEN_TITLES[5]);
  await page.getByRole('button', { name: 'Go to my plan' }).click();
  await expect(page.getByTestId('balance')).toBeVisible();
}

const JESS: Person = {
  accounts: [
    { name: 'Jess current account', balance: '410', warning: '50' },
    { name: 'Joint account', kind: 'Joint account', balance: '1050', warning: '100' },
  ],
  pay: { name: 'Jess pay', payday: '2026-10-28', amount: '2100', into: 'Jess current account' },
};

const TOM: Person = {
  accounts: [{ name: 'Tom current account', balance: '520', warning: '50' }],
  pay: { name: 'Tom pay', payday: '2026-11-15', amount: '2350' },
};

/** Opens Add a budget and fills it in, leaving it open so its words can be checked. */
async function fillBudget(page: Page, name: string, amount: string, from: string) {
  await page.goto('/app/budgets/');
  await expect(page.getByRole('heading', { level: 1, name: b.heading })).toBeVisible();
  await page.getByRole('button', { name: b.add, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: sheetWords.addTitle });
  await box(sheet, spending.name).fill(name);
  await box(sheet, spending.amount).fill(amount);
  await radio(sheet.getByRole('group', { name: spending.every }), spending.month).check();
  await radio(sheet.getByRole('group', { name: spending.from }), from).check();
  return sheet;
}

async function saveBudget(sheet: ReturnType<Page['getByRole']>) {
  await sheet.getByRole('button', { name: sheetWords.save }).click();
  await expect(sheet).toBeHidden();
}

/** Waits until nothing on this phone is waiting to be sent. */
async function allSent(page: Page) {
  await page.goto('/app/more/');
  await expect(page.getByTestId('where-kept')).toHaveText(strings.account.savedInAccount, {
    timeout: 20_000,
  });
}

/** A budget's card on the Budgets screen. */
const budgetCard = (page: Page, name: string) =>
  page.getByTestId('budget').and(page.locator(`[data-budget="${name}"]`));

/** Shares one of Jess's accounts, checking what the sheet that asks first says. */
async function share(page: Page, account: string, says: string | null, screenshot?: string) {
  await page.goto('/app/share/accounts/');
  await expect(page.getByRole('heading', { level: 1, name: s.accountsTitle })).toBeVisible();
  await page.getByRole('checkbox', { name: account }).check();
  await page.getByRole('button', { name: s.shareThese }).click();
  const sheet = page.getByRole('dialog', { name: s.confirmTitle(account) });
  if (says === null) await expect(sheet.getByTestId('share-your-paydays')).toHaveCount(0);
  else await expect(sheet.getByTestId('share-your-paydays')).toHaveText(says);
  await noAxeProblems(page);
  if (screenshot !== undefined) await page.screenshot({ path: screenshot });
  await sheet.getByRole('button', { name: s.confirmYes }).click();
  await expect(page.getByTestId('share-said')).toHaveText(s.sharedDone(account), {
    timeout: 20_000,
  });
  return sheet;
}

/** Jess's invite link, "Can edit". */
async function inviteLink(page: Page): Promise<string> {
  await openShare(page);
  const invite = page.getByTestId('invite');
  await box(invite, s.nameLabel).fill('Jess');
  await radio(invite, s.canEdit).check();
  await radio(invite, s.byLink).check();
  await invite.getByRole('button', { name: s.makeLink }).click();
  return page.getByTestId('invite-link').getByLabel(s.linkLabel).inputValue();
}

/**
 * Tom joins Jess's plan: with a plan of his own, signed up already, which
 * comes with him (D426), or as someone new. Jess allows it.
 */
async function tomJoins(page: Page, tom: Page, link: string, withPlan: boolean) {
  await tom.goto(link);
  await expect(tom.getByRole('heading', { level: 1, name: j.heading })).toBeVisible();
  if (!withPlan) {
    const address = newEmail('tom');
    await tom.getByRole('link', { name: j.signIn }).click();
    await askForCode(tom, address);
    await box(tom, '6-digit code').fill((await signInEmail(address)).code);
    await tom.getByRole('button', { name: 'Sign up', exact: true }).click();
  }
  await expect(tom.getByTestId('join-message')).toHaveText(j.invitedBy('Jess'));
  await box(tom, j.nameLabel('Jess')).fill('Tom');
  await tom.getByRole('button', { name: j.ask }).click();
  const sheet = page.getByRole('dialog', { name: s.requestTitle('Tom') });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await sheet.getByRole('button', { name: s.allow, exact: true }).click();
  await sheet.getByRole('button', { name: s.gotIt }).click();
  // The same bank holidays: his plan comes in by itself (D426).
  await expect(tom).toHaveURL(/\/app\/$/, { timeout: 30_000 });
  await expect(tom.getByTestId('balance')).toBeVisible();
}

/** The accounts both phones have, with every day's balance a year ahead on each. */
async function sharedDays(one: Page, other: Page): Promise<[Days, Days]> {
  const a = await phoneDays(one, TODAY, YEAR_ON);
  const c = await phoneDays(other, TODAY, YEAR_ON);
  const both = Object.keys(a).filter((name) => c[name] !== undefined);
  const pick = (days: Days) => Object.fromEntries(both.map((name) => [name, days[name] ?? {}]));
  return [pick(a), pick(c)];
}

/** The first few days the two phones differ on, as "Joint account 2026-10-28: 75000, not 105000". */
function differences(one: Days, other: Days): string[] {
  const found: string[] = [];
  for (const [account, days] of Object.entries(one)) {
    for (const [date, balance] of Object.entries(days)) {
      const theirs = other[account]?.[date];
      if (theirs !== balance) found.push(`${account} ${date}: ${balance}, not ${theirs}`);
      if (found.length >= 4) return found;
    }
  }
  return found;
}

/**
 * Both phones show every shared account the same, every day for a year,
 * within 30 seconds: well inside the minute a phone that missed a nudge
 * would wait (D515).
 */
async function sameOnBoth(one: Page, other: Page) {
  await expect
    .poll(
      async () => {
        const [a, c] = await sharedDays(one, other);
        return { accounts: Object.keys(a), differences: differences(a, c) };
      },
      { timeout: 30_000 },
    )
    .toEqual({ accounts: ['Joint account'], differences: [] });
  const [days] = await sharedDays(one, other);
  expect(Object.keys(days['Joint account'] ?? {})).toHaveLength(366);
  return days;
}

/** The money leaving the joint account on a day, in pence, as both phones see it. */
const leftOn = (days: Days, date: string, dayBefore: string) =>
  (days['Joint account']?.[date] ?? 0) - (days['Joint account']?.[dayBefore] ?? 0);

/** Checks a screen the way every screen is checked: axe, and nothing wider than the phone. */
async function screenChecks(page: Page) {
  await noAxeProblems(page);
  await noSidewaysScroll(page);
}

async function newPhone(browser: Browser, info: TestInfo, colorScheme: 'light' | 'dark') {
  return secondPhone(browser, info, colorScheme, TODAY);
}

/** Jess leaves the plan with her own things only. */
async function jessLeaves(page: Page) {
  await openShare(page);
  await page.getByTestId('leave').getByRole('link', { name: leave.link }).click();
  await expect(page.getByRole('heading', { level: 1, name: leave.heading })).toBeVisible();
  await radio(page, leave.copyNo).check();
  await page.getByRole('button', { name: leave.leave }).click();
  await page
    .getByRole('dialog', { name: leave.confirmTitle })
    .getByRole('button', { name: leave.confirmYes })
    .click();
  await expect(page).toHaveURL(/\/app\/$/, { timeout: 30_000 });
  await expect(page.getByTestId('left')).toBeVisible({ timeout: 30_000 });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`in ${colorScheme}`, () => {
    test('1. A shared budget added by each partner leaves on their own paydays, the same on both phones, and follows the person who stays', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(420_000);
      await page.emulateMedia({ colorScheme });

      // Jess: her pay into her own account, and the joint account, which she shares.
      await setUp(page, JESS);
      await signUpFromMore(page, newEmail('jess'));
      await share(page, 'Joint account', null);
      const link = await inviteLink(page);

      // Tom: his own plan, his pay into his own account, which comes with him.
      const tom = await newPhone(browser, info, colorScheme);
      await setUp(tom.page, TOM);
      await signUpFromMore(tom.page, newEmail('tom'));
      await tomJoins(page, tom.page, link, true);

      // Jess adds the food month to the joint account: she's told first.
      const food = await fillBudget(page, 'Food', '300', 'Joint account');
      await expect(food.getByTestId('your-paydays')).toHaveText(sheetWords.partnerWillSee('Tom'));
      await screenChecks(page);
      if (shoots(info, colorScheme)) {
        await food.getByRole('button', { name: sheetWords.save }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SCREENS}/your-paydays-360-light.png` });
      }
      // Not for a card, whose bill decides when it leaves, nor for her own account.
      await radio(food, spending.payLater).check();
      await expect(food.getByTestId('your-paydays')).toHaveCount(0);
      await radio(food, spending.atStart).check();
      await radio(food.getByRole('group', { name: spending.from }), 'Jess current account').check();
      await expect(food.getByTestId('your-paydays')).toHaveCount(0);
      await radio(food.getByRole('group', { name: spending.from }), 'Joint account').check();
      await expect(food.getByTestId('your-paydays')).toHaveText(sheetWords.partnerWillSee('Tom'));
      await saveBudget(food);

      // Tom adds his meals out to the joint account: he's told too.
      const meals = await fillBudget(tom.page, 'Meals out', '60', 'Joint account');
      await expect(meals.getByTestId('your-paydays')).toHaveText(sheetWords.partnerWillSee('Jess'));
      await screenChecks(tom.page);
      await saveBudget(meals);
      await allSent(page);
      await allSent(tom.page);

      // Both phones: the same joint account, every day for a year.
      const days = await sameOnBoth(page, tom.page);
      // The food month leaves on Jess's payday, Wed 28 Oct, and next on
      // Fri 27 Nov (28 Nov is a Saturday); the meals out on Tom's, Fri 13 Nov
      // (15 Nov is a Sunday).
      expect(leftOn(days, '2026-10-28', '2026-10-27')).toBe(-30000);
      expect(leftOn(days, '2026-11-13', '2026-11-12')).toBe(-6000);
      expect(leftOn(days, '2026-11-27', '2026-11-26')).toBe(-30000);

      // Each phone says whose paydays each leaves on.
      await page.goto('/app/budgets/');
      await expect(budgetCard(page, 'Food').getByTestId('whose-paydays')).toHaveText(
        b.partnerSeesYourPaydays('Tom'),
        { timeout: 20_000 },
      );
      await expect(budgetCard(page, 'Meals out').getByTestId('whose-paydays')).toHaveText(
        b.onTheirPaydays('Tom'),
      );
      await screenChecks(page);
      await tom.page.goto('/app/budgets/');
      await expect(budgetCard(tom.page, 'Food').getByTestId('whose-paydays')).toHaveText(
        b.onTheirPaydays('Jess'),
        { timeout: 20_000 },
      );
      await expect(budgetCard(tom.page, 'Meals out').getByTestId('whose-paydays')).toHaveText(
        b.partnerSeesYourPaydays('Jess'),
      );
      await expect(budgetCard(tom.page, 'Food')).toContainText(b.thisMonth('Tue 27 Oct'));
      await screenChecks(tom.page);
      if (shoots(info, colorScheme)) {
        await tom.page.screenshot({ path: `${SCREENS}/budgets-tom-360-light.png`, fullPage: true });
      }

      // Tom's phone has Jess's paydays and nothing else of her pay: no
      // amount, name or account.
      const onTomsPhone = await everythingOnThePhone(tom.page);
      expect(onTomsPhone).toContain('2026-10-28');
      expect(onTomsPhone).not.toContain('Jess pay');
      expect(onTomsPhone).not.toContain('210000');
      expect(onTomsPhone).not.toContain('Jess current account');
      await openHome(tom.page);
      await screenChecks(tom.page);

      // Jess leaves, with her own things only. The food month stays with
      // Tom, and now follows his paydays: its month runs to Thu 12 Nov.
      await jessLeaves(page);
      await tom.page.goto('/app/budgets/');
      await expect(budgetCard(tom.page, 'Food').getByTestId('whose-paydays')).toHaveText(
        b.passedOnPaydays,
        { timeout: 70_000 },
      );
      await expect(budgetCard(tom.page, 'Food')).toContainText(b.thisMonth('Thu 12 Nov'));
      await expect(budgetCard(tom.page, 'Meals out').getByTestId('whose-paydays')).toHaveCount(0);
      await screenChecks(tom.page);
      if (shoots(info, colorScheme)) {
        await tom.page.screenshot({
          path: `${SCREENS}/passed-on-360-light.png`,
          fullPage: true,
        });
      }
      const after = await phoneDays(tom.page, TODAY, YEAR_ON);
      // Both on Tom's payday now, and nothing on Jess's.
      expect(leftOn(after, '2026-11-13', '2026-11-12')).toBe(-36000);
      expect(leftOn(after, '2026-11-27', '2026-11-26')).toBe(0);
      // On the server: Jess's paydays have gone from the plan, with nothing left in them.
      const jess = await personOn(page);
      expect(sql(`select count(*) from public.paydays where person = ${quoted(jess)}`)).toBe('0');
      await tom.context.close();
    });

    test('2. Sharing an account with a budget says so first, and with no main pay of his own, Tom gets months from the 1st once Jess leaves', async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(420_000);
      await page.emulateMedia({ colorScheme });

      // Jess adds the food month while the joint account is hers alone: nobody else to tell.
      await setUp(page, JESS);
      await signUpFromMore(page, newEmail('jess'));
      const food = await fillBudget(page, 'Food', '300', 'Joint account');
      await expect(food.getByTestId('your-paydays')).toHaveCount(0);
      await saveBudget(food);
      await allSent(page);

      // Sharing the joint account says who will see it leave on her paydays.
      await share(
        page,
        'Joint account',
        s.budgetsOnYourPaydays(s.partnerFallback, 'Food'),
        shoots(info, colorScheme) ? `${SCREENS}/share-your-paydays-360-light.png` : undefined,
      );

      // Tom joins with no plan of his own, so no main pay.
      const tom = await newPhone(browser, info, colorScheme);
      await tomJoins(page, tom.page, await inviteLink(page), false);
      await sameOnBoth(page, tom.page);
      await tom.page.goto('/app/budgets/');
      await expect(budgetCard(tom.page, 'Food').getByTestId('whose-paydays')).toHaveText(
        b.onTheirPaydays('Jess'),
        { timeout: 20_000 },
      );
      await screenChecks(tom.page);

      // Jess leaves: Tom has no main pay, so each month starts on the 1st.
      await jessLeaves(page);
      await tom.page.goto('/app/budgets/');
      await expect(budgetCard(tom.page, 'Food').getByTestId('whose-paydays')).toHaveText(
        b.passedOnMonths,
        { timeout: 70_000 },
      );
      await expect(budgetCard(tom.page, 'Food')).toContainText(b.thisMonth('Sat 31 Oct'));
      await screenChecks(tom.page);
      const after = await phoneDays(tom.page, TODAY, YEAR_ON);
      expect(leftOn(after, '2026-11-01', '2026-10-31')).toBe(-30000);
      expect(leftOn(after, '2026-11-27', '2026-11-26')).toBe(0);
      await tom.context.close();
    });
  });
}
