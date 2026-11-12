// A backup of someone's plan as a file (brief 4.12, step 3h): what "Download
// my data" writes as JSON, and what "Import a backup" reads back.
//
// The file holds the plan as the engine keeps it (D87), plus, for someone
// signed in, their account and the history of their plan, for them to keep.
// Importing reads the plan only, and trusts nothing in the file:
// - its size first, then that it's JSON, then that it's a PrePenny backup of
//   a version this app reads;
// - every record and every field, with nothing left over, against the
//   engine's own types and the database's own limits: kinds, dates, times,
//   amounts in whole pence, decimals as text, names and notes;
// - how many records of each kind, so a file can't fill the phone;
// - every link between records, which must name a record in the same file;
// - then the engine works the plan out, as Home would, and refuses anything
//   it can't use.
// Every id is made new on this phone, so nothing in the file can name or
// replace a record anywhere else. Who a record belongs to and who may see
// it are never read from the file: the plan is the importer's own, and the
// database decides each record's privacy as it saves it (step 3h).
//
// Pure: no network, no storage. Nothing here writes an amount, a name or a
// note anywhere but its return value (CLAUDE.md).

import {
  type Account,
  type BalanceUpdate,
  type Budget,
  type Debt,
  EngineInputError,
  type Goal,
  NATIONS,
  type Nation,
  type PayAdjustment,
  type PaymentChange,
  type PayProfile,
  type PayWeek,
  type PlanRecords,
  type PlanSettings,
  parseDate,
  parseTaxCode,
  parseTime,
  type Series,
  type Spend,
  type Tick,
  workOutDebts,
  workOutGoals,
} from '@prepenny/engine';
import { z } from 'zod';
import { holidaysFor } from './holidays.ts';
import { planLookAhead, workOutPlanTo } from './plan-input.ts';

// Zod checks without making code of its own at run time: the app's security
// policy allows no eval (D175), and Zod would otherwise try it first.
z.config({ jitless: true });

/** What the file says it is. */
export const BACKUP_APP = 'PrePenny';
export const BACKUP_KIND = 'backup';
/** The version of the file this app writes and reads. */
export const BACKUP_VERSION = 1;

/** The biggest file read: a plan used every day for years, with its history, is a few MB. */
export const MOST_BYTES = 20 * 1024 * 1024;

/** The most of each kind of record a backup may hold: far more than any real plan. */
export const MOST_OF = {
  accounts: 50,
  balanceUpdates: 20_000,
  series: 5_000,
  changes: 20_000,
  ticks: 50_000,
  debts: 200,
  budgets: 200,
  spends: 50_000,
  goals: 200,
  payProfiles: 20,
  payWeeks: 200,
  payAdjustments: 5_000,
} as const;

/** The longest name, and the longest note, read from a file. */
const LONGEST_NAME = 500;
const LONGEST_NOTE = 5_000;

// ---------------------------------------------------------------------------
// What a backup holds.

/** The person's account, as the server gives it for them alone (my_account_data). */
export interface BackupAccount {
  readonly email: string;
  readonly signedUpAt: string;
  readonly name: string | null;
  readonly backupEmail: string | null;
  readonly twoStepSignIn: boolean;
  readonly signsInWithGoogle: boolean;
  readonly devices: readonly {
    readonly device: string;
    readonly thisDevice: boolean;
    readonly signedInAt: string;
    readonly lastUsedAt: string;
  }[];
  readonly plans: readonly {
    readonly role: string;
    readonly joinedAt: string;
    readonly leftAt: string | null;
  }[];
}

/** Who's in the plan, by the names they chose (D420). */
export interface BackupPerson {
  readonly name: string;
  readonly role: string;
  readonly you: boolean;
}

/** One change in the plan's history, in Activity's words (D456, D474). */
export interface BackupChange {
  readonly at: string;
  readonly words: string;
  readonly undone: boolean;
}

