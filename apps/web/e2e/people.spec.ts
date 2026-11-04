// The six people's journeys (brief Part 2 and Part 10, step 2h), at 320px
// and 360px wide, in light and dark, checked by axe: each person sets up
// PrePenny through the screens on a phone with nothing on it, then updates
// their balance, adds a payment, changes "this and all later ones", moves a
// payment to the next payday, records "I spent" and practises in What if.
// Jess and Tom are one plan with their three accounts for now; sharing comes
// in Phase 3.
//
// After setup, and after every task, the plan saved on the phone is read
// back and every day's balance is checked against the person's fixture, the
// engine-tested plan in packages/engine/test/fixtures, with the same change
// made by plain arithmetic (journeys.ts). The screens are also checked for
// what brief Part 2 says each person needs most.

import { expect, type Page, test } from '@playwright/test';
import { build, kofiSteps } from '../../../packages/engine/test/fixtures/from-empty.ts';
import {
  aliPlan,
  deePlan,
  jessAndTomPlan,
  priyaPlan,
} from '../../../packages/engine/test/fixtures/people.ts';
import { samPlan } from '../../../packages/engine/test/fixtures/sam.ts';
import { amountForTyping } from '../lib/amount.ts';
import { formatDay } from '../lib/dates.ts';
import { formatMoney } from '../lib/money.ts';
import { MINUS, paydayButton } from './coming-up.ts';
import {
  addPayment,
  balanceUpdate,
  changeThisAndLater,
  comingUp,
  type Days,
  day,
  daysOf,
  expectDays,
  firstUnder,
  iSpent,
  lowestOf,
  moveToNextPayday,
  nav,
  noAxeProblems,
  noSidewaysScroll,
  openAction,
  openHome,
  openNewPhone,
  openRow,
  openWhatIf,
  period,
  recordsOfFixture,
  rowIn,
  type Shift,
  shift,
  sides,
  thisAndLater,
  throwAway,
  undoBar,
  updateBalance,
  withCommands,
  withShifts,
} from './journeys.ts';
import {
  box,
  expectStep,
  fillAccount,
  fillWhen,
  lastForm,
  next,
  radio,
  setUpKofi,
  setUpPriya,
  skip,
} from './setup.ts';
import {
  KOFI_ALREADY_SPENT,
  KOFI_TODAY,
  PRIYA_ALREADY_SPENT,
  PRIYA_TODAY,
  withSetupRules,
} from './setup-answers.ts';

/** Every Friday from `from` to `to`, for a weekly budget's weeks (D29). */
function weekdaysFrom(from: string, to: string): string[] {
  const days: string[] = [];
  for (
    let at = Date.parse(`${from}T12:00:00Z`);
    at <= Date.parse(`${to}T12:00:00Z`);
    at += 7 * 86_400_000
  ) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
}

/** Fills in one debt on setup's step 5. */
async function addDebt(
  page: Page,
  debt: {
    readonly name: string;
    readonly kind: string;
    readonly owed: string;
    readonly currency?: string;
    readonly rate?: string;
    readonly started?: string;
    readonly payment: string;
    readonly date: string;
    readonly often: string;
    readonly weeksApart?: string;
    readonly laterDates?: readonly string[];
    readonly payments?: string;
    readonly estimate?: boolean;
  },
) {
  await page.getByRole('button', { name: 'Add a debt' }).click();
  const form = lastForm(page, 'debt');
  await box(form, 'Name').fill(debt.name);
  await radio(form, debt.kind).check();
  if (debt.currency !== undefined) await radio(form, debt.currency).check();
  if (debt.rate !== undefined) await box(form, 'How many EUR to £1').fill(debt.rate);
  await box(form, 'What you owe now').fill(debt.owed);
  if (debt.started !== undefined)
    await box(form, 'What it started at, if you know').fill(debt.started);
  await box(form, 'Each payment').fill(debt.payment);
  await fillWhen(form, {
    date: debt.date,
    often: debt.often,
    ...(debt.weeksApart === undefined ? {} : { weeksApart: debt.weeksApart }),
    ...(debt.payments === undefined ? {} : { payments: debt.payments }),
  });
  for (const [index, date] of (debt.laterDates ?? []).entries()) {
    await form.getByRole('button', { name: 'Add a date' }).click();
    await box(form, `Date ${index + 2}`).fill(date);
  }
  if (debt.estimate === true) {
    await form.getByRole('checkbox', { name: 'This is an estimate' }).check();
  }
}

/** A new amount for just this one, keeping "This is an estimate" as it was. */
async function justThisOne(
  page: Page,
  start: string,
  name: string,
  amount: string,
  estimate: boolean,
) {
  const sheet = await openRow(page, start, name);
  await sheet.getByLabel('Amount').fill(amount);
  const box = sheet.getByLabel('This is an estimate');
  if (estimate) await box.check();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(undoBar(page)).toContainText(`${name} changed for just this one.`);
}

// Sam, shift worker (brief Part 2, 8.1 to 8.3, D15): today is Sun 25 Oct 2026,
// and his plan is brief 8.2, which keeps every date (no weekend or bank
// holiday moves). Setup moves rent and bills to the next working day (D231),
// so his rent and his food bill are added with Add a payment, which lets him
// keep the date, as the brief has it.
const SAM_TODAY = '2026-10-25';
const SAM_TO = '2027-02-28';

