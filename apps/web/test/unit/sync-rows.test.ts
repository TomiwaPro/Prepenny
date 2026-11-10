// The plan as rows on the server, and back (step 3c, lib/sync-rows.ts):
// - every person's plan comes back exactly as it was left (brief Part 10),
//   with the same figures on every screen;
// - nothing more is sent once the server has it;
// - a partner's copy has the shared records only (D16, D291, D303), and the
//   person's own copy joins the private links back on (PLAN.md items 24, 28).

import type {
  Account,
  BalanceUpdate,
  Debt,
  PayAdjustment,
  PayProfile,
  PayWeek,
  PlanRecords,
  Series,
} from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { fixtureRecords } from '../../../../packages/engine/test/fixtures/from-empty.ts';
import { otherPeople } from '../../../../packages/engine/test/fixtures/people.ts';
import { samEverything } from '../../../../packages/engine/test/fixtures/sam.ts';
import { examplePlan } from '../../data/example-plan.ts';
import { workOutDebtsView } from '../../lib/debts-view.ts';
import { runEdit } from '../../lib/edit.ts';
import { workOutHome } from '../../lib/home.ts';
import { workOutPlanView } from '../../lib/plan-view.ts';
import {
  type MirrorRow,
  mirrorRowOf,
  recordsFromRows,
  rowsOf,
  savedRows,
  writesFor,
  writesForEdit,
} from '../../lib/sync-rows.ts';

const PLAN = '01900000-0000-7000-8000-000000000001';
const JESS = '01900000-0000-7000-8000-00000000000a';
const TOM = '01900000-0000-7000-8000-00000000000b';

/**
 * What the server would hold after saving these rows, as the database fills
 * in each row's privacy from what it's on (D290): a stand-in for save_edit,
 * checked against the real one in supabase/tests.
 */
function onTheServer(
  records: PlanRecords,
  person: string,
  shared: readonly string[] = [],
): MirrorRow[] {
  const seed: MirrorRow[] = shared.map((id) => ({
    table: 'accounts',
    id,
    version: 1,
    seq: 1,
    privateTo: null,
    deleted: false,
    values: {},
  }));
  const wanted = rowsOf(
    records,
    { planId: PLAN, personId: person },
    new Map(seed.map((row) => [`accounts|${row.id}`, row])),
    undefined,
  );
  const rows = [...wanted.values()];
  const privacy = new Map<string, string | null>();
  const find = (table: string, id: unknown) => privacy.get(`${table}|${String(id)}`);
  const set = (table: string, id: string, value: string | null) =>
    privacy.set(`${table}|${id}`, value);
  for (const row of rows) {
    if (row.table === 'accounts' || row.table === 'debts' || row.table === 'goals') {
      set(row.table, row.id, (row.values.private_to as string | null) ?? null);
    }
  }
  const byTable = (table: string) => rows.filter((row) => row.table === table);
  for (const row of byTable('goals')) {
    const onAccount = find('accounts', row.values.account_id);
    if (onAccount !== null && onAccount !== undefined) set('goals', row.id, onAccount);
  }
  for (const table of ['balance_updates', 'budgets', 'series']) {
    for (const row of byTable(table))
      set(table, row.id, find('accounts', row.values.account_id) ?? null);
  }
  const families = new Map<string, string | null>();
  for (const row of byTable('series'))
    families.set(String(row.values.family_id), find('series', row.id) ?? null);
  for (const table of ['payment_changes', 'ticks']) {
    for (const row of byTable(table)) {
      const parent =
        row.values.series_id === null
          ? find('budgets', row.values.budget_id)
          : find('series', row.values.series_id);
      set(table, row.id, parent ?? null);
    }
  }
  for (const row of byTable('spends'))
    set('spends', row.id, find('budgets', row.values.budget_id) ?? null);
  for (const row of byTable('pay_adjustments'))
    set('pay_adjustments', row.id, families.get(String(row.values.family_id)) ?? null);
  for (const table of [
    'pay_profiles',
    'pay_weeks',
    'pay_adjustment_details',
    'settings',
    'private_links',
  ]) {
    for (const row of byTable(table)) set(table, row.id, person);
  }
  return rows.map((row, index) =>
    mirrorRowOf(row.table, {
      ...row.values,
      id: row.id,
      version: 1,
      seq: index + 1,
      private_to: row.table === 'plans' ? null : (find(row.table, row.id) ?? null),
      deleted: false,
    }),
  );
}

