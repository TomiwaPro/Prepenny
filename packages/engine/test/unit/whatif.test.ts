// What if (brief 4.10, D135): the owner's step 1g tests 2 and 3, and
// ARCHITECTURE.md test 53. Practice changes are made with the same edit
// commands on a copy, the real plan and the practice plan come out side by
// side, throwing the practice away leaves the real plan exactly as it was,
// and keeping it is one edit, one undo step.

import { describe, expect, it } from 'vitest';
import {
  applyWrites,
  type EditCommand,
  type EditInput,
  editPlan,
  formatPounds,
  type WhatIfInput,
  whatIf,
  workOutPlan,
} from '../../src/index.ts';
import { canonical } from '../fixtures/edit.ts';
import { kofiPlan } from '../fixtures/people.ts';
import { pounds } from '../fixtures/plan.ts';
import { samEverything } from '../fixtures/sam.ts';

/** The stored records and settings as text, to prove nothing was changed. */
function asText(input: WhatIfInput): string {
  return JSON.stringify({ ...input, holidays: null });
}

describe('test 2 and ARCHITECTURE.md test 53: Kofi asks "what if I get no work next week?"', () => {
  const real = kofiPlan();
  const before = asText(real);
  // Next week is Mon 2 Nov to Sun 8 Nov (D14): one estimate from each platform.
  const noWorkNextWeek: EditCommand[] = [
    { kind: 'remove-this-one', seriesId: 'rides', originalDate: '2026-11-02' },
    { kind: 'remove-this-one', seriesId: 'deliveries', originalDate: '2026-11-04' },
    { kind: 'remove-this-one', seriesId: 'parcels', originalDate: '2026-11-06' },
  ];
  const result = whatIf(real, noWorkNextWeek);
  const current = result.accounts.find((one) => one.accountId === 'current');

  it('shows the new lowest point beside the real one', () => {
    expect(current?.real.lowestPoint.date).toBe('2026-11-05');
    expect(formatPounds(current?.real.lowestPoint.balance ?? 0)).toBe('156.00');
    expect(current?.real.lowestPoint.status).toBe('ok');
    // With no work next week he's £237.75 short on Thu 5 Nov, when the van
    // finance goes out, until Tue 10 Nov.
    expect(current?.practice.lowestPoint.date).toBe('2026-11-05');
    expect(formatPounds(current?.practice.lowestPoint.balance ?? 0)).toBe('-237.75');
    expect(current?.practice.lowestPoint.status).toBe('short');
    expect(current?.practice.lowestPoint.after?.payment.name).toBe('Van finance');
    expect(
      current?.practice.shortfalls.map((one) => [one.date, formatPounds(one.amount), one.lastDate]),
    ).toEqual([
      ['2026-11-05', '237.75', '2026-11-10'],
      ['2026-11-12', '55.00', '2026-11-12'],
    ]);
    expect(current?.real.shortfalls).toEqual([]);
  });

  it('takes the money set aside for tax away with the income (D113)', () => {
    const tax = result.accounts.find((one) => one.accountId === 'tax');
    const taxOn = (side: 'real' | 'practice', date: string) =>
      result[side].plan.accounts
        .find((one) => one.account.id === 'tax')
        ?.days.find((day) => day.date === date)?.balance;
    // 25% of £380.00 + £145.00 + £90.00 = £153.75 less in his Tax account by Sun 8 Nov.
    expect((taxOn('real', '2026-11-08') ?? 0) - (taxOn('practice', '2026-11-08') ?? 0)).toBe(
      pounds('153.75'),
    );
    expect(tax?.practice.shortfalls).toEqual([]);
  });

  it('throwing it away leaves the real plan exactly as before', () => {
    // The practice never touches the real records...
    expect(asText(real)).toBe(before);
    // ...and the real side is exactly the plan worked out on its own.
    expect(result.real.plan).toEqual(workOutPlan(kofiPlan()));
    expect(result.real.records).toEqual(canonicalRecords(kofiPlan()));
  });

  it('keeping it saves the three removals as one edit, undone in one step', () => {
    expect(result.keep.writes.map((write) => write.kind)).toEqual(['change', 'change', 'change']);
    const kept = applyWrites(real, result.keep.writes);
    expect(workOutPlan(kept as WhatIfInput)).toEqual(result.practice.plan);
    const undone = applyWrites(kept, editPlan(kept, { kind: 'undo', edit: result.keep }).writes);
    expect(canonical(undone)).toEqual(canonical(real));
  });
});

/** The stored records of a plan, as What if gives them back. */
function canonicalRecords(input: WhatIfInput) {
  const { mainPayFamilyId, holidays, today, to, ...records } = input;
  return records;
}