async function setUpSam(page: Page) {
  await openNewPhone(page, SAM_TODAY);
  await page.getByRole('button', { name: 'Make my plan' }).click();
  await expectStep(page, 1, 'Your account');
  await fillAccount(lastForm(page, 'account'), {
    name: 'Current account',
    balance: '267.54',
    warning: '20',
  });
  await page.getByRole('button', { name: 'Add another account' }).click();
  await fillAccount(lastForm(page, 'account'), {
    name: 'Savings',
    kind: 'Savings',
    balance: '500',
    warning: '0',
  });
  await noAxeProblems(page);
  await next(page);

  await expectStep(page, 2, "How you're paid");
  const pay = lastForm(page, 'income');
  await box(pay, 'Name').fill('Pay');
  await radio(pay, 'Every week').check();
  await box(pay, 'Next payday').fill('2026-10-30');
  await pay.getByRole('checkbox', { name: 'My pay changes in a pattern' }).check();
  while ((await pay.getByLabel(/^Payday \d/).count()) < 4) {
    await pay.getByRole('button', { name: 'Add a payday' }).click();
  }
  // Sam's 4-week rota (brief 8.2), each box labelled with its payday.
  for (const [index, amount] of ['452.17', '618.46', '469.06', '592.17'].entries()) {
    await pay.getByLabel(new RegExp(`^Payday ${index + 1}`)).fill(amount);
  }
  await expect(pay.getByLabel(`Payday 2, ${day('Fri 6 Nov')}`)).toHaveValue('618.46');
  await radio(
    pay.getByRole('group', { name: 'On a weekend or bank holiday' }),
    'Keep the date',
  ).check();
  await pay.getByRole('checkbox', { name: 'This is an estimate' }).check();
  // He does overtime, paid one week behind his shifts (brief 8.6, D131).
  await radio(
    page.getByRole('group', { name: 'Do you ever work extra hours or miss shifts?' }),
    'Yes',
  ).check();
  await box(page, 'Overtime rate an hour').fill('19.07');
  await box(page, `${day('Fri 30 Oct')} pays for work up to`).fill('2026-10-25');
  await radio(page, 'Do this later').check();
  await noAxeProblems(page);
  await next(page);

  await expectStep(page, 3, 'Rent or mortgage');
  await page.getByRole('button', { name: "I don't pay rent" }).click();
  await expectStep(page, 4, 'Bills');
  await skip(page);

  await expectStep(page, 5, 'Debts');
  // Brief 8.1's debts with the D15 names, each with its first payments (brief 8.2).
  await addDebt(page, {
    name: 'Pay-later card',
    kind: 'Pay-later plan',
    owed: '466.07',
    payment: '466.07',
    date: '2026-10-29',
    often: 'Once',
  });
  await addDebt(page, {
    name: 'Pay in 3',
    kind: 'Pay-later plan',
    owed: '183.89',
    payment: '41.30',
    date: '2026-11-07',
    often: 'Every week, or every few weeks',
    weeksApart: '2',
    payments: '3',
  });
  await addDebt(page, {
    name: 'Laptop loan',
    kind: 'Loan',
    owed: '484',
    payment: '150',
    date: '2026-11-10',
    often: 'Once',
  });
  await addDebt(page, {
    name: 'Sofa finance',
    kind: 'Pay-later plan',
    owed: '453.77',
    payment: '77',
    date: '2026-11-10',
    often: 'Once',
  });
  await addDebt(page, {
    name: 'Credit card',
    kind: 'Credit card',
    owed: '420.99',
    payment: '25',
    date: '2026-11-15',
    often: 'Every month, or every few months',
    estimate: true,
  });
  await addDebt(page, {
    name: 'Family loan',
    kind: 'Money owed to a person',
    currency: 'Euros (€)',
    rate: '1.1612',
    owed: '1400.57',
    started: '2396.93',
    payment: '125',
    date: '2026-10-26',
    often: 'On chosen dates',
    laterDates: ['2026-11-06'],
  });
  await noAxeProblems(page);
  await next(page);

  await expectStep(page, 6, 'Spending money');
  await skip(page);
  await expectStep(page, 7, 'Savings');
  await skip(page);
  await expectStep(page, 8, "Here's your plan");
  await expect(page.getByTestId('setup-first-debt')).toContainText('Pay-later card');
  await noAxeProblems(page);
  await page.getByRole('button', { name: 'Go to my plan' }).click();
  await expect(page.getByTestId('balance')).toHaveText('£267.54');

  // The rest of brief 8.2, with Add a payment, in the order of its table.
  await addPayment(page, {
    name: 'Spending money until payday',
    amount: '30',
    date: SAM_TODAY,
    often: 'Once',
    type: 'Spending money',
  });
  await addPayment(page, {
    name: 'Driving lesson',
    amount: '100',
    date: '2026-10-26',
    often: 'On chosen dates',
    laterDates: ['2026-11-17', '2026-11-23', '2026-12-15', '2027-01-12'],
  });
  await addPayment(page, {
    kind: 'Between accounts',
    name: 'From savings',
    amount: '500',
    account: 'Savings',
    to: 'Current account',
    date: '2026-10-28',
    often: 'Once',
  });
  await addPayment(page, {
    name: 'Spending money',
    amount: '54',
    date: '2026-10-30',
    often: 'Every week, or every few weeks',
    weekend: 'Keep the date',
    type: 'Spending money',
  });
  await addPayment(page, {
    name: 'Rent',
    amount: '550',
    date: '2026-11-01',
    often: 'Every month, or every few months',
    weekend: 'Keep the date',
    type: 'Rent or mortgage',
  });
  await addPayment(page, {
    name: 'Pay in 3, second order',
    amount: '20',
    date: '2026-11-08',
    often: 'Every week, or every few weeks',
    weeksApart: '2',
    payments: '3',
    lastAmount: '19.99',
    weekend: 'Keep the date',
    type: 'Debt',
    link: 'Debt: Pay in 3',
  });
  await addPayment(page, {
    kind: 'Between accounts',
    name: 'To savings',
    amount: '150',
    account: 'Current account',
    to: 'Savings',
    date: '2026-11-13',
    often: 'Once',
  });
  await addPayment(page, {
    name: 'Family loan',
    amount: '250',
    date: '2026-11-20',
    often: 'Every week, or every few weeks',
    weeksApart: '2',
    payments: '4',
    lastAmount: '206.15',
    weekend: 'Keep the date',
    type: 'Debt',
    link: 'Debt: Family loan',
  });
  await addPayment(page, {
    name: 'Sofa finance',
    amount: '37.88',
    date: '2026-11-23',
    often: 'Every month, or every few months',
    payments: '10',
    lastAmount: '35.85',
    weekend: 'Keep the date',
    type: 'Debt',
    link: 'Debt: Sofa finance',
  });
  await addPayment(page, {
    name: 'Pay-later card (food)',
    amount: '200',
    date: '2026-11-29',
    often: 'Every month, or every few months',
    weekend: 'Keep the date',
    type: 'Bills',
  });
  await addPayment(page, {
    kind: 'Between accounts',
    name: 'From savings',
    amount: '150',
    account: 'Savings',
    to: 'Current account',
    date: '2026-11-30',
    often: 'Once',
  });
  await addPayment(page, {
    name: 'Laptop loan',
    amount: '150',
    date: '2026-12-20',
    often: 'Every month, or every few months',
    payments: '3',
    lastAmount: '34',
    weekend: 'Keep the date',
    type: 'Debt',
    link: 'Debt: Laptop loan',
  });
  // The first pay (£603.06, with overtime), spending money (£45) and rent (£600) differ (brief 8.2).
  await comingUp(page, 'Current account', '2026-10-30');
  await justThisOne(page, '2026-10-30', 'Pay', '603.06', true);
  await justThisOne(page, '2026-10-30', 'Spending money', '45', false);
  await justThisOne(page, '2026-10-30', 'Rent', '600', false);
}

/** "£1,187.73" and "Thu 29 Oct", as the screens write them. */
const money = (pence: number) => formatMoney(pence);
const words = (date: string, today: string) => formatDay(date, today);

/** The lowest point on Home, as the engine works it out from the expected balances (D178). */
async function expectHomeLowest(page: Page, days: Days, account: string, today: string) {
  await openHome(page);
  const lowest = lowestOf(days, account);
  const card = page.getByTestId('lowest-point');
  await expect(card.getByText(money(lowest.balance), { exact: true })).toBeVisible();
  await expect(card).toContainText(words(lowest.date, today));
}

/** A practice change in What if: skip one payment in the practice plan's list. */
async function practiceSkip(page: Page, start: string, name: string) {
  const where = period(page, start);
  if ((await where.getAttribute('data-open')) !== 'true') {
    await where.locator(':scope > h3 > button').click();
  }
  await where
    .getByRole('button', { name: new RegExp(`^${name} (Mon|Tue|Wed|Thu|Fri|Sat|Sun)`) })
    .first()
    .click();
  const sheet = page.getByRole('dialog', { name });
  await sheet.getByRole('button', { name: 'Skip this one' }).click();
  await expect(sheet).toBeHidden();
}

/** The real and practice lowest points side by side for one account (D253). */
async function expectSides(page: Page, account: string, real: Days, practice: Days, today: string) {
  const one = sides(page, account);
  const realLowest = lowestOf(real, account);
  const practiceLowest = lowestOf(practice, account);
  await expect(one.getByTestId('real')).toContainText(money(realLowest.balance));
  await expect(one.getByTestId('real')).toContainText(words(realLowest.date, today));
  await expect(one.getByTestId('practice')).toContainText(money(practiceLowest.balance));
  await expect(one.getByTestId('practice')).toContainText(words(practiceLowest.date, today));
}