/** What plan_changes gives someone: the shared rows and their own (D16). */
const readableBy = (rows: readonly MirrorRow[], person: string) =>
  rows.filter((row) => row.privateTo === null || row.privateTo === person);

const TODAY = '2026-10-25';
/** The records with every list there, empty or not, as the engine reads them: a list left out is an empty one. */
const settled = (records: PlanRecords) => ({
  changes: [],
  ticks: [],
  debts: [],
  budgets: [],
  spends: [],
  goals: [],
  payProfiles: [],
  payWeeks: [],
  payAdjustments: [],
  ...records,
  settings: records.settings ?? { nation: 'england-and-wales', mainPayFamilyId: null },
});

const plans: [string, PlanRecords, string][] = [
  ["Sam's example", examplePlan, TODAY],
  ['Sam with everything on', fixtureRecords(samEverything()), samEverything().today],
  ...Object.entries(otherPeople).map(([name, make]) => {
    const plan = make();
    return [name, fixtureRecords(plan), plan.today] as [string, PlanRecords, string];
  }),
];

/**
 * A debt's or goal's `belongsTo` is carried on the server by its privacy and
 * `belongs_to` (D290), never as a name of its own: the app never sets it, and
 * the engine only checks it's a word (step 3c). Jess and Tom's test plan uses it.
 */
const withoutBelongsTo = (records: PlanRecords): PlanRecords => ({
  ...records,
  debts: (records.debts ?? []).map(({ belongsTo: _, ...debt }) => debt),
  goals: (records.goals ?? []).map(({ belongsTo: _, ...goal }) => goal),
});

describe.each(plans)('%s', (_name, given, today) => {
  const records = withoutBelongsTo(given);
  const rows = onTheServer(records, JESS);
  const back = recordsFromRows(rows).records;

  it('comes back from the server exactly as it was left', () => {
    expect(settled(back)).toEqual(settled(records));
  });

  it('shows the same figures on Home, Coming up and Debts', () => {
    expect(workOutHome(back, today)).toEqual(workOutHome(records, today));
    for (const grouping of ['pay', 'months'] as const) {
      expect(workOutPlanView(back, today, { grouping, months: 24 })).toEqual(
        workOutPlanView(records, today, { grouping, months: 24 }),
      );
    }
    expect(workOutDebtsView(back, today)).toEqual(workOutDebtsView(records, today));
  });

  it('needs nothing more sent once the server has it', () => {
    expect(writesFor(back, { planId: PLAN, personId: JESS }, rows, undefined)).toEqual([]);
  });

  it('is sent whole the first time, every link after what it names', () => {
    const first = writesFor(records, { planId: PLAN, personId: JESS }, [], undefined);
    expect(first.every((write) => write.version === null && write.row !== null)).toBe(true);
    const seen = new Set<string>();
    for (const write of first) {
      for (const [column, value] of Object.entries(write.row ?? {})) {
        if (!column.endsWith('_id') || typeof value !== 'string') continue;
        if (column === 'family_id' || column === 'main_pay_family_id') continue;
        if (records.series.some((one) => one.id === value) && column !== 'series_id') continue;
        expect(seen.has(value), `${write.table}.${column} is saved after what it names`).toBe(true);
      }
      seen.add(write.id);
      if (write.table === 'budgets') seen.add(write.id);
    }
  });
});

