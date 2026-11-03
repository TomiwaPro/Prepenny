// What "I did overtime" or "I missed a shift" would do, before it's saved
// (D5, D131, D200): the payday it lands on, how much it changes that
// payday by, and what the payday becomes. The engine makes the change on a
// copy that's never saved, so the sheet shows exactly what Save will do.
// Worked out in the background worker.

import {
  addDays,
  type EditCommand,
  EngineInputError,
  formatDate,
  type PayAdjustment,
  type Pence,
  type PlanRecords,
  parseDate,
} from '@prepenny/engine';
import { runEdit } from './edit.ts';
import { HOME_MONTHS_AHEAD, planLookAhead, workOutPlanTo } from './plan-input.ts';

export type PayCommand = Extract<EditCommand, { kind: 'overtime' | 'missed-shift' }>;

export type PayPreview =
  | {
      readonly ok: true;
      /** The payday it goes on, or null when that payday is before the plan starts. */
      readonly payday: string | null;
      /** More for overtime, less for a missed shift. */
      readonly change: Pence;
      /** The payday's pay with it, when the payday is in the plan. */
      readonly payAfter: Pence | null;
      /** The rate it's worked out at: the one typed, or the one the engine used. */
      readonly rate: string;
      /** That payday's pay week has extras, such as a shift premium, so the extras box shows (D130). */
      readonly hasExtras: boolean;
    }
  | { readonly ok: false; readonly code: string };

/** How far past the shift a payday can be: more than any pay covers (D131 allows 62 days, and monthly pay a month). */
const PAYDAY_SEARCH_DAYS = 100;

function codeOf(error: unknown): string {
  if (error instanceof EngineInputError) return error.code;
  throw error;
}

/** The payday's pay in a plan, found by the pay's family and the payday's payment number. */
function paydayIn(records: PlanRecords, today: string, saved: PayAdjustment) {
  const family = new Set(
    records.series.filter((one) => one.familyId === saved.familyId).map((one) => one.id),
  );
  const shiftPlus = formatDate(addDays(parseDate(saved.workedOn), PAYDAY_SEARCH_DAYS));
  const lookAhead = planLookAhead(today, HOME_MONTHS_AHEAD);
  const [, to = lookAhead] = [shiftPlus, lookAhead].sort();
  const plan = workOutPlanTo(records, today, to);
  for (const account of plan.accounts) {
    const row = account.rows.find(
      (one) =>
        one.kind === 'payment' &&
        family.has(one.payment.seriesId) &&
        one.payment.number === saved.number,
    );
    if (row !== undefined) return { date: row.payment.date, amount: row.payment.amount };
  }
  return null;
}

/** What the command would do, or the engine's refusal code. */
export function previewPayChange(
  records: PlanRecords,
  today: string,
  command: PayCommand,
): PayPreview {
  let after: PlanRecords;
  try {
    after = runEdit(records, today, command).records;
  } catch (error) {
    return { ok: false, code: codeOf(error) };
  }
  const saved = (after.payAdjustments ?? []).find((one) => one.id === command.id);
  if (saved === undefined) return { ok: false, code: 'unexpected' };
  // The extras box shows only when that payday's pay week has extras (D130):
  // the engine refuses a change to extras on pay without them.
  let hasExtras = (command.extras ?? 0) > 0;
  if (!hasExtras) {
    try {
      runEdit(records, today, { ...command, extras: 1 });
      hasExtras = true;
    } catch (error) {
      hasExtras = codeOf(error) !== 'no-extras';
    }
  }
  const payday = paydayIn(after, today, saved);
  return {
    ok: true,
    payday: payday?.date ?? null,
    change: saved.change,
    payAfter: payday?.amount ?? null,
    rate: saved.rate,
    hasExtras,
  };
}