// Priya, office worker (brief Part 2, 8.5, D137): monthly salary on the last
// working day, yearly and quarterly bills, a holiday goal. Today is Sun 25
// Oct 2026. Her setup answers are step 2e's (setup.ts).
const PRIYA_TO = '2027-10-25';

async function priyaJourney(page: Page) {
  await setUpPriya(page);
  await page.getByRole('button', { name: 'Go to my plan' }).click();
  await expect(page.getByTestId('balance')).toHaveText('£1,240.00');
  let records = withSetupRules(recordsOfFixture(priyaPlan()), PRIYA_TODAY, PRIYA_ALREADY_SPENT);
  const shifts: Shift[] = [];
  const expected = () => withShifts(daysOf(records, PRIYA_TODAY, PRIYA_TO), shifts);
  await expectDays(page, expected(), PRIYA_TODAY, PRIYA_TO);

  // What she needs most (brief Part 2): never surprised by a yearly bill, a month-by-month
  // view, and her savings goal growing.
  await expectHomeLowest(page, expected(), 'Current account', PRIYA_TODAY);
  await noAxeProblems(page);
  await comingUp(page, 'Current account');
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const view = page.getByRole('dialog', { name: 'View' });
  await view.getByRole('radio', { name: 'By calendar month' }).check();
  await view.getByRole('button', { name: 'Done' }).click();
  await expect(period(page, '2026-11-01').locator(':scope > h3')).toContainText('November');
  for (let month = 0; month < 3; month += 1) {
    await page.getByRole('button', { name: 'Show another month' }).click();
  }
  await expect(period(page, '2027-01-01').locator(':scope > h3')).toContainText('January 2027');
  await period(page, '2027-01-01').locator(':scope > h3 > button').click();
  await expect(rowIn(page, '2027-01-01', 'Car insurance')).toContainText(`${MINUS}£612.40`);
  await noAxeProblems(page);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await view.getByRole('radio', { name: 'By payday' }).check();
  await view.getByRole('button', { name: 'Done' }).click();
  await nav(page, 'More').click();
  await page.getByRole('link', { name: /^Savings goals/ }).click();
  await expect(page.locator('[data-goal="Holiday"]')).toContainText(
    day('Reached on Fri 28 May 2027'),
  );

  // Update balance: her bank shows £10.00 less than the plan expected.
  const end = expected()['Current account']?.[PRIYA_TODAY] ?? 0;
  await updateBalance(page, {
    account: 'Current account',
    balance: amountForTyping(end - 1000),
    expected: money(end),
    difference: "That's £10.00 less.",
    toTick: 0,
  });
  records = withCommands(records, PRIYA_TODAY, [balanceUpdate('current', end - 1000, PRIYA_TODAY)]);
  await expectDays(page, expected(), PRIYA_TODAY, PRIYA_TO);

  // Add a payment: a dentist, £45.00 once on Thu 12 Nov.
  await addPayment(page, { name: 'Dentist', amount: '45', date: '2026-11-12', often: 'Once' });
  shifts.push(['Current account', '2026-11-12', -4500]);
  await expectDays(page, expected(), PRIYA_TODAY, PRIYA_TO);

  // This and all later ones: her phone, £21.00 from Fri 20 Nov.
  await comingUp(page, 'Current account');
  await changeThisAndLater(page, '2026-10-30', 'Phone', '21');
  records = withCommands(records, PRIYA_TODAY, [thisAndLater('phone', '2026-11-20', 2100)]);
  await expectDays(page, expected(), PRIYA_TODAY, PRIYA_TO);

  // Move to next payday: streaming on Thu 12 Nov goes to her payday, Mon 30 Nov.
  await moveToNextPayday(page, '2026-10-30', 'Streaming', 'Mon 30 Nov');
  shifts.push(['Current account', '2026-11-12', 1099, '2026-11-30']);
  await expectDays(page, expected(), PRIYA_TODAY, PRIYA_TO);

  // I spent: £10.00 on food, with £230.00 already spent this month (D230).
  await iSpent(page, {
    budget: 'Food',
    amount: '10',
    before: ['£230.00', '£30.00'],
    withIt: 'With this: £240.00 spent, £20.00 left.',
  });
  await expectDays(page, expected(), PRIYA_TODAY, PRIYA_TO);

  // What if: no salary on Mon 30 Nov.
  await openWhatIf(page);
  await practiceSkip(page, '2026-11-30', 'Salary');
  // Without that payday, her food month runs on to the next one (D81, D108), so
  // that month's £260.00 doesn't leave on Mon 30 Nov either.
  await expectSides(
    page,
    'Current account',
    expected(),
    shift(expected(), 'Current account', '2026-11-30', -210000 + 26000),
    PRIYA_TODAY,
  );
  await noAxeProblems(page);
  await noSidewaysScroll(page);
  await throwAway(page, 1);
  await expectDays(page, expected(), PRIYA_TODAY, PRIYA_TO);
  await expectHomeLowest(page, expected(), 'Current account', PRIYA_TODAY);
}

// Dee, Universal Credit and part-time work (brief Part 2, 8.5, D137): today is
// Mon 2 Nov 2026, after her October Universal Credit and wages came in.
const DEE_TODAY = '2026-11-02';
const DEE_TO = '2027-11-02';

