// Shared steps for the setup tests (brief 4.1, step 2e): starting from the
// welcome on a phone with nothing on it, filling in each step's boxes, and
// reading back the plan setup saved on the phone.

import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
import type { PlanRecords } from '@prepenny/engine';
import { recordsOf, type StoredRecord } from '../data/db.ts';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { AXE_TAGS } from './coming-up.ts';
import { settingScript } from './fixtures.ts';
import { PRIYA_TODAY } from './setup-answers.ts';

export async function noAxeProblems(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
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

export async function expectStep(page: Page, step: number, title: string) {
  await expect(page.getByText(`Step ${step} of 8`, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  // The title takes focus, so a screen reader starts there.
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
}

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

/** Step 1 to step 8 with Priya's answers (brief 8.5, D137), checking every step with axe. */
export async function setUpPriya(page: Page, at: (step: number) => Promise<void> = async () => {}) {
  await openFresh(page, PRIYA_TODAY);
  await at(0);
  await page.getByRole('button', { name: 'Make my plan' }).click();
  await expectStep(page, 1, 'Your account');
  // Step 1 can't be skipped (D163).
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

  await expectStep(page, 3, 'Rent or mortgage');
  await noAxeProblems(page);
  await box(page, 'Amount').fill('850');
  await fillWhen(page.getByRole('form'), { date: '2026-11-01' });
  await expect(radio(page, 'The 1st of the month')).toBeChecked();
  await next(page);

  await expectStep(page, 4, 'Bills');
  await noAxeProblems(page);
  const bill = (key: string) => page.locator(`[data-bill="${key}"]`);
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
  await next(page);

  await expectStep(page, 5, 'Debts');
  await noAxeProblems(page);
  await page.getByRole('button', { name: 'I have no debts' }).click();

  await expectStep(page, 6, 'Spending money');
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
  await next(page);

  await expectStep(page, 7, 'Savings');
  await noAxeProblems(page);
  const goal = lastForm(page, 'goal');
  await box(goal, 'What are you saving for?').fill('Holiday');
  await box(goal, 'Target').fill('1500');
  await box(goal, 'By, if you have a date').fill('2027-07-30');
  await expect(
    radio(goal.getByRole('group', { name: 'Kept in' }), 'Holiday savings'),
  ).toBeChecked();
  await box(goal, 'Already saved towards it').fill('300');
  await box(goal, 'Move into it').fill('150');
  await expect(radio(goal, 'Each payday, from Fri 30 Oct')).toBeChecked();
  await expect(radio(goal.getByRole('group', { name: 'From' }), 'Current account')).toBeChecked();
  await noAxeProblems(page);
  await next(page);

  await expectStep(page, 8, "Here's your plan");
  await expect(page.getByRole('button', { name: 'Skip this step' })).toHaveCount(0);
  await expect(page.getByTestId('setup-summary')).toBeVisible();
  await noAxeProblems(page);
  await at(8);
}
