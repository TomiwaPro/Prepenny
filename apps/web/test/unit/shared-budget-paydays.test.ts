// Step 4a on the phone (D508, D512 to D514): a shared budget follows the
// paydays of the person who added it, on both phones. Tom's phone gets
// Jess's paydays from the server as dates only, reads them, and never sends
// them back; a backup leaves them out; and the words say whose paydays each
// budget follows.

import {
  type Account,
  type Budget,
  type PlanRecords,
  type Series,
  workOutPlan,
} from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { recordsForBackup } from '../../lib/backup.ts';
import {
  budgetPaydaysLine,
  budgetsOnMyPaydays,
  followsMyPaydays,
} from '../../lib/budget-paydays.ts';
import { holidaysFor } from '../../lib/holidays.ts';
import { type MirrorRow, recordsFromRows, writesFor, writesForEdit } from '../../lib/sync-rows.ts';
import { strings } from '../../strings/en-GB.ts';

const PLAN = '01900000-0000-7000-8000-000000000001';
const JESS = '01900000-0000-7000-8000-00000000000a';
const TOM = '01900000-0000-7000-8000-00000000000b';
const TODAY = '2026-10-25';
const YEAR_ON = '2027-10-25';

let seq = 0;
const row = (
  table: MirrorRow['table'],
  id: string,
  privateTo: string | null,
  values: Record<string, unknown>,
): MirrorRow => {
  seq += 1;
  return { table, id, version: 1, seq, privateTo, deleted: false, values };
};

const account = (name: string, kind: Account['kind']): Record<string, unknown> => ({
  name,
  kind,
  currency: 'GBP',
  overdraft_limit: 0,
  warning_level: 2000,
  belongs_to: null,
  closed: false,
});
const update = (accountId: string, balance: number): Record<string, unknown> => ({
  account_id: accountId,
  balance,
  checked_on: TODAY,
  checked_at: '2026-10-25T09:00:00Z',
  expected: null,
  source: 'typed',
});
const series = (
  id: string,
  accountId: string,
  fields: Record<string, unknown>,
): Record<string, unknown> => ({
  account_id: accountId,
  to_account_id: null,
  name: id,
  direction: 'out',
  type: 'other',
  amount: 1000,
  amount_cycle: null,
  cycle_offset: null,
  cycle_pay_weeks: null,
  start_date: '2026-11-01',
  schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
  end_rule: { kind: 'never' },
  last_amount: null,
  holiday_rule: 'keep',
  debt_id: null,
  goal_id: null,
  set_aside_percent: null,
  set_aside_account_id: null,
  is_estimate: false,
  note: null,
  pay_profile_id: null,
  split_from: null,
  family_id: id,
  family_created_at: '2026-10-24T18:00:00.000Z',
  first_number: null,
  mirrored_by: null,
  locked_to: null,
  paid_to: null,
  ...fields,
});

/**
 * The server's rows for Jess and Tom's plan, as plan_changes gives them to
 * whoever asks: Jess's own account with her pay, monthly on the 28th, moved
 * to the working day before, with December's payday moved to Wed 23 Dec;
 * the joint account with Rent, and Jess's £300 food month on it; and the
 * paydays the database works out for it, the dates only (D512).
 */
