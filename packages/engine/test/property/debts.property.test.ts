// Property tests (fast-check) for debts (step 1d): rules that must hold for
// thousands of made-up debts, linked payments, ticks and changes.
//
// - Each row's "left after" follows from the row before: minus the payment,
//   plus the interest (brief 5.6).
// - "Paid off on" is the first row that leaves 1p, or 1 cent, or less (D34,
//   D42), with no interest after it, and "left at the end" only when there's none.
// - "More than what's left" is what a payment has over what was left (D63, D100).
// - Left now is never below zero or above the balance plus the interest
//   since the update, and progress is 100% only when it's paid off (D34,
//   D99, D104).
// - The answer is the same whatever order the records are given in.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  type Debt,
  type DebtsInput,
  dayFromParts,
  divideRounded,
  formatDate,
  type PaymentChange,
  parseDate,
  type Schedule,
  type Series,
  type Tick,
  toOtherCurrency,
  workOutDebts,
  workOutPayments,
} from '../../src/index.ts';
import { englandAndWales } from '../fixtures/holidays.ts';

const at = (date: string, days: number) => formatDate(addDays(parseDate(date), days));
const two = (n: number) => n.toString().padStart(2, '0');
const timeOn = (date: string, minute: number) =>
  `${date}T${two(Math.floor(minute / 60) % 24)}:${two(minute % 60)}:00Z`;

const debtWish = fc.record({
  euros: fc.boolean(),
  card: fc.boolean(),
  balance: fc.integer({ min: 0, max: 200_000 }),
  start: fc.integer({ min: 0, max: 300_000 }),
  statementDay: fc.integer({ min: 1, max: 31 }),
  balanceMinute: fc.integer({ min: 0, max: 1439 }),
});

const seriesWish = fc.record({
  amount: fc.integer({ min: 0, max: 40_000 }),
  weekly: fc.boolean(),
  every: fc.integer({ min: 1, max: 3 }),
  startOffset: fc.integer({ min: -30, max: 30 }),
  payments: fc.option(fc.integer({ min: 1, max: 12 })),
  lastAmount: fc.option(fc.integer({ min: 0, max: 40_000 })),
  isEstimate: fc.boolean(),
  familyTime: fc.integer({ min: 0, max: 2 }),
});

const recordWish = fc.record({
  series: fc.nat(),
  k: fc.nat({ max: 20 }),
  minute: fc.integer({ min: 0, max: 1439 }),
  daysBefore: fc.integer({ min: 0, max: 10 }),
  inUpdate: fc.boolean(),
  amount: fc.option(fc.integer({ min: 0, max: 40_000 })),
  skipped: fc.boolean(),
});

const wishes = fc.record({
  today: fc.integer({ min: dayFromParts(2026, 1, 1), max: dayFromParts(2027, 12, 31) }),
  balanceDaysAgo: fc.integer({ min: 0, max: 20 }),
  length: fc.integer({ min: 0, max: 500 }),
  debt: debtWish,
  series: fc.array(seriesWish, { minLength: 0, maxLength: 4 }),
  changes: fc.array(recordWish, { maxLength: 4 }),
  ticks: fc.array(recordWish, { maxLength: 4 }),
});

type Wishes = typeof wishes extends fc.Arbitrary<infer T> ? T : never;

