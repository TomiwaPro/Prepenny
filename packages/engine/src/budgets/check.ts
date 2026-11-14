// Checking budgets and spends (D107, D115). Messages name ids and fields
// only, never amounts, names or notes (CLAUDE.md: privacy).

import { type Day, parseDate } from '../dates/day.ts';
import { type Moment, parseTime } from '../dates/time.ts';
import { EngineInputError } from '../errors.ts';
import { checkPence, checkPenceNotNegative, type Pence } from '../money/pence.ts';
import { BUDGET_EVERY, BUDGET_LEAVES, type Budget, type Spend } from './types.ts';

/** A budget, checked, with its dates and time ready to use. */
export interface CheckedBudget {
  readonly budget: Budget;
  readonly startsOn: Day;
  readonly endsOn: Day | null;
  readonly rollOverFrom: Day | null;
  readonly createdAt: Moment;
  /** Its amounts before it was changed, oldest first (D152). */
  readonly amountsBefore: readonly { readonly until: Day; readonly amount: Pence }[];
  /** Pay-later only. */
  readonly billDay: number | null;
  /** Pay-later only, and only when the card's own statement day is set. */
  readonly statementDay: number | null;
}

/** A spend, checked, with its date and time ready to use. */
export interface CheckedSpend {
  readonly spend: Spend;
  readonly spentOn: Day;
  readonly recordedAt: Moment;
}

function fail(id: string, code: string, message: string): never {
  throw new EngineInputError(code, `Budget ${id}: ${message}`);
}

function dayOfMonth(id: string, value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 31) {
    fail(id, 'bad-budget', `${what} must be a whole number from 1 to 31.`);
  }
  return value;
}

/** Checks one budget (D107). `accounts` are the plan's account ids. */
export function checkBudget(budget: Budget, accounts: ReadonlySet<string>): CheckedBudget {
  if (typeof budget?.id !== 'string' || budget.id === '') {
    throw new EngineInputError('bad-budget', 'A budget needs an id.');
  }
  const id = budget.id;
  if (!accounts.has(budget.accountId)) {
    fail(id, 'unknown-account', 'it is for an account not in the plan.');
  }
  if (typeof budget.name !== 'string') fail(id, 'bad-budget', 'its name must be text.');
  checkPenceNotNegative(budget.amount, `Budget ${id}: the amount`);
  if (!(BUDGET_EVERY as readonly unknown[]).includes(budget.every)) {
    fail(id, 'bad-budget', `how often must be one of ${BUDGET_EVERY.join(', ')}.`);
  }
  if (!(BUDGET_LEAVES as readonly unknown[]).includes(budget.leaves)) {
    fail(id, 'bad-budget', `how it leaves must be one of ${BUDGET_LEAVES.join(', ')}.`);
  }
  if (typeof budget.rollOver !== 'boolean') {
    fail(id, 'bad-budget', 'roll-over must be true or false.');
  }
  const startsOn = parseDate(budget.startsOn, `Budget ${id}: the start`);
  const endsOn =
    budget.endsOn === undefined ? null : parseDate(budget.endsOn, `Budget ${id}: the end`);
  if (endsOn !== null && endsOn < startsOn) {
    fail(id, 'bad-budget', 'it ends before it starts.');
  }
  const rollOverFrom =
    budget.rollOverFrom === undefined
      ? null
      : parseDate(budget.rollOverFrom, `Budget ${id}: when roll-over was switched on`);
  const createdAt = parseTime(budget.createdAt, `Budget ${id}: when it was made`);
  if (
    budget.followsPayOf !== undefined &&
    (typeof budget.followsPayOf !== 'string' || budget.followsPayOf === '')
  ) {
    fail(id, 'bad-budget', 'whose paydays it follows must be a person, or left out.');
  }
  const amountsBefore: { until: Day; amount: Pence }[] = [];
  if (budget.amountsBefore !== undefined) {
    if (!Array.isArray(budget.amountsBefore)) {
      fail(id, 'bad-budget', 'its earlier amounts must be a list.');
    }
    budget.amountsBefore.forEach((one, i) => {
      const until = parseDate(one?.until, `Budget ${id}: earlier amount ${i + 1}`);
      const previous = amountsBefore.at(-1);
      if (previous !== undefined && until <= previous.until) {
        fail(id, 'bad-budget', 'its earlier amounts must be in date order.');
      }
      amountsBefore.push({
        until,
        amount: checkPenceNotNegative(one.amount, `Budget ${id}: earlier amount ${i + 1}`),
      });
    });
  }

  let billDay: number | null = null;
  let statementDay: number | null = null;
  if (budget.leaves === 'pay-later') {
    // One monthly pay-later bill (brief 4.5).
    if (budget.every !== 'month') {
      fail(id, 'bad-budget', 'a pay-later bill comes once a month, so the budget is monthly.');
    }
    billDay = dayOfMonth(id, budget.billDay, 'The bill day');
    if (budget.statementDay !== undefined) {
      statementDay = dayOfMonth(id, budget.statementDay, 'The statement day');
    }
  } else if (budget.billDay !== undefined || budget.statementDay !== undefined) {
    fail(id, 'pay-later-only', 'only a pay-later budget has a bill day or a statement day.');
  }
  return {
    budget,
    startsOn,
    endsOn,
    rollOverFrom,
    createdAt,
    amountsBefore,
    billDay,
    statementDay,
  };
}