function serverRows(): MirrorRow[] {
  seq = 0;
  return [
    row('plans', PLAN, null, { nation: 'england-and-wales', owner: JESS }),
    row('accounts', 'jess-current', JESS, account('Jess current', 'current')),
    row('accounts', 'joint', null, account('Joint account', 'joint')),
    row('balance_updates', 'jess-balance', JESS, update('jess-current', 41000)),
    row('balance_updates', 'joint-balance', null, update('joint', 105000)),
    row(
      'series',
      'jess-pay',
      JESS,
      series('jess-pay', 'jess-current', {
        name: 'Jess pay',
        direction: 'in',
        type: 'pay',
        amount: 210000,
        start_date: '2026-10-28',
        schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } },
        holiday_rule: 'working-day-before',
        paid_to: JESS,
      }),
    ),
    row('payment_changes', 'jess-pay-moved', JESS, {
      series_id: 'jess-pay',
      budget_id: null,
      original_date: '2026-12-28',
      payment_number: 2,
      new_date: '2026-12-23',
      amount: null,
      name: null,
      note: null,
      is_estimate: null,
      skipped: null,
    }),
    row(
      'series',
      'rent',
      null,
      series('rent', 'joint', { name: 'Rent', type: 'rent', amount: 95000 }),
    ),
    row('budgets', 'food', null, {
      account_id: 'joint',
      name: 'Food',
      amount: 30000,
      amounts_before: null,
      every: 'month',
      leaves: 'at-start',
      roll_over: false,
      roll_over_from: null,
      starts_on: '2026-10-28',
      ends_on: null,
      bill_day: null,
      statement_day: null,
      made_at: '2026-10-24T18:30:00Z',
      follows_pay_of: JESS,
      passed_on: false,
    }),
    row('settings', 'jess-settings', JESS, { main_pay_family_id: 'jess-pay', setup: null }),
    row('paydays', 'paydays-1', null, {
      person: JESS,
      start_date: '2026-10-28',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } },
      end_rule: { kind: 'never' },
      holiday_rule: 'working-day-before',
      first_number: null,
      moved_from: ['2026-12-28'],
      moved_to: ['2026-12-23'],
      skipped: [],
    }),
  ];
}

const readableBy = (rows: readonly MirrorRow[], person: string) =>
  rows.filter((one) => one.privateTo === null || one.privateTo === person);

function jointDays(records: PlanRecords): [string, number][] {
  const plan = workOutPlan({
    ...records,
    mainPayFamilyId: records.settings?.mainPayFamilyId ?? null,
    holidays: holidaysFor('england-and-wales'),
    today: TODAY,
    to: YEAR_ON,
  });
  const joint = plan.accounts.find((one) => one.account.id === 'joint');
  return (joint?.days ?? []).map((day) => [day.date, day.balance]);
}

