// What the What if screen shows (brief 4.10, D135, the What if sketch in
// ARCHITECTURE.md 4.6): the practice changes made in turn, with the same
// commands as real changes, on a copy of the plan, and the real plan and the
// practice plan side by side. For each account shown: the lowest point ahead,
// with Tight or Short, and the first shortfall with the payments that could
// move (D69). For each debt: Paid off on, or what's still left. For each
// savings goal: the date it's reached. Worked out in the background worker
// from the engine's `whatIf`, so every figure comes from the engine. Nothing
// is saved: the practice plan's records come back for the sheets to use.

import {
  type DayBalance,
  debtsLookAhead,
  type EditCommand,
  type MinorUnits,
  type Pence,
  type PlanRecords,
  type Shortfall,
  whatIf,
} from '@prepenny/engine';
import { homeAccountId } from './home.ts';
import { editInputOf, HOME_MONTHS_AHEAD, planLookAhead } from './plan-input.ts';

/** A payment that could move to fix a shortfall (D69). */
export interface CouldMoveView {
  readonly name: string;
  readonly date: string;
  /** What it does to the account: below zero for money going out. */
  readonly change: Pence;
}

/** The first shortfall ahead, with the payments that could move (brief 5.5, D69, D82). */
export interface ShortfallView {
  readonly amount: Pence;
  readonly date: string;
  /** Where the payments would move to: the first main payday after the short day. */
  readonly moveTo: string | null;
  /** Biggest first (D69). */
  readonly couldMove: readonly CouldMoveView[];
}

/** One side of an account: the lowest point ahead, its status, and the first shortfall. */
export interface LowestSide {
  readonly balance: Pence;
  readonly date: string;
  /** The payment the lowest point is after, or null when it's today's balance before any payment. */
  readonly after: string | null;
  readonly status: DayBalance['status'];
  readonly shortfall: ShortfallView | null;
}

export interface AccountSides {
  readonly id: string;
  readonly name: string;
  readonly real: LowestSide;
  readonly practice: LowestSide;
}

export interface DebtSide {
  readonly paidOffOn: string | null;
  /** What's still left on the last day looked at, in the debt's own currency, when it isn't paid off. */
  readonly leftAtEnd: MinorUnits | null;
  readonly isEstimate: boolean;
}

export interface DebtSides {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly real: DebtSide;
  readonly practice: DebtSide;
}

export interface GoalSide {
  readonly reachedOn: string | null;
  readonly savedAtEnd: Pence;
  readonly isEstimate: boolean;
}

export interface GoalSides {
  readonly id: string;
  readonly name: string;
  readonly real: GoalSide;
  readonly practice: GoalSide;
}

export interface WhatIfView {
  readonly today: string;
  /** The last day the lowest point looks at: 12 months ahead, like Home (D178). */
  readonly to: string;
  /** The last day debts and goals look at: 24 months ahead (D43, D114). */
  readonly debtsTo: string;
  /** The practice plan's records, for the sheets to make the next practice change on. */
  readonly records: PlanRecords;
  /**
   * Home's account first (D168), then any other account the practice changes
   * (step 2g), so nothing that moves is hidden and nothing that doesn't adds
   * clutter.
   */
  readonly accounts: readonly AccountSides[];
  /** Open accounts not shown, because the practice doesn't change them: "Your other accounts don't change." */
  readonly otherAccounts: number;
  readonly debts: readonly DebtSides[];
  readonly goals: readonly GoalSides[];
  /** Keeping would change the real plan: the practice isn't the same as it. */
  readonly changed: boolean;
}

/** How many payments that could move are shown before "Show all" (D69). */
export const COULD_MOVE_SHOWN = 3;

function shortfallOf(shortfall: Shortfall | undefined): ShortfallView | null {
  if (shortfall === undefined) return null;
  return {
    amount: shortfall.amount,
    date: shortfall.date,
    moveTo: shortfall.moveTo,
    couldMove: shortfall.couldMove.map((row) => ({
      name: row.payment.name,
      date: row.date,
      change: row.change,
    })),
  };
}

function lowestSide(lowestPoint: DayBalance, shortfalls: readonly Shortfall[]): LowestSide {
  return {
    balance: lowestPoint.balance,
    date: lowestPoint.date,
    after: lowestPoint.after?.payment.name ?? null,
    status: lowestPoint.status,
    shortfall: shortfallOf(shortfalls[0]),
  };
}

const sameSide = (a: LowestSide, b: LowestSide) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The real plan and the practice plan side by side, with the practice
 * changes made in turn (D135). A practice change the engine can't make is
 * refused with its usual code.
 */
export function workOutWhatIfView(
  records: PlanRecords,
  today: string,
  practice: readonly EditCommand[],
): WhatIfView {
  const to = planLookAhead(today, HOME_MONTHS_AHEAD);
  const debtsTo = debtsLookAhead(today);
  const result = whatIf({ ...editInputOf(records, today), to, debtsTo }, practice);
  const names = new Map(records.accounts.map((one) => [one.id, one.name ?? '']));
  const home = homeAccountId(records);
  const accounts = result.accounts
    .map(
      (one): AccountSides => ({
        id: one.accountId,
        name: names.get(one.accountId) ?? '',
        real: lowestSide(one.real.lowestPoint, one.real.shortfalls),
        practice: lowestSide(one.practice.lowestPoint, one.practice.shortfalls),
      }),
    )
    .filter((one) => one.id === home || !sameSide(one.real, one.practice))
    .sort((a, b) => (a.id === home ? -1 : b.id === home ? 1 : 0));
  const shown = new Set(accounts.map((one) => one.id));
  const otherAccounts = records.accounts.filter(
    (one) => one.closed !== true && !shown.has(one.id),
  ).length;
  const debtNames = new Map((records.debts ?? []).map((one) => [one.id, one]));
  const goals = new Map((records.goals ?? []).map((one) => [one.id, one]));
  return {
    today,
    to,
    debtsTo,
    records: result.practice.records,
    accounts,
    otherAccounts,
    // Closed debts and goals aren't counted any more (D99, D153), so they aren't shown.
    debts: result.debts
      .filter((one) => debtNames.get(one.debtId)?.closed !== true)
      .map((one) => ({
        id: one.debtId,
        name: debtNames.get(one.debtId)?.name ?? '',
        currency: debtNames.get(one.debtId)?.currency ?? 'GBP',
        real: one.real,
        practice: one.practice,
      }))
      .sort(byPaidOff),
    goals: result.goals
      .filter((one) => goals.get(one.goalId)?.closed !== true)
      .map((one) => ({
        id: one.goalId,
        name: goals.get(one.goalId)?.name ?? '',
        real: one.real,
        practice: one.practice,
      })),
    changed: result.keep.writes.length > 0,
  };
}

/** Paid off first, first, as on the Debts screen (D235); those still owed at the end last. */
function byPaidOff(a: DebtSides, b: DebtSides): number {
  const one = a.real.paidOffOn;
  const two = b.real.paidOffOn;
  if (one === null || two === null) return (one === null ? 1 : 0) - (two === null ? 1 : 0);
  return one < two ? -1 : one > two ? 1 : 0;
}
