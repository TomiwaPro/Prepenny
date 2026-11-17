// Step 4c, with two people on two phones (D536, D539), against the local
// Supabase, at 320px and 360px in light and dark, with axe: in a shared
// plan, both phones agree on every date, a year ahead, whichever phone
// fetched the new bank holiday list first, and both say once on Home which
// payment the new bank holiday moved.
//
// Jess shares her current account with Tom, as brief 8.7, and adds Council
// tax on the 8th of each month, moved to the working day before. PrePenny's
// site then has a new one-off bank holiday on Tue 8 Dec 2026. Only one phone
// gets it from the site; the other's site answers nothing, as with no
// signal for that one file, so the list can only reach it through the account.
// From step 4e the database has fetched the same list itself, as only such a
// list is taken (D545).

import { expect, type Page, test } from '@playwright/test';
import { type PlanRecords, workOutPlan } from '@prepenny/engine';
import { strings } from '../strings/en-GB.ts';
import { databaseFetched, siteHas, siteList } from './holiday-site.ts';
import { jessAndTom } from './jess-and-tom.ts';
import { addPayment, day, holidaysOf, noAxeProblems, openHome } from './journeys.ts';
import { differences, sharedDays, TODAY, YEAR_ON } from './paydays.ts';
import { ownRecords } from './setup.ts';
import { personOn, quoted, secondPhone, signIn, sql } from './two-phones.ts';

const t = strings.home;

/** Council tax's dates a year ahead, as the plan on a phone works them out with its own list. */
function councilTaxDates(records: PlanRecords): string[] {
  const plan = workOutPlan({
    ...records,
    mainPayFamilyId: records.settings?.mainPayFamilyId ?? null,
    holidays: holidaysOf(records),
    today: TODAY,
    to: YEAR_ON,
  });
  return plan.accounts
    .flatMap((account) => account.rows)
    .filter((row) => row.payment.name === 'Council tax')
    .map((row) => row.date);
}

/**
 * A week later on this phone: it fetches the list from PrePenny's site again
 * when it opens. The note of when it last fetched is taken off the phone,
 * which is what a week passing does.
 */
async function aWeekLater(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((done, failed) => {
        const request = indexedDB.open('prepenny');
        request.onerror = () => failed(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const gone = db
            .transaction('device', 'readwrite')
            .objectStore('device')
            .delete('bank-holidays-fetched');
          gone.onsuccess = () => {
            db.close();
            done();
          };
          gone.onerror = () => failed(gone.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByTestId('balance')).toBeVisible();
}

/** The list this phone last fetched from PrePenny's site, as kept, or null when it has none. */
async function fetchedOn(page: Page): Promise<unknown> {
  return page.evaluate(
    () =>
      new Promise<unknown>((done, failed) => {
        const request = indexedDB.open('prepenny');
        request.onerror = () => failed(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const found = db.transaction('device').objectStore('device').get('bank-holidays-fetched');
          found.onsuccess = () => {
            db.close();
            done((found.result as { value?: { copy?: unknown } } | undefined)?.value?.copy ?? null);
          };
          found.onerror = () => failed(found.error);
        };
      }),
  );
}

const NEW_LIST = siteList(['2026-12-08']);

for (const [first, colorScheme] of [
  ['Jess', 'light'],
  ['Tom', 'dark'],
  ['Tom', 'light'],
  ['Jess', 'dark'],
] as const) {
  test(`both phones agree on every date a year ahead when ${first}'s phone gets the new list first, in ${colorScheme}`, async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ colorScheme });
    await siteHas(page.context(), 'no signal');
    const tom = await jessAndTom(page, browser, info, colorScheme);
    await siteHas(tom.context, 'no signal');
    await addPayment(page, {
      name: 'Council tax',
      amount: '120',
      date: '2026-11-08',
      often: 'Every month, or every few months',
      weekend: 'Move to the working day before',
    });
    // Both phones have it, on the built-in list: Fri 6 Nov (Sun 8 Nov), then Tue 8 Dec.
    for (const phone of [page, tom.page]) {
      await expect
        .poll(async () => councilTaxDates(await ownRecords(phone)).slice(0, 2), { timeout: 30_000 })
        .toEqual(['2026-11-06', '2026-12-08']);
    }

    // The site has the new bank holiday, and the database has fetched it
    // too (D545). Only the first phone gets it from there.
    databaseFetched(NEW_LIST);
    const [firstPhone, otherPhone] = first === 'Jess' ? [page, tom.page] : [tom.page, page];
    const asked = await siteHas(firstPhone.context(), NEW_LIST);
    await aWeekLater(firstPhone);
    await expect.poll(() => asked.asked, { timeout: 20_000 }).toBeGreaterThan(0);

    // Both phones end on the new list, through the account for the other one.
    for (const phone of [firstPhone, otherPhone]) {
      await expect
        .poll(async () => (await ownRecords(phone)).bankHolidays?.version, { timeout: 30_000 })
        .toBe(NEW_LIST.version);
    }
    // The other phone never had the new list from the site: it came through the account.
    expect(((await fetchedOn(otherPhone)) as { version?: string } | null)?.version).not.toBe(
      NEW_LIST.version,
    );

    // Every date and every day's balance a year ahead is the same on both phones.
    const jessRecords = await ownRecords(page);
    const tomRecords = await ownRecords(tom.page);
    expect(councilTaxDates(jessRecords)).toEqual(councilTaxDates(tomRecords));
    expect(councilTaxDates(jessRecords).slice(0, 3)).toEqual([
      '2026-11-06',
      '2026-12-07',
      '2027-01-08',
    ]);
    const [jessDays, tomDays] = await sharedDays(page, tom.page);
    expect(Object.keys(jessDays)).toEqual(['Current account']);
    expect(Object.keys(jessDays['Current account'] ?? {})).toHaveLength(366);
    expect(differences(jessDays, tomDays)).toEqual([]);

    // Each phone says so once on Home, with Got it.
    for (const phone of [page, tom.page]) {
      await openHome(phone);
      const note = phone.getByTestId('holiday-note');
      await expect(note).toBeVisible({ timeout: 20_000 });
      await expect(
        note.getByText(t.holidayMovedOne(day('Tue 8 Dec'), 'Council tax', day('Mon 7 Dec')), {
          exact: true,
        }),
      ).toBeVisible();
      await noAxeProblems(phone);
      await note.getByRole('button', { name: t.holidayGotIt }).click();
      await expect(note).toHaveCount(0);
    }
    // A third phone signing in as Tom later gets the plan with its list,
    // and no note: nothing on it moved for him there (D543).
    if (colorScheme === 'light') {
      const address = sql(
        `select email from auth.users where id = ${quoted(await personOn(tom.page))}`,
      );
      const third = await secondPhone(browser, info, colorScheme);
      await siteHas(third.context, 'no signal');
      await signIn(third.page, address);
      await expect(third.page).toHaveURL(/\/app\/$/, { timeout: 30_000 });
      await expect(third.page.getByTestId('balance')).toBeVisible();
      await expect
        .poll(async () => (await ownRecords(third.page)).bankHolidays?.version, { timeout: 30_000 })
        .toBe(NEW_LIST.version);
      await expect
        .poll(async () => councilTaxDates(await ownRecords(third.page)), { timeout: 30_000 })
        .toEqual(councilTaxDates(tomRecords));
      await third.page.reload();
      await expect(third.page.getByTestId('balance')).toBeVisible();
      await expect(third.page.getByTestId('holiday-note')).toHaveCount(0);
      await third.context.close();
    }
    await tom.context.close();
  });
}
