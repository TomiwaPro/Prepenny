// Step 4c, on one phone (D537 to D540), at 320px and 360px, in light and
// dark, with axe:
// 1. A new bank holiday arrives from PrePenny's own site, moves Rent, and
//    Home says so once, with "Got it" (D539, the owner's answer to question 4).
// 2. A payment's sheet says why it moved, and its weekend and bank holiday
//    rule is changed for this and all later ones (D538, D540).
// 3. With no signal, PrePenny uses the list built into it.
//
// Today is Sun 25 Oct 2026 (D201). The site's list is played by the test:
// the built-in one with a one-off bank holiday added, as GOV.UK added the
// coronation's. Nothing here signs in; two phones are in
// shared-bank-holidays.spec.ts.

import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { strings } from '../strings/en-GB.ts';
import { named } from './coming-up.ts';
import { siteHas, siteList } from './holiday-site.ts';
import { addPayment, day, noAxeProblems, noSidewaysScroll, undoBar } from './journeys.ts';
import { helperInCharge } from './offline-helper.ts';
import { makeAPlan } from './sign-in-helpers.ts';

const t = strings.home;
const SCREENS = '../../docs/screens/4c';

/** Screenshots at 360px in light and 320px in dark, as the owner looks at them. */
async function shoot(page: Page, info: TestInfo, colorScheme: string, name: string) {
  const width = info.project.name === 'phone-360' ? 360 : 320;
  if ((width === 360) !== (colorScheme === 'light')) return;
  await page.screenshot({ path: `${SCREENS}/${name}-${width}-${colorScheme}.png` });
}
const e = strings.edit;

/** A row's name for screen readers, starting with its name and date, as "Rent Fri 6 Nov". */
const dueAs = (name: string, date: string) => new RegExp(`^${name} ${day(date)} `);

const nextDue = (page: Page) =>
  page.getByTestId('next-due').getByRole('button', { name: named('Rent') });

/** Rent, £550 on the 8th of each month, moved to the working day before. */
async function addRent(page: Page) {
  await addPayment(page, {
    name: 'Rent',
    amount: '550',
    date: '2026-11-08',
    often: 'Every month, or every few months',
    weekend: 'Move to the working day before',
  });
}

