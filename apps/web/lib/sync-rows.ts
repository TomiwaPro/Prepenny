// The plan as rows on the server, and back (step 3c, ARCHITECTURE.md 3.5).
//
// The phone keeps the engine's own records (D87). The server keeps one row
// per record in the tables of supabase/migrations, with the sync fields it
// fills in itself. This file turns one into the other, exactly, so a plan
// brought down on another phone is exactly the plan that was left (brief
// Part 10): every figure the same.
//
// It also keeps what's private apart, as the database's rules ask (D291,
// D303): a shared payment never names a private debt, goal or job, so those
// links go in `private_links`, which only their person reads; the shared
// half of a private transfer names nothing private, and its private half
// names it instead (`mirrored_by`). Bringing a plan down joins them back on
// (PLAN.md items 24 and 28). A partner's phone never has them, so its plan
// has the shared records alone.
//
// Pure: no network, no storage, no clock. Runs in the background worker.
// Nothing here ever writes an amount, a name or a note anywhere but its
// return value (CLAUDE.md).

import {
  type Account,
  applyWrites,
  type BalanceUpdate,
  type Budget,
  type Debt,
  type Goal,
  hasShiftDetails,
  type PayAdjustment,
  type PaymentChange,
  type PayProfile,
  type PayWeek,
  type PlanRecords,
  type OtherPaydays,
  type PaydaySchedule,
  type PlanSettings,
  paymentNumberOf,
  type RecordWrite,
  type Series,
  type Spend,
  type Tick,
} from '@prepenny/engine';
import { holidaysFor } from './holidays.ts';
import type { SetupProgress } from './setup-progress.ts';
import { derivedId } from './sync-ids.ts';

/** The plan record tables, in the order a new plan's rows are saved, so every link is saved after what it names. */
export const RECORD_TABLES = [
  'accounts',
  'debts',
  'pay_profiles',
  'pay_weeks',
  'goals',
  'budgets',
  'balance_updates',
  'series',
  'payment_changes',
  'ticks',
  'spends',
  'pay_adjustments',
  'pay_adjustment_details',
  'settings',
  'private_links',
] as const;

export type RecordTable = (typeof RECORD_TABLES)[number];
/**
 * `paydays` are the database's own (step 4a, D512): the dates of another
 * person's pay a shared budget follows. Phones read them and never write them.
 */
export type Table = RecordTable | 'plans' | 'paydays';

/** One row as the server last gave it to this phone: the phone's copy of the server (its "mirror"). */
export interface MirrorRow {
  readonly table: Table;
  readonly id: string;
  readonly version: number;
  /** The plan's change number when it was last saved (ARCHITECTURE.md 3.1). */
  readonly seq: number;
  readonly privateTo: string | null;
  readonly deleted: boolean;
  /** When it was last changed, as the server says: for "Your saved plan, last changed Tue 3 Nov". */
  readonly changedAt?: string;
  /** The edit that last saved it, when it was made and by whom (step 3d): for clashes. */
  readonly editId?: string;
  readonly editMadeAt?: string;
  /** When that edit reached the account, by the server's clock (D492): for "Changed by Tom, 2 hours ago". */
  readonly editSavedAt?: string;
  readonly editBy?: string;
  /** What kind of change that was (step 3g), so sharing an account isn't "Changed by" anyone: "tick", "share-accounts". */
  readonly editKind?: string;
  /** Who added it (step 3g): "Added by Tom", and who may make a shared account private again. */
  readonly createdBy?: string;
  /** Its own columns: everything but the sync fields. */
  readonly values: Readonly<Record<string, unknown>>;
}

/** One record written in an edit, as save_edit takes it. */
export interface DbWrite {
  readonly table: Table;
  readonly id: string;
  /** The version this phone last saw, or null for a new record. */
  readonly version: number | null;
  /** Every column, null where empty; null to remove the record. */
  readonly row: Readonly<Record<string, unknown>> | null;
}

export interface SyncPlan {
  readonly planId: string;
  /** The person signed in on this phone. */
  readonly personId: string;
}

const keyOf = (table: Table, id: string) => `${table}|${id}`;

/** The mirror as a lookup by table and id. */
export function mirrorMap(rows: readonly MirrorRow[]): Map<string, MirrorRow> {
  return new Map(rows.map((row) => [keyOf(row.table, row.id), row]));
}

// ---------------------------------------------------------------------------
// Records to rows.

/** A row this phone wants on the server: its table, its id and its columns. */
interface WantedRow {
  readonly table: Table;
  readonly id: string;
  readonly values: Record<string, unknown>;
}

const orNull = <T>(value: T | undefined): T | null => (value === undefined ? null : value);

/** The row id of a one-off change or a tick, found by its payment (D87). */
export function paymentRowId(
  planId: string,
  table: 'payment_changes' | 'ticks',
  seriesId: string,
  originalDate: string,
  setAside = false,
): string {
  return derivedId(planId, table, seriesId, originalDate, setAside ? 'set-aside' : '');
}

/** The row id of a person's settings for the plan. */
export const settingsRowId = (planId: string, personId: string) =>
  derivedId(planId, 'settings', personId);

