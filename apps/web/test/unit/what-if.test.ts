// What if (brief 4.10, D135), as the What if screen works it out: the
// owner's step 2g tests 1 and 2 on the figures themselves, as well as on the
// screens. The practice changes are the same commands the sheets make.

import { applyWrites, type EditCommand, formatPounds, parsePounds } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { fixtureRecords } from '../../../../packages/engine/test/fixtures/from-empty.ts';
import { kofiPlan } from '../../../../packages/engine/test/fixtures/people.ts';
import { examplePlan } from '../../data/example-plan.ts';
import { runEdits } from '../../lib/edit.ts';
import { workOutHome } from '../../lib/home.ts';
import { workOutWhatIfView } from '../../lib/what-if-view.ts';

const SUNDAY = '2026-10-25';
const pounds = (amount: number) => formatPounds(amount);

describe("test 1: Sam's Fri 30 Oct pay at £503.06", () => {
  const lowerPay: EditCommand = {
    kind: 'just-this-one',
    seriesId: 'pay',
    originalDate: '2026-10-30',
    edits: { amount: parsePounds('503.06') },
  };
  const view = workOutWhatIfView(examplePlan, SUNDAY, [lowerPay]);
  const current = view.accounts[0];

  it('shows −£95.47 on Sun 1 Nov, Short, beside the real £4.53, Tight', () => {
    expect(view.accounts.map((one) => one.name)).toEqual(['Current account']);
    expect([current?.real.balance, current?.real.date, current?.real.status]).toEqual([
      parsePounds('4.53'),
      '2026-11-01',
      'tight',
    ]);
    expect([current?.practice.balance, current?.practice.date, current?.practice.status]).toEqual([
      -parsePounds('95.47'),
      '2026-11-01',
      'short',
    ]);
    expect(current?.practice.after).toBe('Rent');
    expect(current?.real.shortfall).toBeNull();
  });

  it('lists Pay-later card, Family loan and Driving lesson as the payments that could move', () => {
    const short = current?.practice.shortfall;
    expect([short?.amount, short?.date, short?.moveTo]).toEqual([
      parsePounds('95.47'),
      '2026-11-01',
      '2026-11-06',
    ]);
    expect(short?.couldMove.map((one) => [one.name, one.date, pounds(one.change)])).toEqual([
      ['Pay-later card', '2026-10-29', '-466.07'],
      ['Family loan', '2026-10-26', '-125.00'],
      ['Driving lesson', '2026-10-26', '-100.00'],
    ]);
  });

  it('keeps every paid-off date the same, in the order the Debts screen uses', () => {
    expect(view.debts.map((one) => [one.name, one.real.paidOffOn])).toEqual([
      ['Pay-later card', '2026-10-29'],
      ['Pay in 3', '2026-12-06'],
      ['Family loan', '2027-01-01'],
      ['Laptop loan', '2027-02-20'],
      ['Sofa finance', '2027-08-23'],
      ['Credit card', '2028-03-15'],
    ]);
    for (const one of view.debts) expect(one.practice).toEqual(one.real);
  });

  it('gives back the practice records, and keeping them is one change one Undo takes back', () => {
    expect(view.changed).toBe(true);
    expect(view.records.changes?.find((one) => one.originalDate === '2026-10-30')).toMatchObject({
      seriesId: 'pay',
      amount: parsePounds('503.06'),
    });
    // The real plan isn't touched.
    expect(examplePlan.changes?.find((one) => one.seriesId === 'pay')?.amount).toBe(
      parsePounds('603.06'),
    );
    // Keep makes the same commands on the real plan as one change (D135).
    const kept = runEdits(examplePlan, SUNDAY, [lowerPay]);
    expect(workOutHome(kept.records, SUNDAY).lowest.balance).toBe(-parsePounds('95.47'));
    const undone = applyWrites(kept.records, kept.edit.undo);
    expect(workOutHome(undone, SUNDAY).lowest.balance).toBe(parsePounds('4.53'));
  });

  it('with no practice changes, both sides are the same and nothing would be kept', () => {
    const none = workOutWhatIfView(examplePlan, SUNDAY, []);
    expect(none.changed).toBe(false);
    expect(none.accounts[0]?.practice).toEqual(none.accounts[0]?.real);
  });
});

describe('test 2: Kofi with no work next week', () => {
  const records = fixtureRecords(kofiPlan());
  const WEDNESDAY = '2026-10-28';
  // Next week is Mon 2 Nov to Sun 8 Nov (D14): one estimate from each platform.
  const noWork: EditCommand[] = [
    { kind: 'remove-this-one', seriesId: 'rides', originalDate: '2026-11-02' },
    { kind: 'remove-this-one', seriesId: 'deliveries', originalDate: '2026-11-04' },
    { kind: 'remove-this-one', seriesId: 'parcels', originalDate: '2026-11-06' },
  ];
  const view = workOutWhatIfView(records, WEDNESDAY, noWork);
  const current = view.accounts.find((one) => one.name === 'Current account');

  it('shows £237.75 short on Thu 5 Nov beside the real lowest point of £156.00', () => {
    expect([current?.real.balance, current?.real.date, current?.real.status]).toEqual([
      parsePounds('156.00'),
      '2026-11-05',
      'ok',
    ]);
    expect([current?.practice.balance, current?.practice.date, current?.practice.status]).toEqual([
      -parsePounds('237.75'),
      '2026-11-05',
      'short',
    ]);
    expect(current?.practice.shortfall).toMatchObject({
      amount: parsePounds('237.75'),
      date: '2026-11-05',
    });
  });

  it('shows only his current account: his Tax account gets less, but its lowest point stays the same', () => {
    expect(view.accounts.map((one) => one.name)).toEqual(['Current account']);
  });
});
