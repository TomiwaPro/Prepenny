// The six people's journeys again (step 3i), now signed in, on two phones,
// against the local Supabase (README.md, "Checks"): brief Part 2's six
// people, as in e2e/people.spec.ts (step 2h, D268), with sign-in, sync
// between two phones, sharing where it fits and changes made offline.
//
// Each person sets PrePenny up through the screens on their phone, exactly
// as in people.spec.ts, and signs up. A second phone signs in and brings the
// plan down; Jess and Tom instead share their three accounts, and Tom joins
// on his own phone. The first phone loses its signal and adds a payment,
// which waits on it, then goes when the signal is back and reaches the
// second phone. The second phone adds one, which reaches the first.
//
// After every step, the plan on each phone is read back and every day's
// balance, a year ahead (Sam's to the end of February 2027), is checked
// against the person's fixture, with the same changes made by plain
// arithmetic (journeys.ts). Each person runs at 320px in light and 360px in
// dark (D497), with axe.

import { expect, type Page, test } from '@playwright/test';
import type { PlanRecords } from '@prepenny/engine';
import { build, kofiSteps } from '../../../packages/engine/test/fixtures/from-empty.ts';
import {
  aliPlan,
  deePlan,
  jessAndTomPlan,
  priyaPlan,
} from '../../../packages/engine/test/fixtures/people.ts';
import { samPlan } from '../../../packages/engine/test/fixtures/sam.ts';
import { strings } from '../strings/en-GB.ts';
import { allSentOn, inviteTom } from './jess-and-tom.ts';
import {
  addPayment,
  type Days,
  daysOf,
  expectDays,
  noAxeProblems,
  noSidewaysScroll,
  openHome,
  recordsOfFixture,
  type Shift,
  withShifts,
} from './journeys.ts';
import { helperInCharge } from './offline-helper.ts';
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
import { newEmail } from './sign-in-helpers.ts';
import { openMore, secondPhone, signIn, signUpFromMore } from './two-phones.ts';

const t = strings.account;

interface Person {
  readonly name: string;
  readonly today: string;
  readonly to: string;
  /** Sets the plan up on a phone with nothing on it, ending on Home. */
  readonly setUp: (page: Page) => Promise<void>;
  /** The plan just after setup, from the person's fixture. */
  readonly records: () => PlanRecords;
  /** The account the payments are added to, when there's more than one to choose from. */
  readonly account: string;
  readonly chooseAccount: boolean;
}

const goToPlan = async (page: Page) => {
  await page.getByRole('button', { name: 'Go to my plan' }).click();
  await expect(page.getByTestId('balance')).toBeVisible();
};

const PEOPLE: readonly Person[] = [
  {
    name: 'Sam',
    today: SAM_TODAY,
    to: SAM_TO,
    setUp: setUpSam,
    records: () => recordsOfFixture(samPlan()),
    account: 'Current account',
    chooseAccount: true,
  },
  {
    name: 'Priya',
    today: PRIYA_TODAY,
    to: '2027-10-25',
    setUp: async (page) => {
      await setUpPriya(page);
      await goToPlan(page);
    },
    records: () => withSetupRules(recordsOfFixture(priyaPlan()), PRIYA_TODAY, PRIYA_ALREADY_SPENT),
    account: 'Current account',
    chooseAccount: true,
  },
  {
    name: 'Dee',
    today: DEE_TODAY,
    to: '2027-11-02',
    setUp: setUpDee,
    records: () => withSetupRules(recordsOfFixture(deePlan()), DEE_TODAY, {}),
    account: 'Current account',
    chooseAccount: false,
  },
  {
    name: 'Kofi',
    today: KOFI_TODAY,
    to: '2027-10-27',
    setUp: async (page) => {
      await setUpKofi(page);
      await goToPlan(page);
    },
    records: () => {
      const steps = kofiSteps();
      const atSetup = build(
        steps.slice(0, steps.findIndex((one) => one.command.kind === 'choose-main-pay') + 1),
      );
      return withSetupRules(atSetup.records, KOFI_TODAY, KOFI_ALREADY_SPENT);
    },
    account: 'Current account',
    chooseAccount: true,
  },
  {
    name: 'Jess and Tom',
    today: COUPLE_TODAY,
    to: '2027-10-25',
    setUp: setUpJessAndTom,
    records: () => withSetupRules(recordsOfFixture(jessAndTomPlan()), COUPLE_TODAY, {}),
    account: 'Joint account',
    chooseAccount: true,
  },
  {
    name: 'Ali',
    today: ALI_TODAY,
    to: '2027-11-02',
    setUp: setUpAli,
    records: () => {
      // His fixture, without the books people.spec.ts adds later.
      const fixture = recordsOfFixture(aliPlan());
      return withSetupRules(
        { ...fixture, series: fixture.series.filter((one) => one.id !== 'books') },
        ALI_TODAY,
        {},
      );
    },
    account: 'Student account',
    chooseAccount: false,
  },
];