describe('one change, sent as an edit with its records', () => {
  const rows = onTheServer(examplePlan, JESS);

  it("sends only the records the change touched, at the server's versions", () => {
    const records = recordsFromRows(rows).records;
    const rent = records.series.find((one) => one.name === 'Rent');
    if (rent === undefined) throw new Error('No rent in the example.');
    const { edit } = runEdit(records, TODAY, {
      kind: 'tick',
      seriesId: rent.id,
      originalDate: '2026-11-01',
      tickedAt: '2026-10-25T09:00:00Z',
    });
    const { writes } = writesForEdit(
      rows,
      edit.writes,
      { planId: PLAN, personId: JESS },
      undefined,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: 'ticks', version: null });
    expect(writes[0]?.row).toMatchObject({
      series_id: rent.id,
      original_date: '2026-11-01',
      payment_number: 0,
    });
  });

  it('knows the new versions once saved, so the next change is sent against them', () => {
    const account = rows.find((row) => row.table === 'accounts');
    if (account === undefined) throw new Error('No account.');
    const sent = [
      {
        table: 'accounts' as const,
        id: account.id,
        version: 1,
        row: { ...account.values, name: 'Main' },
      },
    ];
    const after = savedRows(
      sent,
      [
        {
          table: 'accounts',
          id: account.id,
          version: 2,
          seq: 99,
          private_to: JESS,
          deleted: false,
        },
      ],
      rows,
    );
    expect(after[0]).toMatchObject({ version: 2, seq: 99, privateTo: JESS });
    expect(after[0]?.values.name).toBe('Main');
    expect(after[0]?.values).not.toHaveProperty('private_to');
  });
});

// ---------------------------------------------------------------------------
// A shared plan: Jess's private account and a joint account she shares.

const monthly = (day: number) => ({ kind: 'monthly', every: 1, on: { kind: 'day', day } }) as const;
const one = (
  fields: Partial<Series> &
    Pick<Series, 'id' | 'accountId' | 'name' | 'amount' | 'start' | 'schedule'>,
): Series => ({
  direction: 'out',
  end: { kind: 'never' },
  holidayRule: 'keep',
  type: 'other',
  isEstimate: false,
  familyId: fields.id,
  familyCreatedAt: '2026-10-24T18:00:00.000Z',
  ...fields,
});
const accounts: Account[] = [
  {
    id: 'jess-current',
    name: 'Jess current',
    kind: 'current',
    overdraftLimit: 0,
    warningLevel: 2000,
  },
  { id: 'joint', name: 'Joint', kind: 'joint', overdraftLimit: 0, warningLevel: 2000 },
];
const updates: BalanceUpdate[] = [
  {
    id: 'jess-balance',
    accountId: 'jess-current',
    balance: 120000,
    checkedOn: TODAY,
    checkedAt: '2026-10-25T09:00:00Z',
  },
  {
    id: 'joint-balance',
    accountId: 'joint',
    balance: 80000,
    checkedOn: TODAY,
    checkedAt: '2026-10-25T09:00:00Z',
  },
];
const card: Debt = {
  id: 'jess-card',
  name: 'Jess card',
  kind: 'credit-card',
  currency: 'GBP',
  balance: 42099,
  balanceOn: TODAY,
  balanceAt: '2026-10-25T09:00:00Z',
  startingBalance: 42099,
};
const job: PayProfile = {
  id: 'cafe-job',
  name: 'Cafe',
  frequency: 'weekly',
  taxCode: '1257L',
  basis: 'cumulative',
  overtimeRate: '15',
};
const week: PayWeek = {
  id: 'cafe-week',
  payProfileId: 'cafe-job',
  name: 'Saturday',
  lines: [{ name: 'Basic', kind: 'basic', hours: '8', rate: '12.71' }],
};
const overtime: PayAdjustment = {
  id: 'cafe-overtime',
  familyId: 'cafe-pay',
  number: 1,
  kind: 'overtime',
  workedOn: '2026-10-27',
  hours: '1.5',
  rate: '15',
  change: 1800,
  taxYear: '2026-27',
};
const shared: PlanRecords = {
  accounts,
  balanceUpdates: updates,
  series: [
    one({
      id: 'rent',
      accountId: 'joint',
      name: 'Rent',
      amount: 110000,
      start: '2026-11-01',
      schedule: monthly(1),
      type: 'rent',
    }),
    one({
      id: 'card-payment',
      accountId: 'joint',
      name: 'Card',
      amount: 2500,
      start: '2026-11-15',
      schedule: monthly(15),
      type: 'debt',
      debtId: 'jess-card',
    }),
    one({
      id: 'from-jess',
      accountId: 'joint',
      name: 'From Jess',
      direction: 'in',
      amount: 60000,
      start: '2026-10-28',
      schedule: monthly(28),
      type: 'bills',
      mirrorOf: 'to-joint',
    }),
    one({
      id: 'to-joint',
      accountId: 'jess-current',
      name: 'To the joint account',
      note: 'For the bills',
      amount: 60000,
      start: '2026-10-28',
      schedule: monthly(28),
      type: 'bills',
    }),
    one({
      id: 'cafe-pay',
      accountId: 'joint',
      name: 'Cafe pay',
      direction: 'in',
      amount: 9000,
      start: '2026-10-31',
      schedule: { kind: 'weekly', every: 1 },
      type: 'pay',
      isEstimate: true,
      payProfileId: 'cafe-job',
      cyclePayWeeks: ['cafe-week'],
    }),
  ],
  changes: [{ seriesId: 'rent', originalDate: '2026-12-01', note: 'Paid early' }],
  ticks: [
    {
      seriesId: 'card-payment',
      originalDate: '2026-11-15',
      tickedAt: '2026-10-25T10:00:00Z',
      paidOn: TODAY,
      inDebtUpdate: 'jess-card',
    },
  ],
  debts: [card],
  payProfiles: [job],
  payWeeks: [week],
  payAdjustments: [overtime],
  settings: { nation: 'england-and-wales', mainPayFamilyId: 'cafe-pay' },
};

