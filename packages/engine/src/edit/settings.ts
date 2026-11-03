// The main pay and the nation whose bank holidays apply, as one settings
// record (D14, D155). Each change is one edit, so one undo (D87).

import type { PlanSettings } from '../balance/types.ts';
import { NATIONS, type Nation } from '../dates/bank-holiday-rules.ts';
import { type Context, refuse } from './context.ts';

/** The nation of a bank holiday calendar, when the holidays given are one. */
function nationOf(holidays: unknown): Nation | null {
  const nation = (holidays as { nation?: unknown } | null)?.nation;
  return (NATIONS as readonly unknown[]).includes(nation) ? (nation as Nation) : null;
}

/**
 * The plan's settings as they are now in this edit. Before any have been
 * saved, they're the ones the edit was given: the main pay in use and the
 * nation of its bank holidays.
 */
function settingsNow(context: Context): PlanSettings | null {
  return context.draft.get({ kind: 'settings', value: null }) as PlanSettings | null;
}

/**
 * Chooses the main pay (D14, D155): a family of money coming in, or none.
 * Plan periods, Left to spend and "Move to next payday" follow it.
 */
export function chooseMainPay(context: Context, familyId: string | null): void {
  if (familyId !== null) {
    if (typeof familyId !== 'string' || familyId === '') {
      refuse('bad-command', 'The main pay must be a family id, or null.');
    }
    const family = context.checked.prepared.filter(
      (one) => one.series.familyId === familyId && !context.checked.budgets.has(one.series.id),
    );
    if (family.length === 0) {
      refuse('unknown-family', `There's no payment in family ${familyId} to be the main pay.`);
    }
    if (family.some((one) => one.series.direction !== 'in')) {
      refuse('main-pay-not-coming-in', `Family ${familyId} isn't money coming in.`);
    }
  }
  const now = settingsNow(context);
  const nation =
    now?.nation ??
    nationOf(context.input.holidays) ??
    refuse('no-nation', 'Choose the nation for bank holidays first.');
  context.draft.set({ kind: 'settings', value: { nation, mainPayFamilyId: familyId } });
}

/** Sets the nation whose bank holidays apply (brief 4.3, 5.7, D155). */
export function setNation(context: Context, nation: Nation): void {
  if (!(NATIONS as readonly unknown[]).includes(nation)) {
    refuse('bad-nation', 'The nation must be england-and-wales, scotland or northern-ireland.');
  }
  const now = settingsNow(context);
  context.draft.set({
    kind: 'settings',
    value: {
      nation,
      mainPayFamilyId: now === null ? context.input.mainPayFamilyId : now.mainPayFamilyId,
    },
  });
}
