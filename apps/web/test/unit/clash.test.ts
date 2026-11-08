// Clashes (step 3d, lib/clash.ts), on Sam's example plan: a change made on
// this phone, waiting to be sent, against what another phone saved since.
// - Nothing else changed: it's sent as it is.
// - The same payment changed on both: the newest wins (D59). This phone's,
//   when it's newer, replacing the other and naming it to be told; the
//   other's, when it's newer, with this phone told what each did.
// - Different parts of the same payment: both are kept, nobody told.
// - Rent changed for this and all later ones on the other phone, and one
//   Rent payment on this one: judged by the payment the person sees.
// - The payment gone: it can't be made. Both ticked it: it's done.
// - This phone's own earlier changes never clash with it.

import type { EditCommand, PlanRecords, RecordWrite } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import { type QueuedChange, replacedFacts, settleChange } from '../../lib/clash.ts';
import { runEdit } from '../../lib/edit.ts';
import { type MirrorRow, mirrorMap, rowsOf } from '../../lib/sync-rows.ts';

const PLAN = '01900000-0000-7000-8000-000000000001';
const SAM = '01900000-0000-7000-8000-00000000000a';
const TODAY = '2026-10-25';
const plan = { planId: PLAN, personId: SAM };

/** The rows the server holds for these records, every one saved by `edit` at change number `seq`. */
function rowsFor(
  records: PlanRecords,
  edit: { readonly id: string; readonly madeAt: string; readonly by: string },
  seq: number,
  before: readonly MirrorRow[] = [],
): MirrorRow[] {
  const known = mirrorMap(before);
  const wanted = rowsOf(records, plan, known, undefined);
  // A record that's gone is marked removed on the server, as save_edit does.
  const removed = before
    .filter((row) => !wanted.has(`${row.table}|${row.id}`))
    .map((row) => ({
      ...row,
      version: row.version + 1,
      seq,
      deleted: true,
      editId: edit.id,
      editMadeAt: edit.madeAt,
      editBy: edit.by,
    }));
  return [
    ...removed,
    ...[...wanted.values()].map((row) => {
      const was = known.get(`${row.table}|${row.id}`);
      const same = was !== undefined && JSON.stringify(was.values) === JSON.stringify(row.values);
      if (same && was !== undefined) return was;
      return {
        table: row.table,
        id: row.id,
        version: (was?.version ?? 0) + 1,
        seq,
        privateTo: SAM,
        deleted: false,
        editId: edit.id,
        editMadeAt: edit.madeAt,
        editBy: edit.by,
        values: Object.fromEntries(
          Object.entries(row.values).filter(([key]) => key !== 'private_to'),
        ),
      };
    }),
  ];
}

const first = { id: 'first-copy', madeAt: '2026-10-25T08:00:00.000Z', by: SAM };
const startRows = rowsFor(examplePlan, first, 5);
/** What this phone had brought down when the change was made. */
const seen = { shared: 0, mine: 5 };

/** A change made on the plan as it was, as it waits in the queue. */
function waiting(commands: readonly EditCommand[], madeAt: string): QueuedChange {
  const command = commands[0] as EditCommand;
  const result = runEdit(examplePlan, TODAY, command);
  return {
    writes: result.edit.writes,
    before: result.edit.undo,
    commands,
    today: TODAY,
    payments: result.payments,
    seen,
    madeAt,
  };
}

/** Another phone's change, saved on the server since, by `by` at `madeAt`. */
function savedElsewhere(command: EditCommand, madeAt: string, by = 'tom'): MirrorRow[] {
  const result = runEdit(examplePlan, TODAY, command);
  return rowsFor(result.records, { id: 'theirs', madeAt, by }, 9, startRows);
}

const rentOn1Dec = { seriesId: 'rent', originalDate: '2026-12-01' } as const;
const amount = (pence: number): EditCommand => ({
  kind: 'just-this-one',
  ...rentOn1Dec,
  edits: { amount: pence },
});

/** The rent change row a settled change sends, as the server would take it. */
function sentAmount(writes: readonly { table: string; row: Record<string, unknown> | null }[]) {
  return writes.find((write) => write.table === 'payment_changes')?.row?.amount;
}

