// A backup of someone's plan as a file, and reading it back (step 3h,
// lib/backup.ts):
// - every person's plan comes back from its file with every figure the
//   same: each account's balance at the end of every day for a year;
// - nothing in the file is taken on trust: every id is made new, and who a
//   record belongs to is never read;
// - a broken file is refused, for each way a file can be wrong, before
//   anything is saved.

import type { PlanRecords } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { fixtureRecords } from '../../../../packages/engine/test/fixtures/from-empty.ts';
import { otherPeople } from '../../../../packages/engine/test/fixtures/people.ts';
import { samEverything, samToday } from '../../../../packages/engine/test/fixtures/sam.ts';
import { examplePlan } from '../../data/example-plan.ts';
import {
  type Backup,
  backupText,
  MOST_BYTES,
  MOST_OF,
  type ReadBackup,
  readBackup,
  recordsForBackup,
} from '../../lib/backup.ts';
import { planLookAhead, workOutPlanTo } from '../../lib/plan-input.ts';

/** New ids as the phone makes them, counted, so the test knows each one. */
function idMaker() {
  const made: string[] = [];
  return {
    made,
    newId: () => {
      const id = `00000000-0000-7000-8000-${String(made.length + 1).padStart(12, '0')}`;
      made.push(id);
      return id;
    },
  };
}

function backupOf(records: PlanRecords): Backup {
  return {
    app: 'PrePenny',
    kind: 'backup',
    version: 1,
    about: 'A test backup.',
    madeAt: '2026-11-12T10:00:00Z',
    plan: {
      nation: records.settings?.nation ?? 'england-and-wales',
      records: recordsForBackup(records),
    },
    account: null,
    people: null,
    history: null,
  };
}

/** Each account's balance at the end of every day, in order: the plan's figures without its ids. */
function figures(records: PlanRecords, today: string) {
  const plan = workOutPlanTo(records, today, planLookAhead(today, 12));
  return plan.accounts.map((account) => ({
    name: account.account.name,
    lowest: [account.lowestPoint.date, account.lowestPoint.balance],
    days: account.days.map((day) => [day.date, day.balance]),
  }));
}

function read(text: string, today = samToday): ReadBackup {
  return readBackup(text, { today, newId: idMaker().newId });
}

function problemOf(text: string): string {
  const got = read(text);
  return got.ok ? 'no problem' : got.problem;
}

/** A backup's JSON with one change made to it. */
function changed(records: PlanRecords, change: (backup: Record<string, unknown>) => void): string {
  const backup = JSON.parse(backupText(backupOf(records))) as Record<string, unknown>;
  change(backup);
  return JSON.stringify(backup);
}

const plans: [string, PlanRecords, string][] = [
  ["Sam's example", examplePlan, samToday],
  ['Sam with everything on', fixtureRecords(samEverything()), samToday],
  ...Object.entries(otherPeople).map(([name, plan]): [string, PlanRecords, string] => [
    name,
    fixtureRecords(plan()),
    plan().today,
  ]),
];

describe('A plan comes back from its backup exactly as it was', () => {
  for (const [name, records, today] of plans) {
    it(`${name}: every account's balance at the end of every day for a year is the same`, () => {
      const ids = idMaker();
      const got = readBackup(backupText(backupOf(records)), { today, newId: ids.newId });
      if (!got.ok) throw new Error(got.problem);
      expect(figures(got.records, today)).toEqual(figures(records, today));
      expect(got.records.settings?.nation).toBe(records.settings?.nation ?? 'england-and-wales');
    });

    it(`${name}: every id is made new on this phone`, () => {
      const ids = idMaker();
      const got = readBackup(backupText(backupOf(records)), { today, newId: ids.newId });
      if (!got.ok) throw new Error(got.problem);
      const old = new Set(JSON.stringify(records).match(/"(?:id|familyId)":"[^"]+"/g) ?? []);
      const now = JSON.stringify(got.records).match(/"(?:id|familyId)":"([^"]+)"/g) ?? [];
      expect(now.length).toBeGreaterThan(0);
      for (const one of now) {
        expect(old.has(one)).toBe(false);
        expect(ids.made).toContain(one.split(':')[1]?.replaceAll('"', ''));
      }
    });
  }

  it('says what it holds: accounts, payments, debts and goals still open', () => {
    const got = read(backupText(backupOf(examplePlan)));
    expect(got.ok && got.counts).toEqual({
      accounts: 2,
      payments: expect.any(Number),
      debts: 6,
      goals: 0,
    });
  });
});

describe('Nothing in a file is taken on trust', () => {
  it("who a debt or goal belongs to is never read: it becomes the importer's", () => {
    const records = fixtureRecords(otherPeople['Jess and Tom']());
    const text = changed(records, (backup) => {
      const plan = backup.plan as { records: { debts?: { belongsTo?: string }[] } };
      for (const debt of plan.records.debts ?? []) debt.belongsTo = 'someone-else';
    });
    const got = read(text, otherPeople['Jess and Tom']().today);
    expect(got.ok).toBe(true);
    if (got.ok) expect(JSON.stringify(got.records)).not.toContain('someone-else');
  });

  it('a backup never writes whose a record is: a download leaves it out', () => {
    const records: PlanRecords = {
      ...examplePlan,
      debts: (examplePlan.debts ?? []).map((debt) => ({ ...debt, belongsTo: 'person-id-1234' })),
    };
    expect(backupText(backupOf(records))).not.toContain('person-id-1234');
  });

  it('a field that says who may see a record is refused, as any unknown field is', () => {
    expect(
      problemOf(
        changed(examplePlan, (backup) => {
          const plan = backup.plan as { records: { accounts: Record<string, unknown>[] } };
          (plan.records.accounts[0] as Record<string, unknown>).privateTo = 'someone-else';
        }),
      ),
    ).toBe('bad-record');
  });

  it('"From Jess" halves come in as two payments of the importer\'s own (D426)', () => {
    const records = fixtureRecords(otherPeople['Jess and Tom']());
    const withHalf: PlanRecords = {
      ...records,
      series: records.series.map((one, i) =>
        i === 1 ? { ...one, mirrorOf: records.series[0]?.id ?? '' } : one,
      ),
    };
    const got = read(backupText(backupOf(withHalf)), otherPeople['Jess and Tom']().today);
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.records.series.some((one) => one.mirrorOf !== undefined)).toBe(false);
  });
});

