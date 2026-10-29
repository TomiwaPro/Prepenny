// Property tests (fast-check): rules that must hold for thousands of made-up
// series, not just the examples (brief 5.8, step 1a).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayFromParts,
  daysInMonth,
  type EndRule,
  EngineInputError,
  formatDate,
  type HolidayRule,
  type MonthlyDay,
  monthNumber,
  type Payment,
  type PaymentChange,
  parseDate,
  partsOfDay,
  paymentByNumber,
  type Schedule,
  type Series,
  type Weekday,
  type WeekdayPosition,
  workOutPayments,
} from '../../src/index.ts';
import { englandAndWales } from '../fixtures/holidays.ts';
import { series } from '../fixtures/series.ts';

const holidays = englandAndWales;
const firstDay = dayFromParts(2020, 1, 1);
const lastDay = dayFromParts(2035, 12, 31);
const dateArb = fc.integer({ min: firstDay, max: lastDay }).map(formatDate);

describe('a monthly payment never drifts off its day', () => {
  it('stays on its day of the month (or the month’s last day) for 10 years', () => {
    fc.assert(
      fc.property(
        dateArb,
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: 1, max: 12 }),
        (start, day, every) => {
          const monthly = series({
            start,
            schedule: { kind: 'monthly', every, on: { kind: 'day', day } },
          });
          const tenYearsOn = formatDate(addDays(parseDate(start), 3653));
          const payments = workOutPayments({
            series: [monthly],
            holidays,
            from: start,
            to: tenYearsOn,
          });
          expect(payments.length).toBeGreaterThanOrEqual(Math.floor(120 / every) - 1);
          let previousMonth: number | null = null;
          for (const payment of payments) {
            const parts = partsOfDay(parseDate(payment.date));
            // The chosen day, or the month's last day when the month is shorter.
            expect(parts.day).toBe(Math.min(day, daysInMonth(parts.year, parts.month)));
            const month = monthNumber(parts.year, parts.month);
            if (previousMonth !== null) {
              expect(month - previousMonth).toBe(every);
            }
            previousMonth = month;
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

const monthlyDayArb: fc.Arbitrary<MonthlyDay> = fc.oneof(
  fc.integer({ min: 1, max: 31 }).map((day) => ({ kind: 'day' as const, day })),
  fc.constant({ kind: 'last-day' as const }),
  fc.constant({ kind: 'last-working-day' as const }),
  fc.record({
    kind: fc.constant('weekday' as const),
    weekday: fc.constantFrom<Weekday>(1, 2, 3, 4, 5, 6, 7),
    position: fc.constantFrom<WeekdayPosition>(1, 2, 3, 4, 'last'),
  }),
);

const scheduleArb: fc.Arbitrary<Schedule> = fc.oneof(
  fc.constant({ kind: 'once' as const }),
  fc.integer({ min: 1, max: 52 }).map((every) => ({ kind: 'weekly' as const, every })),
  fc.constant({ kind: 'irregular' as const }),
  fc.record(
    {
      kind: fc.constant('monthly' as const),
      every: fc.integer({ min: 1, max: 12 }),
      on: monthlyDayArb,
      leaveOut: fc.uniqueArray(fc.integer({ min: 1, max: 12 }), { maxLength: 6 }),
    },
    { requiredKeys: ['kind', 'every', 'on'] },
  ),
  fc
    .uniqueArray(dateArb, { minLength: 1, maxLength: 12 })
    .map((dates) => ({ kind: 'dates' as const, dates })),
);

const endArb: fc.Arbitrary<EndRule> = fc.oneof(
  fc.constant({ kind: 'never' as const }),
  fc.integer({ min: 1, max: 80 }).map((payments) => ({ kind: 'after' as const, payments })),
  dateArb.map((date) => ({ kind: 'on' as const, date })),
);

const seriesArb: fc.Arbitrary<Series> = fc
  .record({
    start: dateArb,
    schedule: scheduleArb,
    end: endArb,
    holidayRule: fc.constantFrom<HolidayRule>('keep', 'working-day-before', 'working-day-after'),
    amount: fc.integer({ min: 0, max: 500_000 }),
    cycle: fc.option(
      fc.array(fc.integer({ min: 0, max: 500_000 }), { minLength: 1, maxLength: 8 }),
    ),
    cycleOffset: fc.integer({ min: -10, max: 10 }),
    lastAmount: fc.option(fc.integer({ min: 0, max: 500_000 })),
    firstNumber: fc.integer({ min: 0, max: 20 }),
  })
  .map((s) =>
    series({
      start: s.start,
      schedule: s.schedule,
      end: s.end,
      holidayRule: s.holidayRule,
      amount: s.amount,
      cycleOffset: s.cycleOffset,
      firstNumber: s.firstNumber,
      ...(s.cycle === null ? {} : { amountCycle: s.cycle }),
      ...(s.lastAmount === null ? {} : { lastAmount: s.lastAmount }),
    }),
  );

const changeArb = fc.record({
  k: fc.integer({ min: 0, max: 40 }),
  moveBy: fc.option(fc.integer({ min: -60, max: 60 })),
  amount: fc.option(fc.integer({ min: 0, max: 500_000 })),
  skipped: fc.boolean(),
});

/** A made-up series, or null when its schedule leaves out every month it falls in. */
function usable(candidate: Series): boolean {
  try {
    paymentByNumber({ series: candidate, holidays, number: 0 });
    return true;
  } catch (error) {
    if (error instanceof EngineInputError && error.code === 'no-payments') return false;
    throw error;
  }
}

/** Turns made-up changes into real ones, attached to real payments' original dates. */
function changesFor(
  one: Series,
  wanted: readonly { k: number; moveBy: number | null; amount: number | null; skipped: boolean }[],
): PaymentChange[] {
  const byDate = new Map<string, PaymentChange>();
  for (const w of wanted) {
    const payment = paymentByNumber({
      series: one,
      holidays,
      number: (one.firstNumber ?? 0) + w.k,
    });
    if (payment === null || byDate.has(payment.originalDate)) continue;
    byDate.set(payment.originalDate, {
      seriesId: one.id,
      originalDate: payment.originalDate,
      skipped: w.skipped,
      ...(w.moveBy === null
        ? {}
        : { newDate: formatDate(addDays(parseDate(payment.originalDate), w.moveBy)) }),
      ...(w.amount === null ? {} : { amount: w.amount }),
    });
  }
  return [...byDate.values()];
}

describe('payment k is always the same, whatever order it is asked for in', () => {
  it('gives each payment number the same payment, asked alone, in any order, or in a window', () => {
    fc.assert(
      fc.property(
        seriesArb.filter(usable),
        fc.array(changeArb, { maxLength: 6 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 60 }), { minLength: 1, maxLength: 12 }),
        fc.integer(),
        (one, wantedChanges, offsets, seed) => {
          const changes = changesFor(one, wantedChanges);
          const first = one.firstNumber ?? 0;
          const ask = (k: number) => paymentByNumber({ series: one, changes, holidays, number: k });

          // Asked one at a time, in the order given.
          const inOrder = new Map(offsets.map((o) => [first + o, ask(first + o)]));
          // Asked again in a shuffled order.
          const shuffled = [...offsets].sort(
            (a, b) => ((a * 7919 + seed) % 97) - ((b * 7919 + seed) % 97),
          );
          for (const o of shuffled) {
            expect(ask(first + o)).toEqual(inOrder.get(first + o));
          }

          // Found inside one window that covers them all.
          const found = [...inOrder.values()].filter((p): p is Payment => p !== null);
          if (found.length === 0) return;
          const dates = found.map((p) => p.date).sort();
          const window = workOutPayments({
            series: [one],
            changes,
            holidays,
            from: dates[0] as string,
            to: dates.at(-1) as string,
          });
          for (const payment of found) {
            expect(window.filter((p) => p.number === payment.number)).toEqual([payment]);
          }
        },
      ),
      { numRuns: 400 },
    );
  });

  it('gives the same payments for a window as for the two halves it splits into', () => {
    fc.assert(
      fc.property(
        seriesArb.filter(usable),
        fc.array(changeArb, { maxLength: 6 }),
        dateArb,
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 400 }),
        (one, wantedChanges, from, firstPart, secondPart) => {
          const changes = changesFor(one, wantedChanges);
          const at = (date: string, days: number) => formatDate(addDays(parseDate(date), days));
          const middle = at(from, firstPart);
          const to = at(middle, secondPart + 1);
          const work = (a: string, b: string) =>
            workOutPayments({ series: [one], changes, holidays, from: a, to: b });
          const whole = work(from, to);
          const halves = [...work(from, middle), ...work(at(middle, 1), to)];
          expect(halves).toEqual(whole);
        },
      ),
      { numRuns: 300 },
    );
  });
});