export interface Backup {
  readonly app: typeof BACKUP_APP;
  readonly kind: typeof BACKUP_KIND;
  readonly version: typeof BACKUP_VERSION;
  /** One plain sentence on what the file is, for anyone who opens it. */
  readonly about: string;
  readonly madeAt: string;
  readonly plan: {
    readonly nation: Nation;
    readonly records: PlanRecords;
  };
  readonly account: BackupAccount | null;
  readonly people: readonly BackupPerson[] | null;
  readonly history: readonly BackupChange[] | null;
}

/**
 * A plan's records as a backup keeps them: everything the engine needs, and
 * nothing that names a person. Which person a debt or goal belongs to is
 * the database's to decide, and on import it's always the importer.
 */
export function recordsForBackup(records: PlanRecords): PlanRecords {
  const withoutPerson = <T extends { readonly belongsTo?: string }>(one: T): T => {
    const { belongsTo: _belongsTo, ...rest } = one;
    return rest as T;
  };
  return {
    ...records,
    ...(records.debts === undefined ? {} : { debts: records.debts.map(withoutPerson) }),
    ...(records.goals === undefined ? {} : { goals: records.goals.map(withoutPerson) }),
  };
}

/** The backup file's content, as JSON a person can read. */
export function backupText(backup: Backup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Checking every field of a file before it's trusted.

/** True for text with a hidden control character in it, other than a tab or a new line. */
function hasControl(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) return true;
  }
  return false;
}
// Ids are only read to join the file's records to each other: each is made
// new on import. A plan made on a phone has random ids; one from the tests
// has short names, such as "rent".
const ID = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/);
const name = z
  .string()
  .max(LONGEST_NAME)
  .refine((text) => !hasControl(text) && !/[\t\r\n]/.test(text));
const note = z
  .string()
  .max(LONGEST_NOTE)
  .refine((text) => !hasControl(text));
const date = z.string().refine((text) => {
  try {
    parseDate(text);
    return /^\d{4}-\d{2}-\d{2}$/.test(text);
  } catch {
    return false;
  }
});
const time = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$/)
  .refine((text) => {
    try {
      parseTime(text);
      return true;
    } catch {
      return false;
    }
  });
const decimal = z.string().regex(/^[0-9]{1,9}(\.[0-9]{1,9})?$/);
const pence = z.number().int().refine(Number.isSafeInteger);
const notNegative = pence.refine((value) => value >= 0);
const positive = pence.refine((value) => value > 0);
const dayOfMonth = z.number().int().min(1).max(31);
const paymentNumber = z.number().int().min(0).max(100_000);
const taxYear = z.string().regex(/^[0-9]{4}-[0-9]{2}$/);
const taxCode = z
  .string()
  .max(20)
  .refine((text) => {
    try {
      parseTaxCode(text);
      return true;
    } catch {
      return false;
    }
  });

const account = z.strictObject({
  id: ID,
  name: name.optional(),
  kind: z.enum(['current', 'savings', 'joint']),
  overdraftLimit: notNegative,
  warningLevel: pence,
  closed: z.boolean().optional(),
});

const balanceUpdate = z.strictObject({
  id: ID,
  accountId: ID,
  balance: pence,
  checkedOn: date,
  checkedAt: time,
});

const monthlyDay = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('day'), day: dayOfMonth }),
  z.strictObject({ kind: z.literal('last-day') }),
  z.strictObject({ kind: z.literal('last-working-day') }),
  z.strictObject({
    kind: z.literal('weekday'),
    weekday: z.number().int().min(1).max(7),
    position: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal('last')]),
  }),
]);

const schedule = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('once') }),
  z.strictObject({ kind: z.literal('weekly'), every: z.number().int().min(1).max(52) }),
  z.strictObject({
    kind: z.literal('monthly'),
    every: z.number().int().min(1).max(12),
    on: monthlyDay,
    leaveOut: z.array(z.number().int().min(1).max(12)).max(11).optional(),
  }),
  z.strictObject({ kind: z.literal('dates'), dates: z.array(date).min(1).max(1_000) }),
  z.strictObject({ kind: z.literal('irregular') }),
]);