/** The row id of an overtime's details (D303). */
export const detailsRowId = (planId: string, adjustmentId: string) =>
  derivedId(planId, 'pay-adjustment-details', adjustmentId);

const familyLinkId = (planId: string, what: 'debt' | 'goal', familyId: string) =>
  derivedId(planId, `family-${what}`, familyId);
const jobLinkId = (planId: string, seriesId: string) => derivedId(planId, 'series-job', seriesId);
const tickLinkId = (planId: string, tickRowId: string) => derivedId(planId, 'tick-debt', tickRowId);

/** Works out every row the records make, with the privacy each will have. */
export function rowsOf(
  records: PlanRecords,
  plan: SyncPlan,
  mirror: ReadonlyMap<string, MirrorRow>,
  setup: SetupProgress | undefined,
): Map<string, WantedRow> {
  const { planId, personId } = plan;
  const wanted = new Map<string, WantedRow>();
  const want = (table: Table, id: string, values: Record<string, unknown>) => {
    wanted.set(keyOf(table, id), { table, id, values });
  };
  const known = (table: Table, id: string) => mirror.get(keyOf(table, id));
  /** A record's privacy: as the server has it, or for a new one, private to this person. */
  const chosen = (table: Table, id: string) => {
    const row = known(table, id);
    return row === undefined ? personId : row.privateTo;
  };
  const accountPrivacy = (accountId: string) => chosen('accounts', accountId);
  const goals = new Map((records.goals ?? []).map((goal) => [goal.id, goal]));
  const goalPrivacy = (goalId: string) => {
    const goal = goals.get(goalId);
    const onAccount = goal === undefined ? null : accountPrivacy(goal.accountId);
    if (onAccount !== null) return onAccount;
    const row = known('goals', goalId);
    return row === undefined ? null : row.privateTo;
  };
  /** Whether a row may name a record of this privacy itself, or needs a private link (D291). */
  const mayName = (rowPrivacy: string | null, target: string | null) =>
    target === null || target === rowPrivacy;
  const budgets = new Map((records.budgets ?? []).map((budget) => [budget.id, budget]));
  const series = new Map(records.series.map((one) => [one.id, one]));
  const holidays = holidaysFor(records.settings?.nation ?? 'england-and-wales');
  const halves = new Map(
    records.series.flatMap((one) => (one.mirrorOf === undefined ? [] : [[one.mirrorOf, one.id]])),
  );

  records.accounts.forEach((account, order) => {
    const privateTo = accountPrivacy(account.id);
    want('accounts', account.id, {
      private_to: privateTo,
      list_order: order,
      name: orNull(account.name),
      kind: account.kind,
      currency: 'GBP',
      overdraft_limit: account.overdraftLimit,
      warning_level: account.warningLevel,
      belongs_to: privateTo,
      closed: account.closed === true,
    });
  });

  records.balanceUpdates.forEach((update, order) => {
    want('balance_updates', update.id, {
      list_order: order,
      account_id: update.accountId,
      balance: update.balance,
      checked_on: update.checkedOn,
      checked_at: update.checkedAt,
      expected: null,
      source: 'typed',
    });
  });

  (records.debts ?? []).forEach((debt, order) => {
    const privateTo = chosen('debts', debt.id);
    want('debts', debt.id, {
      private_to: privateTo,
      list_order: order,
      name: debt.name,
      kind: debt.kind,
      currency: debt.currency,
      rate: orNull(debt.rate),
      balance: debt.balance,
      balance_on: debt.balanceOn,
      balance_at: debt.balanceAt,
      starting_balance: debt.startingBalance,
      interest_rate: orNull(debt.interestRate),
      zero_interest_until: orNull(debt.zeroInterestUntil),
      statement_day: orNull(debt.statementDay),
      minimum_rule: orNull(debt.minimumRule),
      belongs_to: privateTo,
      closed: debt.closed === true,
    });
  });

  (records.payProfiles ?? []).forEach((profile, order) => {
    want('pay_profiles', profile.id, {
      list_order: order,
      belongs_to: personId,
      name: orNull(profile.name),
      frequency: profile.frequency,
      tax_code: profile.taxCode,
      basis: profile.basis,
      ni_category: orNull(profile.niCategory),
      pension_percent: orNull(profile.pension?.percent),
      pension_lower: orNull(profile.pension?.lower),
      pension_upper: orNull(profile.pension?.upper),
      pension_when: orNull(profile.pension?.when),
      student_loans: orNull(profile.studentLoans),
      other_deductions: orNull(profile.otherDeductions),
      so_far_tax_year: orNull(profile.soFar?.taxYear),
      so_far_period: orNull(profile.soFar?.period),
      gross_so_far: orNull(profile.soFar?.grossForTax),
      tax_so_far: orNull(profile.soFar?.taxPaid),
      overtime_rate: orNull(profile.overtimeRate),
      covered_to: orNull(profile.coveredTo),
    });
  });

  (records.payWeeks ?? []).forEach((week, order) => {
    want('pay_weeks', week.id, {
      list_order: order,
      pay_profile_id: week.payProfileId,
      name: orNull(week.name),
      lines: week.lines,
      fixed: orNull(week.fixed),
    });
  });

  (records.goals ?? []).forEach((goal, order) => {
    const privateTo = goalPrivacy(goal.id);
    want('goals', goal.id, {
      private_to: privateTo,
      list_order: order,
      name: goal.name,
      target: goal.target,
      target_date: orNull(goal.targetDate),
      account_id: goal.accountId,
      starting_amount: goal.startingAmount,
      belongs_to: privateTo,
      closed: goal.closed === true,
    });
  });

  (records.budgets ?? []).forEach((budget, order) => {
    want('budgets', budget.id, {
      list_order: order,
      account_id: budget.accountId,
      name: budget.name,
      amount: budget.amount,
      amounts_before: orNull(budget.amountsBefore),
      every: budget.every,
      leaves: budget.leaves,
      roll_over: budget.rollOver,
      roll_over_from: orNull(budget.rollOverFrom),
      starts_on: budget.startsOn,
      ends_on: orNull(budget.endsOn),
      bill_day: orNull(budget.billDay),
      statement_day: orNull(budget.statementDay),
      made_at: budget.createdAt,
    });
  });

  /** Whose pay a series is (D303): kept from the server for its family, or worked out once for a new family. */
  const paidTo = (one: Series): string | null => {
    // A series still there first: one removed before its account was shared
    // can still say whose it was then (D414, D418).
    let removed: MirrorRow | undefined;
    for (const row of mirror.values()) {
      if (row.table === 'series' && row.values.family_id === one.familyId) {
        if (!row.deleted) return (row.values.paid_to as string | null | undefined) ?? null;
        removed ??= row;
      }
    }
    if (removed !== undefined) return (removed.values.paid_to as string | null | undefined) ?? null;
    const first = series.get(one.familyId) ?? one;
    if (first.mirrorOf !== undefined || first.direction !== 'in') return null;
    const privacy = accountPrivacy(first.accountId);
    if (privacy !== null) return privacy;
    return first.type === 'pay' || first.type === 'benefits' ? personId : null;
  };

  records.series.forEach((one, order) => {
    const privateTo = accountPrivacy(one.accountId);
    const debtOnRow = one.debtId === undefined || mayName(privateTo, chosen('debts', one.debtId));
    const goalOnRow = one.goalId === undefined || mayName(privateTo, goalPrivacy(one.goalId));
    // A job is always private to its person (D303).
    const jobOnRow = one.payProfileId === undefined || mayName(privateTo, personId);
    const row = known('series', one.id);
    want('series', one.id, {
      list_order: order,
      account_id: one.accountId,
      to_account_id: orNull(one.toAccountId),
      name: one.name,
      direction: one.direction,
      type: one.type,
      amount: one.amount,
      amount_cycle: orNull(one.amountCycle),
      cycle_offset: orNull(one.cycleOffset),
      cycle_pay_weeks: jobOnRow ? orNull(one.cyclePayWeeks) : null,
      start_date: one.start,
      schedule: one.schedule,
      end_rule: one.end,
      last_amount: orNull(one.lastAmount),
      holiday_rule: one.holidayRule,
      debt_id: debtOnRow ? orNull(one.debtId) : null,
      budget_id: null,
      goal_id: goalOnRow ? orNull(one.goalId) : null,
      set_aside_percent: orNull(one.setAside?.percent),
      set_aside_account_id: orNull(one.setAside?.accountId),
      is_estimate: one.isEstimate,
      note: orNull(one.note),
      pay_profile_id: jobOnRow ? orNull(one.payProfileId) : null,
      split_from: orNull(one.splitFrom),
      family_id: one.familyId,
      family_created_at: one.familyCreatedAt,
      first_number: orNull(one.firstNumber),
      // The private half names the shared half that mirrors it (D291).
      mirrored_by: privateTo === null ? null : orNull(halves.get(one.id)),
      // The shared half "From Jess" is locked to the person whose money it is (D16).
      locked_to:
        row === undefined
          ? one.mirrorOf === undefined
            ? null
            : personId
          : ((row.values.locked_to as string | null | undefined) ?? null),
      paid_to: paidTo(one),
    });
    if (!debtOnRow && one.debtId !== undefined) {
      want('private_links', familyLinkId(planId, 'debt', one.familyId), {
        list_order: order,
        family_id: one.familyId,
        debt_id: one.debtId,
        goal_id: null,
        tick_id: null,
        in_debt_update: null,
        series_id: null,
        pay_profile_id: null,
        cycle_pay_weeks: null,
      });
    }
    if (!goalOnRow && one.goalId !== undefined) {
      want('private_links', familyLinkId(planId, 'goal', one.familyId), {
        list_order: order,
        family_id: one.familyId,
        debt_id: null,
        goal_id: one.goalId,
        tick_id: null,
        in_debt_update: null,
        series_id: null,
        pay_profile_id: null,
        cycle_pay_weeks: null,
      });
    }
    if (!jobOnRow && one.payProfileId !== undefined) {
      want('private_links', jobLinkId(planId, one.id), {
        list_order: order,
        family_id: null,
        debt_id: null,
        goal_id: null,
        tick_id: null,
        in_debt_update: null,
        series_id: one.id,
        pay_profile_id: one.payProfileId,
        cycle_pay_weeks: orNull(one.cyclePayWeeks),
      });
    }
  });

  /** The payment a change or tick is on: a series' payment, or a pay-later bill (D111). */
  const onPayment = (seriesId: string, originalDate: string) => {
    const budget = budgets.get(seriesId);
    if (budget !== undefined) {
      return {
        series_id: null,
        budget_id: seriesId,
        payment_number: null,
        privacy: accountPrivacy(budget.accountId),
      };
    }
    const one = series.get(seriesId);
    const number =
      one === undefined ? null : paymentNumberOf({ series: one, holidays, originalDate });
    return {
      series_id: seriesId,
      budget_id: null,
      payment_number: number,
      privacy: one === undefined ? personId : accountPrivacy(one.accountId),
    };
  };

  (records.changes ?? []).forEach((change, order) => {
    const { privacy: _privacy, ...payment } = onPayment(change.seriesId, change.originalDate);
    want(
      'payment_changes',
      paymentRowId(planId, 'payment_changes', change.seriesId, change.originalDate),
      {
        list_order: order,
        ...payment,
        original_date: change.originalDate,
        new_date: orNull(change.newDate),
        amount: orNull(change.amount),
        name: orNull(change.name),
        note: orNull(change.note),
        is_estimate: orNull(change.isEstimate),
        skipped: orNull(change.skipped),
      },
    );
  });

  const updates = new Map(records.balanceUpdates.map((update) => [update.id, update]));
  (records.ticks ?? []).forEach((tick, order) => {
    const { privacy, ...payment } = onPayment(tick.seriesId, tick.originalDate);
    const id = paymentRowId(
      planId,
      'ticks',
      tick.seriesId,
      tick.originalDate,
      tick.setAside === true,
    );
    const update =
      tick.inBalanceUpdate === undefined ? undefined : updates.get(tick.inBalanceUpdate);
    // A tick inside another account's private Update balance counts only for
    // that account (D83), so a shared tick doesn't name it (D291).
    const updateOnRow = update === undefined || mayName(privacy, accountPrivacy(update.accountId));
    const debtOnRow =
      tick.inDebtUpdate === undefined || mayName(privacy, chosen('debts', tick.inDebtUpdate));
    want('ticks', id, {
      list_order: order,
      ...payment,
      original_date: tick.originalDate,
      set_aside: tick.setAside === true,
      paid_on: tick.paidOn,
      ticked_at: tick.tickedAt,
      in_balance_update: updateOnRow ? orNull(tick.inBalanceUpdate) : null,
      in_debt_update: debtOnRow ? orNull(tick.inDebtUpdate) : null,
      source: 'typed',
    });
    if (!debtOnRow && tick.inDebtUpdate !== undefined) {
      want('private_links', tickLinkId(planId, id), {
        list_order: order,
        family_id: null,
        debt_id: null,
        goal_id: null,
        tick_id: id,
        in_debt_update: tick.inDebtUpdate,
        series_id: null,
        pay_profile_id: null,
        cycle_pay_weeks: null,
      });
    }
  });

  (records.spends ?? []).forEach((spend, order) => {
    want('spends', spend.id, {
      list_order: order,
      budget_id: spend.budgetId,
      amount: spend.amount,
      spent_on: spend.spentOn,
      recorded_at: spend.recordedAt,
      note: orNull(spend.note),
    });
  });

  (records.payAdjustments ?? []).forEach((one, order) => {
    want('pay_adjustments', one.id, {
      list_order: order,
      family_id: one.familyId,
      payment_number: one.number,
      change: one.change,
    });
    if (hasShiftDetails(one)) {
      want('pay_adjustment_details', detailsRowId(planId, one.id), {
        list_order: order,
        adjustment_id: one.id,
        kind: one.kind,
        worked_on: one.workedOn,
        hours: one.hours,
        rate: one.rate,
        extras: orNull(one.extras),
        tax_year: one.taxYear,
      });
    }
  });

  if (records.settings !== undefined || setup !== undefined) {
    want('settings', settingsRowId(planId, personId), {
      list_order: 0,
      main_pay_family_id: records.settings?.mainPayFamilyId ?? null,
      setup: orNull(setup),
    });
  }
  want('plans', planId, { nation: records.settings?.nation ?? 'england-and-wales' });
  return wanted;
}

