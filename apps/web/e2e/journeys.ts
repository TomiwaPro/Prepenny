// Shared steps for the six people's journeys (brief Part 10, step 2h): each
// person sets up through the screens, then updates their balance, adds a
// payment, changes "this and all later ones", moves a payment to the next
// payday, records "I spent" and practises in What if. After setup and after
// every task, the plan saved on the phone is read back and every day's
// balance is checked against the person's fixture, the engine-tested plan,
// with the same change made by plain arithmetic: a new payment lowers each
// day from its date by its amount, a move raises the days it's no longer in,
// and so on. So the screens are checked against the fixture, not against
// themselves.

import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
import {
  type EditCommand,
  type PlanRecords,
  parsePounds,
  type WhatIfInput,
  workOutPlan,
} from '@prepenny/engine';
import { build, fixtureRecords } from '../../../packages/engine/test/fixtures/from-empty.ts';
import { calendarFor as holidaysFor } from '../../../packages/engine/test/fixtures/holidays.ts';
import { TEST_SETTING_KEY } from '../lib/test-setting.ts';
import { AXE_TAGS, openPeriod, period, rowIn } from './coming-up.ts';
import { settingScript } from './fixtures.ts';
import { box, ownRecords, radio } from './setup.ts';

export const NB = ' ';
/** A date as the screens write it, with its spaces kept together. */
export const day = (text: string) => text.replaceAll(' ', NB);
export const pounds = (text: string) => parsePounds(text);

export async function noAxeProblems(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
}

export async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(wide).toBeLessThanOrEqual(0);
}

export const undoBar = (page: Page) => page.getByTestId('undo-bar');
export const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });

/** Opens PrePenny on a phone with nothing on it, with the test-only today (D201), at the welcome. */
export async function openNewPhone(page: Page, today: string) {
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, { today }] as const);
  await page.goto('/app/');
  await expect(page).toHaveURL(/\/setup\/$/);
  await expect(page.getByText('Plan every penny before payday.')).toBeVisible();
}

/** Each account's end-of-day balance, from today to `to`. */
export type Days = Record<string, Record<string, number>>;

export function daysOf(records: PlanRecords, today: string, to: string): Days {
  const plan = workOutPlan({
    ...records,
    mainPayFamilyId: records.settings?.mainPayFamilyId ?? null,
    holidays: holidaysFor(records.settings?.nation ?? 'england-and-wales'),
    today,
    to,
  });
  const days: Days = {};
  for (const account of plan.accounts) {
    days[account.account.name ?? account.account.id] = Object.fromEntries(
      account.days.map((one) => [one.date, one.balance]),
    );
  }
  return days;
}

/** A fixture plan's records, ready to work out. */
export const recordsOfFixture = (plan: WhatIfInput) => fixtureRecords(plan);

/** Makes engine commands on records, as the phone would, for an expected plan built from a fixture. */
export function withCommands(
  records: PlanRecords,
  today: string,
  commands: readonly EditCommand[],
): PlanRecords {
  return build(
    commands.map((command) => ({ today, command })),
    records,
  ).records;
}

/** Every day's balance saved on the phone, worked out by the engine. */
export async function phoneDays(page: Page, today: string, to: string): Promise<Days> {
  // A change is saved straight after it's made; wait for the database to have it.
  await page.waitForTimeout(150);
  return daysOf(await ownRecords(page), today, to);
}

/** The days, with `amount` pence added to one account on every day from `from` (and before `until`). */
export function shift(
  days: Days,
  account: string,
  from: string,
  amount: number,
  until: string | null = null,
): Days {
  const one = days[account];
  if (one === undefined) throw new Error(`No account called ${account}.`);
  return {
    ...days,
    [account]: Object.fromEntries(
      Object.entries(one).map(([date, balance]) => [
        date,
        date >= from && (until === null || date < until) ? balance + amount : balance,
      ]),
    ),
  };
}

