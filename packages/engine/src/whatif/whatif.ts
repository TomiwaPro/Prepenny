// What if (brief 4.10, ARCHITECTURE.md 2.1, D135): a safe practice mode.
// Practice changes are made with the same edit commands as real ones, on a
// copy of the plan's records, and the real plan and the practice plan are
// worked out side by side. Nothing is saved: throwing the practice away
// leaves the real plan exactly as it was, and keeping it gives one edit to
// save, which is one undo step.

import { workOutPlan } from '../balance/plan.ts';
import type { DayBalance, Plan, Shortfall } from '../balance/types.ts';
import { debtsLookAhead, workOutDebts } from '../debts/debts.ts';
import type { DebtsPlan } from '../debts/types.ts';
import { editPlan } from '../edit/edit.ts';
import { applyWrites, Draft } from '../edit/records.ts';
import type { Edit, EditCommand, EditInput, PlanRecords } from '../edit/types.ts';
import { EngineInputError } from '../errors.ts';
import { workOutGoals } from '../goals/goals.ts';
import type { GoalsPlan } from '../goals/types.ts';
import type { MinorUnits } from '../money/currency.ts';
import type { Pence } from '../money/pence.ts';

/** What What if needs: the real plan's records and settings, and how far ahead to look. */
export interface WhatIfInput extends EditInput {
  /** The last day the plan looks at, "YYYY-MM-DD", included. */
  readonly to: string;
  /**
   * The last day debts and savings goals look at for "Paid off on" and the
   * date a goal is reached, "YYYY-MM-DD". 24 months ahead when it's left
   * out, like the Debts screen (D43, D114).
   */
  readonly debtsTo?: string;
}

/** One side of What if: the records and everything worked out from them. */
export interface WhatIfSide {
  readonly records: PlanRecords;
  readonly plan: Plan;
  readonly debts: DebtsPlan;
  readonly goals: GoalsPlan;
}

/** What What if shows for an account, on one side. */
export interface AccountOutcome {
  /** The lowest end-of-day balance from today on (brief 5.5). */
  readonly lowestPoint: DayBalance;
  /** The first day from today on under the warning level (D8). */
  readonly firstUnderWarning: DayBalance | null;
  /** Each shortfall, with the payments that could move (D69, D82). */
  readonly shortfalls: readonly Shortfall[];
}

/** What What if shows for a debt, on one side. */
export interface DebtOutcome {
  /** "Paid off on", or null when it isn't paid off by the last day looked at. */
  readonly paidOffOn: string | null;
  /** What's still left on the last day looked at, when it isn't paid off. */
  readonly leftAtEnd: MinorUnits | null;
  readonly isEstimate: boolean;
}

/** What What if shows for a savings goal, on one side. */
export interface GoalOutcome {
  /** The date the plan reaches the target, or null. */
  readonly reachedOn: string | null;
  /** What's saved on the last day looked at. */
  readonly savedAtEnd: Pence;
  readonly isEstimate: boolean;
}

/** The real plan and the practice plan, side by side (brief 4.10). */
export interface WhatIf {
  readonly real: WhatIfSide;
  readonly practice: WhatIfSide;
  /** One for each account, in the order given. */
  readonly accounts: readonly {
    readonly accountId: string;
    readonly real: AccountOutcome;
    readonly practice: AccountOutcome;
  }[];
  /**
   * One for each debt in the real plan, in the order given. A debt only in
   * the practice plan isn't listed: debts aren't added with edit commands.
   */
  readonly debts: readonly {
    readonly debtId: string;
    readonly real: DebtOutcome;
    readonly practice: DebtOutcome;
  }[];
  /** One for each savings goal, in the order given. */
  readonly goals: readonly {
    readonly goalId: string;
    readonly real: GoalOutcome;
    readonly practice: GoalOutcome;
  }[];
  /**
   * "Keep": every practice change as one edit, to save on the real records.
   * It's one undo step (brief 5.4, D87). Empty when the practice changes
   * nothing.
   */
  readonly keep: Edit;
}

function sideOf(records: EditInput, to: string, debtsTo: string): WhatIfSide {
  const common = {
    series: records.series,
    changes: records.changes ?? [],
    ticks: records.ticks ?? [],
    holidays: records.holidays,
    today: records.today,
    to: debtsTo,
  };
  return {
    records: recordsOf(records),
    plan: workOutPlan({ ...records, to }),
    debts: workOutDebts({ ...common, debts: records.debts ?? [] }),
    goals: workOutGoals({ ...common, goals: records.goals ?? [] }),
  };
}