// ---------------------------------------------------------------------------
// What has to be sent: the rows wanted, against the rows the server has.

/** The same value, whatever order an object's keys are in. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return (a ?? null) === (b ?? null);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((one, index) => same(one, b[index]));
  }
  const ka = Object.keys(a as object).filter(
    (key) => (a as Record<string, unknown>)[key] !== undefined,
  );
  const kb = Object.keys(b as object).filter(
    (key) => (b as Record<string, unknown>)[key] !== undefined,
  );
  if (ka.length !== kb.length) return false;
  return ka.every((key) =>
    same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/** True when a wanted row says the same as the server's, its place in its list apart. */
function sameRow(wanted: WantedRow, row: MirrorRow): boolean {
  if (row.deleted) return false;
  return Object.entries(wanted.values).every(([column, value]) => {
    if (column === 'list_order') return true;
    if (column === 'private_to') return same(value, row.privateTo);
    return same(value, row.values[column]);
  });
}

const TABLE_ORDER = new Map<Table, number>([
  ['plans', -1],
  ...RECORD_TABLES.map((table, index) => [table, index] as const),
]);

/**
 * The writes that make the server's rows say what these records say: new
 * records, changed ones and removed ones, in an order where every link is
 * saved after what it names. The rows the server has and these records don't
 * are removed. Rows the same as the server's aren't sent.
 */