/** Checks every budget, and that no two share an id. */
export function checkBudgets(
  budgets: readonly Budget[],
  accounts: ReadonlySet<string>,
): Map<string, CheckedBudget> {
  if (!Array.isArray(budgets)) {
    throw new EngineInputError('bad-budget', 'The budgets must be a list.');
  }
  const byId = new Map<string, CheckedBudget>();
  for (const budget of budgets) {
    const checked = checkBudget(budget, accounts);
    if (byId.has(budget.id)) {
      throw new EngineInputError('repeated-budget', `Budget ${budget.id} is listed twice.`);
    }
    byId.set(budget.id, checked);
  }
  return byId;
}

/** Checks one spend (D115). */
export function checkSpend(
  spend: Spend,
  budgets: ReadonlyMap<string, CheckedBudget>,
): CheckedSpend {
  if (typeof spend?.id !== 'string' || spend.id === '') {
    throw new EngineInputError('bad-spend', 'A spend needs an id.');
  }
  const what = `Spend ${spend.id}`;
  if (!budgets.has(spend.budgetId)) {
    throw new EngineInputError('unknown-budget', `${what} is for a budget not in the plan.`);
  }
  if (checkPence(spend.amount, `${what}: the amount`) <= 0) {
    throw new EngineInputError('bad-spend', `${what}: the amount must be above zero.`);
  }
  if (spend.note !== undefined && typeof spend.note !== 'string') {
    throw new EngineInputError('bad-spend', `${what}: the note must be text.`);
  }
  return {
    spend,
    spentOn: parseDate(spend.spentOn, `${what}: the day it was spent`),
    recordedAt: parseTime(spend.recordedAt, `${what}: when it was recorded`),
  };
}

/** Checks every spend, and that no two share an id. Grouped by budget. */
export function checkSpends(
  spends: readonly Spend[],
  budgets: ReadonlyMap<string, CheckedBudget>,
): Map<string, CheckedSpend[]> {
  if (!Array.isArray(spends)) {
    throw new EngineInputError('bad-spend', 'The spends must be a list.');
  }
  const seen = new Set<string>();
  const byBudget = new Map<string, CheckedSpend[]>();
  for (const spend of spends) {
    const checked = checkSpend(spend, budgets);
    if (seen.has(spend.id)) {
      throw new EngineInputError('repeated-spend', `Spend ${spend.id} is listed twice.`);
    }
    seen.add(spend.id);
    const list = byBudget.get(spend.budgetId) ?? [];
    list.push(checked);
    byBudget.set(spend.budgetId, list);
  }
  return byBudget;
}