const endRule = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('never') }),
  z.strictObject({ kind: z.literal('after'), payments: z.number().int().min(1).max(100_000) }),
  z.strictObject({ kind: z.literal('on'), date }),
]);

const series = z.strictObject({
  id: ID,
  accountId: ID,
  toAccountId: ID.optional(),
  name,
  direction: z.enum(['in', 'out', 'transfer']),
  amount: notNegative,
  amountCycle: z.array(notNegative).min(1).max(8).optional(),
  cycleOffset: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  start: date,
  schedule,
  end: endRule,
  lastAmount: notNegative.optional(),
  holidayRule: z.enum(['keep', 'working-day-before', 'working-day-after']),
  type: z.enum(['pay', 'benefits', 'rent', 'bills', 'debt', 'spending-money', 'savings', 'other']),
  debtId: ID.optional(),
  goalId: ID.optional(),
  setAside: z.strictObject({ percent: decimal, accountId: ID }).optional(),
  payProfileId: ID.optional(),
  cyclePayWeeks: z.array(ID).min(1).max(8).optional(),
  isEstimate: z.boolean(),
  note: note.optional(),
  familyId: ID,
  familyCreatedAt: time,
  firstNumber: paymentNumber.optional(),
  splitFrom: ID.optional(),
  mirrorOf: ID.optional(),
});

const change = z.strictObject({
  seriesId: ID,
  originalDate: date,
  newDate: date.optional(),
  amount: notNegative.optional(),
  name: name.optional(),
  note: note.optional(),
  isEstimate: z.boolean().optional(),
  skipped: z.boolean().optional(),
});

const tick = z.strictObject({
  seriesId: ID,
  originalDate: date,
  tickedAt: time,
  inBalanceUpdate: ID.optional(),
  inDebtUpdate: ID.optional(),
  paidOn: date,
  setAside: z.literal(true).optional(),
});

const minimumRule = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('typed'), amount: notNegative }),
  z.strictObject({ kind: z.literal('rule'), percent: decimal, atLeast: notNegative }),
]);

const debt = z.strictObject({
  id: ID,
  name,
  kind: z.enum(['pay-later', 'credit-card', 'loan', 'overdraft', 'owed-to-a-person']),
  currency: z.string().regex(/^[A-Z]{3}$/),
  rate: decimal.optional(),
  balance: pence,
  balanceOn: date,
  balanceAt: time,
  startingBalance: pence,
  interestRate: decimal.optional(),
  zeroInterestUntil: date.optional(),
  statementDay: dayOfMonth.optional(),
  minimumRule: minimumRule.optional(),
  // Who it belongs to is never read from a file: on import it's the importer's.
  belongsTo: z.string().max(100).optional(),
  closed: z.boolean().optional(),
});

const budget = z.strictObject({
  id: ID,
  accountId: ID,
  name,
  amount: positive,
  amountsBefore: z
    .array(z.strictObject({ until: date, amount: positive }))
    .max(1_000)
    .optional(),
  every: z.enum(['week', 'month']),
  leaves: z.enum(['at-start', 'spread', 'pay-later']),
  rollOver: z.boolean(),
  rollOverFrom: date.optional(),
  startsOn: date,
  endsOn: date.optional(),
  billDay: dayOfMonth.optional(),
  statementDay: dayOfMonth.optional(),
  createdAt: time,
});

const spend = z.strictObject({
  id: ID,
  budgetId: ID,
  amount: positive,
  spentOn: date,
  recordedAt: time,
  note: note.optional(),
});

const goal = z.strictObject({
  id: ID,
  name,
  target: positive,
  targetDate: date.optional(),
  accountId: ID,
  startingAmount: notNegative,
  belongsTo: z.string().max(100).optional(),
  closed: z.boolean().optional(),
});