describe("Tom's phone, with Jess's paydays as dates only (D508, D512)", () => {
  const rows = serverRows();
  const jess = recordsFromRows(readableBy(rows, JESS), JESS).records;
  const tom = recordsFromRows(readableBy(rows, TOM), TOM).records;

  it('shows the joint account exactly as Jess does, every day for a year', () => {
    expect(jointDays(tom)).toEqual(jointDays(jess));
    expect(jointDays(tom)).toHaveLength(366);
  });

  it('knows the food month follows Jess, and has her paydays and nothing else of her pay', () => {
    expect(tom.budgets?.[0]?.followsPayOf).toBe(JESS);
    expect(tom.otherPaydays).toEqual([
      {
        person: JESS,
        series: [
          {
            id: 'paydays-1',
            start: '2026-10-28',
            schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 28 } },
            end: { kind: 'never' },
            holidayRule: 'working-day-before',
            moved: [{ from: '2026-12-28', to: '2026-12-23' }],
          },
        ],
      },
    ]);
    expect(tom.series.map((one) => one.id)).toEqual(['rent']);
    expect(JSON.stringify(tom)).not.toMatch(/210000|Jess pay|jess-pay|jess-current/);
  });

  it("on Jess's phone, the budget follows her own pay, and her own paydays aren't used", () => {
    expect(jess.budgets?.[0]?.followsPayOf).toBeUndefined();
    expect(jess.otherPaydays).toBeUndefined();
  });

  it('without the signed-in person, it goes by whose own settings came down', () => {
    expect(recordsFromRows(readableBy(rows, JESS)).records.budgets?.[0]?.followsPayOf).toBe(
      undefined,
    );
    expect(recordsFromRows(readableBy(rows, TOM)).records.budgets?.[0]?.followsPayOf).toBe(JESS);
  });

  it('paydays emptied by the server are left out', () => {
    const emptied = readableBy(rows, TOM).map((one) =>
      one.table === 'paydays' ? { ...one, deleted: true, values: { person: null } } : one,
    );
    expect(recordsFromRows(emptied, TOM).records.otherPaydays).toBeUndefined();
  });

  it("a change on Tom's phone never sends, changes or removes a payday", () => {
    const mine = readableBy(rows, TOM);
    const added: Series = {
      id: 'window',
      accountId: 'joint',
      name: 'Window cleaner',
      direction: 'out',
      amount: 1200,
      start: '2026-10-31',
      schedule: { kind: 'once' },
      end: { kind: 'never' },
      holidayRule: 'keep',
      type: 'bills',
      isEstimate: false,
      familyId: 'window',
      familyCreatedAt: '2026-10-25T10:00:00Z',
    };
    const { writes } = writesForEdit(
      mine,
      [{ kind: 'series', id: 'window', value: added }],
      {
        planId: PLAN,
        personId: TOM,
      },
      undefined,
    );
    expect(writes.map((one) => `${one.table}|${one.id}`)).toEqual(['series|window']);
    // Whole records with no paydays in them remove nothing of the server's.
    const { otherPaydays: _gone, ...without } = tom;
    expect(
      writesFor(without, { planId: PLAN, personId: TOM }, mine, undefined).filter(
        (one) => one.table === 'paydays',
      ),
    ).toEqual([]);
  });

  it("Tom's change to the food month keeps whose paydays it follows, and sends nothing of it", () => {
    const food = tom.budgets?.[0] as Budget;
    const { writes } = writesForEdit(
      readableBy(rows, TOM),
      [{ kind: 'budget', id: 'food', value: { ...food, amount: 32000 } }],
      { planId: PLAN, personId: TOM },
      undefined,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.row).not.toHaveProperty('follows_pay_of');
    expect(writes[0]?.row).not.toHaveProperty('passed_on');
  });
});

describe('A backup leaves out whose paydays a budget follows, and the paydays (D512)', () => {
  it('so an imported plan is the importer’s own', () => {
    const tom = recordsFromRows(readableBy(serverRows(), TOM), TOM).records;
    const backup = recordsForBackup(tom);
    expect(backup.otherPaydays).toBeUndefined();
    expect(backup.budgets?.[0]).not.toHaveProperty('followsPayOf');
    expect(JSON.stringify(backup)).not.toContain(JESS);
  });
});