async function deeJourney(page: Page) {
  await openNewPhone(page, DEE_TODAY);
  await page.getByRole('button', { name: 'Make my plan' }).click();
  await expectStep(page, 1, 'Your account');
  await fillAccount(lastForm(page, 'account'), {
    name: 'Current account',
    balance: '427.40',
    warning: '50',
  });
  await next(page);

  await expectStep(page, 2, "How you're paid");
  const credit = lastForm(page, 'income');
  await box(credit, 'Name').fill('Universal Credit');
  await radio(credit, 'Benefits, such as Universal Credit').check();
  await radio(credit, 'Monthly, on a date').check();
  await credit.getByLabel(/^Next pay(day|ment)$/).fill('2026-11-28');
  await box(credit, 'How much comes in, after tax').fill('845');
  await expect(
    radio(
      credit.getByRole('group', { name: 'On a weekend or bank holiday' }),
      'Move to the working day before',
    ),
  ).toBeChecked();
  await credit.getByRole('checkbox', { name: 'This is an estimate' }).check();
  await page.getByRole('button', { name: 'Add another income' }).click();
  const wages = lastForm(page, 'income');
  await box(wages, 'Name').fill('Café wages');
  await radio(wages, 'Every 2 weeks').check();
  await box(wages, 'Next payday').fill('2026-11-13');
  await box(wages, 'How much comes in, after tax').fill('406.72');
  await wages.getByRole('checkbox', { name: 'This is an estimate' }).check();
  await radio(
    page.getByRole('group', { name: 'Which is your main pay?' }),
    'Universal Credit',
  ).check();
  // Her café pays 32 hours at £12.71, so I missed a shift works (D137).
  await radio(
    page.getByRole('group', { name: 'Do you ever work extra hours or miss shifts?' }),
    'Yes',
  ).check();
  await box(page, 'Overtime rate an hour').fill('12.71');
  await box(page, `${day('Fri 13 Nov')} pays for work up to`).fill('2026-11-08');
  await radio(page, 'Save my usual week now').check();
  await box(page, 'Usual rate an hour').fill('12.71');
  await box(page, 'Hours').fill('32');
  await noAxeProblems(page);
  await next(page);

  await expectStep(page, 3, 'Rent or mortgage');
  await box(page, 'Amount').fill('795');
  await fillWhen(page.getByRole('form'), { date: '2026-12-01' });
  await next(page);

  await expectStep(page, 4, 'Bills');
  const bill = (key: string) => page.locator(`[data-bill="${key}"]`);
  await bill('council-tax').getByRole('checkbox', { name: 'Council tax', exact: true }).check();
  await box(bill('council-tax'), 'Amount').fill('118');
  await fillWhen(bill('council-tax'), { date: '2026-12-01' });
  await bill('energy').getByRole('checkbox', { name: 'Energy', exact: true }).check();
  await box(bill('energy'), 'Amount').fill('82');
  await fillWhen(bill('energy'), { date: '2026-11-03' });
  await bill('energy').getByRole('checkbox', { name: 'This is an estimate' }).check();
  await bill('phone').getByRole('checkbox', { name: 'Phone', exact: true }).check();
  await box(bill('phone'), 'Amount').fill('12');
  await fillWhen(bill('phone'), { date: '2026-11-18' });
  await page.getByRole('button', { name: 'Add another bill' }).click();
  const childcare = lastForm(page, 'bill');
  await box(childcare, 'Name').fill('Childcare');
  await box(childcare, 'Amount').fill('95');
  await fillWhen(childcare, { date: DEE_TODAY, often: 'Every week, or every few weeks' });
  await noAxeProblems(page);
  await next(page);

  await expectStep(page, 5, 'Debts');
  await page.getByRole('button', { name: 'I have no debts' }).click();
  await expectStep(page, 6, 'Spending money');
  const food = page.getByTestId('budget-form').first();
  await box(food, 'Amount').fill('60');
  await radio(food, 'Week').check();
  await next(page);
  await expectStep(page, 7, 'Savings');
  await skip(page);
  await expectStep(page, 8, "Here's your plan");
  await noAxeProblems(page);
  await page.getByRole('button', { name: 'Go to my plan' }).click();
  await expect(page.getByTestId('balance')).toHaveText('£427.40');
  // Kids clubs keep their date, so they're added with Add a payment (D231).
  await addPayment(page, {
    name: 'Kids clubs',
    amount: '28',
    date: '2026-11-10',
    often: 'Every month, or every few months',
    weekend: 'Keep the date',
  });

  let records = withSetupRules(recordsOfFixture(deePlan()), DEE_TODAY, {});
  const shifts: Shift[] = [];
  const expected = () => withShifts(daysOf(records, DEE_TODAY, DEE_TO), shifts);
  await expectDays(page, expected(), DEE_TODAY, DEE_TO);

  // What she needs most (brief Part 2): a warning before she goes overdrawn, and
  // Universal Credit on Thu 24 Dec, before Christmas (brief 8.5).
  await expectHomeLowest(page, expected(), 'Current account', DEE_TODAY);
  const under = firstUnder(expected(), 'Current account', 5000);
  expect(under).not.toBeNull();
  await expect(page.getByTestId('lowest-point')).toContainText(
    `Under £50 from ${words(under ?? '', DEE_TODAY)}.`,
  );
  await expect(page.getByTestId('lowest-point')).not.toContainText('Short');
  await noAxeProblems(page);
  await comingUp(page, null);
  await expect(paydayButton(page, '2026-12-24')).toContainText(day('Thu 24 Dec'));
  await expect(paydayButton(page, '2026-12-24')).toContainText('Pay £845.00 in');

  // Estimates she corrects: Universal Credit on Fri 27 Nov comes in at £812.46.
  const credit27 = await openRow(page, '2026-11-27', 'Universal Credit');
  await credit27.getByLabel('Amount').fill('812.46');
  await expect(credit27.getByLabel('This is an estimate')).not.toBeChecked();
  await expect(credit27.getByText('£32.54 less than the estimate.')).toBeVisible();
  await credit27.getByRole('button', { name: 'Save' }).click();
  await expect(credit27).toBeHidden();
  shifts.push(['Current account', '2026-11-27', -3254]);
  await expectDays(page, expected(), DEE_TODAY, DEE_TO);

  // Update balance: childcare has gone today, and her bank shows £330.00.
  const end = expected()['Current account']?.[DEE_TODAY] ?? 0;
  await updateBalance(page, {
    account: null,
    balance: '330',
    expected: money(end),
    difference: `That's ${money(33000 - end)} more.`,
    toTick: 1,
  });
  records = withCommands(records, DEE_TODAY, [
    balanceUpdate('current', 33000, DEE_TODAY, [
      { seriesId: 'childcare', originalDate: DEE_TODAY },
    ]),
  ]);
  await expectDays(page, expected(), DEE_TODAY, DEE_TO);

  // Add a payment: a school trip, £15.00 once on Fri 20 Nov.
  await addPayment(page, { name: 'School trip', amount: '15', date: '2026-11-20', often: 'Once' });
  shifts.push(['Current account', '2026-11-20', -1500]);
  await expectDays(page, expected(), DEE_TODAY, DEE_TO);

  // This and all later ones: energy, £90.00 from Thu 3 Dec.
  await comingUp(page, null);
  await changeThisAndLater(page, '2026-11-27', 'Energy', '90');
  records = withCommands(records, DEE_TODAY, [thisAndLater('energy', '2026-12-03', 9000)]);
  await expectDays(page, expected(), DEE_TODAY, DEE_TO);

  // Move to next payday: her phone on Wed 18 Nov goes to Fri 27 Nov.
  await moveToNextPayday(page, '2026-11-02', 'Phone', 'Fri 27 Nov');
  shifts.push(['Current account', '2026-11-18', 1200, '2026-11-27']);
  await expectDays(page, expected(), DEE_TODAY, DEE_TO);

  // I spent: £12.00 on food this week.
  await iSpent(page, {
    budget: null,
    amount: '12',
    before: ['£0.00', '£60.00'],
    withIt: 'With this: £12.00 spent, £48.00 left.',
  });
  await expectDays(page, expected(), DEE_TODAY, DEE_TO);

  // What if: she misses Fri 13 Nov's wages.
  await openWhatIf(page);
  await practiceSkip(page, '2026-11-02', 'Café wages');
  await expectSides(
    page,
    'Current account',
    expected(),
    shift(expected(), 'Current account', '2026-11-13', -40672),
    DEE_TODAY,
  );
  await noAxeProblems(page);
  await throwAway(page, 1);
  await expectDays(page, expected(), DEE_TODAY, DEE_TO);
}

// Kofi, self-employed driver (brief Part 2, 8.5, D137): three platforms as weekly
// estimates, 25% set aside for tax, weeks from Monday. His setup answers are
// step 2e's (setup.ts), on Tue 27 Oct 2026.
const KOFI_TO = '2027-10-27';

