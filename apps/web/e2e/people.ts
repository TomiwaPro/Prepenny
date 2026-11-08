// Each person's answers to setup, typed into the screens on a phone with
// nothing on it (step 2h): the journeys in people.spec.ts and the step 2h
// screenshots both start from them. Sam's, Dee's, Jess and Tom's and Ali's
// are here; Priya's and Kofi's are step 2e's, in setup.ts.

import { expect, type Page } from '@playwright/test';
import { MINUS } from './coming-up.ts';
import {
  addPayment,
  comingUp,
  day,
  noAxeProblems,
  openNewPhone,
  openRow,
  period,
  undoBar,
} from './journeys.ts';
import {
  billOn,
  box,
  expectStep,
  fillAccount,
  fillWhen,
  lastForm,
  next,
  radio,
  rentForm,
  skip,
} from './setup.ts';

export const DEE_TODAY = '2026-11-02';
export const COUPLE_TODAY = '2026-10-25';
export const ALI_TODAY = '2026-11-02';

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
export async function justThisOne(
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
export const SAM_TODAY = '2026-10-25';
export const SAM_TO = '2027-02-28';

export async function setUpSam(page: Page) {
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

  // No rent and no bills set up here (D231): one screen for both (D356).
  await expectStep(page, 3, 'Home and bills');
  await radio(rentForm(page), "I don't pay rent or a mortgage").check();
  await next(page);

  await expectStep(page, 4, 'Debts');
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

  await expectStep(page, 5, 'Spending money');
  await skip(page);
  await expectStep(page, 6, "Here's your plan");
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

/** Dee's answers to setup on Mon 2 Nov 2026, then her kids clubs with Add a payment (D231). */
export async function setUpDee(page: Page) {
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

  await expectStep(page, 3, 'Home and bills');
  await box(rentForm(page), 'Amount').fill('795');
  await fillWhen(rentForm(page), { date: '2026-12-01' });
  const bill = (key: string) => billOn(page, key);
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

  await expectStep(page, 4, 'Debts');
  await page.getByRole('button', { name: 'I have no debts' }).click();
  await expectStep(page, 5, 'Spending money');
  const food = page.getByTestId('budget-form').first();
  await box(food, 'Amount').fill('60');
  await radio(food, 'Week').check();
  await next(page);
  await expectStep(page, 6, "Here's your plan");
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
}

/** Jess and Tom's answers to setup on Sun 25 Oct 2026, then their standing orders, gym and spending money. */
export async function setUpJessAndTom(page: Page) {
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

  await expectStep(page, 3, 'Home and bills');
  await box(rentForm(page), 'Amount').fill('950');
  await fillWhen(rentForm(page), { date: '2026-11-01' });
  await radio(rentForm(page).getByRole('group', { name: 'From' }), 'Joint account').check();
  const bill = (key: string) => billOn(page, key);
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

  await expectStep(page, 4, 'Debts');
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

  await expectStep(page, 5, 'Spending money');
  const food = page.getByTestId('budget-form').first();
  await box(food, 'Amount').fill('300');
  await radio(food.getByRole('group', { name: 'From' }), 'Joint account').check();
  await next(page);
  await expectStep(page, 6, "Here's your plan");
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
}

/** Ali's answers to setup on Mon 2 Nov 2026, then his bus pass and the last loan payment. */
export async function setUpAli(page: Page) {
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

  await expectStep(page, 3, 'Home and bills');
  const rent = rentForm(page);
  await box(rent, 'Amount').fill('1480');
  await fillWhen(rent, { date: '2027-01-15', often: 'On chosen dates' });
  await rent.getByRole('button', { name: 'Add a date' }).click();
  await box(rent, 'Date 2').fill('2027-04-30');
  const phone = billOn(page, 'phone');
  await phone.getByRole('checkbox', { name: 'Phone', exact: true }).check();
  await box(phone, 'Name').fill('Phone contract');
  await box(phone, 'Amount').fill('14');
  await fillWhen(phone, { date: '2026-11-09' });
  await next(page);

  await expectStep(page, 4, 'Debts');
  await page.getByRole('button', { name: 'I have no debts' }).click();
  await expectStep(page, 5, 'Spending money');
  const food = page.getByTestId('budget-form').first();
  await box(food, 'Amount').fill('35');
  await radio(food, 'Week').check();
  await next(page);
  await expectStep(page, 6, "Here's your plan");
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
}
