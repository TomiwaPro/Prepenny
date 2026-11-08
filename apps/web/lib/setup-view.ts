// What first-time setup shows that only the engine can work out (brief 4.1,
// step 2e): this week and this month for a new budget (D29, D108, D230),
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
   * This week and this month for a new budget, the ones with today in them
   * (D29, D108): a budget in setup starts in them (D230). Null before
   * there's an account.
   */
  readonly budgetPeriods: { readonly week: Period; readonly month: Period } | null;
  /** "Here's your plan" (screen 6, D356). Null before there's an account. */
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

export interface Period {
  readonly start: string;
  readonly end: string;
}

export interface Reached {
  readonly name: string;
  readonly date: string;
  readonly isEstimate: boolean;
}

const PROBE_WEEK = 'setup-probe-week';
const PROBE_MONTH = 'setup-probe-month';

/** This week and this month for a weekly and a monthly budget that start today. */
function budgetPeriodsOf(records: PlanRecords, today: string): SetupView['budgetPeriods'] {
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
  const periodOf = (id: string): Period => {
    const current = plan.budgets.find((one) => one.budget.id === id)?.current ?? null;
    return current === null
      ? { start: today, end: today }
      : { start: current.start, end: current.end };
  };
  return { week: periodOf(PROBE_WEEK), month: periodOf(PROBE_MONTH) };
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
    budgetPeriods: budgetPeriodsOf(records, today),
    summary: summaryOf(records, today),
  };
}
