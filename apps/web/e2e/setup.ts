// Shared steps for the setup tests (brief 4.1, step 2e, D356): starting from
// the welcome on a phone with nothing on it, filling in each screen's boxes,
// and reading back the plan setup saved on the phone. Setup is 6 screens in
// 3 parts: money in (1 and 2), money out (3 to 5) and your plan (6).

import { expect, type Locator, type Page } from '@playwright/test';
import type { PlanRecords } from '@prepenny/engine';
import { recordsOf, type StoredRecord } from '../data/db.ts';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { axeOnceStill } from './axe.ts';
import { AXE_TAGS } from './coming-up.ts';
import { settingScript } from './fixtures.ts';
import { KOFI_ALREADY_SPENT, KOFI_TODAY, PRIYA_TODAY } from './setup-answers.ts';

export async function noAxeProblems(page: Page) {
  expect((await (await axeOnceStill(page)).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
}

/** Opens PrePenny on a phone with nothing on it, with the test-only today (D201). */
export async function openFresh(page: Page, today: string) {
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today }] as const);
  await page.goto('/app/');
  await expect(page).toHaveURL(/\/setup\/$/);
  await expect(page.getByRole('button', { name: 'Make my plan' })).toBeVisible();
}

/** Opens PrePenny fresh and taps "Make my plan". */
export async function startSetup(page: Page, today: string) {
  await openFresh(page, today);
  await page.getByRole('button', { name: 'Make my plan' }).click();
  await expectStep(page, 1, 'Your account');
}

/** The words at the top of each screen (D356). */
export const PART_OF_SCREEN: Readonly<Record<number, string>> = {
  1: 'Part 1 of 3: Money in',
  2: 'Part 1 of 3: Money in',
  3: 'Part 2 of 3: Money out',
  4: 'Part 2 of 3: Money out',
  5: 'Part 2 of 3: Money out',
  6: 'Part 3 of 3: Your plan',
};

/** The screen showing: its number, the part at the top, its title, which has focus. */
export async function expectStep(page: Page, screen: 1 | 2 | 3 | 4 | 5 | 6, title: string) {
  await expect(page.locator('main[data-step]')).toHaveAttribute('data-step', String(screen));
  await expect(page.getByText(PART_OF_SCREEN[screen] ?? '', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  // The title takes focus, so a screen reader starts there.
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
}

/** Each screen's title, in order (D356). */
export const SCREEN_TITLES = [
  'Your account',
  "How you're paid",
  'Home and bills',
  'Debts',
  'Spending money',
  "Here's your plan",
] as const;

/** The rent or mortgage card at the top of screen 3 (D356). */
export const rentForm = (page: Page) => page.getByTestId('rent-form');

/** A bill on the checklist on screen 3, by its key. */
export const billOn = (page: Page, key: string) => page.locator(`[data-bill="${key}"]`);

export const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true }).click();
export const skip = (page: Page) =>
  page.getByRole('button', { name: 'Skip this step', exact: true }).click();
export const back = (page: Page) => page.getByRole('button', { name: 'Back', exact: true }).click();

/** The last form of a kind on the step, such as the account just added. */
export const lastForm = (page: Page, kind: string) => page.getByTestId(`${kind}-form`).last();

export const radio = (where: Locator | Page, name: string) =>
  where.getByRole('radio', { name, exact: true });

export const box = (where: Locator | Page, label: string) =>
  where.getByLabel(label, { exact: true });

export interface AccountAnswers {
  readonly name: string;
  readonly kind?: 'Current account' | 'Savings' | 'Joint account';
  readonly balance: string;
  readonly overdraft?: string;
  readonly warning: string;
}

export async function fillAccount(form: Locator, answers: AccountAnswers) {
  await box(form, 'Name of the account').fill(answers.name);
  if (answers.kind !== undefined) await radio(form, answers.kind).check();
  await box(form, 'Type what your bank shows today').fill(answers.balance);
  if (answers.overdraft !== undefined) {
    await box(form, 'Overdraft limit, if you have one').fill(answers.overdraft);
  }
  await box(form, 'Warn me when it goes under').fill(answers.warning);
}