describe('test 3: Sam asks "what if my pay on Fri 30 Oct is £100 lower?"', () => {
  const real = samEverything();
  const before = asText(real);
  const lowerPay: EditCommand = {
    kind: 'just-this-one',
    seriesId: 'pay',
    originalDate: '2026-10-30',
    edits: { amount: pounds('503.06') },
  };
  const result = whatIf(real, [lowerPay]);
  const current = result.accounts.find((one) => one.accountId === 'current');

  it('gives a lowest point of −£95.47 on Sun 1 Nov, Short, beside the real £4.53, Tight', () => {
    expect([
      current?.real.lowestPoint.date,
      formatPounds(current?.real.lowestPoint.balance ?? 0),
      current?.real.lowestPoint.status,
    ]).toEqual(['2026-11-01', '4.53', 'tight']);
    expect([
      current?.practice.lowestPoint.date,
      formatPounds(current?.practice.lowestPoint.balance ?? 0),
      current?.practice.lowestPoint.status,
    ]).toEqual(['2026-11-01', '-95.47', 'short']);
    expect(current?.practice.lowestPoint.after?.payment.name).toBe('Rent');
  });

  it('lists the same payments that could move as D69', () => {
    const shortfall = current?.practice.shortfalls[0];
    expect([shortfall?.date, formatPounds(shortfall?.amount ?? 0), shortfall?.moveTo]).toEqual([
      '2026-11-01',
      '95.47',
      '2026-11-06',
    ]);
    expect(
      shortfall?.couldMove.map((row) => `${row.payment.name} ${formatPounds(row.change)}`),
    ).toEqual(['Pay-later card -466.07', 'Family loan -125.00', 'Driving lesson -100.00']);
    expect(current?.practice.shortfalls).toHaveLength(1);
    expect(current?.real.shortfalls).toEqual([]);
  });

  it('keeps every paid-off date the same, looking 24 months ahead', () => {
    const paidOff = result.debts.map((one) => [one.debtId, one.real.paidOffOn]);
    expect(paidOff).toEqual([
      ['pay-later-card', '2026-10-29'],
      ['pay-in-3', '2026-12-06'],
      ['laptop-loan', '2027-02-20'],
      ['sofa-finance', '2027-08-23'],
      ['credit-card', '2028-03-15'],
      ['family-loan', '2027-01-01'],
    ]);
    for (const one of result.debts) expect(one.practice).toEqual(one.real);
  });

  it('leaves the real plan exactly as it was', () => {
    expect(asText(real)).toBe(before);
    expect(result.real.plan).toEqual(workOutPlan(samEverything()));
  });

  it('keeping it gives one edit that makes the practice plan real, undone in one step', () => {
    const kept = applyWrites(real, result.keep.writes);
    expect(workOutPlan(kept as WhatIfInput)).toEqual(result.practice.plan);
    const undone = applyWrites(kept, editPlan(kept, { kind: 'undo', edit: result.keep }).writes);
    expect(canonical(undone)).toEqual(canonical(real));
  });
});

describe('What if (D135)', () => {
  const real = samEverything();

  it('shows the two sides the same, and keeps nothing, with no practice changes', () => {
    const result = whatIf(real, []);
    expect(result.practice.plan).toEqual(result.real.plan);
    expect(result.practice.debts).toEqual(result.real.debts);
    expect(result.practice.goals).toEqual(result.real.goals);
    expect(result.keep).toEqual({ writes: [], undo: [] });
  });

  it('makes each practice change on the records the ones before it left', () => {
    // Rent £560 from Jan 2027 for this and all later ones, then January's rent
    // moved to Fri 8 Jan: the second change needs the series the first made.
    const changes: EditCommand[] = [
      {
        kind: 'this-and-later',
        seriesId: 'rent',
        originalDate: '2027-01-01',
        edits: { amount: pounds('560.00') },
        newSeriesId: 'rent-from-january',
      },
      {
        kind: 'move',
        seriesId: 'rent-from-january',
        originalDate: '2027-01-01',
        date: '2027-01-08',
      },
    ];
    const result = whatIf(real, changes);
    const rent = result.practice.plan.accounts[0]?.rows
      .filter((row) => row.payment.name === 'Rent')
      .map((row) => `${row.date} ${formatPounds(row.change)}`);
    expect(rent).toEqual([
      '2026-11-01 -600.00',
      '2026-12-01 -550.00',
      '2027-01-08 -560.00',
      '2027-02-01 -560.00',
    ]);
    // Kept, it's one edit: the old series ended, the new one, and its move.
    expect(result.keep.writes.map((write) => write.kind)).toEqual(['series', 'series', 'change']);
    const kept = applyWrites(real, result.keep.writes) as EditInput;
    expect(canonical(kept)).toEqual(canonical(result.practice.records as EditInput));
  });

  it('can practise "I did overtime" and a balance update like any other edit', () => {
    const result = whatIf(real, [
      {
        kind: 'overtime',
        id: 'practice-overtime',
        seriesId: 'pay',
        workedOn: '2026-10-26',
        hours: '11.5',
      },
    ]);
    const payOn = (side: 'real' | 'practice') =>
      result[side].plan.accounts[0]?.rows.find(
        (row) => row.payment.seriesId === 'pay' && row.date === '2026-11-06',
      )?.change;
    // The same £155.12 as the step 1f test (D5, D131).
    expect((payOn('practice') ?? 0) - (payOn('real') ?? 0)).toBe(pounds('155.12'));
  });

  it('refuses a practice change the engine can’t make, saying which one', () => {
    expect(() =>
      whatIf(real, [
        { kind: 'remove-this-one', seriesId: 'rent', originalDate: '2026-11-01' },
        { kind: 'remove-this-one', seriesId: 'rent', originalDate: '2026-11-01' },
      ]),
    ).toThrow(
      expect.objectContaining({
        code: 'already-removed',
        message: expect.stringMatching(/^Practice change 2: /),
      }),
    );
  });

  it('looks for paid-off dates as far as it’s asked to', () => {
    const toFebruary = whatIf({ ...real, debtsTo: '2027-02-28' }, []);
    const sofa = toFebruary.debts.find((one) => one.debtId === 'sofa-finance');
    expect([sofa?.real.paidOffOn, formatPounds(sofa?.real.leftAtEnd ?? 0)]).toEqual([
      null,
      '225.25',
    ]);
  });
});