const amountLine = z.strictObject({ name, amount: notNegative });

const payProfile = z.strictObject({
  id: ID,
  name: name.optional(),
  frequency: z.enum(['weekly', 'two-weekly', 'four-weekly', 'monthly']),
  taxCode,
  basis: z.enum(['cumulative', 'week-one']),
  niCategory: z
    .string()
    .regex(/^[A-Z]$/)
    .optional(),
  pension: z
    .strictObject({
      percent: decimal,
      lower: notNegative.optional(),
      upper: notNegative.optional(),
      when: z.enum(['before-tax', 'after-tax']),
    })
    .optional(),
  studentLoans: z
    .array(z.enum(['plan-1', 'plan-2', 'plan-4', 'plan-5', 'postgraduate']))
    .max(5)
    .optional(),
  otherDeductions: z.array(amountLine).max(50).optional(),
  soFar: z
    .strictObject({
      taxYear,
      period: z.number().int().min(1).max(56),
      grossForTax: notNegative,
      taxPaid: pence,
    })
    .optional(),
  overtimeRate: decimal.optional(),
  coveredTo: z
    .discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('day-of-month'),
        day: dayOfMonth,
        monthBefore: z.literal(true).optional(),
      }),
      z.strictObject({ kind: z.literal('last-day'), monthBefore: z.literal(true).optional() }),
      z.strictObject({ kind: z.literal('days-before'), days: z.number().int().min(0).max(62) }),
    ])
    .optional(),
});

const payWeek = z.strictObject({
  id: ID,
  name: name.optional(),
  payProfileId: ID,
  lines: z
    .array(
      z.strictObject({
        name,
        kind: z.enum(['basic', 'overtime', 'nights', 'weekends', 'holiday']),
        hours: decimal,
        rate: decimal,
      }),
    )
    .max(50),
  fixed: z.array(amountLine).max(50).optional(),
});

const payAdjustment = z.strictObject({
  id: ID,
  familyId: ID,
  number: paymentNumber,
  kind: z.enum(['overtime', 'missed-shift']).optional(),
  workedOn: date.optional(),
  hours: decimal.optional(),
  rate: decimal.optional(),
  extras: positive.optional(),
  change: pence,
  taxYear: taxYear.optional(),
});

const nation = z.enum(NATIONS as unknown as readonly [Nation, ...Nation[]]);

const settings = z.strictObject({
  nation,
  mainPayFamilyId: ID.nullable(),
});

const list = <T extends z.ZodType>(of: T, most: number) => z.array(of).max(most);

const records = z.strictObject({
  accounts: list(account, MOST_OF.accounts),
  balanceUpdates: list(balanceUpdate, MOST_OF.balanceUpdates),
  series: list(series, MOST_OF.series),
  changes: list(change, MOST_OF.changes).optional(),
  ticks: list(tick, MOST_OF.ticks).optional(),
  debts: list(debt, MOST_OF.debts).optional(),
  budgets: list(budget, MOST_OF.budgets).optional(),
  spends: list(spend, MOST_OF.spends).optional(),
  goals: list(goal, MOST_OF.goals).optional(),
  payProfiles: list(payProfile, MOST_OF.payProfiles).optional(),
  payWeeks: list(payWeek, MOST_OF.payWeeks).optional(),
  payAdjustments: list(payAdjustment, MOST_OF.payAdjustments).optional(),
  settings: settings.optional(),
});

/** What the file says it is: only these are looked at before the plan. */
const envelope = z.looseObject({
  app: z.literal(BACKUP_APP),
  kind: z.literal(BACKUP_KIND),
  version: z.number().int().min(1),
});

const planPart = z.looseObject({
  plan: z.strictObject({ nation, records }),
});

// ---------------------------------------------------------------------------
// Reading a file.