async function kofiJourney(page: Page) {
  await setUpKofi(page);
  await page.getByRole('button', { name: 'Go to my plan' }).click();
  await expect(page.getByTestId('balance')).toHaveText('£640.00');
  const steps = kofiSteps();
  const atSetup = build(
    steps.slice(0, steps.findIndex((one) => one.command.kind === 'choose-main-pay') + 1),
  );
  let records = withSetupRules(atSetup.records, KOFI_TODAY, KOFI_ALREADY_SPENT);
  const shifts: Shift[] = [];
  const expected = () => withShifts(daysOf(records, KOFI_TODAY, KOFI_TO), shifts);
  await expectDays(page, expected(), KOFI_TODAY, KOFI_TO);

  // What he needs most (brief Part 2): 25% of everything set aside for tax. Next
  // week's £380.00, £145.00 and £90.00 put £153.75 in his Tax account.
  await expectHomeLowest(page, expected(), 'Current account', KOFI_TODAY);
  await comingUp(page, 'Tax');
  await expect(paydayButton(page, '2026-11-02')).toContainText('£153.75 coming in');
  await noAxeProblems(page);

  // Update balance: his bank shows £20.00 more than the plan expected.
  const end = expected()['Current account']?.[KOFI_TODAY] ?? 0;
  await updateBalance(page, {
    account: 'Current account',
    balance: amountForTyping(end + 2000),
    expected: money(end),
    difference: "That's £20.00 more.",
    toTick: 0,
  });
  records = withCommands(records, KOFI_TODAY, [balanceUpdate('current', end + 2000, KOFI_TODAY)]);
  await expectDays(page, expected(), KOFI_TODAY, KOFI_TO);

  // Add a payment: new tyres, £120.00 once on Fri 6 Nov.
  await addPayment(page, {
    name: 'Tyres',
    amount: '120',
    date: '2026-11-06',
    often: 'Once',
    account: 'Current account',
  });
  shifts.push(['Current account', '2026-11-06', -12000]);
  await expectDays(page, expected(), KOFI_TODAY, KOFI_TO);

  // This and all later ones: van insurance, £104.00 from Thu 12 Nov.
  await comingUp(page, 'Current account');
  await changeThisAndLater(page, '2026-11-09', 'Van insurance', '104');
  records = withCommands(records, KOFI_TODAY, [thisAndLater('van-insurance', '2026-11-12', 10400)]);
  await expectDays(page, expected(), KOFI_TODAY, KOFI_TO);

  // Move to next payday: his phone on Fri 20 Nov goes to Monday, Mon 23 Nov (D66).
  await moveToNextPayday(page, '2026-11-16', 'Phone', 'Mon 23 Nov');
  shifts.push(['Current account', '2026-11-20', 2500, '2026-11-23']);
  await expectDays(page, expected(), KOFI_TODAY, KOFI_TO);

  // I spent: £25.00 on fuel, with £30.00 already spent this week (D230).
  await iSpent(page, {
    budget: 'Fuel',
    amount: '25',
    before: ['£30.00', '£40.00'],
    withIt: 'With this: £55.00 spent, £15.00 left.',
  });
  await expectDays(page, expected(), KOFI_TODAY, KOFI_TO);

  // What if: no work next week (brief 8.5). Each platform's money goes, with the
  // 25% that would have moved to Tax: 75% of it comes off his current account.
  await openWhatIf(page);
  await practiceSkip(page, '2026-11-02', 'Rides');
  await practiceSkip(page, '2026-11-02', 'Deliveries');
  await practiceSkip(page, '2026-11-02', 'Parcels');
  const practice = withShifts(expected(), [
    ['Current account', '2026-11-02', -28500],
    ['Current account', '2026-11-04', -10875],
    ['Current account', '2026-11-06', -6750],
  ]);
  await expectSides(page, 'Current account', expected(), practice, KOFI_TODAY);
  await noAxeProblems(page);
  // Throwing it away leaves the real plan exactly as before (brief 8.5).
  await throwAway(page, 3);
  await expectDays(page, expected(), KOFI_TODAY, KOFI_TO);
  await expectHomeLowest(page, expected(), 'Current account', KOFI_TODAY);
}

// Jess and Tom, a couple (brief Part 2, 8.5, D137): one plan with their three
// accounts for now; sharing between their phones comes in Phase 3. Today is
// Sun 25 Oct 2026, and Jess's pay is the main pay.
const COUPLE_TODAY = '2026-10-25';
const COUPLE_TO = '2027-10-25';