export function writesFor(
  records: PlanRecords,
  plan: SyncPlan,
  mirrorRows: readonly MirrorRow[],
  setup: SetupProgress | undefined,
): DbWrite[] {
  const mirror = mirrorMap(mirrorRows);
  const wanted = rowsOf(records, plan, mirror, setup);
  const writes: { write: DbWrite; order: readonly (number | string)[] }[] = [];
  const familyOrder = new Map(
    records.series.map((one) => [one.id, [one.mirrorOf === undefined ? 1 : 0, one.familyId]]),
  );
  for (const [key, row] of wanted) {
    const server = mirror.get(key);
    if (server !== undefined && sameRow(row, server)) continue;
    if (row.table === 'plans') {
      if (server === undefined) continue;
      writes.push({
        write: { table: 'plans', id: row.id, version: server.version, row: row.values },
        order: [-1],
      });
      continue;
    }
    const series = row.table === 'series' ? familyOrder.get(row.id) : undefined;
    writes.push({
      write: { table: row.table, id: row.id, version: server?.version ?? null, row: row.values },
      order: [
        TABLE_ORDER.get(row.table) ?? 99,
        ...(series ?? []),
        Number(row.values.first_number ?? 0),
        Number(row.values.list_order ?? 0),
      ],
    });
  }
  for (const [key, server] of mirror) {
    if (server.deleted || server.table === 'plans' || server.table === 'paydays' || wanted.has(key)) {
      continue;
    }
    writes.push({
      write: { table: server.table, id: server.id, version: server.version, row: null },
      // Removed last, so nothing new is ever saved naming a removed record's place.
      order: [100 + (TABLE_ORDER.get(server.table) ?? 0)],
    });
  }
  const compare = (a: readonly (number | string)[], b: readonly (number | string)[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const x = a[i] ?? '';
      const y = b[i] ?? '';
      if (x === y) continue;
      if (typeof x === 'number' && typeof y === 'number') return x - y;
      return String(x) < String(y) ? -1 : 1;
    }
    return 0;
  };
  return writes.sort((a, b) => compare(a.order, b.order)).map(({ write }) => write);
}

