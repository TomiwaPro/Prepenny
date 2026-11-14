// Another person's paydays, the dates only (D508, D512, D514). In a shared
// plan, a budget's weeks and months follow the main pay of the person who
// added it, on every phone. The other person's phone gets that pay's dates
// and nothing else: when it comes, which ones were moved and which removed,
// never its amount, name, account or job. This turns them into the main
// paydays a budget's periods follow (D29, D108), worked out exactly as the
// person's own phone works out their main pay.

import { formatDate, parseDate } from '../dates/day.ts';
import type { BankHolidayLookup } from '../dates/working-days.ts';
import { EngineInputError } from '../errors.ts';
import { mainPaydaysOf } from '../periods/main-pay.ts';
import { type ChangeIndex, indexChanges } from '../schedule/payments.ts';
import { markFamilies, type PreparedSeries, prepareSeries } from '../schedule/series.ts';
import type { PaymentChange, Series } from '../schedule/types.ts';
import type { CheckedBudget } from './check.ts';
import { type BudgetPay, budgetPay } from './periods.ts';
import type { OtherPaydays, PaydaySchedule } from './types.ts';

/** Another person's paydays, ready to give a budget's periods. */
export interface PreparedPaydays {
  readonly person: string;
  readonly familyId: string;
  readonly prepared: readonly PreparedSeries[];
  readonly changes: ChangeIndex;
}

function fail(code: string, message: string): never {
  throw new EngineInputError(code, message);
}

/**
 * Checks other people's paydays (D512): one entry per person, each a list
 * of the series of their main pay with only the fields that say when it
 * comes. Messages hold ids only (CLAUDE.md: privacy).
 */
export function checkOtherPaydays(
  list: readonly OtherPaydays[] | undefined,
  holidays: BankHolidayLookup,
): ReadonlyMap<string, PreparedPaydays> {
  const found = new Map<string, PreparedPaydays>();
  if (list === undefined) return found;
  if (!Array.isArray(list)) fail('bad-paydays', "Other people's paydays must be a list.");
  for (const other of list) {
    const person = other?.person;
    if (typeof person !== 'string' || person === '') {
      fail('bad-paydays', "Other people's paydays each need the person's id.");
    }
    if (found.has(person)) fail('bad-paydays', `Paydays for ${person} are given twice.`);
    if (!Array.isArray(other.series) || other.series.length === 0) {
      fail('bad-paydays', `Paydays for ${person} need at least one series.`);
    }
    // The family is the person: every series given is a part of their main pay.
    const familyId = `paydays:${person}`;
    const ids = new Set<string>();
    const changes: PaymentChange[] = [];
    const prepared = (other.series as readonly PaydaySchedule[]).map((one) => {
      if (typeof one?.id !== 'string' || one.id === '' || ids.has(one.id)) {
        fail('bad-paydays', `Paydays for ${person}: each series needs an id of its own.`);
      }
      ids.add(one.id);
      // A series with nothing in it but its dates: no amount, name or account.
      const series: Series = {
        id: one.id,
        accountId: familyId,
        name: '',
        direction: 'in',
        amount: 0,
        start: one.start,
        schedule: one.schedule,
        end: one.end,
        holidayRule: one.holidayRule,
        type: 'pay',
        isEstimate: false,
        familyId,
        familyCreatedAt: '1970-01-01T00:00:00Z',
        ...(one.firstNumber === undefined ? {} : { firstNumber: one.firstNumber }),
      };
      // One change per payday: moved, removed, or both (a removed payday's
      // new date changes nothing, as it isn't a payday).
      const byDate = new Map<string, { newDate?: string; skipped?: true }>();
      for (const moved of one.moved ?? []) {
        const from = formatDate(parseDate(moved?.from, `Paydays for ${person}: a moved payday`));
        const to = formatDate(parseDate(moved?.to, `Paydays for ${person}: a moved payday's date`));
        byDate.set(from, { ...byDate.get(from), newDate: to });
      }
      for (const skipped of one.skipped ?? []) {
        const on = formatDate(parseDate(skipped, `Paydays for ${person}: a removed payday`));
        byDate.set(on, { ...byDate.get(on), skipped: true });
      }
      for (const [originalDate, change] of byDate) {
        changes.push({ seriesId: one.id, originalDate, ...change });
      }
      return prepareSeries(series, holidays);
    });
    found.set(person, {
      person,
      familyId,
      prepared: markFamilies(prepared),
      changes: indexChanges(changes),
    });
  }
  return found;
}

/** How the periods of a budget that follows another person's pay line up (D29, D108, D508). */
export function otherBudgetPay(
  paydays: PreparedPaydays | undefined,
  holidays: BankHolidayLookup,
  today: number,
): BudgetPay {
  if (paydays === undefined) return budgetPay(null, null, [], today);
  const main = mainPaydaysOf(paydays.familyId, paydays.prepared, paydays.changes, holidays);
  return budgetPay(main, paydays.familyId, paydays.prepared, today);
}

/**
 * The pay each budget's periods follow (D508): the viewer's own main pay,
 * or, for a budget that follows someone else's, their paydays (D512). Each
 * person's are worked out once.
 */
export function budgetPayOf(
  paydays: ReadonlyMap<string, PreparedPaydays>,
  own: BudgetPay,
  holidays: BankHolidayLookup,
  today: number,
): (budget: CheckedBudget) => BudgetPay {
  const theirs = new Map<string, BudgetPay>();
  return (budget) => {
    const person = budget.budget.followsPayOf;
    if (person === undefined) return own;
    let pay = theirs.get(person);
    if (pay === undefined) {
      pay = otherBudgetPay(paydays.get(person), holidays, today);
      theirs.set(person, pay);
    }
    return pay;
  };
}