function build(wish: Wishes): DebtsInput {
  const today = formatDate(wish.today);
  const balanceOn = at(today, -wish.balanceDaysAgo);
  const d = wish.debt;
  const debt: Debt = {
    id: 'debt',
    name: 'Debt',
    kind: d.card ? 'credit-card' : 'loan',
    currency: d.euros ? 'EUR' : 'GBP',
    ...(d.euros ? { rate: '1.1612' } : {}),
    balance: d.balance,
    balanceOn,
    balanceAt: timeOn(balanceOn, d.balanceMinute),
    startingBalance: d.start,
    ...(d.card
      ? {
          interestRate: '24.9',
          statementDay: d.statementDay,
          minimumRule: { kind: 'rule', percent: '1', atLeast: 500 },
        }
      : {}),
  };
  const series: Series[] = wish.series.map((s, i) => {
    const schedule: Schedule = s.weekly
      ? { kind: 'weekly', every: s.every }
      : { kind: 'monthly', every: s.every, on: { kind: 'day', day: 15 } };
    return {
      id: `series-${i}`,
      accountId: 'current',
      name: 'Payment',
      direction: 'out',
      type: 'debt',
      debtId: 'debt',
      amount: s.amount,
      start: at(balanceOn, s.startOffset),
      schedule,
      end: s.payments === null ? { kind: 'never' } : { kind: 'after', payments: s.payments },
      ...(s.lastAmount === null || s.payments === null ? {} : { lastAmount: s.lastAmount }),
      holidayRule: 'working-day-before',
      isEstimate: s.isEstimate,
      familyId: `series-${i}`,
      familyCreatedAt: `2026-01-0${s.familyTime + 1}T00:00:00Z`,
    };
  });
  const to = at(today, wish.length);
  const paymentsOf = (one: Series) =>
    workOutPayments({
      series: [one],
      holidays: englandAndWales,
      from: at(balanceOn, -60),
      to: at(to, 60),
    });
  const changes: PaymentChange[] = [];
  const ticks: Tick[] = [];
  const used = { change: new Set<string>(), tick: new Set<string>() };
  for (const [kind, list] of [
    ['change', wish.changes],
    ['tick', wish.ticks],
  ] as const) {
    for (const r of list) {
      const one = series[r.series % Math.max(1, series.length)];
      if (one === undefined) continue;
      const payments = paymentsOf(one);
      const payment = payments[r.k % Math.max(1, payments.length)];
      const key = `${one.id} ${payment?.originalDate}`;
      if (payment === undefined || used[kind].has(key)) continue;
      used[kind].add(key);
      if (kind === 'change') {
        changes.push({
          seriesId: one.id,
          originalDate: payment.originalDate,
          ...(r.amount === null ? {} : { amount: r.amount }),
          ...(r.skipped ? { skipped: true } : {}),
        });
      } else {
        const tickedOn = [at(today, -r.daysBefore), payment.date].sort()[0] as string;
        ticks.push({
          seriesId: one.id,
          originalDate: payment.originalDate,
          tickedAt: timeOn(at(today, -r.daysBefore), r.minute),
          paidOn: tickedOn,
          ...(r.inUpdate ? { inDebtUpdate: 'debt' } : {}),
        });
      }
    }
  }
  return { debts: [debt], series, changes, ticks, holidays: englandAndWales, today, to };
}

