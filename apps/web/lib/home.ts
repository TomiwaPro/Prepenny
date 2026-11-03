// Everything the Home screen shows (brief 4.9, the Home sketch in
// ARCHITECTURE.md 4.6), worked out by the engine from the stored records.
// It runs in the background worker. It holds only figures, dates and the
// names people typed; the words around them come from the strings file.

import {
  type AccountPlan,
  type BalanceStatus,
  groupIntoPeriods,
  type Pence,
  type Plan,
  type PlanRecords,
} from '@prepenny/engine';
import { HOME_MONTHS_AHEAD, planLookAhead, workOutPlanTo } from './plan-input.ts';
import { type RowView, rowMaker } from './rows.ts';

export type LeftToSpendLine =
  | { readonly kind: 'spend-no-more-than'; readonly amount: Pence }
  | { readonly kind: 'under-even-spending-nothing'; readonly date: string };

export interface HomeView {
  readonly today: string;
  /** The plan's last day: Home looks this far ahead, 12 months (D178). */
  readonly lookAheadTo: string;
  readonly account: {
    readonly name: string;
    readonly balance: Pence;
    readonly checkedOn: string;
    readonly warningLevel: Pence;
  };
  /** Null when there's no main pay (D112). */
  readonly leftToSpend: {
    readonly amount: Pence;
    /** "until Fri 30 Oct" for a payday, "to Fri 30 Apr" for the month's end (D144). */
    readonly runsTo: 'payday' | 'month-end';
    readonly until: string;
    readonly lastDay: string;
    readonly line: LeftToSpendLine | null;
    readonly payLater: readonly { readonly left: Pence; readonly until: string }[];
  } | null;
  readonly mainPayEnded: boolean;
  readonly lowest: LowestView;
  /** "This pay has to cover": this pay period's money out and in (D84). Null without pay periods. */
  readonly cover: {
    readonly goingOut: Pence;
    readonly comingIn: Pence;
    /** The period's last day: "Going out by Thu 29 Oct". */
    readonly by: string;
  } | null;
  /** The next three rows from today on that aren't ticked (D168, D179). */
  readonly nextDue: readonly RowView[];
}

/** Lowest point ahead, with its warning (brief 5.5, D8, D82). */
export interface LowestView {
  readonly balance: Pence;
  readonly date: string;
  /** The name of the payment it's after, or null when nothing has gone out yet. */
  readonly after: string | null;
  readonly status: BalanceStatus;
  /** The first day under the warning level (D8), when it's under. */
  readonly underWarningFrom: string | null;
  /** The first shortfall: "£95.47 short on Sun 1 Nov" (D82). */
  readonly short: { readonly amount: Pence; readonly date: string } | null;
}

/**
 * Home's account: the one the main pay arrives in, otherwise the first
 * current account, otherwise the first account (D168).
 */
export function homeAccountId(records: PlanRecords): string {
  const open = records.accounts.filter((account) => account.closed !== true);
  const mainPay = records.settings?.mainPayFamilyId ?? null;
  const pay = records.series.find((one) => one.familyId === mainPay && one.direction === 'in');
  const chosen =
    open.find((account) => account.id === pay?.accountId) ??
    open.find((account) => account.kind === 'current') ??
    open[0] ??
    records.accounts[0];
  if (chosen === undefined) {
    throw new Error('The plan has no accounts.');
  }
  return chosen.id;
}

/** Works out the plan for Home, looking 12 months ahead (D178). */
export function workOutHomePlan(records: PlanRecords, today: string): Plan {
  return workOutPlanTo(records, today, planLookAhead(today, HOME_MONTHS_AHEAD));
}

/** An account's lowest point ahead and its first warning (brief 5.5). */
export function lowestOf(account: AccountPlan): LowestView {
  const lowest = account.lowestPoint;
  const short = account.shortfalls[0];
  return {
    balance: lowest.balance,
    date: lowest.date,
    after: lowest.after?.payment.name ?? null,
    status: lowest.status,
    underWarningFrom: account.firstUnderWarning?.date ?? null,
    short: short === undefined ? null : { amount: short.amount, date: short.date },
  };
}

function leftToSpendOf(account: AccountPlan): HomeView['leftToSpend'] {
  const left = account.leftToSpend;
  if (left === null) return null;
  let line: LeftToSpendLine | null = null;
  if (left.underEvenSpendingNothing !== null) {
    line = { kind: 'under-even-spending-nothing', date: left.underEvenSpendingNothing };
  } else if (left.spendNoMoreThan !== null) {
    line = { kind: 'spend-no-more-than', amount: left.spendNoMoreThan };
  }
  return {
    amount: left.amount,
    runsTo: left.runsTo,
    until: left.until,
    lastDay: left.lastDay,
    line,
    payLater: left.payLater.map((one) => ({ left: one.left, until: one.until })),
  };
}

function coverOf(plan: Plan, accountId: string): HomeView['cover'] {
  if (plan.mainPay === 'none' || plan.mainPayEnded) return null;
  const periods = groupIntoPeriods(plan, 'pay');
  if (periods.by !== 'pay') return null;
  const first = periods.accounts.find((one) => one.accountId === accountId)?.periods[0];
  if (first === undefined) return null;
  let goingOut = 0;
  for (const row of first.rows) {
    if (row.change < 0) goingOut -= row.change;
  }
  return { goingOut, comingIn: first.cameIn, by: first.to };
}

/** Everything Home shows, from the stored records and today. */
export function workOutHome(records: PlanRecords, today: string): HomeView {
  const plan = workOutHomePlan(records, today);
  const accountId = homeAccountId(records);
  const account = plan.accounts.find((one) => one.account.id === accountId);
  if (account === undefined) {
    throw new Error(`No plan for account ${accountId}.`);
  }
  const makeRow = rowMaker(plan, records);
  return {
    today,
    lookAheadTo: plan.to,
    account: {
      name: account.account.name ?? '',
      balance: account.start.balance,
      checkedOn: account.start.checkedOn,
      warningLevel: account.account.warningLevel,
    },
    leftToSpend: leftToSpendOf(account),
    mainPayEnded: plan.mainPayEnded,
    lowest: lowestOf(account),
    cover: coverOf(plan, accountId),
    nextDue: account.rows
      .filter((row) => !row.atStart && !row.ticked && row.date >= today)
      .slice(0, 3)
      .map((row) => makeRow(row, null)),
  };
}
