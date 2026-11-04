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
  ALI_TODAY,
  COUPLE_TODAY,
  DEE_TODAY,
  SAM_TO,
  SAM_TODAY,
  setUpAli,
  setUpDee,
  setUpJessAndTom,
  setUpSam,
} from './people.ts';
import { setUpKofi, setUpPriya } from './setup.ts';
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
    await where.locator(':scope > :is(h3, h4) > button').click();
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
  await expect(period(page, '2026-11-01').locator(':scope > :is(h3, h4)')).toContainText(
    'November',
  );
  for (let month = 0; month < 3; month += 1) {
    await page.getByRole('button', { name: 'Show another month' }).click();
  }
  await expect(period(page, '2027-01-01').locator(':scope > :is(h3, h4)')).toContainText(
    'January 2027',
  );
  await period(page, '2027-01-01').locator(':scope > :is(h3, h4) > button').click();
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
const DEE_TO = '2027-11-02';

async function deeJourney(page: Page) {
  await setUpDee(page);
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
const COUPLE_TO = '2027-10-25';

async function jessAndTomJourney(page: Page) {
  await setUpJessAndTom(page);
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
const ALI_TO = '2027-11-02';

async function aliJourney(page: Page) {
  await setUpAli(page);
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
      await pay.locator(':scope > :is(h3, h4) > button').click();
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
