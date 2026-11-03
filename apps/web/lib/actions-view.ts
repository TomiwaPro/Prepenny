// What the four actions on Home need from the plan (brief 4.2, 4.3, 4.5,
// 4.9): for Update balance, each account's balance, what the plan expected
// by the end of today (D46), the lowest point ahead and the payments from
// today or earlier waiting for a tick; for I spent, each budget's spent and
// left this week or month; for Add a payment, the debts and savings goals a
// payment can be linked to (D160); for I did overtime and I missed a shift,
// the pay with a pay profile. Worked out in the background worker, from the
// engine's own figures.

import type { BudgetEvery, BudgetLeaves, Pence, PlanRecords } from '@prepenny/engine';
import { homeAccountId, type LowestView, lowestOf, workOutHomePlan } from './home.ts';
import { type RowView, rowMaker } from './rows.ts';

export interface BalanceAccount {
  readonly id: string;
  readonly name: string;
  /** The latest balance update. */
  readonly balance: Pence;
  readonly checkedOn: string;
  readonly checkedAt: string;
  /** What the plan expects by the end of today, before anything is ticked (D46). */
  readonly expected: Pence;
  /** Looking 12 months ahead, as Home does (D178). */
  readonly lowest: LowestView;
  /** Payments dated today or earlier that aren't ticked, oldest first: the ones that can be ticked (D11, D109). */
  readonly toTick: readonly RowView[];
}

export interface BudgetView {
  readonly id: string;
  readonly name: string;
  readonly accountId: string;
  readonly every: BudgetEvery;
  readonly leaves: BudgetLeaves;
  /** This week or month: the one with today in it, or the budget's first when it starts later (D107). */
  readonly current: {
    readonly start: string;
    readonly end: string;
    readonly base: Pence;
    readonly rolledOver: Pence;
    readonly amount: Pence;
    readonly spent: Pence;
    readonly left: Pence;
  };
}

export interface PayView {
  /** A series of the pay, for the overtime and missed shift commands. */
  readonly seriesId: string;
  readonly familyId: string;
  readonly name: string;
  /** The rate last used for overtime on this pay, or the pay profile's (brief 4.3: the rate is remembered). */
  readonly overtimeRate: string | null;
  /** The hours of the last overtime or missed shift saved on this pay, to start the box with. */
  readonly lastHours: { readonly overtime: string | null; readonly missed: string | null };
}

export interface ActionsView {
  readonly today: string;
  /** Home's account: the one chosen first in Update balance (D168). */
  readonly homeAccountId: string;
  /** Open accounts, in the order they were made. */
  readonly accounts: readonly BalanceAccount[];
  /** Budgets that haven't ended, in the order they were made. */
  readonly budgets: readonly BudgetView[];
  /** Open debts and savings goals, for "Add a payment" (D160). */
  readonly debts: readonly { readonly id: string; readonly name: string }[];
  readonly goals: readonly {
    readonly id: string;
    readonly name: string;
    readonly accountId: string;
  }[];
  /** Pay with a pay profile, the main pay first. */
  readonly pay: readonly PayView[];
}

/** The rows that can be ticked: payments, pay-later bills and money set aside. Budget rows and spends never are (D109). */
const tickable = (row: RowView) => row.editing !== 'none';

function payOf(records: PlanRecords): PayView[] {
  const profiles = new Map((records.payProfiles ?? []).map((one) => [one.id, one]));
  const mainPay = records.settings?.mainPayFamilyId ?? null;
  const families = new Map<string, PayView>();
  for (const series of records.series) {
    if (series.direction !== 'in' || series.payProfileId === undefined) continue;
    if (families.has(series.familyId)) continue;
    const profile = profiles.get(series.payProfileId);
    const saved = (records.payAdjustments ?? []).filter((one) => one.familyId === series.familyId);
    const lastOvertime = saved.filter((one) => one.kind === 'overtime').at(-1);
    const lastMissed = saved.filter((one) => one.kind === 'missed-shift').at(-1);
    families.set(series.familyId, {
      seriesId: series.id,
      familyId: series.familyId,
      name: series.name,
      overtimeRate: lastOvertime?.rate ?? profile?.overtimeRate ?? null,
      lastHours: { overtime: lastOvertime?.hours ?? null, missed: lastMissed?.hours ?? null },
    });
  }
  const pay = [...families.values()];
  return [
    ...pay.filter((one) => one.familyId === mainPay),
    ...pay.filter((one) => one.familyId !== mainPay),
  ];
}

/** Everything the four actions need, from the stored records and today. */
export function workOutActionsView(records: PlanRecords, today: string): ActionsView {
  const plan = workOutHomePlan(records, today);
  const makeRow = rowMaker(plan, records);
  const accounts = plan.accounts
    .filter((account) => account.account.closed !== true)
    .map(
      (account): BalanceAccount => ({
        id: account.account.id,
        name: account.account.name ?? '',
        balance: account.start.balance,
        checkedOn: account.start.checkedOn,
        checkedAt: account.start.checkedAt,
        expected: account.expected,
        lowest: lowestOf(account),
        toTick: account.rows
          .filter((row) => !row.ticked && row.date <= today)
          .map((row) => makeRow(row, null))
          .filter(tickable),
      }),
    );
  const budgets = plan.budgets.flatMap((one): BudgetView[] => {
    const current = one.current;
    if (current === null) return [];
    return [
      {
        id: one.budget.id,
        name: one.budget.name,
        accountId: one.budget.accountId,
        every: one.budget.every,
        leaves: one.budget.leaves,
        current: {
          start: current.start,
          end: current.end,
          base: current.base,
          rolledOver: current.rolledOver,
          amount: current.amount,
          spent: current.spent,
          left: current.left,
        },
      },
    ];
  });
  return {
    today,
    homeAccountId: homeAccountId(records),
    accounts,
    budgets,
    debts: (records.debts ?? [])
      .filter((debt) => debt.closed !== true)
      .map((debt) => ({ id: debt.id, name: debt.name })),
    goals: (records.goals ?? [])
      .filter((goal) => goal.closed !== true)
      .map((goal) => ({ id: goal.id, name: goal.name, accountId: goal.accountId })),
    pay: payOf(records),
  };
}
