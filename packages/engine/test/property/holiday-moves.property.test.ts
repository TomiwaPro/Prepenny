// Property tests for step 4c (D538, D539): one new bank holiday, on any
// weekday, with weekly and monthly payments under every rule.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  type BankHolidayLookup,
  dayFromParts,
  formatDate,
  type HolidayRule,
  movedByNewBankHolidays,
  parseDate,
  ruleMoveOf,
  workOutPayments,
} from '../../src/index.ts';
import { englandAndWales } from '../fixtures/holidays.ts';
import { series } from '../fixtures/series.ts';

const firstDay = dayFromParts(2027, 1, 4);
const lastDay = dayFromParts(2028, 12, 22);
const ruleArb = fc.constantFrom<HolidayRule>('keep', 'working-day-before', 'working-day-after');

/** The built-in list with one more bank holiday. */
function plusOne(day: number): BankHolidayLookup {
  return { isBankHoliday: (d) => d === day || englandAndWales.isBankHoliday(d) };
}

const seriesArb = fc
  .array(
    fc.record({
      start: fc.integer({ min: firstDay - 60, max: firstDay }).map(formatDate),
      monthly: fc.boolean(),
      day: fc.integer({ min: 1, max: 31 }),
      rule: ruleArb,
    }),
    { minLength: 1, maxLength: 6 },
  )
  .map((list) =>
    list.map((one, i) =>
      series({
        id: `s${i}`,
        name: `Payment ${i}`,
        familyId: `s${i}`,
        start: one.start,
        schedule: one.monthly
          ? { kind: 'monthly', every: 1, on: { kind: 'day', day: one.day } }
          : { kind: 'weekly', every: 1 },
        holidayRule: one.rule,
      }),
    ),
  );

describe('a new bank holiday (D539)', () => {
  it('moves exactly the payments that were on it and follow a rule, and tells each one', () => {
    fc.assert(
      fc.property(
        seriesArb,
        fc
          .integer({ min: firstDay, max: lastDay })
          .filter((day) => !englandAndWales.isBankHoliday(day)),
        (all, holiday) => {
          const after = plusOne(holiday);
          const from = formatDate(addDays(holiday, -40));
          const to = formatDate(addDays(holiday, 40));
          const window = { series: all, from, to };
          const old = workOutPayments({ ...window, holidays: englandAndWales });
          const now = new Map(
            workOutPayments({ ...window, holidays: after }).map((one) => [
              `${one.seriesId} ${one.number}`,
              one,
            ]),
          );
          const moved = movedByNewBankHolidays({ ...window, before: englandAndWales, after });
          const expected = old
            .filter((one) => now.get(`${one.seriesId} ${one.number}`)?.date !== one.date)
            .map((one) => `${one.seriesId} ${one.originalDate}`);
          expect(moved.map((one) => `${one.seriesId} ${one.originalDate}`).sort()).toEqual(
            expected.sort(),
          );
          for (const one of moved) {
            // It was on the new bank holiday, and isn't now.
            expect(one.holiday).toBe(formatDate(holiday));
            expect(one.to).not.toBe(one.holiday);
            const rule = all.find((s) => s.id === one.seriesId)?.holidayRule;
            expect(rule).not.toBe('keep');
            // And the sheet says why it moved: a bank holiday, maybe with a weekend.
            const why = ruleMoveOf({
              series: all.find((s) => s.id === one.seriesId) as (typeof all)[number],
              originalDate: one.originalDate,
              holidays: after,
            });
            expect(why?.because).toMatch(/bank-holiday/);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('why a payment moved (D538)', () => {
  it('is null exactly when it lands on its date, and its from date is its date', () => {
    fc.assert(
      fc.property(fc.integer({ min: firstDay, max: lastDay }), ruleArb, (day, rule) => {
        const one = series({
          start: formatDate(day),
          schedule: { kind: 'once' },
          holidayRule: rule,
        });
        const [payment] = workOutPayments({
          series: [one],
          holidays: englandAndWales,
          from: formatDate(addDays(day, -20)),
          to: formatDate(addDays(day, 20)),
        });
        const why = ruleMoveOf({
          series: one,
          originalDate: formatDate(day),
          holidays: englandAndWales,
        });
        expect(why === null).toBe(payment?.date === formatDate(day));
        if (why !== null) {
          expect(why.from).toBe(formatDate(day));
          const weekend = parseDate(why.from) % 7;
          // Day 0 (1 Jan 1970) was a Thursday, so 2 and 3 are Saturday and Sunday.
          const onWeekend = weekend === 2 || weekend === 3;
          expect(why.because === 'bank-holiday').toBe(!onWeekend);
        }
      }),
      { numRuns: 500 },
    );
  });
});
