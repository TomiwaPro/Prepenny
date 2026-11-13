// What if (brief 4.10, D135), at 320px and 360px wide, in light and dark,
// checked by axe: the owner's step 2g tests 1 and 2. Practice changes are
// made with the same sheets as real ones, on the practice plan's payments.
// "Today" is Sun 25 Oct 2026 on Sam's example; Kofi's test plan is his
// fixture from step 1g, with his today, Wed 28 Oct 2026 (D201).

import type { Locator, Page } from '@playwright/test';
import { fixtureRecords } from '../../../packages/engine/test/fixtures/from-empty.ts';
import { kofiPlan } from '../../../packages/engine/test/fixtures/people.ts';
import { TEST_SETTING_KEY, type TestSetting } from '../lib/test-setting.ts';
import { axeOnceStill } from './axe.ts';
import { AXE_TAGS, layoutProblems, MINUS, named, openPeriod, period } from './coming-up.ts';
import { expect, settingScript, test } from './fixtures.ts';

async function useSetting(page: Page, setting: TestSetting) {
  await page.addInitScript(settingScript, [TEST_SETTING_KEY, setting] as const);
}

async function noAxeProblems(page: Page) {
  expect((await (await axeOnceStill(page)).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
}

async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(wide).toBeLessThanOrEqual(0);
}

const undoBar = (page: Page) => page.getByTestId('undo-bar');

/** A payment's row in the practice plan, in the payday that starts on `start`. */
async function practiceRow(page: Page, start: string, name: string): Promise<Locator> {
  await openPeriod(page, start);
  return period(page, start).getByRole('button', { name: named(name) });
}

/** Opens What if from Coming up's "What if" button. */
async function openWhatIfFromComingUp(page: Page) {
  await page.goto('/app/coming-up/');
  await expect(page.getByTestId('period').first()).toBeVisible();
  const line = page.getByTestId('what-if-line');
  await expect(line).toContainText('Try changes in practice, then keep them or throw them away.');
  await line.getByRole('link', { name: 'Try a change' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'What if' })).toBeVisible();
  await expect(page.getByTestId('side-by-side')).toBeVisible();
}

/** The lowest point, side by side, for one account. */
const accountSides = (page: Page, name: string) =>
  page.locator(`[data-testid="what-if-account"][data-account="${name}"]`);

/** Changes Sam's Fri 30 Oct pay to £503.06 for just this one, in practice. */
async function lowerFridayPay(page: Page) {
  const row = await practiceRow(page, '2026-10-30', 'Pay');
  await row.click();
  const sheet = page.getByRole('dialog', { name: 'Pay' });
  await sheet.getByLabel('Amount').fill('503.06');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('practice-list')).toContainText('Pay changed for just this one.');
}