async function jessAndTomJourney(page: Page) {
  await openNewPhone(page, COUPLE_TODAY);
  await page.getByRole('button', { name: 'Make my plan' }).click();
  await expectStep(page, 1, 'Your account');
  await fillAccount(lastForm(page, 'account'), {
    name: 'Jess current account',
    balance: '410',
    warning: '50',
  });
  await page.getByRole('button', { name: 'Add another account' }).click();
  await fillAccount(lastForm(page, 'account'), {
    name: 'Tom current account',
    kind: 'Current account',
    balance: '520',
    warning: '50',
  });
  await page.getByRole('button', { name: 'Add another account' }).click();
  await fillAccount(lastForm(page, 'account'), {
    name: 'Joint account',
    kind: 'Joint account',
    balance: '1050',
    warning: '100',
  });
  await noAxeProblems(page);
  await next(page);

  await expectStep(page, 2, "How you're paid");
  const jess = lastForm(page, 'income');
  await box(jess, 'Name').fill('Jess pay');
  await radio(jess, 'Monthly, on a date').check();
  await box(jess, 'Next payday').fill('2026-10-28');
  await box(jess, 'How much comes in, after tax').fill('2100');
  await radio(jess.getByRole('group', { name: 'Into' }), 'Jess current account').check();
  await page.getByRole('button', { name: 'Add another income' }).click();
  const tom = lastForm(page, 'income');
  await box(tom, 'Name').fill('Tom pay');
  await radio(tom, 'Monthly, on a date').check();
  await box(tom, 'Next payday').fill('2026-11-15');
  await box(tom, 'How much comes in, after tax').fill('2350');
  await radio(tom.getByRole('group', { name: 'Into' }), 'Tom current account').check();
  await radio(page.getByRole('group', { name: 'Which is your main pay?' }), 'Jess pay').check();
  await radio(
    page.getByRole('group', { name: 'Do you ever work extra hours or miss shifts?' }),
    'No',
  ).check();
  await next(page);

  await expectStep(page, 3, 'Rent or mortgage');
  await box(page, 'Amount').fill('950');
  await fillWhen(page.getByRole('form'), { date: '2026-11-01' });
  await radio(page.getByRole('group', { name: 'From' }), 'Joint account').check();
  await next(page);

  await expectStep(page, 4, 'Bills');
  const bill = (key: string) => page.locator(`[data-bill="${key}"]`);
  const from = async (where: ReturnType<typeof bill>, account: string) =>
    radio(where.getByRole('group', { name: 'From' }), account).check();
  await bill('council-tax').getByRole('checkbox', { name: 'Council tax', exact: true }).check();
  await box(bill('council-tax'), 'Amount').fill('140');
  await fillWhen(bill('council-tax'), { date: '2026-11-01' });
  await from(bill('council-tax'), 'Joint account');
  await bill('energy').getByRole('checkbox', { name: 'Energy', exact: true }).check();
  await box(bill('energy'), 'Amount').fill('110');
  await fillWhen(bill('energy'), { date: '2026-11-05' });
  await bill('energy').getByRole('checkbox', { name: 'This is an estimate' }).check();
  await from(bill('energy'), 'Joint account');
  await bill('broadband').getByRole('checkbox', { name: 'Broadband', exact: true }).check();
  await box(bill('broadband'), 'Amount').fill('30');
  await fillWhen(bill('broadband'), { date: '2026-11-10' });
  await from(bill('broadband'), 'Joint account');
  await bill('phone').getByRole('checkbox', { name: 'Phone', exact: true }).check();
  await box(bill('phone'), 'Amount').fill('22');
  await fillWhen(bill('phone'), { date: '2026-11-20' });
  await page.getByRole('button', { name: 'Add another bill' }).click();
  const tomPhone = lastForm(page, 'bill');
  await box(tomPhone, 'Name').fill('Phone');
  await box(tomPhone, 'Amount').fill('15');
  await fillWhen(tomPhone, { date: '2026-11-08' });
  await radio(tomPhone.getByRole('group', { name: 'From' }), 'Tom current account').check();
  await noAxeProblems(page);
  await next(page);

  await expectStep(page, 5, 'Debts');
  await page.getByRole('button', { name: 'Add a debt' }).click();
  const loan = lastForm(page, 'debt');
  await box(loan, 'Name').fill('Car loan');
  await radio(loan, 'Loan').check();
  await box(loan, 'What you owe now').fill('2160');
  await box(loan, 'What it started at, if you know').fill('4320');
  await box(loan, 'Each payment').fill('180');
  await fillWhen(loan, { date: '2026-11-18', payments: '12' });
  await radio(loan.getByRole('group', { name: 'From' }), 'Tom current account').check();
  await next(page);

  await expectStep(page, 6, 'Spending money');
  const food = page.getByTestId('budget-form').first();
  await box(food, 'Amount').fill('300');
  await radio(food.getByRole('group', { name: 'From' }), 'Joint account').check();
  await next(page);
  await expectStep(page, 7, 'Savings');
  await skip(page);
  await expectStep(page, 8, "Here's your plan");
  await noAxeProblems(page);
  await page.getByRole('button', { name: 'Go to my plan' }).click();
  await expect(page.getByTestId('balance')).toHaveText('£410.00');

  // The standing orders into the joint account, the gym and spending money, with Add a payment.
  await addPayment(page, {
    kind: 'Between accounts',
    name: 'Jess to joint account',
    amount: '600',
    account: 'Jess current account',
    to: 'Joint account',
    date: '2026-10-28',
    often: 'Every month, or every few months',
    weekend: 'Move to the working day before',
  });
  await addPayment(page, {
    kind: 'Between accounts',
    name: 'Tom to joint account',
    amount: '950',
    account: 'Tom current account',
    to: 'Joint account',
    date: '2026-11-15',
    often: 'Every month, or every few months',
    weekend: 'Move to the working day before',
  });
  await addPayment(page, {
    name: 'Gym',
    amount: '30',
    account: 'Jess current account',
    date: '2026-11-03',
    often: 'Every month, or every few months',
    weekend: 'Keep the date',
  });
  await addPayment(page, {
    name: 'Spending money',
    amount: '45',
    account: 'Jess current account',
    date: '2026-10-30',
    often: 'Every week, or every few weeks',
    weekend: 'Keep the date',
    type: 'Spending money',
  });
  await addPayment(page, {
    name: 'Spending money',
    amount: '40',
    account: 'Tom current account',
    date: '2026-10-31',
    often: 'Every week, or every few weeks',
    weekend: 'Keep the date',
    type: 'Spending money',
  });

  let records = withSetupRules(recordsOfFixture(jessAndTomPlan()), COUPLE_TODAY, {});
  const shifts: Shift[] = [];
  const expected = () => withShifts(daysOf(records, COUPLE_TODAY, COUPLE_TO), shifts);
  await expectDays(page, expected(), COUPLE_TODAY, COUPLE_TO);

  // Brief 8.5: Jess's £600 on her payday, Wed 28 Oct, lowers her account and raises
  // the joint one by £600, and the total across all three is unchanged by it.
  const days = expected();
  const total = (date: string) =>
    Object.values(days).reduce((sum, one) => sum + (one[date] ?? 0), 0);
  // Jess's £2,100.00 pay comes in, and the joint account's £300.00 food month starts
  // on her payday (D29): the £600.00 itself only moves between accounts.
  expect(total('2026-10-28') - total('2026-10-27')).toBe(210000 - 30000);
  expect(
    (days['Jess current account']?.['2026-10-28'] ?? 0) -
      (days['Jess current account']?.['2026-10-27'] ?? 0),
  ).toBe(210000 - 60000);
  await comingUp(page, 'Jess current account', '2026-10-28');
  await expect(rowIn(page, '2026-10-28', 'Jess to joint account')).toContainText(`${MINUS}£600.00`);
  await comingUp(page, 'Joint account', '2026-10-28');
  await expect(rowIn(page, '2026-10-28', 'Jess to joint account')).toContainText('+£600.00');
  await noAxeProblems(page);

  // Update balance: the joint account's bank shows £10.00 less.
  const end = days['Joint account']?.[COUPLE_TODAY] ?? 0;
  await updateBalance(page, {
    account: 'Joint account',
    balance: amountForTyping(end - 1000),
    expected: money(end),
    difference: "That's £10.00 less.",
    toTick: 0,
  });
  records = withCommands(records, COUPLE_TODAY, [balanceUpdate('joint', end - 1000, COUPLE_TODAY)]);
  await expectDays(page, expected(), COUPLE_TODAY, COUPLE_TO);

  // Add a payment: a window cleaner, £12.00 once on Sat 7 Nov from the joint account.
  await addPayment(page, {
    name: 'Window cleaner',
    amount: '12',
    account: 'Joint account',
    date: '2026-11-07',
    often: 'Once',
  });
  shifts.push(['Joint account', '2026-11-07', -1200]);
  await expectDays(page, expected(), COUPLE_TODAY, COUPLE_TO);

  // This and all later ones: rent, £975.00 from Tue 1 Dec.
  await comingUp(page, 'Joint account');
  await changeThisAndLater(page, '2026-11-27', 'Rent', '975');
  records = withCommands(records, COUPLE_TODAY, [thisAndLater('rent', '2026-12-01', 97500)]);
  await expectDays(page, expected(), COUPLE_TODAY, COUPLE_TO);

  // Move to next payday: broadband on Tue 10 Nov goes to Jess's payday, Fri 27 Nov.
  await moveToNextPayday(page, '2026-10-28', 'Broadband', 'Fri 27 Nov');
  shifts.push(['Joint account', '2026-11-10', 3000, '2026-11-27']);
  await expectDays(page, expected(), COUPLE_TODAY, COUPLE_TO);

  // I spent: £20.00 on food from the joint account.
  await iSpent(page, {
    budget: null,
    amount: '20',
    before: ['£0.00', '£300.00'],
    withIt: 'With this: £20.00 spent, £280.00 left.',
  });
  await expectDays(page, expected(), COUPLE_TODAY, COUPLE_TO);

  // What if: no pay for Jess on Fri 27 Nov.
  await openWhatIf(page);
  await practiceSkip(page, '2026-11-27', 'Jess pay');
  await expectSides(
    page,
    'Jess current account',
    expected(),
    shift(expected(), 'Jess current account', '2026-11-27', -210000),
    COUPLE_TODAY,
  );
  await noAxeProblems(page);
  await throwAway(page, 1);
  await expectDays(page, expected(), COUPLE_TODAY, COUPLE_TO);
}

// Ali, student (brief Part 2, 8.5, D137): a student loan in three termly
// payments, a weekly job, rent each term and a £1,000 overdraft, the floor.
// Today is Mon 2 Nov 2026, and he's £300 into his overdraft.
const ALI_TODAY = '2026-11-02';
const ALI_TO = '2027-11-02';