describe('A broken file is refused before anything is saved', () => {
  it('a file bigger than any backup', () => {
    expect(problemOf(' '.repeat(MOST_BYTES + 1))).toBe('too-big');
  });

  it('an empty file', () => {
    expect(problemOf('  \n')).toBe('empty');
  });

  it("a file that isn't JSON, such as a spreadsheet", () => {
    expect(problemOf('Name,Amount\nRent,550.00\n')).toBe('not-json');
  });

  it("JSON that isn't a PrePenny backup", () => {
    expect(problemOf('{"accounts": []}')).toBe('not-a-backup');
    expect(problemOf('[1, 2, 3]')).toBe('not-a-backup');
    expect(problemOf('null')).toBe('not-a-backup');
  });

  it('a backup from a newer PrePenny', () => {
    expect(problemOf(changed(examplePlan, (backup) => Object.assign(backup, { version: 2 })))).toBe(
      'newer',
    );
  });

  const record = (change: (records: Record<string, Record<string, unknown>[]>) => void) =>
    changed(examplePlan, (backup) =>
      change((backup.plan as { records: Record<string, Record<string, unknown>[]> }).records),
    );

  it("a date that doesn't exist", () => {
    expect(
      problemOf(record((r) => Object.assign(r.series?.[0] ?? {}, { start: '2026-02-30' }))),
    ).toBe('bad-record');
  });

  it('an amount with part of a penny, or written as text', () => {
    expect(problemOf(record((r) => Object.assign(r.series?.[0] ?? {}, { amount: 12.5 })))).toBe(
      'bad-record',
    );
    expect(problemOf(record((r) => Object.assign(r.series?.[0] ?? {}, { amount: '1250' })))).toBe(
      'bad-record',
    );
  });

  it('an amount too big to be exact', () => {
    expect(
      problemOf(record((r) => Object.assign(r.balanceUpdates?.[0] ?? {}, { balance: 2 ** 60 }))),
    ).toBe('bad-record');
  });

  it("a kind of payment PrePenny doesn't have", () => {
    expect(problemOf(record((r) => Object.assign(r.series?.[0] ?? {}, { type: 'casino' })))).toBe(
      'bad-record',
    );
  });

  it("a field PrePenny doesn't have", () => {
    expect(problemOf(record((r) => Object.assign(r.series?.[0] ?? {}, { script: 'x' })))).toBe(
      'bad-record',
    );
  });

  it('a name with hidden characters in it', () => {
    expect(
      problemOf(record((r) => Object.assign(r.series?.[0] ?? {}, { name: 'Rent\u0000' }))),
    ).toBe('bad-record');
  });

  it('more records of a kind than any plan has', () => {
    const accounts = Array.from({ length: MOST_OF.accounts + 1 }, (_, i) => ({
      id: `a${i}`,
      kind: 'current',
      overdraftLimit: 0,
      warningLevel: 0,
    }));
    expect(problemOf(record((r) => Object.assign(r, { accounts })))).toBe('too-many');
  });

  it("a payment from an account the file doesn't have", () => {
    expect(
      problemOf(record((r) => Object.assign(r.series?.[0] ?? {}, { accountId: 'not-there' }))),
    ).toBe('broken-link');
  });

  it('two records with one id', () => {
    expect(
      problemOf(
        record((r) => {
          const first = r.accounts?.[0];
          if (first !== undefined) r.accounts?.push({ ...first });
        }),
      ),
    ).toBe('broken-link');
  });

  it('two ticks for one payment', () => {
    expect(
      problemOf(
        record((r) => {
          r.ticks = [
            {
              seriesId: 'rent',
              originalDate: '2026-11-01',
              tickedAt: '2026-11-01T09:00:00Z',
              paidOn: '2026-11-01',
            },
            {
              seriesId: 'rent',
              originalDate: '2026-11-01',
              tickedAt: '2026-11-01T09:00:00Z',
              paidOn: '2026-11-01',
            },
          ];
        }),
      ),
    ).toBe('broken-link');
  });

  it("every field right, but a plan the engine can't work out", () => {
    // A pay-later budget needs its bill day (D32).
    const budget = {
      id: 'food',
      accountId: 'current',
      name: 'Food',
      amount: 20000,
      every: 'month',
      leaves: 'pay-later',
      rollOver: false,
      startsOn: '2026-11-01',
      createdAt: '2026-10-25T09:00:00Z',
    };
    expect(problemOf(record((r) => Object.assign(r, { budgets: [budget] })))).toBe('cant-work-out');
  });
});