/** Why a file can't be imported, as a code the screen turns into words. */
export type ReadProblem =
  /** Bigger than any backup: MOST_BYTES. */
  | 'too-big'
  | 'empty'
  /** Not JSON at all, such as a spreadsheet or a picture. */
  | 'not-json'
  /** JSON, but not a PrePenny backup. */
  | 'not-a-backup'
  /** A backup from a newer version of PrePenny than this one. */
  | 'newer'
  /** More records of a kind than any real plan has. */
  | 'too-many'
  /** A record or field that isn't as a backup's is, such as a date that doesn't exist. */
  | 'bad-record'
  /** A record that names another one the file doesn't have, or two records with one id. */
  | 'broken-link'
  /** Every field is right, but the plan as a whole can't be worked out. */
  | 'cant-work-out';

/** What's in a backup, for the sentence before it's imported. */
export interface BackupCounts {
  readonly accounts: number;
  readonly payments: number;
  readonly debts: number;
  readonly goals: number;
}

export type ReadBackup =
  | {
      readonly ok: true;
      readonly nation: Nation;
      readonly records: PlanRecords;
      readonly counts: BackupCounts;
      /** When the file was made, as it says, or null when it doesn't say in a way that can be read. */
      readonly madeAt: string | null;
    }
  | { readonly ok: false; readonly problem: ReadProblem };

type Parsed = z.infer<typeof records>;