/** "Throw them away" asks first (step 2h); "Keep practising" keeps them, then it's asked again. */
async function throwAway(page: Page, question: string) {
  await page.getByRole('button', { name: 'Throw them away' }).click();
  const sheet = page.getByRole('dialog', { name: 'Throw them away' });
  await expect(sheet).toContainText(question);
  await expect(sheet).toContainText('Your real plan stays exactly as it was.');
  await noAxeProblems(page);
  await sheet.getByRole('button', { name: 'Keep practising' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('practice-list')).toBeVisible();
  await page.getByRole('button', { name: 'Throw them away' }).click();
  await sheet.getByRole('button', { name: 'Throw them away' }).click();
  await expect(sheet).toBeHidden();
}

const DEBTS = [
  ['Pay-later card', 'Thu 29 Oct'],
  ['Pay in 3', 'Sun 6 Dec'],
  ['Family loan', 'Fri 1 Jan 2027'],
  ['Laptop loan', 'Sat 20 Feb 2027'],
  ['Sofa finance', 'Mon 23 Aug 2027'],
  ['Credit card', 'Wed 15 Mar 2028, an estimate'],
] as const;

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`What if, in ${colorScheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
    });

    test("test 1: Sam's Fri 30 Oct pay at £503.06 is Short beside the real Tight, then thrown away and kept", async ({
      page,
    }) => {
      await openWhatIfFromComingUp(page);
      await expect(
        page.getByText(
          "Practice mode. Try changes here. Your real plan doesn't change unless you keep them.",
        ),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to Coming up' })).toBeVisible();
      await expect(page.getByTestId('practice-changes')).toContainText(
        'No practice changes yet. Make one below.',
      );
      await noAxeProblems(page);

      await lowerFridayPay(page);
      const current = accountSides(page, 'Current account');
      // Savings doesn't change, so it isn't shown, and the screen says so (step 2h).
      await expect(page.getByTestId('what-if-account')).toHaveCount(1);
      await expect(page.getByTestId('other-accounts')).toHaveText(
        "Your other accounts don't change.",
      );
      await expect(current.getByTestId('real')).toContainText('£4.53');
      await expect(current.getByTestId('real')).toContainText('Sun 1 Nov, after Rent');
      await expect(current.getByTestId('real')).toContainText('Tight');
      await expect(current.getByTestId('practice')).toContainText(`${MINUS}£95.47`);
      await expect(current.getByTestId('practice')).toContainText('Sun 1 Nov, after Rent');
      await expect(current.getByTestId('practice')).toContainText('Short');
      const short = current.getByTestId('practice-short');
      await expect(short).toContainText("In practice, you'd be £95.47 short on Sun 1 Nov.");
      await expect(short).toContainText('Moving one of these payments to Fri 6 Nov would fix it.');
      await expect(short.getByTestId('could-move').locator('li')).toHaveText([
        `Pay-later cardThu 29 Oct${MINUS}£466.07`,
        `Family loanMon 26 Oct${MINUS}£125.00`,
        `Driving lessonMon 26 Oct${MINUS}£100.00`,
      ]);
      await expect(current.getByTestId('real-short')).toHaveCount(0);
      // Every paid-off date is the same.
      const debts = page.getByTestId('what-if-debt');
      await expect(debts).toHaveCount(DEBTS.length);
      for (const [index, [name, date]] of DEBTS.entries()) {
        const debt = debts.nth(index);
        await expect(debt.getByRole('heading')).toHaveText(name);
        await expect(debt.locator('[data-side="real"]')).toHaveText(date);
        await expect(debt.locator('[data-side="practice"]')).toHaveText(date);
      }
      // The practice plan's own payments show the change; nothing was saved.
      await expect(await practiceRow(page, '2026-10-30', 'Pay')).toContainText('+£503.06');
      await expect(undoBar(page)).toHaveCount(0);
      await noAxeProblems(page);
      await noSidewaysScroll(page);

      // Throw them away, after one question: the real plan is exactly as before.
      await throwAway(page, 'Throw away 1 practice change?');
      await expect(page.getByTestId('what-if-note')).toHaveText(
        'Practice changes thrown away. Your real plan is exactly as it was.',
      );
      await expect(page.getByTestId('what-if-note')).toBeFocused();
      await expect(current.getByTestId('practice')).toContainText('£4.53');
      await page.getByRole('link', { name: 'Back to Coming up' }).click();
      // What if shows a practice copy of Coming up, with the same lowest point
      // and the same paydays, Fri 30 Oct open. So wait for Coming up itself
      // before reading them: reading the old page found Fri 30 Oct open, so
      // it wasn't tapped, and the new page then showed it closed (D364).
      await expect(page.getByRole('heading', { level: 1, name: 'Coming up' })).toBeVisible();
      await expect(page.getByTestId('side-by-side')).toHaveCount(0);
      await expect(page.getByTestId('plan-lowest')).toContainText(
        'Lowest point: £4.53 on Sun 1 Nov, after Rent',
      );
      await openPeriod(page, '2026-10-30');
      await expect(
        period(page, '2026-10-30').getByRole('button', { name: named('Pay') }),
      ).toContainText('+£603.06');

      // Again, and Keep these changes: one change, which one Undo puts back.
      await page.getByTestId('what-if-line').getByRole('link', { name: 'Try a change' }).click();
      await expect(page.getByTestId('side-by-side')).toBeVisible();
      await lowerFridayPay(page);
      await expect(page.getByTestId('practice-changes')).toContainText(
        'They go into your real plan as one change, and one Undo takes them all back.',
      );
      await page.getByRole('button', { name: 'Keep these changes' }).click();
      await expect(undoBar(page)).toContainText('Your practice change is now in your plan.');
      await expect(undoBar(page).getByRole('button', { name: 'Undo' })).toBeFocused();
      await expect(page.getByTestId('practice-changes')).toContainText(
        'No practice changes yet. Make one below.',
      );
      // Now it's the real plan, so both sides show it.
      await expect(current.getByTestId('real')).toContainText(`${MINUS}£95.47`);
      await noAxeProblems(page);
      await undoBar(page).getByRole('button', { name: 'Undo' }).click();
      await expect(undoBar(page)).toHaveText('Change undone.');
      await expect(current.getByTestId('real')).toContainText('£4.53');
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Home' })
        .click();
      await expect(page.getByTestId('lowest-point')).toContainText('£4.53');
    });

    test('test 2: Kofi with no work next week is £237.75 short on Thu 5 Nov beside £156.00', async ({
      page,
    }) => {
      await useSetting(page, { plan: fixtureRecords(kofiPlan()), today: '2026-10-28' });
      await page.goto('/app/more/');
      await page.getByRole('link', { name: /^What if/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'What if' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to More' })).toBeVisible();
      await expect(page.getByTestId('side-by-side')).toBeVisible();
      // Next week is Mon 2 Nov to Sun 8 Nov (D14): skip each platform's
      // estimate, coming in (the money set aside for tax has the same name).
      for (const name of ['Rides', 'Deliveries', 'Parcels']) {
        const row = (await practiceRow(page, '2026-11-02', name)).filter({ hasText: '+£' });
        await row.click();
        const sheet = page.getByRole('dialog', { name });
        await sheet.getByRole('button', { name: 'Skip this one' }).click();
        await expect(sheet).toBeHidden();
      }
      await expect(page.getByTestId('practice-list').locator('li')).toHaveText([
        'Rides skipped.',
        'Deliveries skipped.',
        'Parcels skipped.',
      ]);
      const current = accountSides(page, 'Current account');
      await expect(current.getByTestId('real')).toContainText('£156.00');
      await expect(current.getByTestId('real')).toContainText('Thu 5 Nov, after Van finance');
      await expect(current.getByTestId('real')).not.toContainText('Short');
      await expect(current.getByTestId('practice')).toContainText(`${MINUS}£237.75`);
      await expect(current.getByTestId('practice')).toContainText('Thu 5 Nov, after Van finance');
      await expect(current.getByTestId('practice')).toContainText('Short');
      await expect(current.getByTestId('practice-short')).toContainText(
        "In practice, you'd be £237.75 short on Thu 5 Nov.",
      );
      await noAxeProblems(page);
      await noSidewaysScroll(page);

      // Throwing it away leaves the real plan exactly as before.
      await throwAway(page, 'Throw away 3 practice changes?');
      await expect(current.getByTestId('practice')).toContainText('£156.00');
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Home' })
        .click();
      await expect(page.getByTestId('lowest-point')).toContainText('£156.00');
      await expect(page.getByTestId('lowest-point')).toContainText('Thu 5 Nov');
    });
  });
}

test('the practice changes stay after PrePenny is closed and opened again, and take back one at a time (step 2h)', async ({
  page,
}) => {
  await openWhatIfFromComingUp(page);
  await lowerFridayPay(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click();
  await page.getByRole('link', { name: /^What if/ }).click();
  await expect(page.getByTestId('practice-list')).toContainText('Pay changed for just this one.');
  // Closing PrePenny and opening it again keeps them, until they're kept or thrown away.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'What if' })).toBeVisible();
  await expect(page.getByTestId('practice-list')).toContainText('Pay changed for just this one.');
  await expect(accountSides(page, 'Current account').getByTestId('practice')).toContainText(
    `${MINUS}£95.47`,
  );
  // Nothing was saved to the real plan.
  await expect(accountSides(page, 'Current account').getByTestId('real')).toContainText('£4.53');
  await page.getByRole('button', { name: 'Take back the last change' }).click();
  await expect(page.getByTestId('what-if-note')).toHaveText(
    'The last practice change is taken back.',
  );
  await expect(accountSides(page, 'Current account').getByTestId('practice')).toContainText(
    '£4.53',
  );
  // Taken back is kept too.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'What if' })).toBeVisible();
  await expect(page.getByTestId('side-by-side')).toBeVisible();
  await expect(page.getByTestId('practice-list')).toHaveCount(0);
});

test('two practice changes ask "Throw away 2 practice changes?" (step 2h)', async ({ page }) => {
  await openWhatIfFromComingUp(page);
  await lowerFridayPay(page);
  const row = await practiceRow(page, '2026-10-30', 'Spending money');
  await row.click();
  const sheet = page.getByRole('dialog', { name: 'Spending money' });
  await sheet.getByRole('button', { name: 'Skip this one' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('practice-list').getByRole('listitem')).toHaveCount(2);
  await throwAway(page, 'Throw away 2 practice changes?');
  await page.reload();
  await expect(page.getByTestId('side-by-side')).toBeVisible();
  await expect(page.getByTestId('practice-list')).toHaveCount(0);
});

test('changes that cancel each other out leave nothing to keep (found by the outside review)', async ({
  page,
}) => {
  await openWhatIfFromComingUp(page);
  // The driving lesson on Mon 26 Oct at £90.00, then back to £100.00.
  for (const amount of ['90', '100']) {
    await page
      .locator('[data-testid="period"][data-start="2026-10-25"]')
      .getByRole('button', { name: named('Driving lesson') })
      .click();
    const sheet = page.getByRole('dialog', { name: 'Driving lesson' });
    await sheet.getByLabel('Amount').fill(amount);
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet).toBeHidden();
  }
  await expect(page.getByTestId('practice-list').locator('li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Keep these changes' }).click();
  await expect(page.getByTestId('what-if-note')).toHaveText(
    'Your practice changes cancel each other out, so there was nothing to keep. Your real plan is exactly as it was.',
  );
  await expect(undoBar(page)).toHaveCount(0);
});

test('after Keep, a practice change that removes a row never puts focus on the real Undo (found by the outside review)', async ({
  page,
}) => {
  await openWhatIfFromComingUp(page);
  await lowerFridayPay(page);
  await page.getByRole('button', { name: 'Keep these changes' }).click();
  await expect(undoBar(page)).toContainText('Your practice change is now in your plan.');
  const lesson = page
    .locator('[data-testid="period"][data-start="2026-10-25"]')
    .getByRole('button', { name: named('Driving lesson') });
  await lesson.click();
  const sheet = page.getByRole('dialog', { name: 'Driving lesson' });
  await sheet.getByRole('button', { name: 'Skip this one' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Your practice changes', exact: true }),
  ).toBeFocused();
  await expect(page.getByTestId('practice-list')).toContainText('Driving lesson skipped.');
});

test('stays readable with text at 200%, and every tap target is big enough', async ({ page }) => {
  await openWhatIfFromComingUp(page);
  await lowerFridayPay(page);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(page.getByTestId('practice-short')).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
});

/**
 * Keeps the phone's own database busy for `ms` milliseconds, as a slow or
 * busy phone can, so PrePenny's next save there waits until then. A reload
 * straight after a practice change must still find the list as the screen
 * last showed it (D264), however long the phone takes to save it (D510).
 */
async function holdPhoneStorage(page: Page, ms: number) {
  await page.evaluate(
    (hold) =>
      new Promise<void>((started, failed) => {
        const request = indexedDB.open('prepenny');
        request.onerror = () => failed(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const store = db.transaction('device', 'readwrite').objectStore('device');
          const until = performance.now() + hold;
          const again = () => {
            if (performance.now() < until) store.count().onsuccess = again;
          };
          again();
          // Closes once the held transaction ends.
          db.close();
          started();
        };
      }),
    ms,
  );
}

test('a practice change, taking one back and throwing them away are kept on the phone before the screen says so, even on a slow phone (D510)', async ({
  page,
}) => {
  await openWhatIfFromComingUp(page);
  // Made: a reload straight after still has it.
  await holdPhoneStorage(page, 2000);
  await lowerFridayPay(page);
  await page.reload();
  await expect(page.getByTestId('side-by-side')).toBeVisible();
  await expect(page.getByTestId('practice-list')).toContainText('Pay changed for just this one.');
  // A second one, taken back: a reload straight after has only the first.
  const row = await practiceRow(page, '2026-10-30', 'Spending money');
  await row.click();
  const spending = page.getByRole('dialog', { name: 'Spending money' });
  await spending.getByRole('button', { name: 'Skip this one' }).click();
  await expect(spending).toBeHidden();
  await expect(page.getByTestId('practice-list').getByRole('listitem')).toHaveCount(2);
  await holdPhoneStorage(page, 2000);
  await page.getByRole('button', { name: 'Take back the last change' }).click();
  await expect(page.getByTestId('what-if-note')).toHaveText(
    'The last practice change is taken back.',
  );
  await page.reload();
  await expect(page.getByTestId('side-by-side')).toBeVisible();
  await expect(page.getByTestId('practice-list').getByRole('listitem')).toHaveCount(1);
  // Thrown away: a reload straight after has none.
  await page.getByRole('button', { name: 'Throw them away' }).click();
  const sheet = page.getByRole('dialog', { name: 'Throw them away' });
  await expect(sheet).toContainText('Throw away 1 practice change?');
  await holdPhoneStorage(page, 2000);
  await sheet.getByRole('button', { name: 'Throw them away' }).click();
  await expect(sheet).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('side-by-side')).toBeVisible();
  await expect(page.getByTestId('practice-list')).toHaveCount(0);
});

test('Keep removes the practice changes from the phone before saying they are in the plan, so they can never be kept a second time (D510)', async ({
  page,
}) => {
  // Notes, in order, when the phone removes something it keeps for this
  // device, and when the undo bar first says the changes are in the plan.
  await page.addInitScript(() => {
    const seen: string[] = [];
    Reflect.set(window, '__seen', seen);
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (
      this: IDBObjectStore,
      key: IDBValidKey | IDBKeyRange,
    ) {
      if (this.name === 'device') seen.push(`removed ${String(key)}`);
      return remove.call(this, key);
    };
    new MutationObserver(() => {
      const kept = '[data-testid="undo-bar"][data-words*="now in your plan"]';
      if (!seen.includes('said kept') && document.querySelector(kept) !== null) {
        seen.push('said kept');
      }
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-words'],
    });
  });
  await openWhatIfFromComingUp(page);
  await lowerFridayPay(page);
  // Only what Keep does is noted.
  await page.evaluate(() => {
    (Reflect.get(window, '__seen') as string[]).length = 0;
  });
  await page.getByRole('button', { name: 'Keep these changes' }).click();
  await expect(undoBar(page)).toContainText('Your practice change is now in your plan.');
  const seen = await page.evaluate(() => Reflect.get(window, '__seen') as string[]);
  const removed = seen.findIndex((one) => one.startsWith('removed what-if|'));
  expect(removed).toBeGreaterThanOrEqual(0);
  expect(removed).toBeLessThan(seen.indexOf('said kept'));
  // So a reload straight after has nothing left to keep, and the real plan has it once.
  await page.reload();
  await expect(page.getByTestId('side-by-side')).toBeVisible();
  await expect(page.getByTestId('practice-list')).toHaveCount(0);
  await expect(accountSides(page, 'Current account').getByTestId('real')).toContainText(
    `${MINUS}£95.47`,
  );
  await expect(accountSides(page, 'Current account').getByTestId('practice')).toContainText(
    `${MINUS}£95.47`,
  );
});