/** The first few days that differ, as "Current account 2026-11-09: 29432, not 29232". */
function differences(actual: Days, expected: Days): string[] {
  const found: string[] = [];
  for (const account of new Set([...Object.keys(actual), ...Object.keys(expected)])) {
    const got = actual[account] ?? {};
    const want = expected[account] ?? {};
    for (const date of [...new Set([...Object.keys(got), ...Object.keys(want)])].sort()) {
      if (got[date] !== want[date]) {
        found.push(`${account} ${date}: ${got[date]}, not ${want[date]}`);
        if (found.length >= 5) return found;
      }
    }
  }
  return found;
}

/** Polls until the phone's plan has exactly these balances, so a slow save never fails it. */
export async function expectDays(page: Page, expected: Days, today: string, to: string) {
  await expect
    .poll(async () => differences(await phoneDays(page, today, to), expected), {
      timeout: 10_000,
    })
    .toEqual([]);
}

// The tasks, as a person does them.

export async function openHome(page: Page) {
  await nav(page, 'Home').click();
  await expect(page.getByTestId('balance')).toBeVisible();
}

export async function openAction(page: Page, name: string, title = name): Promise<Locator> {
  await page.getByRole('button', { name, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: title });
  await expect(sheet).toBeVisible();
  return sheet;
}

/**
 * Update balance from Home (D197): the account, what the bank shows, the
 * plan's expected figure and the difference, then Tick all and Done.
 */