describe('a shared plan', () => {
  const server = onTheServer(shared, JESS, ['joint']);
  const jess = readableBy(server, JESS);
  const tom = readableBy(server, TOM);
  const tomsPlan = recordsFromRows(tom).records;
  const jessPrivate = new Set(server.filter((row) => row.privateTo === JESS).map((row) => row.id));

  it("keeps a shared payment's private debt, job and Update from statement in Jess's private links", () => {
    const card = server.find((row) => row.table === 'series' && row.id === 'card-payment');
    expect(card?.privateTo).toBeNull();
    expect(card?.values.debt_id).toBeNull();
    const pay = server.find((row) => row.id === 'cafe-pay');
    expect([pay?.values.pay_profile_id, pay?.values.cycle_pay_weeks, pay?.values.paid_to]).toEqual([
      null,
      null,
      JESS,
    ]);
    const tick = server.find((row) => row.table === 'ticks');
    expect([tick?.privateTo, tick?.values.in_debt_update]).toEqual([null, null]);
    const links = server.filter((row) => row.table === 'private_links');
    expect(links).toHaveLength(3);
    expect(links.every((row) => row.privateTo === JESS)).toBe(true);
  });

  it('keeps "From Jess" naming nothing private, with its private half naming it instead (D291)', () => {
    const half = server.find((row) => row.id === 'from-jess');
    expect([half?.privateTo, half?.values.locked_to, half?.values.mirrored_by]).toEqual([
      null,
      JESS,
      null,
    ]);
    expect(server.find((row) => row.id === 'to-joint')?.values.mirrored_by).toBe('from-jess');
  });

  it("brings Jess's own plan back exactly, every private link joined back on", () => {
    expect(settled(recordsFromRows(jess).records)).toEqual(settled(shared));
  });

  it("gives Tom's phone nothing of Jess's private records, and nothing that names one", () => {
    expect(tom.filter((row) => jessPrivate.has(row.id))).toEqual([]);
    const text = JSON.stringify(tom);
    for (const id of [
      'jess-current',
      'jess-card',
      'cafe-job',
      'cafe-week',
      'to-joint',
      'jess-balance',
    ]) {
      expect(text, id).not.toContain(`"${id}"`);
    }
    expect(text).not.toContain('For the bills');
    expect(text).not.toContain('"hours"');
  });

  it('gives Tom the shared payments, "From Jess" as money coming in, and her overtime as an amount only (D303)', () => {
    expect(tomsPlan.accounts.map((account) => account.id)).toEqual(['joint']);
    expect(tomsPlan.series.map((one) => one.id).sort()).toEqual([
      'cafe-pay',
      'card-payment',
      'from-jess',
      'rent',
    ]);
    expect(tomsPlan.series.find((one) => one.id === 'from-jess')?.mirrorOf).toBeUndefined();
    expect(tomsPlan.series.find((one) => one.id === 'card-payment')?.debtId).toBeUndefined();
    expect(tomsPlan.payAdjustments).toEqual([
      { id: 'cafe-overtime', familyId: 'cafe-pay', number: 1, change: 1800 },
    ]);
    expect(tomsPlan.debts).toEqual([]);
    expect(tomsPlan.payProfiles).toEqual([]);
  });

  it("works out on Tom's phone: the joint account, its payments and the overtime's change", () => {
    expect(JSON.stringify(workOutHome(tomsPlan, TODAY))).toContain('Joint');
    // The joint account's money is the same on both phones, row by row and
    // day by day. Only what's Jess's to know differs: her main pay, that a
    // payment is to her own card, and which half of her transfer is shared.
    const joint = (records: PlanRecords) =>
      workOutPlanView(records, TODAY, { grouping: 'months', months: 12 })
        .accounts.find((account) => account.id === 'joint')
        ?.periods.map((period) => ({
          lowest: period.lowest,
          rows: period.rows.map(({ name, amount, leftAfter, paymentDate, status }) => ({
            name,
            amount,
            leftAfter,
            paymentDate,
            status,
          })),
        }));
    expect(joint(tomsPlan)).toEqual(joint(shared));
    expect(JSON.stringify(joint(tomsPlan))).toContain('"amount":10800');
  });

  it("asks Tom's phone to send nothing it didn't change", () => {
    expect(writesFor(tomsPlan, { planId: PLAN, personId: TOM }, tom, undefined)).toEqual([]);
  });
});