describe('Whose paydays, in words (D512 to D514)', () => {
  const facts = {
    followsName: null,
    followsSomeoneElse: false,
    followsPaydays: true,
    every: 'month' as const,
    leaves: 'at-start' as const,
    shared: true,
    partner: 'Tom',
    passedOn: false,
  };
  const b = strings.budgets;

  it("on Tom's phone, Jess's food month leaves on her paydays", () => {
    expect(
      budgetPaydaysLine({
        ...facts,
        followsSomeoneElse: true,
        followsName: 'Jess',
        partner: 'Jess',
      }),
    ).toBe("Leaves on Jess's paydays.");
  });

  it("on Jess's phone, Tom sees it leave on her paydays", () => {
    expect(budgetPaydaysLine(facts)).toBe('Tom sees this leave on your paydays.');
  });

  it('nothing when it runs Monday to Sunday or from the 1st, is private, on a card, or nobody else is in the plan', () => {
    expect(budgetPaydaysLine({ ...facts, followsPaydays: false })).toBeNull();
    expect(
      budgetPaydaysLine({
        ...facts,
        followsSomeoneElse: true,
        followsName: 'Jess',
        followsPaydays: false,
      }),
    ).toBeNull();
    expect(budgetPaydaysLine({ ...facts, shared: false })).toBeNull();
    expect(budgetPaydaysLine({ ...facts, leaves: 'pay-later' })).toBeNull();
    expect(budgetPaydaysLine({ ...facts, partner: null })).toBeNull();
  });

  it('once the person who added it has left, it says it was passed on (D513)', () => {
    const passed = { ...facts, passedOn: true, partner: null };
    expect(budgetPaydaysLine(passed)).toBe(b.passedOnPaydays);
    expect(budgetPaydaysLine({ ...passed, followsPaydays: false })).toBe(b.passedOnMonths);
    expect(budgetPaydaysLine({ ...passed, followsPaydays: false, every: 'week' })).toBe(
      b.passedOnWeeks,
    );
    expect(b.passedOnMonths).toContain('the 1st');
  });

  it('the sheet says it before a budget on the shared account is added (D514)', () => {
    expect(strings.budgetSheet.partnerWillSee('Tom')).toBe(
      'Tom will see this money leave on your paydays.',
    );
    const jess = recordsFromRows(readableBy(serverRows(), JESS), JESS).records;
    expect(followsMyPaydays(jess, 'month', 'at-start')).toBe(true);
    expect(followsMyPaydays(jess, 'month', 'pay-later')).toBe(false);
    expect(followsMyPaydays(jess, 'week', 'at-start')).toBe(false);
  });

  it("by the database's own rule: any part of the pay, never irregular pay (D522)", () => {
    const jess = recordsFromRows(readableBy(serverRows(), JESS), JESS).records;
    const pay = jess.series.find((one) => one.id === 'jess-pay') as Series;
    // Monthly now, weekly from March: a weekly budget's paydays go to Tom at once, so she's told.
    const weeklyLater: Series = {
      ...pay,
      id: 'jess-pay-weekly',
      start: '2027-03-05',
      schedule: { kind: 'weekly', every: 1 },
      firstNumber: 5,
    };
    const both = { ...jess, series: [...jess.series, weeklyLater] };
    expect(followsMyPaydays(both, 'week', 'at-start')).toBe(true);
    expect(followsMyPaydays(both, 'month', 'spread')).toBe(true);
    const irregular = {
      ...jess,
      series: [...jess.series, { ...weeklyLater, schedule: { kind: 'irregular' as const } }],
    };
    expect(followsMyPaydays(irregular, 'month', 'at-start')).toBe(false);
    const { settings: _settings, ...noSettings } = jess;
    expect(followsMyPaydays(noSettings, 'month', 'at-start')).toBe(false);
  });

  it('names the budgets on the accounts being shared, but not one that ended over two months ago', () => {
    const jess = recordsFromRows(readableBy(serverRows(), JESS), JESS).records;
    const food = jess.budgets?.[0] as Budget;
    const records = {
      ...jess,
      budgets: [
        food,
        { ...food, id: 'old', name: 'Old food', endsOn: '2026-08-01' },
        { ...food, id: 'card', name: 'Card', leaves: 'pay-later' as const, billDay: 29 },
        { ...food, id: 'tom', name: 'Meals out', followsPayOf: TOM },
      ],
    };
    expect(budgetsOnMyPaydays(records, TODAY, (id) => id === 'joint')).toEqual(['Food']);
    expect(budgetsOnMyPaydays(records, TODAY, () => false)).toEqual([]);
  });

  it("a partner's line comes before the note that it was passed on", () => {
    expect(budgetPaydaysLine({ ...facts, passedOn: true, partner: 'Sam' })).toBe(
      'Sam sees this leave on your paydays.',
    );
  });
});

describe("The phone keeps a partner's paydays with the plan (D512)", () => {
  it('saved and loaded again, they come back exactly, and the plan is the same', async () => {
    const { recordsOf, rowsOf } = await import('../../data/db.ts');
    const tom = recordsFromRows(readableBy(serverRows(), TOM), TOM).records;
    const stored = rowsOf(PLAN, tom);
    expect(stored.filter((one) => one.kind === 'paydays').map((one) => one.key)).toEqual([JESS]);
    const back = recordsOf(stored);
    expect(back.otherPaydays).toEqual(tom.otherPaydays);
    expect(jointDays(back)).toEqual(jointDays(tom));
  });
});