export async function updateBalance(
  page: Page,
  answers: {
    readonly account: string | null;
    readonly balance: string;
    readonly expected: string;
    readonly difference: string;
    /** How many payments from today or earlier there are to tick. */
    readonly toTick: number;
  },
) {
  await openHome(page);
  const sheet = await openAction(page, 'Update balance');
  await expect(sheet.getByText('Step 1 of 3')).toBeVisible();
  if (answers.account !== null) await radio(sheet, answers.account).check();
  const overdrawn = answers.balance.startsWith('-');
  await sheet.getByLabel('Type what your bank shows now').fill(answers.balance.replace(/^-/, ''));
  if (overdrawn) {
    await sheet.getByRole('checkbox', { name: "It's overdrawn, below £0.00" }).check();
  }
  await sheet.getByRole('button', { name: 'Next' }).click();
  const compare = sheet.getByTestId('balance-compare');
  await expect(compare).toContainText(`The plan expected ${answers.expected} by the end of today.`);
  await expect(compare).toContainText(answers.difference);
  await noAxeProblems(page);
  await sheet.getByRole('button', { name: 'Next' }).click();
  await expect(sheet.getByText('Step 3 of 3')).toBeVisible();
  const boxes = sheet.getByTestId('to-tick').getByRole('checkbox');
  await expect(boxes).toHaveCount(answers.toTick);
  if (answers.toTick > 0) await sheet.getByRole('button', { name: 'Tick all' }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet.getByRole('heading', { name: 'Balance updated' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
  await expect(undoBar(page)).toContainText('balance updated');
}

export interface PaymentAnswers {
  readonly kind?: 'Going out' | 'Coming in' | 'Between accounts';
  readonly name: string;
  readonly amount: string;
  readonly date: string;
  /** The account it leaves or arrives in, when there's more than one. */
  readonly account?: string;
  readonly to?: string;
  readonly often?:
    | 'Once'
    | 'Every week, or every few weeks'
    | 'Every month, or every few months'
    | 'On chosen dates';
  readonly weeksApart?: string;
  readonly laterDates?: readonly string[];
  readonly payments?: string;
  readonly lastAmount?: string;
  readonly weekend?:
    | 'Keep the date'
    | 'Move to the working day before'
    | 'Move to the working day after';
  readonly type?: string;
  readonly link?: string;
  readonly estimate?: boolean;
}

/** Add a payment from Home (D199), filled in as a person would, then saved. */
export async function addPayment(page: Page, answers: PaymentAnswers) {
  await openHome(page);
  const sheet = await openAction(page, 'Add a payment');
  if (answers.kind !== undefined) await radio(sheet, answers.kind).check();
  await box(sheet, 'Name').fill(answers.name);
  await box(sheet, 'Amount').fill(answers.amount);
  if (answers.account !== undefined) {
    const group = sheet.getByRole('group', {
      name: answers.kind === 'Coming in' ? 'Into' : 'From',
    });
    await radio(group, answers.account).check();
  }
  if (answers.to !== undefined) {
    await radio(sheet.getByRole('group', { name: 'To' }), answers.to).check();
  }
  await box(sheet, 'Next payment').fill(answers.date);
  if (answers.often !== undefined) await radio(sheet, answers.often).check();
  if (answers.weeksApart !== undefined) {
    await box(sheet, 'How many weeks apart').fill(answers.weeksApart);
  }
  for (const [index, date] of (answers.laterDates ?? []).entries()) {
    await sheet.getByRole('button', { name: 'Add a date' }).click();
    await box(sheet, `Date ${index + 2}`).fill(date);
  }
  if (answers.payments !== undefined) {
    await radio(sheet, 'After a number of payments').check();
    await box(sheet, 'How many payments').fill(answers.payments);
  }
  if (answers.lastAmount !== undefined) {
    await sheet.getByRole('checkbox', { name: 'The last payment is a different amount' }).check();
    await box(sheet, 'Last amount').fill(answers.lastAmount);
  }
  if (answers.weekend !== undefined) {
    await radio(
      sheet.getByRole('group', { name: 'On a weekend or bank holiday' }),
      answers.weekend,
    ).check();
  }
  if (answers.type !== undefined)
    await sheet.getByLabel('Type', { exact: true }).selectOption({ label: answers.type });
  if (answers.link !== undefined) {
    await sheet
      .getByLabel('Paying off a debt, or saving towards a goal')
      .selectOption({ label: answers.link });
  }
  if (answers.estimate === true) {
    await sheet.getByRole('checkbox', { name: 'This is an estimate' }).check();
  }
  await sheet.getByRole('button', { name: 'Add payment' }).click();
  await expect(sheet).toBeHidden();
  await expect(undoBar(page)).toContainText(`${answers.name} added.`);
}

/** Goes to Coming up, on the account given when there's more than one, and opens the paydays given. */
export async function comingUp(page: Page, account: string | null, ...paydays: readonly string[]) {
  await nav(page, 'Coming up').click();
  await expect(page.getByTestId('period').first()).toBeVisible();
  if (account !== null) {
    const heading = page.getByTestId('plan-account').getByRole('heading');
    if ((await heading.textContent()) !== account) {
      await page.getByRole('button', { name: 'Switch account' }).click();
      const sheet = page.getByRole('dialog', { name: 'Switch account' });
      await sheet.getByRole('button', { name: new RegExp(`^${account}`) }).click();
      await expect(sheet).toBeHidden();
      await expect(heading).toHaveText(account);
    }
  }
  for (const start of paydays) await openPeriod(page, start);
}

/** Opens a payment's edit sheet from Coming up. */
export async function openRow(page: Page, start: string, name: string): Promise<Locator> {
  await openPeriod(page, start);
  await rowIn(page, start, name).first().click();
  const sheet = page.getByRole('dialog', { name });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** A new amount for this payment and every later one (brief 5.4). */
export async function changeThisAndLater(page: Page, start: string, name: string, amount: string) {
  const sheet = await openRow(page, start, name);
  await sheet.getByLabel('Amount').fill(amount);
  await radio(sheet, 'This and all later ones').check();
  const pattern = sheet.getByRole('group', { name: /pattern/i });
  if ((await pattern.count()) > 0) await radio(sheet, 'Every payday from now').check();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(undoBar(page)).toContainText(`${name} changed for this and all later ones.`);
}

/** Move to next payday from a payment's sheet, which says where first (D188). */
export async function moveToNextPayday(page: Page, start: string, name: string, to: string) {
  const sheet = await openRow(page, start, name);
  await expect(sheet.getByText(`Moves it to ${day(to)}`, { exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Move to next payday' }).click();
  await expect(sheet).toBeHidden();
  await expect(undoBar(page)).toContainText(`${name} moved to ${day(to)}.`);
}

/** I spent from Home (D198), checking spent and left before and with the spend. */
export async function iSpent(
  page: Page,
  answers: {
    readonly budget: string | null;
    readonly amount: string;
    readonly before: readonly [spent: string, left: string];
    readonly withIt: string;
  },
) {
  await openHome(page);
  const sheet = await openAction(page, 'I spent');
  if (answers.budget !== null) await radio(sheet, answers.budget).check();
  await expect(sheet.getByTestId('budget-period').getByRole('definition')).toHaveText([
    ...answers.before,
  ]);
  await sheet.getByLabel('How much').fill(answers.amount);
  await expect(sheet.getByText(answers.withIt)).toBeVisible();
  await noAxeProblems(page);
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(undoBar(page)).toContainText(` spent on `);
}

/** Opens What if from More. */
export async function openWhatIf(page: Page) {
  await nav(page, 'More').click();
  await page.getByRole('link', { name: /^What if/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'What if' })).toBeVisible();
  await expect(page.getByTestId('side-by-side')).toBeVisible();
}

/** The lowest point side by side for one account in What if. */
export const sides = (page: Page, account: string) =>
  page.locator(`[data-testid="what-if-account"][data-account="${account}"]`);

/** Throws the practice changes away, answering the question first (D264). */
export async function throwAway(page: Page, count: number) {
  await page.getByRole('button', { name: 'Throw them away' }).click();
  const sheet = page.getByRole('dialog', { name: 'Throw them away' });
  await expect(sheet).toContainText(
    count === 1 ? 'Throw away 1 practice change?' : `Throw away ${count} practice changes?`,
  );
  await sheet.getByRole('button', { name: 'Throw them away' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('what-if-note')).toHaveText(
    'Practice changes thrown away. Your real plan is exactly as it was.',
  );
}

export { period, rowIn };

/** The lowest end-of-day balance of one account from today on, and its first date (D85). */
export function lowestOf(days: Days, account: string): { balance: number; date: string } {
  const one = Object.entries(days[account] ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  let lowest = one[0];
  for (const entry of one) if (lowest === undefined || entry[1] < lowest[1]) lowest = entry;
  if (lowest === undefined) throw new Error(`No days for ${account}.`);
  return { date: lowest[0], balance: lowest[1] };
}

/** The first day under the warning level, or null (D10). */
export function firstUnder(days: Days, account: string, warning: number): string | null {
  const one = Object.entries(days[account] ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  return one.find(([, balance]) => balance < warning)?.[0] ?? null;
}

/** Shifts made one after another, each as `shift` takes them. */
export type Shift = readonly [account: string, from: string, amount: number, until?: string];

export function withShifts(days: Days, shifts: readonly Shift[]): Days {
  return shifts.reduce(
    (now, [account, from, amount, until]) => shift(now, account, from, amount, until ?? null),
    days,
  );
}

/** A balance update made by the engine, as Update balance makes it (D33, D87). */
export function balanceUpdate(
  accountId: string,
  balance: number,
  today: string,
  ticks: readonly { readonly seriesId: string; readonly originalDate: string }[] = [],
): EditCommand {
  const at = `${today}T23:00:00Z`;
  return {
    kind: 'update-balance',
    update: { id: `${accountId}-updated`, accountId, balance, checkedOn: today, checkedAt: at },
    ticks: ticks.map((one) => ({ ...one, tickedAt: at })),
  };
}

/** A new amount for this payment and every later one, made by the engine (brief 5.4). */
export function thisAndLater(seriesId: string, originalDate: string, amount: number): EditCommand {
  return {
    kind: 'this-and-later',
    seriesId,
    originalDate,
    edits: { amount },
    newSeriesId: `${seriesId}-from-${originalDate}`,
  };
}