export interface WhenAnswers {
  readonly date: string;
  /** "Every month, or every few months" and the others, as the sheet words them. */
  readonly often?: string;
  readonly monthsApart?: string;
  readonly weeksApart?: string;
  readonly payments?: string;
}

/** The "when" boxes: the next payment's date, how often and when it ends. */
export async function fillWhen(form: Locator, answers: WhenAnswers) {
  await box(form, 'Next payment').fill(answers.date);
  if (answers.often !== undefined) await radio(form, answers.often).check();
  if (answers.monthsApart !== undefined) {
    await box(form, 'How many months apart').fill(answers.monthsApart);
  }
  if (answers.weeksApart !== undefined) {
    await box(form, 'How many weeks apart').fill(answers.weeksApart);
  }
  if (answers.payments !== undefined) {
    await radio(form, 'After a number of payments').check();
    await box(form, 'How many payments').fill(answers.payments);
  }
}

/** Every record of the person's own plan, read straight from the phone's database. */
export async function ownRecords(page: Page): Promise<PlanRecords> {
  const rows = await page.evaluate(
    () =>
      new Promise<StoredRecord[]>((resolve, reject) => {
        const request = indexedDB.open('prepenny');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const plans = db.transaction('plans').objectStore('plans').getAll();
          plans.onsuccess = () => {
            const own = (plans.result as { id: string; isExample: boolean }[]).find(
              (plan) => !plan.isExample,
            );
            if (own === undefined) {
              db.close();
              resolve([]);
              return;
            }
            const records = db.transaction('records').objectStore('records').getAll();
            records.onsuccess = () => {
              db.close();
              resolve((records.result as StoredRecord[]).filter((row) => row.planId === own.id));
            };
          };
        };
      }),
  );
  return recordsOf(rows);
}

/** The plans on the phone, as stored. */
export async function storedPlans(page: Page): Promise<unknown[]> {
  return page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = indexedDB.open('prepenny');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const plans = db.transaction('plans').objectStore('plans').getAll();
          plans.onsuccess = () => {
            db.close();
            resolve(plans.result as unknown[]);
          };
        };
      }),
  );
}

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** The fields that hold the id of a record. */
const ID_FIELDS = new Set([
  'id',
  'accountId',
  'toAccountId',
  'familyId',
  'debtId',
  'goalId',
  'budgetId',
  'payProfileId',
  'cyclePayWeeks',
  'splitFrom',
  'mirrorOf',
  'mainPayFamilyId',
]);

/**
 * A plan's records with every id swapped for the name of what it is, and
 * every time for "a time", so a plan built on the screens and one built by
 * the commands with their own ids can be compared. The order things were
 * made in is kept separately.
 */