/** Opens Rent's sheet from Home's next three due, by its date. */
async function openDue(page: Page, date: string) {
  // Finding a button by its name takes its spaces as plain ones.
  await page
    .getByTestId('next-due')
    .getByRole('button', { name: new RegExp(`^Rent ${date} `) })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Rent' });
  await expect(sheet).toBeVisible();
  return sheet;
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Bank holidays on one phone, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test("a new bank holiday arrives from PrePenny's site, moves Rent, and Home says so once", async ({
      context,
      page,
    }, info) => {
      // No list from the site yet: the plan uses the built-in one.
      const offline = await siteHas(context, 'no signal');
      await makeAPlan(page);
      await addRent(page);
      expect(offline.asked).toBeGreaterThan(0);
      // Sun 8 Nov moves to Fri 6 Nov; Tue 8 Dec and Fri 8 Jan keep their dates.
      await expect(nextDue(page)).toHaveCount(3);
      await expect(nextDue(page).nth(0)).toHaveAccessibleName(dueAs('Rent', 'Fri 6 Nov'));
      await expect(nextDue(page).nth(1)).toHaveAccessibleName(dueAs('Rent', 'Tue 8 Dec'));
      await expect(nextDue(page).nth(2)).toHaveAccessibleName(dueAs('Rent', 'Fri 8 Jan 2027'));
      await expect(page.getByTestId('holiday-note')).toHaveCount(0);

      // GOV.UK adds a one-off bank holiday on Tue 8 Dec 2026; PrePenny opens again.
      const site = await siteHas(context, siteList(['2026-12-08']));
      await page.reload();
      const note = page.getByTestId('holiday-note');
      await expect(note).toBeVisible();
      await expect(
        note.getByText(t.holidayMovedOne(day('Tue 8 Dec'), 'Rent', day('Mon 7 Dec')), {
          exact: true,
        }),
      ).toBeVisible();
      await expect(note).toHaveText(
        `A new bank holiday on ${day('Tue 8 Dec')} moved Rent to ${day('Mon 7 Dec')}.Got it`,
      );
      await expect(nextDue(page).nth(1)).toHaveAccessibleName(dueAs('Rent', 'Mon 7 Dec'));
      expect(site.asked).toBe(1);
      // Under the lowest point, which a 320 by 568 phone still shows first (D442).
      const lowest = await page.getByTestId('lowest-point').boundingBox();
      const noted = await note.boundingBox();
      expect((noted?.y ?? 0) > (lowest?.y ?? 0)).toBe(true);
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      await note.scrollIntoViewIfNeeded();
      await shoot(page, info, colorScheme, 'home-note');

      // The sheet says why it moved, and why November's moved.
      let sheet = await openDue(page, 'Mon 7 Dec');
      await expect(sheet.getByTestId('moved-from')).toHaveText(
        e.movedFrom(day('Tue 8 Dec'), e.movedBecause['bank-holiday']),
      );
      await expect(sheet.getByTestId('moved-from')).toHaveText(
        `Moved from ${day('Tue 8 Dec')}: bank holiday`,
      );
      await noAxeProblems(page);
      await shoot(page, info, colorScheme, 'sheet-moved-from');
      await sheet.getByRole('button', { name: strings.sheet.close }).click();
      await expect(sheet).toBeHidden();
      sheet = await openDue(page, 'Fri 6 Nov');
      await expect(sheet.getByTestId('moved-from')).toHaveText(
        `Moved from ${day('Sun 8 Nov')}: weekend`,
      );
      await sheet.getByRole('button', { name: strings.sheet.close }).click();

      // "Got it": the note goes, and doesn't come back. The list isn't fetched again for a week.
      await note.getByRole('button', { name: t.holidayGotIt }).click();
      await expect(note).toHaveCount(0);
      await page.reload();
      await expect(nextDue(page).nth(1)).toHaveAccessibleName(dueAs('Rent', 'Mon 7 Dec'));
      await expect(page.getByTestId('holiday-note')).toHaveCount(0);
      expect(site.asked).toBe(1);
    });

    test("changing Rent's weekend and bank holiday rule for this and all later ones", async ({
      context,
      page,
    }, info) => {
      await siteHas(context, siteList([]));
      await makeAPlan(page);
      await addRent(page);
      const sheet = await openDue(page, 'Fri 6 Nov');
      await expect(sheet.getByTestId('moved-from')).toHaveText(
        `Moved from ${day('Sun 8 Nov')}: weekend`,
      );
      // Only for this and all later ones.
      const rule = sheet.getByRole('group', { name: e.weekendRule });
      await expect(rule).toHaveCount(0);
      await sheet.getByRole('radio', { name: e.thisAndLater }).check();
      await expect(rule.getByRole('radio', { name: e.dayBefore })).toBeChecked();
      await noAxeProblems(page);
      await noSidewaysScroll(page);
      await rule.scrollIntoViewIfNeeded();
      await shoot(page, info, colorScheme, 'sheet-rule');
      await rule.getByRole('radio', { name: e.dayAfter }).check();
      await sheet.getByRole('button', { name: e.save }).click();
      await expect(sheet).toBeHidden();
      await expect(undoBar(page)).toContainText('Rent changed for this and all later ones.');
      await expect(nextDue(page).nth(0)).toHaveAccessibleName(dueAs('Rent', 'Mon 9 Nov'));

      // Keep the date: Sun 8 Nov, with nothing to say about a move.
      const again = await openDue(page, 'Mon 9 Nov');
      await expect(again.getByTestId('moved-from')).toHaveText(
        `Moved from ${day('Sun 8 Nov')}: weekend`,
      );
      await again.getByRole('radio', { name: e.thisAndLater }).check();
      await again
        .getByRole('group', { name: e.weekendRule })
        .getByRole('radio', { name: e.keepDate })
        .check();
      await again.getByRole('button', { name: e.save }).click();
      await expect(again).toBeHidden();
      await expect(nextDue(page).nth(0)).toHaveAccessibleName(dueAs('Rent', 'Sun 8 Nov'));
      const kept = await openDue(page, 'Sun 8 Nov');
      await expect(kept.getByTestId('moved-from')).toHaveCount(0);
      await kept.getByRole('button', { name: strings.sheet.close }).click();
      await expect(kept).toBeHidden();

      // Undo takes it back, one change at a time.
      await undoBar(page).getByRole('button', { name: strings.undo.undo }).click();
      await expect(nextDue(page).nth(0)).toHaveAccessibleName(dueAs('Rent', 'Mon 9 Nov'));
    });

    test('with no signal, PrePenny uses the bank holidays built into it', async ({
      context,
      page,
    }) => {
      const site = await siteHas(context, 'no signal');
      await makeAPlan(page);
      // Universal Credit on the 28th, moved to the working day before, as Dee's (brief 8.5).
      await addPayment(page, {
        kind: 'Coming in',
        name: 'Universal Credit',
        amount: '800',
        date: '2026-11-28',
        often: 'Every month, or every few months',
        weekend: 'Move to the working day before',
      });
      const credit = page
        .getByTestId('next-due')
        .getByRole('button', { name: named('Universal Credit') });
      // Sat 28 Nov to Fri 27 Nov; Mon 28 Dec, the Boxing Day bank holiday, to Thu 24 Dec.
      await expect(credit.nth(0)).toHaveAccessibleName(dueAs('Universal Credit', 'Fri 27 Nov'));
      await expect(credit.nth(1)).toHaveAccessibleName(dueAs('Universal Credit', 'Thu 24 Dec'));
      // And with no signal at all, PrePenny opening from the phone itself.
      await helperInCharge(page);
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByTestId('offline-note')).toBeVisible();
      await expect(credit.nth(1)).toHaveAccessibleName(dueAs('Universal Credit', 'Thu 24 Dec'));
      await page
        .getByTestId('next-due')
        .getByRole('button', { name: /^Universal Credit Thu 24 Dec / })
        .click();
      const sheet = page.getByRole('dialog', { name: 'Universal Credit' });
      await expect(sheet.getByTestId('moved-from')).toHaveText(
        `Moved from ${day('Mon 28 Dec')}: bank holiday`,
      );
      await noAxeProblems(page);
      await sheet.getByRole('button', { name: strings.sheet.close }).click();
      await expect(page.getByTestId('holiday-note')).toHaveCount(0);
      await context.setOffline(false);
      expect(site.asked).toBeGreaterThan(0);
    });
  });
}
