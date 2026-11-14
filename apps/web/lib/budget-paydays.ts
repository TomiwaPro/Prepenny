// Whose paydays a budget follows, in words (step 4a, D508, D512 to D514).
// In a shared plan, a budget's weeks and months follow the main pay of the
// person who added it, on every phone, and the other person's phone gets
// those paydays, the dates only. Before such a budget is shared, the person
// adding it is told; the Budgets screen says whose paydays each follows;
// and once the person who added it has left, it says it's passed on.

import {
  addDays,
  type Budget,
  type BudgetEvery,
  type BudgetLeaves,
  formatDate,
  type PlanRecords,
  parseDate,
} from '@prepenny/engine';
import { strings } from '../strings/en-GB.ts';
import { settingsOf } from './plan-input.ts';

const t = strings.budgets;

/**
 * Whether a shared budget of this person's gives their partner's phone their
 * paydays, the dates only (D512): by the database's own rule (D516, D522),
 * so the person is told exactly when that's so. A weekly budget, when any
 * part of their main pay comes every week or every few weeks; a monthly
 * one, when any part comes every month. Never for a pay-later card, which
 * follows its bill, nor for irregular pay, whose budgets run Monday to Sunday.
 */
export function followsMyPaydays(
  records: PlanRecords,
  every: BudgetEvery,
  leaves: BudgetLeaves,
): boolean {
  if (leaves === 'pay-later') return false;
  const family = settingsOf(records).mainPayFamilyId;
  if (family === null) return false;
  const parts = records.series.filter((one) => one.familyId === family);
  if (parts.length === 0 || parts.some((one) => one.schedule.kind === 'irregular')) return false;
  return parts.some((one) =>
    every === 'week'
      ? one.schedule.kind === 'weekly'
      : one.schedule.kind === 'monthly' && one.schedule.every === 1,
  );
}

/** How long after a budget ends it may still be in its last month: the database's two months (D522). */
const LAST_MONTH_DAYS = 62;

/**
 * This person's budgets, in the accounts given, whose money leaves on their
 * paydays, so their partner's phone gets those paydays: named before an
 * account is shared or someone is invited (D514, D518).
 */
export function budgetsOnMyPaydays(
  records: PlanRecords,
  today: string,
  inAccount: (accountId: string) => boolean,
): string[] {
  const since = formatDate(addDays(parseDate(today, 'today'), -LAST_MONTH_DAYS));
  return (records.budgets ?? [])
    .filter(
      (one: Budget) =>
        inAccount(one.accountId) &&
        one.followsPayOf === undefined &&
        (one.endsOn === undefined || one.endsOn >= since) &&
        followsMyPaydays(records, one.every, one.leaves),
    )
    .map((one) => one.name);
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
  // Someone in the plan now sees it leave on these paydays: that comes first,
  // over the note that it was passed on (D518).
  if (facts.followsPaydays && facts.partner !== null) {
    return t.partnerSeesYourPaydays(facts.partner);
  }
  if (facts.passedOn) {
    if (facts.followsPaydays) return t.passedOnPaydays;
    return facts.every === 'week' ? t.passedOnWeeks : t.passedOnMonths;
  }
  return null;
}