export function comparable(records: PlanRecords) {
  const labels = new Map<string, string>();
  const name = (list: readonly { id: string; name?: string }[] | undefined, kind: string) => {
    for (const one of list ?? []) labels.set(one.id, `${kind}: ${one.name ?? ''}`);
  };
  name(records.accounts, 'account');
  name(records.series, 'series');
  name(records.debts, 'debt');
  name(records.budgets, 'budget');
  name(records.goals, 'goal');
  name(records.payProfiles, 'pay profile');
  name(records.payWeeks, 'pay week');
  for (const spend of records.spends ?? []) {
    labels.set(spend.id, `spend: ${labels.get(spend.budgetId) ?? ''} on ${spend.spentOn}`);
  }
  for (const update of records.balanceUpdates) {
    labels.set(update.id, `balance: ${labels.get(update.accountId)} on ${update.checkedOn}`);
  }
  const swap = (value: unknown, key = ''): unknown => {
    if (typeof value === 'string') {
      if (ID_FIELDS.has(key)) return labels.get(value) ?? value;
      return TIME.test(value) ? 'a time' : value;
    }
    if (Array.isArray(value)) return value.map((one) => swap(one, key));
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([field, one]) => [field, swap(one, field)]),
      );
    }
    return value;
  };
  const sorted = (list: readonly unknown[] | undefined) =>
    (
      (swap(list ?? [], 'list') as unknown[]).map((one) => JSON.stringify(one)).sort() as string[]
    ).map((one) => JSON.parse(one) as unknown);
  const madeOrder = [...records.series]
    .sort((a, b) => (a.familyCreatedAt < b.familyCreatedAt ? -1 : 1))
    .map((one) => one.name);
  const budgetOrder = [...(records.budgets ?? [])]
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map((one) => one.name);
  return {
    settings: swap(records.settings ?? null, 'settings'),
    accounts: sorted(records.accounts),
    balanceUpdates: sorted(records.balanceUpdates),
    series: sorted(records.series),
    changes: sorted(records.changes),
    ticks: sorted(records.ticks),
    debts: sorted(records.debts),
    budgets: sorted(records.budgets),
    spends: sorted(records.spends),
    goals: sorted(records.goals),
    payProfiles: sorted(records.payProfiles),
    payWeeks: sorted(records.payWeeks),
    payAdjustments: sorted(records.payAdjustments),
    madeOrder,
    budgetOrder,
  };
}

/**
 * Counts taps from here on, for the setup tests (D356): every press of a
 * button, choice or tick box, and every tap into a box to type in. Picking a
 * date in a phone's own date picker takes a few more taps, the same before
 * and after.
 */
export async function countTaps(page: Page) {
  await page.addInitScript(() => {
    const textBoxes = new Set(['text', 'date', 'number', 'email', 'tel', 'search', '']);
    const counter = window as unknown as { __taps: number };
    counter.__taps = 0;
    let pressed: EventTarget | null = null;
    document.addEventListener(
      'pointerdown',
      (event) => {
        counter.__taps += 1;
        pressed = event.target;
      },
      true,
    );
    document.addEventListener(
      'focusin',
      (event) => {
        const box = event.target;
        const typed =
          box instanceof HTMLTextAreaElement ||
          (box instanceof HTMLInputElement && textBoxes.has(box.type));
        // A box typed into without a tap on it first: that's one tap.
        if (typed && !(pressed instanceof Node && (pressed === box || box.contains(pressed)))) {
          counter.__taps += 1;
        }
        pressed = null;
      },
      true,
    );
  });
}

export const tapsSoFar = (page: Page) =>
  page.evaluate(() => (window as unknown as { __taps: number }).__taps);

export interface GoalAnswers {
  readonly name: string;
  readonly target: string;
  readonly by?: string;
  readonly saved?: string;
  readonly move?: string;
}

/**
 * "Saving for something? Add a goal" on Here's your plan (D356): the savings
 * goal sheet, the same as under More, then back on the plan with the goal
 * listed.
 */