/** A date `days` after `from`. */
function after(from: string, days: number): string {
  return new Date(Date.parse(`${from}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Waits until a phone's plan has these balances, however long the change takes to reach it. */
async function arrives(page: Page, expected: Days, person: Person) {
  await expect(async () => {
    await expectDays(page, expected, person.today, person.to);
  }).toPass({ timeout: 70_000 });
}

for (const person of PEOPLE) {
  test(`${person.name}: set up, signed up, on two phones, with a change made offline`, async ({
    page,
    context,
    browser,
  }, info) => {
    const colorScheme = info.project.name === 'sign-in-320' ? 'light' : 'dark';
    test.setTimeout(420_000);
    await page.emulateMedia({ colorScheme });
    const records = person.records();
    const shifts: Shift[] = [];
    const expected = () => withShifts(daysOf(records, person.today, person.to), shifts);
    // Tom's phone works the plan out with his own main pay (D289), and he
    // has none, so the joint account's food budget runs by calendar month
    // there (D29), where Jess's runs from her payday: a question for the
    // owner (PLAN.md, "Waiting for the owner"). Everyone else's second phone
    // is the same person's, with the same main pay.
    const withoutMainPay: PlanRecords =
      records.settings === undefined
        ? records
        : { ...records, settings: { ...records.settings, mainPayFamilyId: null } };
    const otherExpected = () =>
      person.name === 'Jess and Tom'
        ? withShifts(daysOf(withoutMainPay, person.today, person.to), shifts)
        : expected();

    // Set up on the screens, exactly as in people.spec.ts, then sign up.
    await person.setUp(page);
    await expectDays(page, expected(), person.today, person.to);
    const address = newEmail(person.name.toLowerCase().replaceAll(' ', '-'));
    await signUpFromMore(page, address);

    // The second phone: Jess and Tom share their accounts and Tom joins on
    // his own; everyone else signs in on a second phone of their own.
    let other: Awaited<ReturnType<typeof secondPhone>>;
    if (person.name === 'Jess and Tom') {
      await page.goto('/app/share/accounts/');
      for (const name of ['Jess current account', 'Tom current account', 'Joint account']) {
        await page.getByRole('checkbox', { name }).check();
      }
      await page.getByRole('button', { name: strings.share.shareThese }).click();
      await page
        .getByRole('dialog', { name: /^Share .*\?$/ })
        .getByRole('button', { name: strings.share.confirmYes })
        .click();
      await expect(page.getByTestId('share-said')).toContainText('Shared:', { timeout: 20_000 });
      other = await inviteTom(page, browser, info, colorScheme, 'Tom', person.today);
    } else {
      other = await secondPhone(browser, info, colorScheme, person.today);
      await signIn(other.page, address);
      await expect(other.page).toHaveURL(/\/app\/$/);
    }
    await arrives(other.page, otherExpected(), person);
    await openHome(other.page);
    await noAxeProblems(other.page);
    await noSidewaysScroll(other.page);

    // No signal on the first phone: a payment added there waits on it.
    await helperInCharge(page);
    await context.setOffline(true);
    const firstDate = after(person.today, 5);
    await addPayment(page, {
      name: 'Dentist',
      amount: '45',
      date: firstDate,
      often: 'Once',
      ...(person.chooseAccount ? { account: person.account } : {}),
    });
    const beforeIt = otherExpected();
    shifts.push([person.account, firstDate, -4500]);
    await expectDays(page, expected(), person.today, person.to);
    await openMore(page);
    await expect(page.getByTestId('where-kept')).toHaveText(t.unsent(1));
    await noAxeProblems(page);
    // Nothing of it reaches the other phone while there's no signal.
    await expectDays(other.page, beforeIt, person.today, person.to);

    // The signal comes back: it goes, and reaches the other phone.
    await context.setOffline(false);
    await allSentOn(page);
    await arrives(other.page, otherExpected(), person);

    // A payment added on the other phone reaches the first.
    const secondDate = after(person.today, 6);
    await addPayment(other.page, {
      name: 'Window cleaner',
      amount: '12',
      date: secondDate,
      often: 'Once',
      ...(person.chooseAccount ? { account: person.account } : {}),
    });
    shifts.push([person.account, secondDate, -1200]);
    await allSentOn(other.page);
    await arrives(page, expected(), person);
    await expectDays(other.page, otherExpected(), person.today, person.to);
    await openHome(page);
    await noAxeProblems(page);
    await noSidewaysScroll(page);
    await other.context.close();
  });
}
