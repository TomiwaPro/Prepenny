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

import { expect, type TestInfo, test } from '@playwright/test';
import { LOCAL_SUPABASE } from '../lib/sign-in-config.ts';
import { strings } from '../strings/en-GB.ts';
import { openShare } from './jess-and-tom.ts';
import { openHome, phoneDays } from './journeys.ts';
import {
  allSent,
  budgetCard,
  fillBudget,
  inviteLink,
  JESS,
  jessLeaves,
  leftOn,
  newPhone,
  sameOnBoth,
  saveBudget,
  screenChecks,
  setUp,
  share,
  TODAY,
  TOM,
  tomJoins,
  YEAR_ON,
} from './paydays.ts';
import { radio } from './setup.ts';
import { newEmail } from './sign-in-helpers.ts';
import { everythingOnThePhone, personOn, quoted, signUpFromMore, sql } from './two-phones.ts';

const SCREENS = '../../docs/screens/4a';
const s = strings.share;
const b = strings.budgets;
const sheetWords = strings.budgetSheet;
const spending = strings.setup.spending;

/** Screenshots once, at 360px in light. */
const shoots = (info: TestInfo, colorScheme: string) =>
  info.project.name === 'sign-in-360' && colorScheme === 'light';

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
      // Whoever Tom invites next is told first, too.
      await openShare(tom.page);
      await expect(tom.page.getByTestId('invite-your-paydays')).toHaveText(
        s.inviteYourPaydays('Food and Meals out'),
      );
      await screenChecks(tom.page);
      await tom.page.goto('/app/budgets/');
      await expect(budgetCard(tom.page, 'Food').getByTestId('whose-paydays')).toHaveText(
        b.passedOnPaydays,
      );
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

/**
 * A change saved while the other phone is bringing the plan down comes whole,
 * or not yet (D521). Jess's food month and the paydays saved with it are in
 * two kinds of record. The server is held part-way through reading Tom's,
 * after the budgets and before the paydays, and Jess's food month is saved
 * at that moment. Read in one go, Tom gets neither, then both; read kind by
 * kind, as before, he got the paydays without the budget, counted past it,
 * and never asked for it again.
 */
test('3. A change saved while the other phone is bringing the plan down comes whole', async ({
  page,
  browser,
}, info) => {
  test.skip(
    info.project.name !== 'sign-in-360',
    'About the server, not the screen: run once, at 360px.',
  );
  test.setTimeout(300_000);
  await page.emulateMedia({ colorScheme: 'light' });
  await setUp(page, JESS);
  await signUpFromMore(page, newEmail('jess'));
  await share(page, 'Joint account', null);
  const tom = await newPhone(browser, info, 'light');
  await tomJoins(page, tom.page, await inviteLink(page), false);
  // A weekly budget, which needs none of Jess's monthly paydays.
  const travel = await fillBudget(page, 'Travel', '25', 'Joint account');
  await radio(travel.getByRole('group', { name: spending.every }), spending.week).check();
  await expect(travel.getByTestId('your-paydays')).toHaveCount(0);
  await saveBudget(travel);
  await allSent(page);
  const plan = sql(
    `select plan_id from public.plan_members where person_id = ${quoted(await personOn(page))}`,
  );
  const jess = await personOn(page);
  const token = await tom.page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem('prepenny-sign-in') ?? 'null') as { access_token: string })
        .access_token,
  );
  const version = sql('select app.database_version()');
  const bringDown = async (after: number) => {
    const response = await fetch(`${LOCAL_SUPABASE.url}/rest/v1/rpc/plan_changes`, {
      method: 'POST',
      headers: {
        apikey: LOCAL_SUPABASE.key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-prepenny-version': version,
      },
      body: JSON.stringify({ plan, shared_after: after, mine_after: 0 }),
    });
    expect(response.status).toBe(200);
    return (await response.json()) as {
      rows: { table: string; row: { seq: number; name?: string; person?: string } }[];
    };
  };
  const seen = Math.max(0, ...(await bringDown(0)).rows.map((one) => one.row.seq));

  // Reading this plan's budgets takes 2 seconds, for this test only.
  sql(`create or replace function tests.hold_budgets(plan uuid) returns boolean
    language plpgsql volatile as $$ begin
      if plan = ${quoted(plan)} then perform pg_sleep(2); end if;
      return true;
    end $$;
    grant execute on function tests.hold_budgets(uuid) to authenticated;
    create policy hold_for_a_test on public.budgets as restrictive for select to authenticated
      using (tests.hold_budgets(plan_id));`);
  try {
    const answer = bringDown(seen);
    // Until the server is held part-way through Tom's request.
    await expect
      .poll(
        () =>
          sql(`select count(*) from pg_stat_activity
            where wait_event = 'PgSleep' and query like '%plan_changes%'`),
        { timeout: 10_000, intervals: [50] },
      )
      .not.toBe('0');
    // Jess's food month, saved while Tom's phone is part-way through.
    sql(`insert into public.budgets (id, plan_id, account_id, name, amount, every, leaves,
        starts_on, made_at, follows_pay_of)
      select gen_random_uuid(), ${quoted(plan)}, a.id, 'Food', 30000, 'month', 'at-start',
        '2026-10-25', '2026-10-25T10:00:00Z', ${quoted(jess)}
      from public.accounts a where a.plan_id = ${quoted(plan)} and a.name = 'Joint account'`);
    const first = await answer;
    const has = (rows: typeof first.rows) => ({
      food: rows.some((one) => one.table === 'budgets' && one.row.name === 'Food'),
      paydays: rows.some((one) => one.table === 'paydays' && one.row.person === jess),
    });
    // Whole, or not yet: never the paydays without the budget.
    expect(has(first.rows)).toEqual({ food: false, paydays: false });
    const next = await bringDown(Math.max(seen, ...first.rows.map((one) => one.row.seq)));
    expect(has(next.rows)).toEqual({ food: true, paydays: true });
  } finally {
    sql(`drop policy if exists hold_for_a_test on public.budgets;
      drop function if exists tests.hold_budgets(uuid);`);
  }
  await tom.context.close();
});