describe('A change waiting to be sent, and what another phone saved since', () => {
  it('nothing else changed: it is sent as it is, replacing nobody', () => {
    const settled = settleChange({
      plan,
      rows: startRows,
      change: waiting([amount(64000)], '2026-10-25T09:00:00.000Z'),
      ours: [],
    });
    expect(settled.kind).toBe('send');
    if (settled.kind !== 'send') return;
    expect(sentAmount(settled.writes)).toBe(64000);
    expect(settled.overrides).toEqual([]);
  });

  it('the same payment changed on both, this one made later: it wins, and the other is named to be told', () => {
    const rows = savedElsewhere(amount(65000), '2026-10-25T09:00:00.000Z');
    const settled = settleChange({
      plan,
      rows,
      change: waiting([amount(64000)], '2026-10-25T10:00:00.000Z'),
      ours: [],
    });
    expect(settled.kind).toBe('send');
    if (settled.kind !== 'send') return;
    expect(sentAmount(settled.writes)).toBe(64000);
    expect(settled.overrides).toEqual(['theirs']);
  });

  it('the same payment changed on both, the other made later: theirs is kept, and this person is told what each did', () => {
    const rows = savedElsewhere(amount(65000), '2026-10-25T10:00:00.000Z');
    const settled = settleChange({
      plan,
      rows,
      change: waiting([amount(64000)], '2026-10-25T09:00:00.000Z'),
      ours: [],
    });
    expect(settled).toEqual({
      kind: 'kept-theirs',
      facts: {
        by: 'tom',
        name: 'Rent',
        on: '2026-12-01',
        theirs: { kind: 'amount', amount: 65000 },
        ours: { kind: 'amount', amount: 64000 },
      },
    });
  });

  it('different parts of the same payment: both are kept, and nobody needs telling', () => {
    const rows = savedElsewhere(
      { kind: 'move', ...rentOn1Dec, date: '2026-12-02' },
      '2026-10-25T10:00:00.000Z',
    );
    const settled = settleChange({
      plan,
      rows,
      change: waiting([amount(64000)], '2026-10-25T09:00:00.000Z'),
      ours: [],
    });
    expect(settled.kind).toBe('send');
    if (settled.kind !== 'send') return;
    const row = settled.writes.find((write) => write.table === 'payment_changes')?.row;
    expect(row?.amount).toBe(64000);
    expect(row?.new_date).toBe('2026-12-02');
    expect(settled.overrides).toEqual([]);
  });

  it('Rent for this and all later ones on the other phone, made later, against one Rent payment here: theirs is kept', () => {
    const rows = savedElsewhere(
      {
        kind: 'this-and-later',
        seriesId: 'rent',
        originalDate: '2026-11-01',
        edits: { amount: 65000 },
        newSeriesId: 'rent-from-nov',
      },
      '2026-10-25T10:00:00.000Z',
    );
    const settled = settleChange({
      plan,
      rows,
      change: waiting([amount(64000)], '2026-10-25T09:00:00.000Z'),
      ours: [],
    });
    expect(settled.kind).toBe('kept-theirs');
  });

  it('Rent split from Tue 1 Dec on the other phone, and this one made later: it lands on the same payment in the new series, and wins', () => {
    const rows = savedElsewhere(
      {
        kind: 'this-and-later',
        seriesId: 'rent',
        originalDate: '2026-12-01',
        edits: { amount: 65000 },
        newSeriesId: 'rent-from-dec',
      },
      '2026-10-25T09:00:00.000Z',
    );
    const settled = settleChange({
      plan,
      rows,
      change: waiting([amount(64000)], '2026-10-25T10:00:00.000Z'),
      ours: [],
    });
    expect(settled.kind).toBe('send');
    if (settled.kind !== 'send') return;
    const row = settled.writes.find((write) => write.table === 'payment_changes')?.row;
    expect(row?.series_id).toBe('rent-from-dec');
    expect(row?.amount).toBe(64000);
    expect(settled.overrides).toEqual(['theirs']);
  });

  it("the payment removed on the other phone: this change can't be made, and the person is told", () => {
    const rows = savedElsewhere(
      { kind: 'remove-this-and-later', seriesId: 'rent', originalDate: '2026-11-01' },
      '2026-10-25T09:00:00.000Z',
    );
    const settled = settleChange({
      plan,
      rows,
      change: waiting([amount(64000)], '2026-10-25T10:00:00.000Z'),
      ours: [],
    });
    expect(settled.kind).toBe('cant');
    if (settled.kind !== 'cant') return;
    expect(settled.facts.theirs).toEqual({ kind: 'removed' });
    expect(settled.facts.ours).toEqual({ kind: 'amount', amount: 64000 });
  });

  it("the payment removed just this once on the other phone: this change can't be made, whichever was newer", () => {
    for (const madeAt of ['2026-10-25T08:30:00.000Z', '2026-10-25T10:00:00.000Z']) {
      const rows = savedElsewhere(
        { kind: 'remove-this-one', ...rentOn1Dec },
        '2026-10-25T09:00:00.000Z',
      );
      const settled = settleChange({
        plan,
        rows,
        change: waiting([amount(64000)], madeAt),
        ours: [],
      });
      expect(settled.kind, madeAt).toBe('cant');
    }
  });

  it('this phone removed a payment the other phone changed: the newest wins', () => {
    const rows = savedElsewhere(amount(65000), '2026-10-25T09:00:00.000Z');
    const removal: EditCommand = { kind: 'remove-this-one', ...rentOn1Dec };
    const newer = settleChange({
      plan,
      rows,
      change: waiting([removal], '2026-10-25T10:00:00.000Z'),
      ours: [],
    });
    expect(newer.kind).toBe('send');
    if (newer.kind === 'send') expect(newer.overrides).toEqual(['theirs']);
    const older = settleChange({
      plan,
      rows,
      change: waiting([removal], '2026-10-25T08:00:00.000Z'),
      ours: [],
    });
    expect(older.kind).toBe('kept-theirs');
    if (older.kind === 'kept-theirs') {
      expect(older.facts.theirs).toEqual({ kind: 'amount', amount: 65000 });
      expect(older.facts.ours).toEqual({ kind: 'removed' });
    }
  });

  it("the plan's bank holidays changed on both phones: the newest wins", () => {
    const toScotland: EditCommand = { kind: 'set-nation', nation: 'scotland' };
    const toNorthernIreland: EditCommand = { kind: 'set-nation', nation: 'northern-ireland' };
    const theirs = runEdit(examplePlan, TODAY, toScotland);
    const rows = rowsFor(
      theirs.records,
      { id: 'theirs', madeAt: '2026-10-25T09:00:00.000Z', by: 'tom' },
      9,
      startRows,
    );
    expect(rows.find((row) => row.table === 'plans')?.editId).toBe('theirs');
    const older = settleChange({
      plan,
      rows,
      change: waiting([toNorthernIreland], '2026-10-25T08:00:00.000Z'),
      ours: [],
    });
    expect(older.kind).toBe('kept-theirs');
    const newer = settleChange({
      plan,
      rows,
      change: waiting([toNorthernIreland], '2026-10-25T10:00:00.000Z'),
      ours: [],
    });
    expect(newer.kind).toBe('send');
  });

  it('an Update balance ticking a payment the other phone removed: the balance is still saved, without that tick', () => {
    const rows = savedElsewhere(
      { kind: 'remove-this-one', seriesId: 'spending-until-payday', originalDate: TODAY },
      '2026-10-25T10:00:00.000Z',
    );
    const update: EditCommand = {
      kind: 'update-balance',
      update: {
        id: 'balance-now',
        accountId: 'current',
        balance: 25000,
        checkedOn: TODAY,
        checkedAt: '2026-10-25T09:00:00.000Z',
      },
      ticks: [
        {
          seriesId: 'spending-until-payday',
          originalDate: TODAY,
          tickedAt: '2026-10-25T09:00:00.000Z',
        },
      ],
    };
    const settled = settleChange({
      plan,
      rows,
      change: waiting([update], '2026-10-25T09:00:00.000Z'),
      ours: [],
    });
    expect(settled.kind).toBe('send');
    if (settled.kind !== 'send') return;
    expect(settled.writes.find((write) => write.table === 'balance_updates')?.row?.balance).toBe(
      25000,
    );
    expect(settled.writes.filter((write) => write.table === 'ticks')).toEqual([]);
  });

  it('both phones ticked the same payment: it is done, with nothing to send', () => {
    const tick: EditCommand = {
      kind: 'tick',
      seriesId: 'rent',
      originalDate: '2026-11-01',
      tickedAt: '2026-10-25T09:00:00.000Z',
    };
    const rows = savedElsewhere(
      { ...tick, tickedAt: '2026-10-25T09:30:00.000Z' },
      '2026-10-25T09:30:00.000Z',
    );
    expect(
      settleChange({ plan, rows, change: waiting([tick], '2026-10-25T09:00:00.000Z'), ours: [] }),
    ).toEqual({ kind: 'done' });
  });

  it('rows from a server before step 3d, naming no edit, are sent as before, with no clash', () => {
    const rows = savedElsewhere(amount(65000), '2026-10-25T10:00:00.000Z').map(
      ({ editId: _id, editMadeAt: _at, editBy: _by, ...row }) => row,
    );
    const settled = settleChange({
      plan,
      rows,
      change: waiting([amount(64000)], '2026-10-25T09:00:00.000Z'),
      ours: [],
    });
    expect(settled.kind).toBe('send');
  });

  it("this phone's own earlier change is never a clash, even made on the same payment", () => {
    const rows = savedElsewhere(amount(65000), '2026-10-25T10:00:00.000Z', SAM);
    const settled = settleChange({
      plan,
      rows,
      change: waiting([amount(64000)], '2026-10-25T09:00:00.000Z'),
      ours: ['theirs'],
    });
    expect(settled.kind).toBe('send');
  });
});

describe('A change this phone sent that a newer one replaced', () => {
  it('says what each did, from the records as they are now', () => {
    const ours = waiting([amount(64000)], '2026-10-25T09:00:00.000Z');
    const rows = savedElsewhere(amount(65000), '2026-10-25T10:00:00.000Z');
    expect(replacedFacts({ rows, change: ours, by: 'tom' })).toEqual({
      by: 'tom',
      name: 'Rent',
      on: '2026-12-01',
      theirs: { kind: 'amount', amount: 65000 },
      ours: { kind: 'amount', amount: 64000 },
    });
  });

  it('with only the records this phone holds: a record it never had is described by nothing of anyone else', () => {
    const write: RecordWrite = {
      kind: 'budget',
      id: 'someone-elses',
      value: null,
    };
    const facts = replacedFacts({
      rows: startRows,
      change: { writes: [write], madeAt: '2026-10-25T09:00:00.000Z' },
      by: 'tom',
    });
    expect(facts.name).toBe('');
  });
});