describe('debts hold for any debt, payments, ticks and changes', () => {
  it('keeps every row, Paid off on, More than what’s left and Left now consistent', () => {
    let paidOff = 0;
    let withInterest = 0;
    let interestInLeftNow = 0;
    fc.assert(
      fc.property(wishes, (wish) => {
        const input = build(wish);
        const plan = workOutDebts(input).debts[0];
        if (plan === undefined) throw new Error('No debt.');
        const debt = input.debts[0] as Debt;

        let balance = debt.balance;
        let firstPaidOff: string | null = balance <= 1 ? debt.balanceOn : null;
        for (const row of plan.rows) {
          if (row.kind === 'statement') {
            expect(firstPaidOff, 'interest after it was paid off').toBeNull();
            expect(row.interest).toBeGreaterThanOrEqual(0);
            balance += row.interest;
            withInterest += row.interest > 0 ? 1 : 0;
            if (row.minimum !== null) {
              expect(row.minimum).toBeLessThanOrEqual(Math.max(0, balance));
            }
          } else {
            // What's left counts as nothing once it's 1p or less (D100).
            const over = row.amount - (balance <= 1 ? 0 : balance);
            expect(row.moreThanLeft).toBe(over > 1 ? over : null);
            balance -= row.amount;
            expect(row.paidOff).toBe(balance <= 1);
            // Never before the balance date: a row at the start pays it off on that date.
            if (firstPaidOff === null && balance <= 1) {
              firstPaidOff = [row.date, debt.balanceOn].sort()[1] as string;
            }
            // Planned payments from the balance date on, including that day itself (D105).
            if (!row.ticked) {
              expect(row.date >= debt.balanceOn && row.date <= input.to).toBe(true);
            }
          }
          expect(row.balanceAfter).toBe(balance);
          expect(row.leftAfter).toBe(balance <= 1 ? 0 : balance);
        }
        expect(plan.paidOffOn).toBe(firstPaidOff);
        expect(plan.leftAtEnd).toBe(firstPaidOff === null ? balance : null);
        if (firstPaidOff !== null) paidOff += 1;

        // Left now, worked out a second way (D99, D104): the balance, minus
        // every payment ticked after the update, plus 24.9% ÷ 12 on each
        // statement day from the day after the balance date to today, with
        // that day's payments first and nothing once it's paid off.
        const amountOf = (tick: Tick): number => {
          const one = input.series.find((s) => s.id === tick.seriesId) as Series;
          const payment = workOutPayments({
            series: [one],
            changes: (input.changes ?? []).filter((c) => c.seriesId === one.id),
            holidays: englandAndWales,
            from: at(debt.balanceOn, -400),
            to: at(input.to, 400),
          }).find((p) => p.originalDate === tick.originalDate);
          const pence = payment?.amount ?? 0;
          return debt.rate === undefined ? pence : toOtherCurrency(pence, debt.rate);
        };
        const after = (input.ticks ?? []).filter(
          (t) => t.tickedAt > debt.balanceAt && t.inDebtUpdate !== debt.id,
        );
        let walk = debt.balance;
        let interest = 0;
        let gone = walk <= 1;
        const daysToToday = Math.max(0, parseDate(input.today) - parseDate(debt.balanceOn));
        const daysToLast = Math.max(
          daysToToday,
          ...after.map((t) => parseDate(t.paidOn) - parseDate(debt.balanceOn)),
        );
        for (let i = -60; i <= daysToLast; i += 1) {
          const day = at(debt.balanceOn, i);
          for (const t of after) {
            if (t.paidOn !== day) continue;
            walk -= amountOf(t);
            if (walk <= 1) gone = true;
          }
          const [y, m, d] = day.split('-').map(Number) as [number, number, number];
          const monthEnd = new Date(Date.UTC(y, m, 0)).getUTCDate();
          const statementToday =
            debt.statementDay !== undefined && d === Math.min(debt.statementDay, monthEnd);
          if (statementToday && i > 0 && i <= daysToToday && !gone && walk > 0) {
            const added = Number(divideRounded(BigInt(walk) * 249n, 12000n));
            interest += added;
            walk += added;
          }
        }
        expect(plan.interestSinceUpdate).toBe(interest);
        if (interest > 0) interestInLeftNow += 1;
        expect(plan.leftNow).toBe(walk <= 1 ? 0 : walk);

        // Left now and progress (D34, D99), with a card's interest up to today (D104).
        expect(plan.leftNow).toBeGreaterThanOrEqual(0);
        expect(plan.leftNow).toBeLessThanOrEqual(debt.balance + plan.interestSinceUpdate);
        expect(plan.leftNowIsEstimate).toBe(plan.interestSinceUpdate > 0);
        if (debt.kind !== 'credit-card') expect(plan.interestSinceUpdate).toBe(0);
        expect(plan.paidOffNow).toBe(plan.leftNow === 0);
        expect(plan.percentPaid === 100).toBe(plan.paidOffNow);
        expect(plan.percentPaid).toBeGreaterThanOrEqual(0);

        // The same whatever order the records come in.
        const reversed = workOutDebts({
          ...input,
          series: [...input.series].reverse(),
          changes: [...(input.changes ?? [])].reverse(),
          ticks: [...(input.ticks ?? [])].reverse(),
        });
        expect(reversed.debts[0]).toEqual(plan);
      }),
      { numRuns: 1000 },
    );
    // Enough paid-off debts and interest for this to mean something.
    expect(paidOff).toBeGreaterThan(100);
    expect(withInterest).toBeGreaterThan(100);
    expect(interestInLeftNow).toBeGreaterThan(50);
  });
});