/** Every record's links, checked against what's in the file, then given new ids. */
function withNewIds(found: Parsed, newId: () => string): PlanRecords | 'broken-link' {
  const maps = {
    account: new Map<string, string>(),
    update: new Map<string, string>(),
    series: new Map<string, string>(),
    family: new Map<string, string>(),
    debt: new Map<string, string>(),
    budget: new Map<string, string>(),
    spend: new Map<string, string>(),
    goal: new Map<string, string>(),
    profile: new Map<string, string>(),
    week: new Map<string, string>(),
    adjustment: new Map<string, string>(),
  };
  const fill = (map: Map<string, string>, ids: readonly string[]) => {
    for (const id of ids) {
      if (map.has(id)) return false;
      map.set(id, newId());
    }
    return true;
  };
  const filled = [
    fill(
      maps.account,
      found.accounts.map((one) => one.id),
    ),
    fill(
      maps.update,
      found.balanceUpdates.map((one) => one.id),
    ),
    fill(
      maps.series,
      found.series.map((one) => one.id),
    ),
    fill(
      maps.debt,
      (found.debts ?? []).map((one) => one.id),
    ),
    fill(
      maps.budget,
      (found.budgets ?? []).map((one) => one.id),
    ),
    fill(
      maps.spend,
      (found.spends ?? []).map((one) => one.id),
    ),
    fill(
      maps.goal,
      (found.goals ?? []).map((one) => one.id),
    ),
    fill(
      maps.profile,
      (found.payProfiles ?? []).map((one) => one.id),
    ),
    fill(
      maps.week,
      (found.payWeeks ?? []).map((one) => one.id),
    ),
    fill(
      maps.adjustment,
      (found.payAdjustments ?? []).map((one) => one.id),
    ),
  ];
  if (filled.includes(false)) return 'broken-link';
  // A family keeps the id of its first series where it has one; one whose
  // first series has gone gets an id of its own, the same for every series in it.
  for (const one of found.series) {
    if (!maps.family.has(one.familyId)) {
      maps.family.set(one.familyId, maps.series.get(one.familyId) ?? newId());
    }
  }

  class Broken extends Error {}
  const must = (map: Map<string, string>, id: string): string => {
    const made = map.get(id);
    if (made === undefined) throw new Broken();
    return made;
  };
  const maybe = (map: Map<string, string>, id: string | undefined) =>
    id === undefined ? undefined : must(map, id);
  /** Leaves out what isn't set, as the engine does. */
  const some = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } =>
    (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
  /** A change or a tick names a series, or a pay-later budget's bills (D111). */
  const seriesOrBudget = (id: string) => maps.series.get(id) ?? must(maps.budget, id);

  try {
    const accounts = found.accounts.map(
      (one) => ({ ...one, id: must(maps.account, one.id) }) as unknown as Account,
    );
    const balanceUpdates = found.balanceUpdates.map(
      (one) =>
        ({
          ...one,
          id: must(maps.update, one.id),
          accountId: must(maps.account, one.accountId),
        }) as unknown as BalanceUpdate,
    );
    const seriesList: Series[] = found.series.map((one) => {
      // A "From Jess" half is two payments of the importer's own (D426, D437).
      const { mirrorOf: _mirrorOf, ...rest } = one;
      return {
        ...rest,
        id: must(maps.series, one.id),
        accountId: must(maps.account, one.accountId),
        ...some('toAccountId', maybe(maps.account, one.toAccountId)),
        ...some('debtId', maybe(maps.debt, one.debtId)),
        ...some('goalId', maybe(maps.goal, one.goalId)),
        ...some(
          'setAside',
          one.setAside === undefined
            ? undefined
            : {
                percent: one.setAside.percent,
                accountId: must(maps.account, one.setAside.accountId),
              },
        ),
        ...some('payProfileId', maybe(maps.profile, one.payProfileId)),
        ...some(
          'cyclePayWeeks',
          one.cyclePayWeeks?.map((week) => must(maps.week, week)),
        ),
        familyId: must(maps.family, one.familyId),
        ...some('splitFrom', maybe(maps.series, one.splitFrom)),
      } as unknown as Series;
    });
    const changes = (found.changes ?? []).map(
      (one) => ({ ...one, seriesId: seriesOrBudget(one.seriesId) }) as unknown as PaymentChange,
    );
    const ticks = (found.ticks ?? []).map(
      (one) =>
        ({
          ...one,
          seriesId: seriesOrBudget(one.seriesId),
          ...some('inBalanceUpdate', maybe(maps.update, one.inBalanceUpdate)),
          ...some('inDebtUpdate', maybe(maps.debt, one.inDebtUpdate)),
        }) as unknown as Tick,
    );
    const debts: Debt[] = (found.debts ?? []).map((one) => {
      const { belongsTo: _belongsTo, ...rest } = one;
      return { ...rest, id: must(maps.debt, one.id) } as unknown as Debt;
    });
    const budgets = (found.budgets ?? []).map(
      (one) =>
        ({
          ...one,
          id: must(maps.budget, one.id),
          accountId: must(maps.account, one.accountId),
        }) as unknown as Budget,
    );
    const spends = (found.spends ?? []).map(
      (one) =>
        ({
          ...one,
          id: must(maps.spend, one.id),
          budgetId: must(maps.budget, one.budgetId),
        }) as unknown as Spend,
    );
    const goals: Goal[] = (found.goals ?? []).map((one) => {
      const { belongsTo: _belongsTo, ...rest } = one;
      return {
        ...rest,
        id: must(maps.goal, one.id),
        accountId: must(maps.account, one.accountId),
      } as unknown as Goal;
    });
    const payProfiles = (found.payProfiles ?? []).map(
      (one) => ({ ...one, id: must(maps.profile, one.id) }) as unknown as PayProfile,
    );
    const payWeeks = (found.payWeeks ?? []).map(
      (one) =>
        ({
          ...one,
          id: must(maps.week, one.id),
          payProfileId: must(maps.profile, one.payProfileId),
        }) as unknown as PayWeek,
    );
    const payAdjustments = (found.payAdjustments ?? []).map(
      (one) =>
        ({
          ...one,
          id: must(maps.adjustment, one.id),
          familyId: must(maps.family, one.familyId),
        }) as unknown as PayAdjustment,
    );
    const settingsFound = found.settings;
    const newSettings: PlanSettings | undefined =
      settingsFound === undefined
        ? undefined
        : {
            nation: settingsFound.nation,
            mainPayFamilyId:
              settingsFound.mainPayFamilyId === null
                ? null
                : must(maps.family, settingsFound.mainPayFamilyId),
          };
    return {
      accounts,
      balanceUpdates,
      series: seriesList,
      changes,
      ticks,
      debts,
      budgets,
      spends,
      goals,
      payProfiles,
      payWeeks,
      payAdjustments,
      ...(newSettings === undefined ? {} : { settings: newSettings }),
    };
  } catch (error) {
    if (error instanceof Broken) return 'broken-link';
    throw error;
  }
}

