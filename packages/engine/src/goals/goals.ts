// workOutGoals: saved so far, progress and the date each savings goal is
// reached at the current plan (brief 4.7, D114). Pure: "today" and the last
// day to look at are passed in.

import { compareRows } from '../balance/order.ts';
import { indexTicks } from '../balance/ticks.ts';
import { addDays, type Day, formatDate, parseDate } from '../dates/day.ts';
import { type Moment, parseTime } from '../dates/time.ts';
import { LONGEST_RUN_WITHOUT_A_WORKING_DAY } from '../dates/working-days.ts';
import { EngineInputError } from '../errors.ts';
import { divideRounded } from '../money/decimal.ts';
import { checkPence, checkPenceNotNegative, type Pence } from '../money/pence.ts';
import {
  indexChanges,
  type PaymentOnDays,
  paymentAtIndex,
  paymentsOfSeriesBetween,
  paymentWithDates,
} from '../schedule/payments.ts';
import { markFamilies, type PreparedSeries, prepareSeries } from '../schedule/series.ts';
import type { Series } from '../schedule/types.ts';
import type { Goal, GoalPlan, GoalRow, GoalsInput, GoalsPlan } from './types.ts';

/** A goal, checked. */
export interface CheckedGoal {
  readonly goal: Goal;
  readonly targetDate: Day | null;
}

function fail(id: string, message: string): never {
  throw new EngineInputError('bad-goal', `Goal ${id}: ${message}`);
}

/** Checks one goal (D114). Messages name ids and fields only (CLAUDE.md: privacy). */
export function checkGoal(goal: Goal): CheckedGoal {
  if (typeof goal?.id !== 'string' || goal.id === '') {
    throw new EngineInputError('bad-goal', 'A goal needs an id.');
  }
  const id = goal.id;
  if (typeof goal.name !== 'string') fail(id, 'its name must be text.');
  if (checkPence(goal.target, `Goal ${id}: the target`) <= 0) {
    fail(id, 'the target must be above zero.');
  }
  checkPenceNotNegative(goal.startingAmount, `Goal ${id}: the starting amount`);
  if (typeof goal.accountId !== 'string' || goal.accountId === '') {
    fail(id, 'it needs the account the money is kept in.');
  }
  if (
    goal.belongsTo !== undefined &&
    (typeof goal.belongsTo !== 'string' || goal.belongsTo === '')
  ) {
    fail(id, 'the person it belongs to must be an id.');
  }
  const targetDate =
    goal.targetDate === undefined
      ? null
      : parseDate(goal.targetDate, `Goal ${id}: the target date`);
  return { goal, targetDate };
}

/** Checks every goal, and that no two share an id. */
export function checkGoals(goals: readonly Goal[]): Map<string, CheckedGoal> {
  if (!Array.isArray(goals)) {
    throw new EngineInputError('bad-goal', 'The goals must be a list.');
  }
  const byId = new Map<string, CheckedGoal>();
  for (const goal of goals) {
    const checked = checkGoal(goal);
    if (byId.has(goal.id)) {
      throw new EngineInputError('repeated-goal', `Goal ${goal.id} is listed twice.`);
    }
    byId.set(goal.id, checked);
  }
  return byId;
}

/**
 * What a payment does to the goal's account: above zero into it, below zero
 * out of it, or null when it doesn't touch it.
 */
function effectOn(series: Series, accountId: string): 1 | -1 | null {
  if (series.direction === 'transfer') {
    if (series.toAccountId === accountId) return 1;
    if (series.accountId === accountId) return -1;
    return null;
  }
  if (series.accountId !== accountId) return null;
  return series.direction === 'in' ? 1 : -1;
}

/**
 * Checks every series' link to a goal (D114): the goal is in the plan, and
 * the series moves money into or out of the goal's account.
 */
export function checkGoalLinks(
  series: readonly Series[],
  goals: ReadonlyMap<string, CheckedGoal>,
): void {
  for (const one of series) {
    if (one.goalId === undefined) continue;
    const goal = goals.get(one.goalId);
    if (goal === undefined) {
      throw new EngineInputError(
        'unknown-goal',
        `Series ${one.id} is linked to a goal that isn't in the plan.`,
      );
    }
    if (effectOn(one, goal.goal.accountId) === null) {
      throw new EngineInputError(
        'bad-goal-link',
        `Series ${one.id} doesn't move money into or out of goal ${one.goalId}'s account.`,
      );
    }
  }
}

interface Counted {
  readonly day: Day;
  readonly payment: PaymentOnDays;
  readonly amount: Pence;
  readonly ticked: boolean;
  readonly familyCreatedAt: Moment;
  readonly familyId: string;
}

/**
 * Saved so far against the target, to the nearest whole percent, halves up,
 * and never 100% before it's reached, as with a debt's progress (D99, D114).
 */
function percentSaved(saved: Pence, target: Pence): number {
  if (saved >= target) return 100;
  if (saved <= 0) return 0;
  return Math.min(99, Number(divideRounded(BigInt(saved) * 100n, BigInt(target))));
}