describe('step 3f: whose pay, once it has been claimed (D418)', () => {
  it('reads it from a series still there, not from one removed before its account was shared', () => {
    const series: Series = {
      id: 'pay-later',
      accountId: 'joint',
      name: 'Pay',
      direction: 'in',
      type: 'pay',
      amount: 180000,
      start: '2026-12-01',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'day', day: 1 } },
      end: { kind: 'never' },
      holidayRule: 'keep',
      isEstimate: false,
      familyId: 'pay',
      familyCreatedAt: '2026-10-25T09:00:00Z',
      splitFrom: 'pay',
      firstNumber: 1,
    };
    const row = (id: string, privateTo: string | null, deleted: boolean, paidTo: string) =>
      mirrorRowOf('series', {
        id,
        version: 2,
        seq: 1,
        private_to: privateTo,
        deleted,
        family_id: 'pay',
        paid_to: paidTo,
      });
    // The removed series comes first, as it may on a phone.
    const mirror = new Map(
      [
        row('pay', JESS, true, JESS),
        row('pay-later', null, false, TOM),
        mirrorRowOf('accounts', {
          id: 'joint',
          version: 1,
          seq: 1,
          private_to: null,
          deleted: false,
        }),
      ].map((one) => [`${one.table}|${one.id}`, one]),
    );
    const wanted = rowsOf(
      {
        accounts: [
          { id: 'joint', name: 'Joint', kind: 'joint', overdraftLimit: 0, warningLevel: 0 },
        ],
        balanceUpdates: [],
        series: [series],
      },
      { planId: PLAN, personId: JESS },
      mirror,
      undefined,
    );
    expect(wanted.get('series|pay-later')?.values.paid_to).toBe(TOM);
  });
});
