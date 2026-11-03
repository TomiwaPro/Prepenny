// Property tests (fast-check) for step 1g, on the six people's whole plans
// (brief Part 2) with any practice changes made in What if (brief 4.10):
//
// - ARCHITECTURE.md test 44 again: each account's end balance is its start
//   balance plus every row applied to it, and transfers never change the
//   total across accounts.
// - Test 45 again: splitting any series without changing anything gives
//   exactly the same plan.
// - Test 46 again: undo gives back exactly the records from before, here for
//   What if's "Keep", which is one edit however many practice changes it holds.
// - What if never changes the real plan, and "Keep" saves exactly the
//   practice plan (D135).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyWrites,
  type EditCommand,
  type EditInput,
  EngineInputError,
  editPlan,
  formatDate,
  parseDate,
  type WhatIfInput,
  whatIf,
  workOutPayments,
  workOutPlan,
} from '../../src/index.ts';
import { canonical } from '../fixtures/edit.ts';
import { otherPeople } from '../fixtures/people.ts';
import { samEverything } from '../fixtures/sam.ts';

const people: Record<string, () => WhatIfInput> = { Sam: samEverything, ...otherPeople };
const names = Object.keys(people);

const KINDS = [
  'amount',
  'move',
  'remove',
  'later-amount',
  'later-note',
  'remove-later',
  'next-payday',
  'tick',
  'overtime',
] as const;

const changeWish = fc.record({
  kind: fc.constantFrom(...KINDS),
  which: fc.nat(),
  amount: fc.integer({ min: 0, max: 300_000 }),
  days: fc.integer({ min: -5, max: 40 }),
});

type ChangeWish = typeof changeWish extends fc.Arbitrary<infer W> ? W : never;

const at = (date: string, days: number) => formatDate(addDays(parseDate(date), days));

/** A practice change from a wish, about a payment in the plan from today on. */
function practiceFrom(wish: ChangeWish, records: WhatIfInput, step: number): EditCommand | null {
  const payments = workOutPayments({
    series: records.series,
    changes: records.changes ?? [],
    holidays: records.holidays,
    from: records.today,
    to: records.to,
  }).filter((one) => !one.skipped);
  const payment = payments[wish.which % Math.max(1, payments.length)];
  if (payment === undefined) return null;
  const ref = { seriesId: payment.seriesId, originalDate: payment.originalDate };
  switch (wish.kind) {
    case 'amount':
      return { kind: 'just-this-one', ...ref, edits: { amount: wish.amount } };
    case 'move':
      return { kind: 'move', ...ref, date: at(payment.date, wish.days) };
    case 'remove':
      return { kind: 'remove-this-one', ...ref };
    case 'later-amount':
      return {
        kind: 'this-and-later',
        ...ref,
        edits: { amount: wish.amount },
        newSeriesId: `practice-${step}`,
      };
    case 'later-note':
      return {
        kind: 'this-and-later',
        ...ref,
        edits: { note: `Practice ${step}` },
        newSeriesId: `practice-${step}`,
      };
    case 'remove-later':
      return { kind: 'remove-this-and-later', ...ref };
    case 'next-payday':
      return { kind: 'move-to-next-payday', ...ref };
    case 'tick':
      return { kind: 'tick', ...ref, tickedAt: `${records.today}T23:00:0${step % 10}Z` };
    case 'overtime': {
      const pay = records.series.find((one) => one.payProfileId !== undefined);
      if (pay === undefined) return null;
      return {
        kind: 'overtime',
        id: `practice-overtime-${step}`,
        seriesId: pay.id,
        workedOn: at(records.today, wish.days),
        hours: '4',
        rate: '15.00',
      };
    }
  }
}

/** The practice changes the engine makes, one after another, and the records they leave. */
function practise(input: WhatIfInput, wishes: readonly ChangeWish[], counts: Map<string, number>) {
  let records = input;
  const made: EditCommand[] = [];
  wishes.forEach((wish, step) => {
    const command = practiceFrom(wish, records, step);
    if (command === null) return;
    try {
      records = applyWrites(records, editPlan(records, command).writes);
      made.push(command);
      counts.set(wish.kind, (counts.get(wish.kind) ?? 0) + 1);
    } catch (error) {
      expect(error).toBeInstanceOf(EngineInputError);
      expect((error as EngineInputError).code, (error as Error).message).not.toBe(
        'edit-breaks-plan',
      );
    }
  });
  return { records, made };
}

