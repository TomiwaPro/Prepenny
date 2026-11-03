// Test 54 (brief 5.8, ARCHITECTURE.md 2.8, D72): 24 months of 100 weekly
// series must be worked out in under 12 milliseconds on the test machine,
// using the middle time of 20 runs after a warm-up. That leaves room for a
// phone four times slower than the test machine to stay under the brief's
// 50 milliseconds. Phase 4 checks it on a real mid-range Android phone.
//
// This file runs on its own, after every other test file has finished
// (vitest.config.ts), so the other tests never compete with it for the
// machine.

import { describe, expect, it } from 'vitest';
import {
  addMonths,
  formatDate,
  formatPounds,
  type PaymentChange,
  type PlanInput,
  parseDate,
  type Series,
  type Tick,
  workOutPlan,
} from '../../src/index.ts';
import { englandAndWales } from '../fixtures/holidays.ts';

const TODAY = '2026-10-25';
/** 24 months ahead, the furthest the plan can show (brief 4.8). */
const TO = formatDate(addMonths(parseDate(TODAY), 24));
const SERIES = 100;
const RUNS = 20;
const WARM_UP_RUNS = 5;
const LIMIT_MILLISECONDS = 12;

/**
 * A busy plan: 100 weekly series over a current account and a savings
 * account. Every tenth is money coming in, a few move money to savings, a
 * third move to the working day before a weekend or bank holiday, and some
 * payments have one-off changes and ticks, as a real plan would.
 */
function busyPlan(): PlanInput {
  const series: Series[] = [];
  const changes: PaymentChange[] = [];
  const ticks: Tick[] = [];
  for (let i = 0; i < SERIES; i += 1) {
    const id = `weekly-${i}`;
    const start = formatDate(parseDate('2026-10-19') + (i % 14));
    const direction = i % 10 === 0 ? 'in' : i % 25 === 7 ? 'transfer' : 'out';
    series.push({
      id,
      accountId: 'current',
      ...(direction === 'transfer' ? { toAccountId: 'savings' } : {}),
      name: `Weekly payment ${i}`,
      direction,
      amount: direction === 'in' ? 40_000 + i : 1_000 + 37 * i,
      start,
      schedule: { kind: 'weekly', every: 1 },
      end: { kind: 'never' },
      holidayRule: i % 3 === 0 ? 'working-day-before' : 'keep',
      type: direction === 'in' ? 'pay' : direction === 'transfer' ? 'savings' : 'bills',
      isEstimate: i % 10 === 0,
      familyId: id,
      familyCreatedAt: `2026-10-${String(1 + (i % 24)).padStart(2, '0')}T08:${String(i % 60).padStart(2, '0')}:00Z`,
    });
    // A few one-off changes: a new amount, a move and a removal.
    if (i % 7 === 0) {
      const later = formatDate(parseDate(start) + 7 * (4 + (i % 30)));
      changes.push({ seriesId: id, originalDate: later, amount: 2_500 + i });
    }
    if (i % 11 === 0) {
      const later = formatDate(parseDate(start) + 7 * (10 + (i % 40)));
      changes.push({
        seriesId: id,
        originalDate: later,
        newDate: formatDate(parseDate(later) + 2),
      });
    }
    if (i % 13 === 0) {
      changes.push({
        seriesId: id,
        originalDate: formatDate(parseDate(start) + 7 * 20),
        skipped: true,
      });
    }
    // Payments from before today, ticked after the balance update.
    if (i % 5 === 0 && parseDate(start) < parseDate(TODAY)) {
      ticks.push({
        seriesId: id,
        originalDate: start,
        tickedAt: '2026-10-25T10:00:00Z',
        paidOn: start,
      });
    }
  }
  return {
    accounts: [
      { id: 'current', kind: 'current', overdraftLimit: 50_000, warningLevel: 2_000 },
      { id: 'savings', kind: 'savings', overdraftLimit: 0, warningLevel: 0 },
    ],
    balanceUpdates: [
      {
        id: 'current-today',
        accountId: 'current',
        balance: 120_000,
        checkedOn: TODAY,
        checkedAt: '2026-10-25T09:00:00Z',
      },
      {
        id: 'savings-today',
        accountId: 'savings',
        balance: 50_000,
        checkedOn: TODAY,
        checkedAt: '2026-10-25T09:00:00Z',
      },
    ],
    series,
    changes,
    ticks,
    mainPayFamilyId: 'weekly-0',
    holidays: englandAndWales,
    today: TODAY,
    to: TO,
  };
}

/** The middle of the times: the average of the two middle ones for an even count. */
function middle(times: readonly number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  const half = sorted.length / 2;
  return ((sorted[half - 1] as number) + (sorted[half] as number)) / 2;
}

describe('test 54: speed', () => {
  const input = busyPlan();

  it('works out a real plan: about 10,000 rows over 24 months, every row in date order', () => {
    const plan = workOutPlan(input);
    const current = plan.accounts[0];
    expect(plan.to).toBe('2028-10-25');
    expect(current?.days).toHaveLength(732);
    const rows = current?.rows ?? [];
    expect(rows.length).toBeGreaterThan(10_000);
    const dates = rows.map((row) => row.date);
    expect(dates).toEqual([...dates].sort());
    // The end balance is the start plus every row, as test 44 checks in general.
    const total = rows.reduce((sum, row) => sum + row.change, 0);
    expect(formatPounds(current?.days.at(-1)?.balance ?? Number.NaN)).toBe(
      formatPounds(120_000 + total),
    );
  });

  it(`takes under ${LIMIT_MILLISECONDS} milliseconds, the middle of ${RUNS} runs after a warm-up (D72)`, () => {
    for (let run = 0; run < WARM_UP_RUNS; run += 1) workOutPlan(input);
    const times: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const started = performance.now();
      workOutPlan(input);
      times.push(performance.now() - started);
    }
    const taken = middle(times);
    // Shown in the test output, so each run says how long it took.
    console.log(
      `Speed: 100 weekly series over 24 months took ${taken.toFixed(2)} ms (the middle of ${RUNS} runs; fastest ${Math.min(...times).toFixed(2)} ms, slowest ${Math.max(...times).toFixed(2)} ms). The limit is ${LIMIT_MILLISECONDS} ms.`,
    );
    expect(taken).toBeLessThan(LIMIT_MILLISECONDS);
  });
});