/** Only the stored records, without the plan's settings. */
function recordsOf(input: EditInput): PlanRecords {
  const {
    mainPayFamilyId: _mainPay,
    holidays: _holidays,
    today: _today,
    to: _to,
    debtsTo: _debtsTo,
    ...records
  } = input as WhatIfInput;
  return records;
}

function accountOutcome(plan: Plan, accountId: string): AccountOutcome {
  const account = plan.accounts.find((one) => one.account.id === accountId);
  if (account === undefined) {
    throw new EngineInputError('edit-breaks-plan', `Account ${accountId} is missing.`);
  }
  return {
    lowestPoint: account.lowestPoint,
    firstUnderWarning: account.firstUnderWarning,
    shortfalls: account.shortfalls,
  };
}

/**
 * What if (brief 4.10): makes each practice change in turn, with the same
 * commands as real edits, on a copy of the records, and works out the real
 * plan and the practice plan side by side: each account's lowest point,
 * first day under the warning level and shortfalls, each debt's "Paid off
 * on", and each goal's date.
 *
 * The real records are never changed. To throw the practice away, the app
 * forgets it. To keep it, the app saves `keep`, one edit that's one
 * undo step. When the real plan may have changed since the practice began,
 * for example after a partner's change arrived, the app runs `whatIf` again
 * on the newest real records with the same practice commands, and keeps
 * that `keep`, in the same way a sync clash runs a command again
 * (ARCHITECTURE.md 3.5).
 *
 * A practice change the engine can't make is refused with its usual code,
 * and the message says which practice change it was.
 */
export function whatIf(input: WhatIfInput, practiceChanges: readonly EditCommand[]): WhatIf {
  if (input === null || typeof input !== 'object') {
    throw new EngineInputError('bad-input', 'What if needs the plan.');
  }
  if (!Array.isArray(practiceChanges)) {
    throw new EngineInputError('bad-command', 'The practice changes must be a list.');
  }
  const debtsTo = input.debtsTo ?? debtsLookAhead(input.today);
  const real = sideOf(input, input.to, debtsTo);

  // Each change on the records as the changes before it left them, and all
  // of them together as one edit: each record's first "before" and last
  // "after" (ARCHITECTURE.md 2.3).
  let practiceRecords: EditInput = input;
  const together = new Draft(input);
  practiceChanges.forEach((command, i) => {
    let edit: Edit;
    try {
      edit = editPlan(practiceRecords, command);
    } catch (error) {
      if (error instanceof EngineInputError) {
        throw new EngineInputError(error.code, `Practice change ${i + 1}: ${error.message}`);
      }
      throw error;
    }
    for (const write of edit.writes) together.set(write);
    practiceRecords = applyWrites(practiceRecords, edit.writes);
  });
  const practice = sideOf(practiceRecords, input.to, debtsTo);

  const debtOutcome = (plan: DebtsPlan, debtId: string): DebtOutcome => {
    const found = plan.debts.find((one) => one.debt.id === debtId);
    if (found === undefined) {
      throw new EngineInputError('edit-breaks-plan', `Debt ${debtId} is missing.`);
    }
    return { paidOffOn: found.paidOffOn, leftAtEnd: found.leftAtEnd, isEstimate: found.isEstimate };
  };
  const goalOutcome = (plan: GoalsPlan, goalId: string): GoalOutcome => {
    const found = plan.goals.find((one) => one.goal.id === goalId);
    if (found === undefined) {
      throw new EngineInputError('edit-breaks-plan', `Goal ${goalId} is missing.`);
    }
    return {
      reachedOn: found.reachedOn,
      savedAtEnd: found.savedAtEnd,
      isEstimate: found.isEstimate,
    };
  };

  return {
    real,
    practice,
    accounts: real.plan.accounts.map(({ account }) => ({
      accountId: account.id,
      real: accountOutcome(real.plan, account.id),
      practice: accountOutcome(practice.plan, account.id),
    })),
    debts: real.debts.debts.map(({ debt }) => ({
      debtId: debt.id,
      real: debtOutcome(real.debts, debt.id),
      practice: debtOutcome(practice.debts, debt.id),
    })),
    goals: real.goals.goals.map(({ goal }) => ({
      goalId: goal.id,
      real: goalOutcome(real.goals, goal.id),
      practice: goalOutcome(practice.goals, goal.id),
    })),
    keep: together.result(),
  };
}