/**
 * The writes one edit sends: the records as the server has them, with the
 * edit's own writes on top, against the server's rows (ARCHITECTURE.md
 * 3.5). Edits are sent one at a time, each once the one before is saved.
 */
export function writesForEdit(
  mirrorRows: readonly MirrorRow[],
  edit: readonly RecordWrite[],
  plan: SyncPlan,
  setup: SetupProgress | undefined,
): { readonly writes: DbWrite[]; readonly records: PlanRecords } {
  const records = applyWrites(recordsFromRows(mirrorRows, plan.personId).records, edit);
  return { writes: writesFor(records, plan, mirrorRows, setup), records };
}

// ---------------------------------------------------------------------------
// Rows to records.

export interface FromRows {
  readonly records: PlanRecords;
  /** How far this person's first-time setup has got (step 2e), from their own settings. */
  readonly setup: SetupProgress | undefined;
}

type Values = Readonly<Record<string, unknown>>;

/** A value that's there, or nothing: the engine leaves out what isn't set. */
function some<K extends string, V>(key: K, value: V | null | undefined): { [P in K]?: V } {
  return (value === null || value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

const text = (value: unknown) => value as string;
const number = (value: unknown) => value as number;

/** The plan's records from the rows the server has given this phone. */
/**
 * The plan's records from the server's rows. `me` is the person signed in on
 * this phone; without it, it's the person whose own settings are among the
 * rows, as only a person's own settings ever come down (D289).
 */
export function recordsFromRows(rows: readonly MirrorRow[], me?: string): FromRows {
  const live = rows.filter((row) => !row.deleted);
  const byTable = new Map<Table, MirrorRow[]>();
  for (const row of live) byTable.set(row.table, [...(byTable.get(row.table) ?? []), row]);
  const of = (table: Table) =>
    [...(byTable.get(table) ?? [])].sort(
      (a, b) =>
        number(a.values.list_order ?? 0) - number(b.values.list_order ?? 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  // The private links, joined back on (PLAN.md items 24 and 28).
  const familyDebt = new Map<string, string>();
  const familyGoal = new Map<string, string>();
  const job = new Map<string, Values>();
  const tickDebt = new Map<string, string>();
  for (const { values } of of('private_links')) {
    if (values.family_id !== null && values.debt_id !== null) {
      familyDebt.set(text(values.family_id), text(values.debt_id));
    } else if (values.family_id !== null && values.goal_id !== null) {
      familyGoal.set(text(values.family_id), text(values.goal_id));
    } else if (values.series_id !== null) {
      job.set(text(values.series_id), values);
    } else if (values.tick_id !== null) {
      tickDebt.set(text(values.tick_id), text(values.in_debt_update));
    }
  }
  const mirroredBy = new Map<string, string>();
  for (const { id, values } of of('series')) {
    if (values.mirrored_by !== null && values.mirrored_by !== undefined) {
      mirroredBy.set(text(values.mirrored_by), id);
    }
  }

  const accounts = of('accounts').map(
    ({ id, values: v }): Account => ({
      id,
      ...some('name', v.name as string | null),
      kind: v.kind as Account['kind'],
      overdraftLimit: number(v.overdraft_limit),
      warningLevel: number(v.warning_level),
      ...(v.closed === true ? { closed: true } : {}),
    }),
  );
  const balanceUpdates = of('balance_updates').map(
    ({ id, values: v }): BalanceUpdate => ({
      id,
      accountId: text(v.account_id),
      balance: number(v.balance),
      checkedOn: text(v.checked_on),
      checkedAt: text(v.checked_at),
    }),
  );
  const debts = of('debts').map(
    ({ id, values: v }): Debt => ({
      id,
      name: text(v.name),
      kind: v.kind as Debt['kind'],
      currency: text(v.currency),
      ...some('rate', v.rate as string | null),
      balance: number(v.balance),
      balanceOn: text(v.balance_on),
      balanceAt: text(v.balance_at),
      startingBalance: number(v.starting_balance),
      ...some('interestRate', v.interest_rate as string | null),
      ...some('zeroInterestUntil', v.zero_interest_until as string | null),
      ...some('statementDay', v.statement_day as number | null),
      ...some('minimumRule', v.minimum_rule as Debt['minimumRule'] | null),
      ...(v.closed === true ? { closed: true } : {}),
    }),
  );
  const payProfiles = of('pay_profiles').map(({ id, values: v }): PayProfile => {
    const pension =
      v.pension_percent === null
        ? undefined
        : {
            percent: text(v.pension_percent),
            ...some('lower', v.pension_lower as number | null),
            ...some('upper', v.pension_upper as number | null),
            when: v.pension_when as 'before-tax' | 'after-tax',
          };
    const soFar =
      v.so_far_tax_year === null
        ? undefined
        : {
            taxYear: text(v.so_far_tax_year),
            period: number(v.so_far_period),
            grossForTax: number(v.gross_so_far),
            taxPaid: number(v.tax_so_far),
          };
    return {
      id,
      ...some('name', v.name as string | null),
      frequency: v.frequency as PayProfile['frequency'],
      taxCode: text(v.tax_code),
      basis: v.basis as PayProfile['basis'],
      ...some('niCategory', v.ni_category as string | null),
      ...some('pension', pension),
      ...some('studentLoans', v.student_loans as PayProfile['studentLoans'] | null),
      ...some('otherDeductions', v.other_deductions as PayProfile['otherDeductions'] | null),
      ...some('soFar', soFar),
      ...some('overtimeRate', v.overtime_rate as string | null),
      ...some('coveredTo', v.covered_to as PayProfile['coveredTo'] | null),
    };
  });
  const payWeeks = of('pay_weeks').map(
    ({ id, values: v }): PayWeek => ({
      id,
      ...some('name', v.name as string | null),
      payProfileId: text(v.pay_profile_id),
      lines: v.lines as PayWeek['lines'],
      ...some('fixed', v.fixed as PayWeek['fixed'] | null),
    }),
  );
  const goals = of('goals').map(
    ({ id, values: v }): Goal => ({
      id,
      name: text(v.name),
      target: number(v.target),
      ...some('targetDate', v.target_date as string | null),
      accountId: text(v.account_id),
      startingAmount: number(v.starting_amount),
      ...(v.closed === true ? { closed: true } : {}),
    }),
  );
  const own = of('settings')[0];
  const person = me ?? own?.privateTo ?? null;
  // A shared budget follows the paydays of the person who added it (D508):
  // named only when that's someone else, whose paydays come as dates (D512).
  const followsOf = (v: Values) => {
    const follows = (v.follows_pay_of as string | null | undefined) ?? null;
    return follows === null || follows === person ? {} : { followsPayOf: follows };
  };
  const budgets = of('budgets').map(
    ({ id, values: v }): Budget => ({
      id,
      accountId: text(v.account_id),
      name: text(v.name),
      amount: number(v.amount),
      ...some('amountsBefore', v.amounts_before as Budget['amountsBefore'] | null),
      every: v.every as Budget['every'],
      leaves: v.leaves as Budget['leaves'],
      rollOver: v.roll_over === true,
      ...some('rollOverFrom', v.roll_over_from as string | null),
      startsOn: text(v.starts_on),
      ...some('endsOn', v.ends_on as string | null),
      ...some('billDay', v.bill_day as number | null),
      ...some('statementDay', v.statement_day as number | null),
      createdAt: text(v.made_at),
      ...followsOf(v),
    }),
  );
  // Other people's paydays, the dates only (D512): each person's series in
  // the order they carry on from each other.
  const paydaysBy = new Map<string, PaydaySchedule[]>();
  for (const { id, values: v } of of('paydays').sort(
    (a, b) =>
      number(a.values.first_number ?? 0) - number(b.values.first_number ?? 0) ||
      (a.id < b.id ? -1 : 1),
  )) {
    const whose = v.person as string | null;
    if (whose === null || whose === person) continue;
    const from = (v.moved_from as string[] | null) ?? [];
    const to = (v.moved_to as string[] | null) ?? [];
    const skipped = (v.skipped as string[] | null) ?? [];
    paydaysBy.set(whose, [
      ...(paydaysBy.get(whose) ?? []),
      {
        id,
        start: text(v.start_date),
        schedule: v.schedule as Series['schedule'],
        end: v.end_rule as Series['end'],
        holidayRule: v.holiday_rule as Series['holidayRule'],
        ...some('firstNumber', v.first_number as number | null),
        ...(from.length === 0
          ? {}
          : { moved: from.map((date, i) => ({ from: date, to: to[i] as string })) }),
        ...(skipped.length === 0 ? {} : { skipped }),
      },
    ]);
  }
  const otherPaydays: OtherPaydays[] = [...paydaysBy].map(([whose, series]) => ({
    person: whose,
    series,
  }));
  const series = of('series').map(({ id, values: v }): Series => {
    const link = job.get(id);
    const payProfileId =
      (v.pay_profile_id as string | null) ?? (link?.pay_profile_id as string | undefined);
    const cyclePayWeeks =
      (v.cycle_pay_weeks as string[] | null) ??
      (link?.cycle_pay_weeks as string[] | null | undefined);
    const familyId = text(v.family_id);
    return {
      id,
      accountId: text(v.account_id),
      ...some('toAccountId', v.to_account_id as string | null),
      name: text(v.name),
      direction: v.direction as Series['direction'],
      amount: number(v.amount),
      ...some('amountCycle', v.amount_cycle as number[] | null),
      ...some('cycleOffset', v.cycle_offset as number | null),
      start: text(v.start_date),
      schedule: v.schedule as Series['schedule'],
      end: v.end_rule as Series['end'],
      ...some('lastAmount', v.last_amount as number | null),
      holidayRule: v.holiday_rule as Series['holidayRule'],
      type: v.type as Series['type'],
      ...some('debtId', (v.debt_id as string | null) ?? familyDebt.get(familyId)),
      ...some('goalId', (v.goal_id as string | null) ?? familyGoal.get(familyId)),
      ...(v.set_aside_percent === null || v.set_aside_percent === undefined
        ? {}
        : {
            setAside: {
              percent: text(v.set_aside_percent),
              accountId: text(v.set_aside_account_id),
            },
          }),
      ...some('payProfileId', payProfileId),
      ...some('cyclePayWeeks', cyclePayWeeks),
      isEstimate: v.is_estimate === true,
      ...some('note', v.note as string | null),
      familyId,
      familyCreatedAt: text(v.family_created_at),
      ...some('firstNumber', v.first_number as number | null),
      ...some('splitFrom', v.split_from as string | null),
      ...some('mirrorOf', mirroredBy.get(id)),
    };
  });
  const paymentOf = (v: Values) => text(v.series_id ?? v.budget_id);
  const changes = of('payment_changes').map(
    ({ values: v }): PaymentChange => ({
      seriesId: paymentOf(v),
      originalDate: text(v.original_date),
      ...some('newDate', v.new_date as string | null),
      ...some('amount', v.amount as number | null),
      ...some('name', v.name as string | null),
      ...some('note', v.note as string | null),
      ...some('isEstimate', v.is_estimate as boolean | null),
      ...some('skipped', v.skipped as boolean | null),
    }),
  );
  const ticks = of('ticks').map(
    ({ id, values: v }): Tick => ({
      seriesId: paymentOf(v),
      originalDate: text(v.original_date),
      tickedAt: text(v.ticked_at),
      ...some('inBalanceUpdate', v.in_balance_update as string | null),
      ...some('inDebtUpdate', (v.in_debt_update as string | null) ?? tickDebt.get(id)),
      paidOn: text(v.paid_on),
      ...(v.set_aside === true ? { setAside: true as const } : {}),
    }),
  );
  const spends = of('spends').map(
    ({ id, values: v }): Spend => ({
      id,
      budgetId: text(v.budget_id),
      amount: number(v.amount),
      spentOn: text(v.spent_on),
      recordedAt: text(v.recorded_at),
      ...some('note', v.note as string | null),
    }),
  );
  const details = new Map(
    of('pay_adjustment_details').map((row) => [text(row.values.adjustment_id), row.values]),
  );
  const payAdjustments = of('pay_adjustments').map(({ id, values: v }): PayAdjustment => {
    const d = details.get(id);
    return {
      id,
      familyId: text(v.family_id),
      number: number(v.payment_number),
      ...(d === undefined
        ? {}
        : {
            kind: d.kind as 'overtime' | 'missed-shift',
            workedOn: text(d.worked_on),
            hours: text(d.hours),
            rate: text(d.rate),
            ...some('extras', d.extras as number | null),
            taxYear: text(d.tax_year),
          }),
      change: number(v.change),
    };
  });
  const plan = live.find((row) => row.table === 'plans');
  const settings: PlanSettings | undefined =
    own === undefined && (plan === undefined || plan.values.nation === 'england-and-wales')
      ? undefined
      : {
          nation: ((plan?.values.nation as PlanSettings['nation'] | undefined) ??
            'england-and-wales') as PlanSettings['nation'],
          mainPayFamilyId: (own?.values.main_pay_family_id as string | null | undefined) ?? null,
        };
  return {
    records: {
      accounts,
      balanceUpdates,
      series,
      changes,
      ticks,
      debts,
      budgets,
      spends,
      goals,
      payProfiles,
      payWeeks,
      payAdjustments,
      ...(settings === undefined ? {} : { settings }),
      ...(otherPaydays.length === 0 ? {} : { otherPaydays }),
    },
    setup: (own?.values.setup as SetupProgress | null | undefined) ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Rows from the server.

const SYNC_FIELDS = new Set([
  'id',
  'version',
  'seq',
  'private_to',
  'deleted',
  'changed_at',
  'changed_by',
  'created_at',
  'created_by',
  'edit_id',
  'plan_id',
]);

function withoutSyncFields(row: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    if (!SYNC_FIELDS.has(column)) values[column] = value;
  }
  return values;
}

/** The edit that saved a row, as save_edit or plan_changes says. */
export interface SavedBy {
  readonly id?: unknown;
  readonly madeAt?: unknown;
  /** When it reached the account, by the server's clock (D492). */
  readonly savedAt?: unknown;
  readonly by?: unknown;
  readonly kind?: unknown;
}

/** A row as plan_changes gives it, kept on the phone, with the edit that last saved it (step 3d). */
export function mirrorRowOf(
  table: Table,
  row: Readonly<Record<string, unknown>>,
  edit: SavedBy = {},
): MirrorRow {
  const values = withoutSyncFields(row);
  const editId = edit.id ?? row.edit_id;
  return {
    table,
    id: text(row.id),
    version: number(row.version),
    seq: number(row.seq ?? 0),
    privateTo: (row.private_to as string | null | undefined) ?? null,
    deleted: row.deleted === true,
    ...(typeof row.changed_at === 'string' ? { changedAt: row.changed_at } : {}),
    ...(typeof editId === 'string' ? { editId } : {}),
    ...(typeof edit.madeAt === 'string' ? { editMadeAt: edit.madeAt } : {}),
    ...(typeof edit.savedAt === 'string' ? { editSavedAt: edit.savedAt } : {}),
    // A change by someone whose account has been deleted names nobody: it's
    // still a change, by "someone who has left" (D482).
    ...(typeof edit.by === 'string'
      ? { editBy: edit.by }
      : edit.by === null && typeof edit.madeAt === 'string'
        ? { editBy: '' }
        : {}),
    ...(typeof edit.kind === 'string' ? { editKind: edit.kind } : {}),
    ...(typeof row.created_by === 'string' ? { createdBy: row.created_by } : {}),
    values,
  };
}

/** The rows of a saved edit as the phone now knows the server has them: what it sent, at the versions save_edit gave back. */
export function savedRows(
  sent: readonly DbWrite[],
  saved: readonly {
    readonly table: Table;
    readonly id: string;
    readonly version: number;
    readonly seq: number;
    readonly private_to: string | null;
    readonly deleted: boolean;
  }[],
  mirrorRows: readonly MirrorRow[],
  /** The edit that saved them: this phone's own (step 3d). */
  edit?: {
    readonly id: string;
    readonly madeAt: string;
    readonly by: string;
    readonly kind?: string;
  },
): MirrorRow[] {
  const mirror = mirrorMap(mirrorRows);
  const answers = new Map(saved.map((one) => [keyOf(one.table, one.id), one]));
  const rows: MirrorRow[] = [];
  for (const write of sent) {
    const key = keyOf(write.table, write.id);
    const answer = answers.get(key);
    if (answer === undefined) continue;
    const before = mirror.get(key);
    rows.push({
      table: write.table,
      id: write.id,
      version: answer.version,
      seq: answer.seq,
      privateTo: answer.private_to,
      deleted: answer.deleted,
      ...(before?.createdBy !== undefined
        ? { createdBy: before.createdBy }
        : write.version === null && edit !== undefined
          ? { createdBy: edit.by }
          : {}),
      ...(edit === undefined
        ? before?.editId === undefined
          ? {}
          : {
              editId: before.editId,
              ...(before.editMadeAt === undefined ? {} : { editMadeAt: before.editMadeAt }),
              ...(before.editBy === undefined ? {} : { editBy: before.editBy }),
              ...(before.editKind === undefined ? {} : { editKind: before.editKind }),
            }
        : {
            editId: edit.id,
            editMadeAt: edit.madeAt,
            editBy: edit.by,
            ...(edit.kind === undefined ? {} : { editKind: edit.kind }),
          }),
      values: withoutSyncFields({ ...(before?.values ?? {}), ...(write.row ?? {}) }),
    });
  }
  return rows;
}