const asText = (input: WhatIfInput) => JSON.stringify({ ...input, holidays: null });

describe('What if holds on every person’s plan, with any practice changes', () => {
  it('never changes the real plan, keeps exactly the practice plan, and undoes it in one step', () => {
    let changed = 0;
    const counts = new Map<string, number>();
    fc.assert(
      fc.property(
        fc.constantFrom(...names),
        fc.array(changeWish, { minLength: 1, maxLength: 5 }),
        (name, wishes) => {
          const input = (people[name] as () => WhatIfInput)();
          const before = asText(input);
          const { records, made } = practise(input, wishes, counts);
          const result = whatIf(input, made);

          // Throwing it away: the real records and the real plan are exactly as before.
          expect(asText(input)).toBe(before);
          expect(result.real.plan).toEqual(workOutPlan(input));

          // The practice side is the records the changes left, one after another.
          expect(result.practice.plan).toEqual(workOutPlan(records));

          // Keeping it: one edit that saves exactly the practice records...
          const kept = applyWrites(input, result.keep.writes);
          expect(canonical(kept)).toEqual(canonical(records));
          expect(workOutPlan(kept)).toEqual(result.practice.plan);
          if (result.keep.writes.length > 0) changed += 1;

          // ...and one undo gives back exactly the real records (test 46).
          const undone = applyWrites(
            kept,
            editPlan(kept, { kind: 'undo', edit: result.keep }).writes,
          );
          expect(canonical(undone)).toEqual(canonical(input));

          // Test 44: every account's end balance is its start plus every row,
          // and money moving between accounts never changes the total.
          for (const plan of [result.real.plan, result.practice.plan]) {
            let moved = 0;
            for (const account of plan.accounts) {
              const total = account.rows.reduce((sum, row) => sum + row.change, 0);
              expect(account.days.at(-1)?.balance).toBe(account.start.balance + total);
              for (const row of account.rows) {
                if (row.flow === 'transfer-in' || row.flow === 'transfer-out') moved += row.change;
              }
            }
            expect(moved).toBe(0);
          }
        },
      ),
      { numRuns: 120 },
    );
    expect(changed).toBeGreaterThan(60);
    // Every kind of practice change must really have been made, for this to mean anything.
    for (const kind of KINDS) expect(counts.get(kind) ?? 0, kind).toBeGreaterThan(5);
  });

  it('test 45: gives exactly the same plan after splitting any series without changing anything', () => {
    let splits = 0;
    fc.assert(
      fc.property(fc.constantFrom(...names), fc.nat(), fc.nat({ max: 30 }), (name, which, k) => {
        const input = (people[name] as () => WhatIfInput)();
        const one = input.series[which % input.series.length];
        if (one === undefined) return;
        const payments = workOutPayments({
          series: input.series,
          changes: input.changes ?? [],
          holidays: input.holidays,
          from: input.today,
          to: input.to,
        }).filter((p) => p.seriesId === one.id);
        const payment = payments[k % Math.max(1, payments.length)];
        if (payment === undefined) return;
        const edit = editPlan(input as EditInput, {
          kind: 'this-and-later',
          seriesId: one.id,
          originalDate: payment.originalDate,
          edits: {},
          newSeriesId: 'split-new',
        });
        const after = applyWrites(input, edit.writes);
        const split = after.series.find((s) => s.id === 'split-new');
        if (split !== undefined) splits += 1;
        const asBefore = (text: string) =>
          split === undefined
            ? text
            : text.replace(/"seriesId":"split-new"/g, `"seriesId":"${split.splitFrom}"`);
        expect(asBefore(JSON.stringify(workOutPlan(after)))).toBe(
          JSON.stringify(workOutPlan(input)),
        );
      }),
      { numRuns: 150 },
    );
    expect(splits).toBeGreaterThan(60);
  });
});