async function aliJourney(page: Page) {
  await openNewPhone(page, ALI_TODAY);
  await page.getByRole('button', { name: 'Make my plan' }).click();
  await expectStep(page, 1, 'Your account');
  const account = lastForm(page, 'account');
  await fillAccount(account, {
    name: 'Student account',
    balance: '300',
    overdraft: '1000',
    warning: '0',
  });
  await account.getByRole('checkbox', { name: "It's overdrawn, below £0.00" }).check();
  await next(page);

  await expectStep(page, 2, "How you're paid");
  const loan = lastForm(page, 'income');
  await box(loan, 'Name').fill('Student loan');
  await radio(loan, 'Something else, such as a student loan').check();
  await radio(loan, 'On chosen dates, such as a student loan').check();
  await loan.getByLabel(/^Next pay(day|ment)$/).fill('2027-01-11');
  await loan.getByRole('button', { name: 'Add a date' }).click();
  await box(loan, 'Date 2').fill('2027-04-26');
  await box(loan, 'How much comes in, after tax').fill('1610');
  await page.getByRole('button', { name: 'Add another income' }).click();
  const job = lastForm(page, 'income');
  await box(job, 'Name').fill('Shop job');
  await radio(job, 'Every week').check();
  await box(job, 'Next payday').fill('2026-11-06');
  await box(job, 'How much comes in, after tax').fill('101.68');
  await job.getByRole('checkbox', { name: 'This is an estimate' }).check();
  await radio(page.getByRole('group', { name: 'Which is your main pay?' }), 'Student loan').check();
  await radio(
    page.getByRole('group', { name: 'Do you ever work extra hours or miss shifts?' }),
    'No',
  ).check();
  await noAxeProblems(page);
  await next(page);

  await expectStep(page, 3, 'Rent or mortgage');
  await box(page, 'Amount').fill('1480');
  const rent = page.getByRole('form');
  await fillWhen(rent, { date: '2027-01-15', often: 'On chosen dates' });
  await rent.getByRole('button', { name: 'Add a date' }).click();
  await box(rent, 'Date 2').fill('2027-04-30');
  await next(page);

  await expectStep(page, 4, 'Bills');
  const phone = page.locator('[data-bill="phone"]');
  await phone.getByRole('checkbox', { name: 'Phone', exact: true }).check();
  await box(phone, 'Name').fill('Phone contract');
  await box(phone, 'Amount').fill('14');
  await fillWhen(phone, { date: '2026-11-09' });
  await next(page);

  await expectStep(page, 5, 'Debts');
  await page.getByRole('button', { name: 'I have no debts' }).click();
  await expectStep(page, 6, 'Spending money');
  const food = page.getByTestId('budget-form').first();
  await box(food, 'Amount').fill('35');
  await radio(food, 'Week').check();
  await next(page);
  await expectStep(page, 7, 'Savings');
  await skip(page);
  await expectStep(page, 8, "Here's your plan");
  await noAxeProblems(page);
  await page.getByRole('button', { name: 'Go to my plan' }).click();
  await expect(page.getByTestId('balance')).toHaveText(`${MINUS}£300.00`);

  // The bus pass keeps its date, so it's added with Add a payment (D231), and
  // the last student loan payment is £1,690.00.
  await addPayment(page, {
    name: 'Bus pass',
    amount: '30',
    date: '2026-12-01',
    often: 'Every month, or every few months',
    weekend: 'Keep the date',
  });
  await comingUp(page, null);
  while ((await period(page, '2027-04-26').count()) === 0) {
    await page.getByRole('button', { name: 'Show another month' }).click();
  }
  await justThisOne(page, '2027-04-26', 'Student loan', '1690', false);

  // His fixture, without the books he adds below.
  const fixture = recordsOfFixture(aliPlan());
  let records = withSetupRules(
    { ...fixture, series: fixture.series.filter((one) => one.id !== 'books') },
    ALI_TODAY,
    {},
  );
  const shifts: Shift[] = [];
  const expected = () => withShifts(daysOf(records, ALI_TODAY, ALI_TO), shifts);
  await expectDays(page, expected(), ALI_TODAY, ALI_TO);

  // What he needs most (brief Part 2, 8.5): the overdraft is the floor, so −£300.00
  // is Tight, not Short, and the loan has to last until Mon 11 Jan.
  await openHome(page);
  const lowest = page.getByTestId('lowest-point');
  await expect(lowest).toContainText('Tight');
  await expect(lowest).not.toContainText('Short');
  await expect(page.getByText(`Left to spend until ${day('Mon 11 Jan 2027')}`)).toBeVisible();
  // Ten weeks of his £35.00 food budget, from Mon 2 Nov to Mon 4 Jan.
  await expect(page.getByTestId('left-to-spend')).toHaveText('£350.00');
  await expectHomeLowest(page, expected(), 'Student account', ALI_TODAY);
  await noAxeProblems(page);

  // Update balance: he's £310.00 overdrawn, after today's food.
  const end = expected()['Student account']?.[ALI_TODAY] ?? 0;
  await updateBalance(page, {
    account: null,
    balance: '-310',
    expected: money(end),
    difference: `That's ${money(-31000 - end)} more.`,
    toTick: 0,
  });
  records = withCommands(records, ALI_TODAY, [balanceUpdate('current', -31000, ALI_TODAY)]);
  await expectDays(page, expected(), ALI_TODAY, ALI_TO);

  // Add a payment: books, £45.00 once on Fri 20 Nov.
  await addPayment(page, { name: 'Books', amount: '45', date: '2026-11-20', often: 'Once' });
  shifts.push(['Student account', '2026-11-20', -4500]);
  await expectDays(page, expected(), ALI_TODAY, ALI_TO);

  // This and all later ones: his phone contract, £16.00 from Mon 9 Nov.
  await comingUp(page, null);
  await changeThisAndLater(page, '2026-11-02', 'Phone contract', '16');
  records = withCommands(records, ALI_TODAY, [thisAndLater('phone', '2026-11-09', 1600)]);
  await expectDays(page, expected(), ALI_TODAY, ALI_TO);

  // Move to next payday: the bus pass on Tue 1 Dec goes to Mon 11 Jan 2027.
  await moveToNextPayday(page, '2026-11-02', 'Bus pass', 'Mon 11 Jan 2027');
  shifts.push(['Student account', '2026-12-01', 3000, '2027-01-11']);
  await expectDays(page, expected(), ALI_TODAY, ALI_TO);

  // I spent: £8.00 on food this week.
  await iSpent(page, {
    budget: null,
    amount: '8',
    before: ['£0.00', '£35.00'],
    withIt: 'With this: £8.00 spent, £27.00 left.',
  });
  await expectDays(page, expected(), ALI_TODAY, ALI_TO);

  // What if: no shifts at the shop on Fri 6 Nov.
  await openWhatIf(page);
  await practiceSkip(page, '2026-11-02', 'Shop job');
  await expectSides(
    page,
    'Student account',
    expected(),
    shift(expected(), 'Student account', '2026-11-06', -10168),
    ALI_TODAY,
  );
  await noAxeProblems(page);
  await throwAway(page, 1);
  await expectDays(page, expected(), ALI_TODAY, ALI_TO);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`The six people, in ${colorScheme} mode`, () => {
    // Each journey sets up a whole plan on the screens, then does six tasks.
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test("Sam sets up brief 8.2's plan on the screens, and it gives every figure in brief 8.3", async ({
      page,
    }) => {
      await setUpSam(page);
      // Every day's balance is his fixture's (brief 8.1 to 8.3), both accounts, to the end of February.
      let expected: Days = daysOf(recordsOfFixture(samPlan()), SAM_TODAY, SAM_TO);
      await expectDays(page, expected, SAM_TODAY, SAM_TO);
      const current = expected['Current account'] ?? {};
      for (const [date, balance] of [
        ['2026-10-31', 60453],
        ['2026-11-30', 73291],
        ['2026-12-31', 102460],
        ['2027-01-31', 223589],
        ['2027-02-28', 330487],
      ] as const) {
        expect(current[date]).toBe(balance);
      }

      // What he needs most (brief Part 2): what each payday covers, the tight days,
      // and the date each debt ends.
      await openHome(page);
      const lowest = page.getByTestId('lowest-point');
      await expect(lowest.getByText('£4.53', { exact: true })).toBeVisible();
      await expect(
        lowest.getByText(`${day('Sun 1 Nov')}, after Rent`, { exact: true }),
      ).toBeVisible();
      await expect(
        lowest.getByText(`Under £20 from ${day('Mon 26 Oct')}.`, { exact: true }),
      ).toBeVisible();
      const cover = page.getByTestId('this-pay');
      await expect(cover.getByRole('definition')).toHaveText(['£721.07', '£500.00']);
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      await nav(page, 'Debts').click();
      for (const [name, paidOff] of [
        ['Pay-later card', 'Paid off on Thu 29 Oct'],
        ['Pay in 3', 'Paid off on Sun 6 Dec'],
        ['Family loan', 'Paid off on Fri 1 Jan 2027'],
        ['Laptop loan', 'Paid off on Sat 20 Feb 2027'],
        ['Sofa finance', 'Paid off on Mon 23 Aug 2027'],
        ['Credit card', 'Paid off on Wed 15 Mar 2028'],
      ] as const) {
        await expect(page.locator(`[data-debt="${name}"]`)).toContainText(day(paidOff));
      }
      await noAxeProblems(page);

      // Update balance: £237.54 is what the plan expected, so nothing ahead changes (D46).
      await updateBalance(page, {
        account: 'Current account',
        balance: '237.54',
        expected: '£237.54',
        difference: 'They match.',
        toTick: 1,
      });
      await expect(page.getByTestId('balance')).toHaveText('£237.54');
      await expectDays(page, expected, SAM_TODAY, SAM_TO);

      // Add a payment: Car MOT, £54.85 once on Fri 13 Nov (step 2d's test 4).
      await addPayment(page, {
        name: 'Car MOT',
        amount: '54.85',
        date: '2026-11-13',
        often: 'Once',
      });
      expected = shift(expected, 'Current account', '2026-11-13', -5485);
      await expectDays(page, expected, SAM_TODAY, SAM_TO);
      await comingUp(page, 'Current account', '2026-11-13');
      await expect(rowIn(page, '2026-11-13', 'Car MOT')).toContainText('£365.90 left');

      // This and all later ones: rent £560 from Fri 1 Jan 2027 (brief 8.4 test 1).
      await changeThisAndLater(page, '2027-01-01', 'Rent', '560');
      expected = shift(expected, 'Current account', '2027-01-01', -1000);
      expected = shift(expected, 'Current account', '2027-02-01', -1000);
      await expectDays(page, expected, SAM_TODAY, SAM_TO);
      await expect(rowIn(page, '2027-01-01', 'Rent')).toContainText(`${MINUS}£560.00`);

      // Move to next payday: the driving lesson on Mon 26 Oct goes to Fri 30 Oct.
      await moveToNextPayday(page, '2026-10-25', 'Driving lesson', 'Fri 30 Oct');
      expected = shift(expected, 'Current account', '2026-10-26', 10000, '2026-10-30');
      await expectDays(page, expected, SAM_TODAY, SAM_TO);

      // What if: his Fri 30 Oct pay £100 less, beside the real plan (brief 4.10, D135).
      await openWhatIf(page);
      const pay = period(page, '2026-10-30');
      await pay.locator(':scope > h3 > button').click();
      await pay.getByRole('button', { name: /^Pay Fri/ }).click();
      const sheet = page.getByRole('dialog', { name: 'Pay' });
      await sheet.getByLabel('Amount').fill('503.06');
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).toBeHidden();
      const account = sides(page, 'Current account');
      await expect(account.getByTestId('real')).toContainText('£4.53');
      await expect(account.getByTestId('practice')).toContainText(`${MINUS}£95.47`);
      await expect(account.getByTestId('practice')).toContainText('Short');
      await expect(account.getByTestId('practice-short')).toContainText(
        `In practice, you'd be £95.47 short on ${day('Sun 1 Nov')}.`,
      );
      await expect(page.getByTestId('other-accounts')).toHaveText(
        "Your other accounts don't change.",
      );
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      await throwAway(page, 1);
      await expectDays(page, expected, SAM_TODAY, SAM_TO);

      // I spent, with no budget yet: Add a budget, Travel at £25 a week with £4.00
      // already spent, then £6.00 (D241, D247).
      await openHome(page);
      const spent = await openAction(page, 'I spent');
      await spent.getByRole('button', { name: 'Add a budget' }).click();
      const budget = page.getByRole('dialog', { name: 'Add a budget' });
      await budget.getByLabel('Name').fill('Travel');
      await budget.getByLabel('Amount').fill('25');
      await budget.getByRole('radio', { name: 'Week', exact: true }).check();
      await budget.getByLabel('Already spent this week').fill('4');
      await budget.getByRole('button', { name: 'Add budget' }).click();
      const again = page.getByRole('dialog', { name: 'I spent' });
      await expect(again.getByTestId('budget-period').getByRole('definition')).toHaveText([
        '£4.00',
        '£21.00',
      ]);
      await again.getByLabel('How much').fill('6');
      await expect(again.getByText('With this: £10.00 spent, £15.00 left.')).toBeVisible();
      await again.getByRole('button', { name: 'Save' }).click();
      await expect(again).toBeHidden();
      await expect(undoBar(page)).toContainText(
        '£6.00 spent on Travel. This week: £10.00 spent, £15.00 left.',
      );
      // £21.00 leaves today, inside the balance his bank showed; the £6.00 is part of
      // it (D2). Every later week's £25.00 leaves on its Friday (D29).
      expected = shift(expected, 'Current account', SAM_TODAY, -2100);
      for (const friday of weekdaysFrom('2026-10-30', SAM_TO)) {
        expected = shift(expected, 'Current account', friday, -2500);
      }
      await expectDays(page, expected, SAM_TODAY, SAM_TO);
      await openHome(page);
      await expect(lowest.getByText(`${MINUS}£41.47`, { exact: true })).toBeVisible();
      await expect(lowest).toContainText('Short');
      await noAxeProblems(page);
    });

    test('Priya sets up a monthly plan, sees her yearly bill and her goal, and does every task', async ({
      page,
    }) => {
      await priyaJourney(page);
    });

    test('Dee sets up Universal Credit and wages, is warned before she goes overdrawn, and does every task', async ({
      page,
    }) => {
      await deeJourney(page);
    });

    test('Kofi sets up three platforms with 25% for tax, practises no work next week, and does every task', async ({
      page,
    }) => {
      await kofiJourney(page);
    });

    test("Jess and Tom set up their three accounts, the £600 moves on Jess's payday, and they do every task", async ({
      page,
    }) => {
      await jessAndTomJourney(page);
    });

    test('Ali sets up his student loan with the overdraft as the floor, and does every task', async ({
      page,
    }) => {
      await aliJourney(page);
    });
  });
}