export async function addGoalOnPlan(
  page: Page,
  answers: GoalAnswers,
  check: (sheet: Locator) => Promise<void> = async () => {},
) {
  const card = page.getByTestId('add-goal');
  await expect(card.getByText('Saving for something?', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: /^Add (a|another) goal$/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a savings goal' });
  await expect(sheet).toBeVisible();
  await box(sheet, 'What are you saving for?').fill(answers.name);
  await box(sheet, 'Target').fill(answers.target);
  if (answers.by !== undefined) await box(sheet, 'By, if you have a date').fill(answers.by);
  if (answers.saved !== undefined) await box(sheet, 'Already saved towards it').fill(answers.saved);
  if (answers.move !== undefined) await box(sheet, 'Move into it').fill(answers.move);
  await check(sheet);
  await sheet.getByRole('button', { name: 'Add goal', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(card.getByRole('status')).toHaveText(`${answers.name} added.`);
  await expect(card.getByTestId('added')).toContainText(answers.name);
}

/** Priya's answers on the 6 screens (brief 8.5, D137, D356), checking every screen with axe. */
export async function setUpPriya(
  page: Page,
  at: (screen: number) => Promise<void> = async () => {},
) {
  await openFresh(page, PRIYA_TODAY);
  await expect(
    page.getByText('Set it up once, about 5 minutes. After that, just keep it up to date.', {
      exact: true,
    }),
  ).toBeVisible();
  await at(0);
  await page.getByRole('button', { name: 'Make my plan' }).click();
  await expectStep(page, 1, 'Your account');
  // The first screen can't be skipped (D163).
  await expect(page.getByRole('button', { name: 'Skip this step' })).toHaveCount(0);
  await expect(box(lastForm(page, 'account'), 'Warn me when it goes under')).toHaveValue('20.00');
  await noAxeProblems(page);
  await fillAccount(lastForm(page, 'account'), {
    name: 'Current account',
    balance: '1240.00',
    warning: '50.00',
  });
  await page.getByRole('button', { name: 'Add another account' }).click();
  await fillAccount(lastForm(page, 'account'), {
    name: 'Holiday savings',
    kind: 'Savings',
    balance: '300',
    warning: '0',
  });
  await expect(radio(page, 'England and Wales')).toBeChecked();
  await at(1);
  await next(page);

  await expectStep(page, 2, "How you're paid");
  await noAxeProblems(page);
  const pay = lastForm(page, 'income');
  await box(pay, 'Name').fill('Salary');
  await radio(pay, 'On the last working day of the month').check();
  await box(pay, 'Next payday').fill('2026-10-30');
  await box(pay, 'How much comes in, after tax').fill('2100');
  // The last working day always lands on the working day before (D145).
  await expect(pay.getByRole('group', { name: 'On a weekend or bank holiday' })).toHaveCount(0);
  await radio(page, 'No').check();
  await noAxeProblems(page);
  await at(2);
  await next(page);

  // Rent at the top, then the bills, on one screen (D356).
  await expectStep(page, 3, 'Home and bills');
  await noAxeProblems(page);
  const rent = rentForm(page);
  await expect(radio(rent, 'Rent')).toBeChecked();
  await box(rent, 'Amount').fill('850');
  await fillWhen(rent, { date: '2026-11-01' });
  await expect(radio(rent, 'The 1st of the month')).toBeChecked();
  const bill = (key: string) => billOn(page, key);
  const tick = async (key: string, name: string) => {
    await bill(key).getByRole('checkbox', { name, exact: true }).check();
  };
  await tick('council-tax', 'Council tax');
  await expect(
    bill('council-tax').getByRole('checkbox', { name: '10 payments, April to January' }),
  ).toBeChecked();
  await box(bill('council-tax'), 'Amount').fill('148');
  await fillWhen(bill('council-tax'), { date: '2026-11-01' });
  await tick('energy', 'Energy');
  await box(bill('energy'), 'Amount').fill('96');
  await fillWhen(bill('energy'), { date: '2026-11-15' });
  await bill('energy').getByRole('checkbox', { name: 'This is an estimate' }).check();
  await tick('water', 'Water');
  await box(bill('water'), 'Amount').fill('118.60');
  await fillWhen(bill('water'), { date: '2026-11-05', monthsApart: '3' });
  await tick('phone', 'Phone');
  await box(bill('phone'), 'Amount').fill('18');
  await fillWhen(bill('phone'), { date: '2026-11-20' });
  await tick('broadband', 'Broadband');
  await box(bill('broadband'), 'Amount').fill('30');
  await fillWhen(bill('broadband'), { date: '2026-11-08' });
  await tick('tv-licence', 'TV licence');
  await box(bill('tv-licence'), 'Amount').fill('174.50');
  await fillWhen(bill('tv-licence'), { date: '2027-03-01', monthsApart: '12' });
  await tick('insurance', 'Insurance');
  await box(bill('insurance'), 'Name').fill('Car insurance');
  await box(bill('insurance'), 'Amount').fill('612.40');
  await fillWhen(bill('insurance'), { date: '2027-01-14', monthsApart: '12' });
  await tick('subscriptions', 'Subscriptions');
  await box(bill('subscriptions'), 'Name').fill('Streaming');
  await box(bill('subscriptions'), 'Amount').fill('10.99');
  await fillWhen(bill('subscriptions'), { date: '2026-11-12' });
  await page.getByRole('button', { name: 'Add another bill' }).click();
  const other = lastForm(page, 'bill');
  await box(other, 'Name').fill('Cloud storage');
  await box(other, 'Amount').fill('2.99');
  await fillWhen(other, { date: '2026-10-27' });
  await noAxeProblems(page);
  await at(3);
  await next(page);

  await expectStep(page, 4, 'Debts');
  await noAxeProblems(page);
  await at(4);
  await page.getByRole('button', { name: 'I have no debts' }).click();

  await expectStep(page, 5, 'Spending money');
  await noAxeProblems(page);
  const food = page.getByTestId('budget-form').first();
  const travel = page.getByTestId('budget-form').nth(1);
  await expect(box(food, 'Name')).toHaveValue('Food');
  await expect(box(travel, 'Name')).toHaveValue('Travel');
  await box(food, 'Amount').fill('260');
  await expect(radio(food, 'Month')).toBeChecked();
  // Each starts this week or month (D230): Priya's month runs payday to
  // payday, her week from Monday (D29, D108).
  await expect(food.getByText('It starts this month, Wed 30 Sep to Thu 29 Oct.')).toBeVisible();
  await box(food, 'Already spent this month').fill('230');
  await box(travel, 'Amount').fill('25');
  await radio(travel, 'Spread across the days').check();
  await expect(travel.getByText('It starts this week, Mon 19 Oct to Sun 25 Oct.')).toBeVisible();
  await box(travel, 'Already spent this week').fill('20');
  await at(5);
  await next(page);

  await expectStep(page, 6, "Here's your plan");
  await expect(page.getByRole('button', { name: 'Skip this step' })).toHaveCount(0);
  await expect(page.getByTestId('setup-summary')).toBeVisible();
  await expect(page.getByTestId('from-now')).toHaveText(
    'From now on: update your balance when you check your bank, and tick payments as they go out.',
  );
  // Savings left setup: "Add a goal" opens the savings goal sheet (D356).
  await expect(page.getByTestId('setup-first-goal')).toHaveCount(0);
  await noAxeProblems(page);
  await addGoalOnPlan(
    page,
    { name: 'Holiday', target: '1500', by: '2027-07-30', saved: '300', move: '150' },
    async (sheet) => {
      await expect(
        radio(sheet.getByRole('group', { name: 'Kept in' }), 'Holiday savings'),
      ).toBeChecked();
      await expect(radio(sheet, 'Each payday, from Fri 30 Oct')).toBeChecked();
      await expect(
        radio(sheet.getByRole('group', { name: 'From' }), 'Current account'),
      ).toBeChecked();
      await noAxeProblems(page);
    },
  );
  await expect(page.getByTestId('setup-first-goal')).toBeVisible();
  await noAxeProblems(page);
  await at(6);
}

/** Kofi's answers on the 6 screens (brief Part 2, D137, D356), checking each with axe; it ends on Here's your plan. */
export async function setUpKofi(page: Page) {
  await startSetup(page, KOFI_TODAY);
  await fillAccount(lastForm(page, 'account'), {
    name: 'Current account',
    balance: '640',
    warning: '50',
  });
  await page.getByRole('button', { name: 'Add another account' }).click();
  await fillAccount(lastForm(page, 'account'), {
    name: 'Tax',
    kind: 'Savings',
    balance: '1180',
    warning: '0',
  });
  await next(page);

  await expectStep(page, 2, "How you're paid");
  const platform = async (name: string, date: string, amount: string) => {
    const form = lastForm(page, 'income');
    await box(form, 'Name').fill(name);
    await radio(form, 'It changes: plan with a weekly estimate').check();
    await box(form, 'Next payday').fill(date);
    await box(form, 'About how much comes in each week').fill(amount);
    await radio(form, 'Keep the date').check();
    await form.getByRole('checkbox', { name: 'Put part of it aside, such as for tax' }).check();
    await box(form, 'How much, as a percentage').fill('25');
    await radio(form.getByRole('group', { name: 'Move it to' }), 'Tax').check();
  };
  await platform('Rides', '2026-11-02', '380');
  await page.getByRole('button', { name: 'Add another income' }).click();
  await platform('Deliveries', '2026-10-28', '145');
  await page.getByRole('button', { name: 'Add another income' }).click();
  await platform('Parcels', '2026-10-30', '90');
  const mainPay = page.getByRole('group', { name: 'Which is your main pay?' });
  await radio(mainPay, 'Rides').check();
  // Self-employed pay has no shifts, so the question isn't asked.
  await expect(
    page.getByRole('group', { name: 'Do you ever work extra hours or miss shifts?' }),
  ).toHaveCount(0);
  await noAxeProblems(page);
  await next(page);

  await expectStep(page, 3, 'Home and bills');
  await box(rentForm(page), 'Amount').fill('650');
  await fillWhen(rentForm(page), { date: '2026-11-01' });
  const bill = (key: string) => billOn(page, key);
  await bill('insurance').getByRole('checkbox', { name: 'Insurance', exact: true }).check();
  await box(bill('insurance'), 'Name').fill('Van insurance');
  await box(bill('insurance'), 'Amount').fill('96');
  await fillWhen(bill('insurance'), { date: '2026-11-12' });
  await bill('phone').getByRole('checkbox', { name: 'Phone', exact: true }).check();
  await box(bill('phone'), 'Amount').fill('25');
  await fillWhen(bill('phone'), { date: '2026-11-20' });
  await page.getByRole('button', { name: 'Add another bill' }).click();
  const tax = lastForm(page, 'bill');
  await box(tax, 'Name').fill('Self Assessment');
  await box(tax, 'Amount').fill('1450');
  await fillWhen(tax, { date: '2027-01-29', often: 'Once' });
  await radio(tax.getByRole('group', { name: 'From' }), 'Tax').check();
  await tax.getByRole('checkbox', { name: 'This is an estimate' }).check();
  await next(page);

  await expectStep(page, 4, 'Debts');
  await page.getByRole('button', { name: 'Add a debt' }).click();
  const van = lastForm(page, 'debt');
  await box(van, 'Name').fill('Van finance');
  await radio(van, 'Loan').check();
  await box(van, 'What you owe now').fill('6936');
  await box(van, 'What it started at, if you know').fill('10404');
  await box(van, 'Each payment').fill('289');
  await fillWhen(van, { date: '2026-11-05', payments: '24' });
  await noAxeProblems(page);
  await next(page);

  await expectStep(page, 5, 'Spending money');
  const fuel = page.getByTestId('budget-form').first();
  const food = page.getByTestId('budget-form').nth(1);
  await box(fuel, 'Name').fill('Fuel');
  await box(fuel, 'Amount').fill('70');
  await radio(fuel, 'Week').check();
  await box(food, 'Name').fill('Food');
  await box(food, 'Amount').fill('45');
  // His weeks run Monday to Sunday, and each starts this week (D14, D108, D230).
  await expect(fuel.getByText('It starts this week, Mon 26 Oct to Sun 1 Nov.')).toBeVisible();
  await expect(food.getByText('It starts this week, Mon 26 Oct to Sun 1 Nov.')).toBeVisible();
  await box(fuel, 'Already spent this week').fill(KOFI_ALREADY_SPENT.Fuel);
  await box(food, 'Already spent this week').fill(KOFI_ALREADY_SPENT.Food);
  await noAxeProblems(page);
  await next(page);

  await expectStep(page, 6, "Here's your plan");
}

/**
 * A plan with something added on every screen, as the old 8 steps could
 * have had: an account, pay, rent, a bill, a debt, a budget and a goal. It
 * ends on Here's your plan.
 */
export async function setUpEverything(page: Page, today = '2026-11-04') {
  await startSetup(page, today);
  await fillEveryScreen(page);
}

/** setUpEverything's answers, from the first screen to Here's your plan. */
export async function fillEveryScreen(page: Page) {
  await expectStep(page, 1, 'Your account');
  await fillAccount(lastForm(page, 'account'), {
    name: 'Current account',
    balance: '800',
    warning: '20',
  });
  await next(page);
  const pay = lastForm(page, 'income');
  await box(pay, 'Next payday').fill('2026-11-06');
  await box(pay, 'How much comes in, after tax').fill('450');
  await radio(page, 'No').check();
  await next(page);
  await expectStep(page, 3, 'Home and bills');
  await box(rentForm(page), 'Amount').fill('550');
  await fillWhen(rentForm(page), { date: '2026-12-01' });
  const phone = billOn(page, 'phone');
  await phone.getByRole('checkbox', { name: 'Phone', exact: true }).check();
  await box(phone, 'Amount').fill('18');
  await fillWhen(phone, { date: '2026-11-20' });
  await next(page);
  await expectStep(page, 4, 'Debts');
  await page.getByRole('button', { name: 'Add a debt' }).click();
  const debt = lastForm(page, 'debt');
  await box(debt, 'Name').fill('Sofa finance');
  await box(debt, 'What you owe now').fill('300');
  await box(debt, 'Each payment').fill('25');
  await fillWhen(debt, { date: '2026-11-23', payments: '12' });
  await next(page);
  await expectStep(page, 5, 'Spending money');
  await box(page.getByTestId('budget-form').first(), 'Amount').fill('200');
  await next(page);
  await expectStep(page, 6, "Here's your plan");
  await addGoalOnPlan(page, { name: 'Holiday', target: '600' }, async (sheet) => {
    await box(sheet, 'Name of the savings account').fill('Savings');
  });
}

/** What each screen lists as added, from setUpEverything. */
export const ADDED_ON: Readonly<Record<number, readonly string[]>> = {
  1: ['Current account'],
  2: ['Pay'],
  3: ['Rent', 'Phone'],
  4: ['Sofa finance'],
  5: ['Food'],
  6: ['Holiday'],
};

export async function expectAddedOn(page: Page, screen: number) {
  const names = page.getByTestId('added').locator('li span:first-child');
  for (const name of ADDED_ON[screen] ?? []) {
    await expect(names.filter({ hasText: new RegExp(`^${name}$`) })).toHaveCount(1);
  }
}

/** The old 8 steps' number for each kind of thing setup adds (step 2e). */
const OLD_STEP_OF_KIND: Readonly<Record<string, number>> = {
  account: 1,
  income: 2,
  'pay-details': 2,
  rent: 3,
  bill: 4,
  debt: 5,
  budget: 6,
  goal: 7,
};

/** Items as the old 8 steps saved them, each with its old step's number. */
export function asOldItems<T extends { readonly kind: string }>(items: readonly T[]) {
  return items.map((item) => ({ ...item, step: OLD_STEP_OF_KIND[item.kind] }));
}

/** Each old step, and the new screen it opens: null for the welcome (D356). */
export const OLD_STEP_OPENS = [
  [0, null],
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 3],
  [5, 4],
  [6, 5],
  [7, 6],
  [8, 6],
] as const;