/** Two one-off changes, or two ticks, for the same payment. */
function samePaymentTwice(found: Parsed): boolean {
  const seen = new Set<string>();
  for (const one of found.changes ?? []) {
    const key = `${one.seriesId}|${one.originalDate}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  seen.clear();
  for (const one of found.ticks ?? []) {
    const key = `${one.seriesId}|${one.originalDate}|${one.setAside === true}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/** True when the engine can work the plan out, as Home, Debts and Savings goals do. */
function engineCanUse(found: PlanRecords, today: string): boolean {
  try {
    const nation = found.settings?.nation ?? 'england-and-wales';
    const to = planLookAhead(today, 12);
    workOutPlanTo(found, today, to);
    const holidays = holidaysFor(nation);
    workOutDebts({ ...found, debts: found.debts ?? [], holidays, today, to });
    workOutGoals({ ...found, goals: found.goals ?? [], holidays, today, to });
    return true;
  } catch (error) {
    if (error instanceof EngineInputError) return false;
    // Anything else the engine throws is as much a refusal: the file isn't trusted.
    return false;
  }
}

/**
 * Reads a backup file's text and checks everything in it before it's
 * trusted. `newId` makes each record's new id; `today` is the person's own
 * date, for the engine's check.
 */
export function readBackup(
  text: string,
  options: { readonly today: string; readonly newId: () => string },
): ReadBackup {
  if (text.length > MOST_BYTES) return { ok: false, problem: 'too-big' };
  if (text.trim() === '') return { ok: false, problem: 'empty' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'not-json' };
  }
  const about = envelope.safeParse(value);
  if (!about.success) return { ok: false, problem: 'not-a-backup' };
  if (about.data.version > BACKUP_VERSION) return { ok: false, problem: 'newer' };
  const found = planPart.safeParse(value);
  if (!found.success) {
    // Too many of a kind of record: a list at the top of the plan's records.
    const tooMany = found.error.issues.some(
      (issue) => issue.code === 'too_big' && issue.origin === 'array' && issue.path.length === 3,
    );
    return { ok: false, problem: tooMany ? 'too-many' : 'bad-record' };
  }
  const { plan } = found.data;
  if (plan.records.settings !== undefined && plan.records.settings.nation !== plan.nation) {
    return { ok: false, problem: 'bad-record' };
  }
  if (samePaymentTwice(plan.records)) return { ok: false, problem: 'broken-link' };
  const renewed = withNewIds(plan.records, options.newId);
  if (renewed === 'broken-link') return { ok: false, problem: 'broken-link' };
  const withSettings: PlanRecords = {
    ...renewed,
    settings: renewed.settings ?? { nation: plan.nation, mainPayFamilyId: null },
  };
  if (!engineCanUse(withSettings, options.today)) return { ok: false, problem: 'cant-work-out' };
  const madeAt = (value as { madeAt?: unknown }).madeAt;
  return {
    ok: true,
    nation: plan.nation,
    records: withSettings,
    counts: {
      accounts: withSettings.accounts.filter((one) => one.closed !== true).length,
      payments: new Set(withSettings.series.map((one) => one.familyId)).size,
      debts: (withSettings.debts ?? []).filter((one) => one.closed !== true).length,
      goals: (withSettings.goals ?? []).filter((one) => one.closed !== true).length,
    },
    madeAt: time.safeParse(madeAt).success ? (madeAt as string) : null,
  };
}
