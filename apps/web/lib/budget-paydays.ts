// Whose paydays a budget follows, in words (step 4a, D508, D512 to D514).
// In a shared plan, a budget's weeks and months follow the main pay of the
// person who added it, on every phone, and the other person's phone gets
// those paydays, the dates only. Before such a budget is shared, the person
// adding it is told; the Budgets screen says whose paydays each follows;
// and once the person who added it has left, it says it's passed on.

import type { BudgetEvery, BudgetLeaves, PlanRecords } from '@prepenny/engine';
import { ownPaydaysFollowed } from '@prepenny/engine';
import { strings } from '../strings/en-GB.ts';
import { holidaysFor } from './holidays.ts';
import { settingsOf } from './plan-input.ts';

const t = strings.budgets;

/**
 * Whether a budget of this person's would leave on their own paydays (D29,
 * D108): then, once it's shared, their partner's phone gets those paydays,
 * the dates only (D512), as the database works them out by the same rule.
 */
export function followsMyPaydays(
  records: PlanRecords,
  today: string,
  every: BudgetEvery,
  leaves: BudgetLeaves,
): boolean {
  if (leaves === 'pay-later') return false;
  const settings = settingsOf(records);
  const own = ownPaydaysFollowed({
    series: records.series,
    changes: records.changes ?? [],
    mainPayFamilyId: settings.mainPayFamilyId,
    holidays: holidaysFor(settings.nation),
    today,
  });
  return every === 'week' ? own.week : own.month;
}

/** What the Budgets screen says about whose paydays a budget follows, or null. */
export interface BudgetPaydaysFacts {
  /** Someone else's, by name, when it follows theirs (D508). */
  readonly followsName: string | null;
  /** Whether it follows someone else's at all. */
  readonly followsSomeoneElse: boolean;
  /** Its weeks or months line up with the paydays it follows. */
  readonly followsPaydays: boolean;
  readonly every: BudgetEvery;
  readonly leaves: BudgetLeaves;
  /** It's in an account everyone in the plan sees. */
  readonly shared: boolean;
  /** The partner's name, or "Your partner", when someone else is in the plan; null when nobody is. */
  readonly partner: string | null;
  /** It was passed on to this person when the person who added it left (D513). */
  readonly passedOn: boolean;
}

export function budgetPaydaysLine(facts: BudgetPaydaysFacts): string | null {
  if (!facts.shared || facts.leaves === 'pay-later') return null;
  if (facts.followsSomeoneElse) {
    return facts.followsPaydays && facts.followsName !== null
      ? t.onTheirPaydays(facts.followsName)
      : null;
  }
  if (facts.passedOn) {
    if (facts.followsPaydays) return t.passedOnPaydays;
    return facts.every === 'week' ? t.passedOnWeeks : t.passedOnMonths;
  }
  return facts.followsPaydays && facts.partner !== null
    ? t.partnerSeesYourPaydays(facts.partner)
    : null;
}