function workOutGoal(
  checked: CheckedGoal,
  linked: readonly PreparedSeries[],
  input: GoalsInput,
  records: {
    readonly changes: ReturnType<typeof indexChanges>;
    readonly ticks: ReturnType<typeof indexTicks>;
    readonly today: Day;
    readonly to: Day;
  },
): GoalPlan {
  const { goal } = checked;
  const { changes, ticks, today, to } = records;
  const counted: Counted[] = [];
  for (const one of linked) {
    const sign = effectOn(one.series, goal.accountId) as 1 | -1;
    const family = {
      familyCreatedAt: parseTime(one.series.familyCreatedAt),
      familyId: one.series.familyId,
    };
    const ticksOfSeries = ticks.get(one.series.id);
    // Ticked payments count on their paid date, wherever their own date is (D1, D71).
    for (const [originalDay, tick] of ticksOfSeries ?? []) {
      const index = one.firstIndexOnOrAfter(originalDay);
      // A tick for a payment that no longer exists is ignored (D83).
      if (index >= one.count || one.dateAt(index) !== originalDay) continue;
      if (tick.paidOn > to) continue;
      const payment = paymentAtIndex(one, index, changes, input.holidays);
      counted.push({
        day: tick.paidOn,
        payment,
        amount: sign * payment.amount,
        ticked: true,
        ...family,
      });
    }
    // Every other payment from the series' first to the last day looked at.
    // One dated before today that isn't ticked yet counts on today (D114).
    // Payments the weekend rule or a moved date takes before the series' start count too.
    let from = addDays(one.start, -LONGEST_RUN_WITHOUT_A_WORKING_DAY);
    for (const { newDay } of changes.get(one.series.id)?.values() ?? []) {
      if (newDay !== null && newDay < from) from = newDay;
    }
    if (from > to) continue;
    for (const payment of paymentsOfSeriesBetween(one, from, to, changes, input.holidays)) {
      if (payment.skipped || ticksOfSeries?.has(payment.originalDay) === true) continue;
      counted.push({
        day: Math.max(payment.day, today),
        payment,
        amount: sign * payment.amount,
        ticked: false,
        ...family,
      });
    }
  }
  counted.sort((a, b) =>
    compareRows(
      {
        ...a,
        flow: a.amount >= 0 ? 'in' : 'out',
        seriesId: a.payment.seriesId,
        name: a.payment.name,
        number: a.payment.number,
      },
      {
        ...b,
        flow: b.amount >= 0 ? 'in' : 'out',
        seriesId: b.payment.seriesId,
        name: b.payment.name,
        number: b.payment.number,
      },
    ),
  );

  const what = `Goal ${goal.id}`;
  let saved = goal.startingAmount;
  let savedSoFar = goal.startingAmount;
  let reachedOn: Day | null = null;
  let reachedWith: number | null = null;
  let reached = saved >= goal.target;
  let isEstimate = false;
  const rows: GoalRow[] = [];
  counted.forEach((one, i) => {
    saved = checkPence(saved + one.amount, `${what}: what's saved`);
    if (one.ticked) savedSoFar = checkPence(savedSoFar + one.amount, `${what}: what's saved`);
    if (!reached && !one.ticked && one.payment.isEstimate) isEstimate = true;
    if (!reached && saved >= goal.target) {
      reached = true;
      reachedOn = one.day;
      reachedWith = i + 1;
    }
    rows.push({
      payment: paymentWithDates(one.payment),
      date: formatDate(one.day),
      amount: one.amount,
      ticked: one.ticked,
      savedAfter: saved,
    });
  });

  const reachedNow = savedSoFar >= goal.target;
  const reachedDay = reachedOn as Day | null;
  return {
    goal,
    savedSoFar,
    leftToSave: Math.max(0, goal.target - savedSoFar),
    percentSaved: percentSaved(savedSoFar, goal.target),
    reachedNow,
    reachedOn: reachedDay === null ? null : formatDate(reachedDay),
    reachedWith,
    byTargetDate:
      checked.targetDate === null
        ? null
        : reachedNow || (reachedDay !== null && reachedDay <= checked.targetDate),
    isEstimate,
    savedAtEnd: saved,
    rows,
  };
}

/**
 * Works out every savings goal (brief 4.7, D114): saved so far, progress,
 * and the date the plan reaches the target, from the starting amount and
 * the payments linked to the goal.
 */
export function workOutGoals(input: GoalsInput): GoalsPlan {
  if (input === null || typeof input !== 'object') {
    throw new EngineInputError('bad-input', 'Working out goals needs the plan.');
  }
  const today = parseDate(input.today, 'today');
  const to = parseDate(input.to, 'to');
  if (to < today) {
    throw new EngineInputError('bad-window', '"to" must be on or after today.');
  }
  const goals = checkGoals(input.goals);
  if (!Array.isArray(input.series)) {
    throw new EngineInputError('bad-series', 'The series must be a list.');
  }
  const seen = new Set<string>();
  const prepared = markFamilies(
    input.series.map((one) => {
      const ready = prepareSeries(one, input.holidays);
      if (seen.has(one.id)) {
        throw new EngineInputError('repeated-series', `Series ${one.id} is listed twice.`);
      }
      seen.add(one.id);
      return ready;
    }),
  );
  checkGoalLinks(input.series, goals);
  const records = {
    changes: indexChanges(input.changes ?? []),
    ticks: indexTicks(input.ticks ?? []),
    today,
    to,
  };
  const linked = new Map<string, PreparedSeries[]>();
  for (const one of prepared) {
    const id = one.series.goalId;
    if (id === undefined) continue;
    linked.set(id, [...(linked.get(id) ?? []), one]);
  }
  return {
    today: formatDate(today),
    to: formatDate(to),
    goals: [...goals.values()].map((goal) =>
      workOutGoal(goal, linked.get(goal.goal.id) ?? [], input, records),
    ),
  };
}
