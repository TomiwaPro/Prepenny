// Property tests (fast-check) for the balance rule (step 1b, owner test 8):
// rules that must hold for thousands of made-up plans, not just the examples.
//
// - Each account's end balance is its start balance plus every payment
//   applied to it (brief 5.8), checked against a separate, simple count.
// - A transfer never changes the total across all accounts.
//
// Enough shortfalls, and enough that a move fixes, are covered by
// construction, never left to chance: fixed plans with a shortfall that one
// move fixes are checked the same way before the random ones.
// - "Payments that could move" is exactly the list a person would find by
//   moving each payment themselves and looking at the new plan (D69).
// - The plan is the same whatever order its records are given in (D12).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Account,
  addDays,
  type BalanceUpdate,
  dayFromParts,
  formatDate,
  PAYMENT_TYPES,
  type Payment,
  type PaymentChange,
  type Plan,
  type PlanInput,
  paidDate,
  parseDate,
  parseTime,
  type Schedule,
  type Series,
  type Tick,
  workOutPayments,
  workOutPlan,
} from '../../src/index.ts';
import { noBankHolidays } from '../fixtures/holidays.ts';

const at = (date: string, days: number) => formatDate(addDays(parseDate(date), days));
const hhmm = (minutes: number) =>
  `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;

const accountWish = fc.record({
  kind: fc.constantFrom<Account['kind']>('current', 'savings', 'joint'),
  overdraft: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 100_000 })),
  warning: fc.integer({ min: -20_000, max: 20_000 }),
  updates: fc.array(
    fc.record({
      daysBeforeToday: fc.integer({ min: 0, max: 30 }),
      minute: fc.integer({ min: 0, max: 1439 }),
      balance: fc.integer({ min: -50_000, max: 150_000 }),
    }),
    { minLength: 1, maxLength: 2 },
  ),
});

const seriesWish = fc.record({
  account: fc.nat(),
  other: fc.nat(),
  direction: fc.constantFrom<Series['direction']>('in', 'out', 'out', 'transfer'),
  amount: fc.integer({ min: 0, max: 60_000 }),
  schedule: fc.oneof(
    fc.constant<Schedule>({ kind: 'once' }),
    fc.integer({ min: 1, max: 3 }).map((every): Schedule => ({ kind: 'weekly', every })),
    fc
      .integer({ min: 1, max: 31 })
      .map((day): Schedule => ({ kind: 'monthly', every: 1, on: { kind: 'day', day } })),
    fc.constant<Schedule>({ kind: 'irregular' }),
  ),
  startOffset: fc.integer({ min: -60, max: 60 }),
  endAfter: fc.option(fc.integer({ min: 1, max: 6 })),
  family: fc.integer({ min: 0, max: 5 }),
  name: fc.constantFrom('Rent', 'Pay', 'Bills', 'Bills ', 'A', 'a'),
  type: fc.constantFrom(...PAYMENT_TYPES),
});

const changeWish = fc.record({
  series: fc.nat(),
  k: fc.integer({ min: 0, max: 12 }),
  moveBy: fc.option(fc.integer({ min: -20, max: 20 })),
  amount: fc.option(fc.integer({ min: 0, max: 60_000 })),
  skipped: fc.boolean(),
});

const tickWish = fc.record({
  series: fc.nat(),
  k: fc.integer({ min: 0, max: 12 }),
  tickedAfterDue: fc.integer({ min: -15, max: 15 }),
  minute: fc.integer({ min: 0, max: 1439 }),
  inUpdate: fc.option(fc.nat()),
});

const planWish = fc.record({
  today: fc.integer({ min: dayFromParts(2026, 1, 1), max: dayFromParts(2027, 12, 31) }),
  length: fc.integer({ min: 0, max: 120 }),
  accounts: fc.array(accountWish, { minLength: 1, maxLength: 3 }),
  series: fc.array(seriesWish, { maxLength: 8 }),
  changes: fc.array(changeWish, { maxLength: 6 }),
  ticks: fc.array(tickWish, { maxLength: 8 }),
  mainPay: fc.option(fc.nat()),
});

type PlanWish = typeof planWish extends fc.Arbitrary<infer T> ? T : never;

/**
 * Plans shaped to have shortfalls that moving one payment can fix: a weekly
 * main pay into the first account, and payments going out over the next
 * three weeks. Fully random plans rarely have them (about 1 in 30).
 */
const shapedWish: fc.Arbitrary<PlanWish> = fc.record({
  today: fc.integer({ min: dayFromParts(2026, 1, 1), max: dayFromParts(2027, 12, 31) }),
  length: fc.integer({ min: 14, max: 60 }),
  accounts: fc.array(
    fc.record({
      kind: fc.constantFrom<Account['kind']>('current', 'savings', 'joint'),
      overdraft: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 20_000 })),
      warning: fc.integer({ min: 0, max: 5_000 }),
      updates: fc.array(
        fc.record({
          daysBeforeToday: fc.integer({ min: 0, max: 3 }),
          minute: fc.integer({ min: 0, max: 1439 }),
          balance: fc.integer({ min: 0, max: 40_000 }),
        }),
        { minLength: 1, maxLength: 2 },
      ),
    }),
    { minLength: 1, maxLength: 3 },
  ),
  series: fc
    .tuple(
      fc.record({
        account: fc.constant(0),
        other: fc.nat(),
        direction: fc.constant<Series['direction']>('in'),
        amount: fc.integer({ min: 20_000, max: 80_000 }),
        schedule: fc.constant<Schedule>({ kind: 'weekly', every: 1 }),
        startOffset: fc.integer({ min: 1, max: 7 }),
        endAfter: fc.constant(null),
        family: fc.integer({ min: 0, max: 5 }),
        name: fc.constant('Pay'),
        type: fc.constant('pay' as const),
      }),
      fc.array(
        fc.record({
          account: fc.nat(),
          other: fc.nat(),
          direction: fc.constantFrom<Series['direction']>('out', 'out', 'transfer'),
          amount: fc.integer({ min: 500, max: 40_000 }),
          schedule: fc.constantFrom<Schedule>(
            { kind: 'once' },
            { kind: 'once' },
            { kind: 'weekly', every: 2 },
          ),
          startOffset: fc.integer({ min: 0, max: 21 }),
          endAfter: fc.option(fc.integer({ min: 1, max: 3 })),
          family: fc.integer({ min: 0, max: 5 }),
          name: fc.constantFrom('Rent', 'Bills', 'A', 'a'),
          type: fc.constant('bills' as const),
        }),
        { minLength: 1, maxLength: 7 },
      ),
    )
    .map(([pay, outs]) => [pay, ...outs]),
  changes: fc.array(changeWish, { maxLength: 3 }),
  ticks: fc.array(tickWish, { maxLength: 3 }),
  mainPay: fc.constant(0),
});

// Families 0 and 1 share a creation time, so the same-day order falls back to names.
const familyTimes = [
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z',
  '2026-01-02T00:00:00Z',
  '2026-01-03T00:00:00Z',
  '2026-01-04T00:00:00Z',
  '2026-01-05T00:00:00Z',
];

/** Every payment of the plan's series that could matter, from well before any start to the end. */
function allPayments(input: PlanInput): Payment[] {
  return workOutPayments({
    series: input.series,
    changes: input.changes ?? [],
    holidays: input.holidays,
    from: at(input.today, -200),
    to: input.to,
  });
}

/** Turns a wish into a real plan. */
function buildPlan(wish: PlanWish): PlanInput {
  const today = formatDate(wish.today);
  const to = at(today, wish.length);
  const accounts: Account[] = wish.accounts.map((a, i) => ({
    id: `account-${i}`,
    kind: a.kind,
    overdraftLimit: a.overdraft,
    warningLevel: a.warning,
  }));
  const balanceUpdates: BalanceUpdate[] = [];
  wish.accounts.forEach((a, i) => {
    const seen = new Set<string>();
    a.updates.forEach((u, j) => {
      const checkedOn = at(today, -u.daysBeforeToday);
      const checkedAt = `${checkedOn}T${hhmm(u.minute)}:00Z`;
      if (seen.has(checkedAt)) return;
      seen.add(checkedAt);
      balanceUpdates.push({
        id: `update-${i}-${j}`,
        accountId: `account-${i}`,
        balance: u.balance,
        checkedOn,
        checkedAt,
      });
    });
  });

  const series: Series[] = wish.series.map((s, i) => {
    const from = s.account % accounts.length;
    const other = (from + 1 + (s.other % Math.max(1, accounts.length - 1))) % accounts.length;
    const transfer = s.direction === 'transfer' && accounts.length > 1;
    return {
      id: `series-${i}`,
      accountId: `account-${from}`,
      ...(transfer ? { toAccountId: `account-${other}` } : {}),
      name: s.name,
      direction: transfer ? 'transfer' : s.direction === 'transfer' ? 'out' : s.direction,
      amount: s.amount,
      start: at(today, s.startOffset),
      schedule: s.schedule,
      end: s.endAfter === null ? { kind: 'never' } : { kind: 'after', payments: s.endAfter },
      holidayRule: 'keep',
      type: s.type,
      isEstimate: false,
      familyId: `family-${s.family}`,
      familyCreatedAt: familyTimes[s.family] as string,
    };
  });

  const byNumber = (one: Series, k: number, changes: readonly PaymentChange[]) =>
    workOutPayments({
      series: [one],
      changes,
      holidays: noBankHolidays,
      from: at(today, -200),
      to: at(to, 400),
    }).find((p) => p.number === k) ?? null;

  const changes: PaymentChange[] = [];
  const changed = new Set<string>();
  if (series.length > 0) {
    for (const c of wish.changes) {
      const one = series[c.series % series.length] as Series;
      const payment = byNumber(one, c.k, []);
      if (payment === null || changed.has(`${one.id} ${payment.originalDate}`)) continue;
      changed.add(`${one.id} ${payment.originalDate}`);
      changes.push({
        seriesId: one.id,
        originalDate: payment.originalDate,
        skipped: c.skipped,
        ...(c.moveBy === null ? {} : { newDate: at(payment.originalDate, c.moveBy) }),
        ...(c.amount === null ? {} : { amount: c.amount }),
      });
    }
  }

  const ticks: Tick[] = [];
  const ticked = new Set<string>();
  if (series.length > 0) {
    for (const t of wish.ticks) {
      const one = series[t.series % series.length] as Series;
      const payment = byNumber(one, t.k, changes);
      if (payment === null || payment.date > to) continue;
      const key = `${one.id} ${payment.originalDate}`;
      if (ticked.has(key)) continue;
      ticked.add(key);
      // Ticked on or before today, around its due date.
      const tickedOn = [at(payment.date, t.tickedAfterDue), today].sort()[0] as string;
      const update =
        t.inUpdate === null ? undefined : balanceUpdates[t.inUpdate % balanceUpdates.length];
      ticks.push({
        seriesId: one.id,
        originalDate: payment.originalDate,
        tickedAt: `${tickedOn}T${hhmm(t.minute)}:30Z`,
        paidOn: paidDate(payment.date, tickedOn),
        ...(update === undefined ? {} : { inBalanceUpdate: update.id }),
      });
    }
  }

  const incoming = series.filter((one) => one.direction === 'in');
  const main =
    wish.mainPay === null || incoming.length === 0
      ? null
      : (incoming[wish.mainPay % incoming.length] as Series).familyId;

  return {
    accounts,
    balanceUpdates,
    series,
    changes,
    ticks,
    mainPayFamilyId: main,
    holidays: noBankHolidays,
    today,
    to,
  };
}

/**
 * A separate, simple count of an account's end balance: the latest balance
 * update plus every payment brief 5.5 applies to it, worked out straight from
 * the rules rather than from the plan's rows.
 */
function expectedEnd(input: PlanInput, accountId: string): number {
  const updates = input.balanceUpdates.filter((u) => u.accountId === accountId);
  const latest = updates.reduce((a, b) =>
    parseTime(b.checkedAt) > parseTime(a.checkedAt) ? b : a,
  );
  const ownUpdates = new Set(updates.map((u) => u.id));
  const ticks = new Map((input.ticks ?? []).map((t) => [`${t.seriesId} ${t.originalDate}`, t]));
  let total = latest.balance;
  for (const p of allPayments(input)) {
    const sign =
      p.accountId === accountId
        ? p.direction === 'in'
          ? 1
          : -1
        : p.toAccountId === accountId
          ? 1
          : 0;
    if (sign === 0) continue;
    const t = ticks.get(`${p.seriesId} ${p.originalDate}`);
    if (p.skipped && t === undefined) continue;
    if (t !== undefined) {
      const inside =
        parseTime(t.tickedAt) <= parseTime(latest.checkedAt) ||
        (t.inBalanceUpdate !== undefined && ownUpdates.has(t.inBalanceUpdate));
      if (inside || t.paidOn > input.to) continue;
    }
    total += sign * p.amount;
  }
  return total;
}

describe('the balance rule holds for any plan', () => {
  it("gives each account's end balance as its start balance plus every payment applied to it (brief 5.8)", () => {
    fc.assert(
      fc.property(planWish, (wish) => {
        const input = buildPlan(wish);
        const plan = workOutPlan(input);
        for (const one of plan.accounts) {
          const end = one.days.at(-1)?.balance;
          expect(end).toBe(expectedEnd(input, one.account.id));
          // And every row's Left after this is the one before plus its change.
          let balance = one.start.balance;
          for (const row of one.rows) {
            balance += row.change;
            expect(row.leftAfter).toBe(balance);
          }
          expect(end).toBe(balance);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('never changes the total across all accounts with a transfer', () => {
    fc.assert(
      fc.property(
        planWish.filter((wish) => wish.accounts.length > 1),
        fc.nat(),
        fc.nat(),
        fc.integer({ min: -40, max: 120 }),
        fc.integer({ min: 0, max: 100_000 }),
        (wish, fromIndex, toOffset, dayOffset, amount) => {
          const input = buildPlan(wish);
          const n = input.accounts.length;
          const from = fromIndex % n;
          const to = (from + 1 + (toOffset % (n - 1))) % n;
          const transfer: Series = {
            id: 'the-transfer',
            accountId: `account-${from}`,
            toAccountId: `account-${to}`,
            name: 'Transfer',
            direction: 'transfer',
            amount,
            start: at(input.today, dayOffset),
            schedule: { kind: 'once' },
            end: { kind: 'never' },
            holidayRule: 'keep',
            type: 'savings',
            isEstimate: false,
            familyId: 'the-transfer',
            familyCreatedAt: '2026-01-01T12:00:00Z',
          };
          const without = workOutPlan(input);
          const withIt = workOutPlan({ ...input, series: [...input.series, transfer] });
          const total = (plan: Plan, date: string) =>
            plan.accounts.reduce(
              (sum, one) => sum + (one.days.find((d) => d.date === date)?.balance ?? Number.NaN),
              0,
            );
          // From the latest balance date on, every account has a balance each day.
          const latestStart = input.balanceUpdates
            .map((u) => u.checkedOn)
            .sort()
            .at(-1) as string;
          for (let date = latestStart; date <= input.to; date = at(date, 1)) {
            expect(total(withIt, date)).toBe(total(without, date));
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

/** The plan with one payment moved to a new date, as "Move" would do it. */
function moved(input: PlanInput, payment: Payment, newDate: string): PlanInput {
  const changes = input.changes ?? [];
  const existing = changes.find(
    (c) => c.seriesId === payment.seriesId && c.originalDate === payment.originalDate,
  );
  return {
    ...input,
    changes:
      existing === undefined
        ? [...changes, { seriesId: payment.seriesId, originalDate: payment.originalDate, newDate }]
        : changes.map((c) => (c === existing ? { ...c, newDate } : c)),
  };
}

/** Checks "Payments that could move" on one plan, and says how many shortfalls and lists it had. */
function checkCouldMove(wish: PlanWish): { shortfalls: number; lists: number } {
  let shortfalls = 0;
  let lists = 0;
  const input = buildPlan(wish);
  const plan = workOutPlan(input);
  const shortBefore = new Set(
    plan.accounts.flatMap((one) =>
      one.days
        .filter((d) => d.date >= plan.today && d.status === 'short')
        .map((d) => `${one.account.id} ${d.date}`),
    ),
  );
  for (const one of plan.accounts) {
    for (const shortfall of one.shortfalls) {
      shortfalls += 1;
      if (shortfall.couldMove.length > 0) lists += 1;
      const listed = new Set(shortfall.couldMove);
      const candidates = one.rows.filter(
        (row) => row.date >= plan.today && row.date < shortfall.date && !row.ticked,
      );
      if (shortfall.moveTo === null) {
        expect(shortfall.couldMove).toEqual([]);
        continue;
      }
      for (const row of candidates) {
        const after = workOutPlan(moved(input, row.payment, shortfall.moveTo));
        const account = after.accounts.find((a) => a.account.id === one.account.id);
        const fixed = (account?.days ?? []).every(
          (d) => d.date < shortfall.date || d.date > shortfall.lastDate || d.status !== 'short',
        );
        const newShortDay = after.accounts.some((a) =>
          a.days.some(
            (d) =>
              d.date >= plan.today &&
              d.status === 'short' &&
              !shortBefore.has(`${a.account.id} ${d.date}`),
          ),
        );
        expect(listed.has(row), `${row.payment.seriesId} ${row.date}`).toBe(fixed && !newShortDay);
      }
      // Only those payments, biggest first.
      expect(shortfall.couldMove.every((row) => candidates.includes(row))).toBe(true);
      const amounts = shortfall.couldMove.map((row) => -row.change);
      expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    }
  }
  return { shortfalls, lists };
}

/**
 * Fixed plans, one for every 5 days from Thu 1 Jan 2026, each with a
 * shortfall that one move fixes: £300.00 today, a bill of £200.00 or a
 * little more tomorrow and £150.00 on day 3, so it's short on day 3, and
 * weekly pay of £600.00 from day 5. Moving tomorrow's bill to that payday
 * fixes it, without a new short day.
 */
const FIXED_SHORT: readonly PlanWish[] = Array.from({ length: 120 }, (_, i) => ({
  today: dayFromParts(2026, 1, 1) + 5 * i,
  length: 30,
  accounts: [
    {
      kind: 'current',
      overdraft: 0,
      warning: 0,
      updates: [{ daysBeforeToday: 0, minute: 8 * 60, balance: 30_000 }],
    },
  ],
  series: [
    {
      account: 0,
      other: 0,
      direction: 'in',
      amount: 60_000,
      schedule: { kind: 'weekly', every: 1 },
      startOffset: 5,
      endAfter: null,
      family: 0,
      name: 'Pay',
      type: 'pay',
    },
    {
      account: 0,
      other: 0,
      direction: 'out',
      amount: 20_000 + 100 * (i % 10),
      schedule: { kind: 'once' },
      startOffset: 1,
      endAfter: null,
      family: 1,
      name: 'Bills',
      type: 'bills',
    },
    {
      account: 0,
      other: 0,
      direction: 'out',
      amount: 15_000,
      schedule: { kind: 'once' },
      startOffset: 3,
      endAfter: null,
      family: 2,
      name: 'Rent',
      type: 'bills',
    },
  ],
  changes: [],
  ticks: [],
  mainPay: 0,
}));

describe('payments that could move (D69)', () => {
  it('lists exactly the payments that, moved on their own, fix the shortfall with no new short day', () => {
    let shortfallsSeen = 0;
    let listsSeen = 0;
    // The fixed plans first: each has a shortfall that one move fixes.
    FIXED_SHORT.forEach((wish, i) => {
      const seen = checkCouldMove(wish);
      expect(seen, `fixed ${i}`).toEqual({ shortfalls: 1, lists: 1 });
      shortfallsSeen += seen.shortfalls;
      listsSeen += seen.lists;
    });
    /** The bars, checked after the fixed ones, which alone meet them, and again after the random ones. */
    const enough = () => {
      // The made-up plans must really have shortfalls, and some that a move can
      // fix, for this to mean anything. About 1 in 10 shortfalls has a list.
      expect(shortfallsSeen).toBeGreaterThan(100);
      expect(listsSeen).toBeGreaterThan(10);
    };
    enough();
    // Then random ones.
    fc.assert(
      fc.property(fc.oneof(planWish, shapedWish, shapedWish), (wish) => {
        const seen = checkCouldMove(wish);
        shortfallsSeen += seen.shortfalls;
        listsSeen += seen.lists;
      }),
      { numRuns: 450 },
    );
    enough();
  });
});

describe('the same-day order (D12)', () => {
  it('gives the same plan whatever order the records are given in', () => {
    fc.assert(
      fc.property(planWish, fc.integer(), (wish, seed) => {
        const input = buildPlan(wish);
        const shuffle = <T>(list: readonly T[]): T[] =>
          list
            .map((item, i) => ({ item, key: (i * 7919 + seed) % 101 }))
            .sort((a, b) => a.key - b.key)
            .map(({ item }) => item);
        const shuffled: PlanInput = {
          ...input,
          balanceUpdates: shuffle(input.balanceUpdates),
          series: shuffle(input.series),
          changes: shuffle(input.changes ?? []),
          ticks: shuffle(input.ticks ?? []),
        };
        expect(workOutPlan(shuffled)).toEqual(workOutPlan(input));
      }),
      { numRuns: 200 },
    );
  });
});
