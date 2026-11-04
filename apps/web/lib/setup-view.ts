// What first-time setup shows that only the engine can work out (brief 4.1,
// step 2e): the day a new budget's next week or month starts (D29, D108),
// and on "Here's your plan" the lowest point ahead, Left to spend, the first
// debt paid off and the first savings goal reached. It runs in the
// background worker, like Home (D170).

import {
  type Budget,
  debtsLookAhead,
  type PlanRecords,
  workOutDebts,
  workOutGoals,
} from '@prepenny/engine';
import { holidaysFor } from './holidays.ts';
import { type HomeView, homeAccountId, workOutHome } from './home.ts';
import { planLookAhead, settingsOf, workOutPlanTo } from './plan-input.ts';

export interface SetupView {
  readonly today: string;
  /**
   * The first day on or after today that a new budget's week or month
   * starts (D29, D108): a new budget starts then, so it never takes money
   * for days already gone. Null before there's an account.
   */
  readonly budgetStarts: { readonly week: string; readonly month: string } | null;
  /** "Here's your plan" (step 8). Null before there's an account. */
  readonly summary: SetupSummary | null;
}

export interface SetupSummary {
  /** Home's account (D168), the one the summary is about. */
  readonly accountName: string;
  /** That account's warning level, for "Under £20 from Mon 26 Oct." */
  readonly warningLevel: number;
  readonly lowest: HomeView['lowest'];
  readonly leftToSpend: HomeView['leftToSpend'];
  /** The debt paid off first, looking 24 months ahead (D43). */
  readonly firstDebt: Reached | null;
  /** The savings goal reached first, looking 24 months ahead (D114). */
  readonly firstGoal: Reached | null;
}

export interface Reached {
  readonly name: string;
  readonly date: string;
  readonly isEstimate: boolean;
}

const PROBE_WEEK = 'setup-probe-week';
const PROBE_MONTH = 'setup-probe-month';

/** The first day on or after today that a weekly and a monthly budget start. */
function budgetStartsOf(records: PlanRecords, today: string): SetupView['budgetStarts'] {
  const account = records.accounts.find((one) => one.closed !== true);
  if (account === undefined) return null;
  const probe = (id: string, every: Budget['every']): Budget => ({
    id,
    accountId: account.id,
    name: id,
    amount: 100,
    every,
    leaves: 'at-start',
    rollOver: false,
    startsOn: today,
    createdAt: '1970-01-01T00:00:00Z',
  });
  const plan = workOutPlanTo(
    {
      ...records,
      budgets: [...(records.budgets ?? []), probe(PROBE_WEEK, 'week'), probe(PROBE_MONTH, 'month')],
    },
    today,
    planLookAhead(today, 3),
  );
  const startOf = (id: string): string => {
    const periods = plan.budgets.find((one) => one.budget.id === id)?.periods ?? [];
    const found = periods.find((period) => period.start >= today);
    return found?.start ?? today;
  };
  return { week: startOf(PROBE_WEEK), month: startOf(PROBE_MONTH) };
}

function firstOf(list: readonly (Reached | null)[]): Reached | null {
  let first: Reached | null = null;
  for (const one of list) {
    if (one !== null && (first === null || one.date < first.date)) first = one;
  }
  return first;
}

function summaryOf(records: PlanRecords, today: string): SetupSummary | null {
  if (records.accounts.length === 0) return null;
  const home = workOutHome(records, today);
  const holidays = holidaysFor(settingsOf(records).nation);
  const to = debtsLookAhead(today);
  const debts =
    (records.debts ?? []).length === 0
      ? []
      : workOutDebts({ ...records, debts: records.debts ?? [], holidays, today, to }).debts;
  const goals =
    (records.goals ?? []).length === 0
      ? []
      : workOutGoals({ ...records, goals: records.goals ?? [], holidays, today, to }).goals;
  const accountId = homeAccountId(records);
  return {
    accountName: records.accounts.find((one) => one.id === accountId)?.name ?? '',
    warningLevel: home.account.warningLevel,
    lowest: home.lowest,
    leftToSpend: home.leftToSpend,
    firstDebt: firstOf(
      debts.map((one) =>
        one.paidOffOn === null
          ? null
          : { name: one.debt.name, date: one.paidOffOn, isEstimate: one.isEstimate },
      ),
    ),
    firstGoal: firstOf(
      goals.map((one) =>
        one.reachedOn === null
          ? null
          : { name: one.goal.name, date: one.reachedOn, isEstimate: one.isEstimate },
      ),
    ),
  };
}

export function workOutSetupView(records: PlanRecords, today: string): SetupView {
  return {
    today,
    budgetStarts: budgetStartsOf(records, today),
    summary: summaryOf(records, today),
  };
}
