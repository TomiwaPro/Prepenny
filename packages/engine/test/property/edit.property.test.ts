// Property tests (fast-check) for editing (step 1c, brought forward from 1g):
// rules that must hold for thousands of made-up plans and edits.
//
// - Splitting a series without changing anything gives exactly the same
//   payments and balances (brief 5.8).
// - Undo after any edit gives back exactly the records from before (brief 5.8).
// - Making an edit, undoing it, then making the same edit again gives the same
//   records as the first time.
// - A private transfer's two halves still match after every edit (D94).
// - An edit is only ever refused for a reason, never because it would leave
//   records the plan can't use.
// - Debts still work out after every edit, "Update from statement" included (step 1d).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Account,
  addDays,
  applyWrites,
  type BalanceUpdate,
  type Debt,
  dayFromParts,
  type Edit,
  type EditCommand,
  EngineInputError,
  editPlan,
  formatDate,
  type PaymentChange,
  type PlanInput,
  paidDate,
  parseDate,
  type Schedule,
  type Series,
  sameValue,
  type Tick,
  workOutDebts,
  workOutPayments,
  workOutPlan,
} from '../../src/index.ts';
import { canonical, halvesProblems } from '../fixtures/edit.ts';
import { englandAndWales } from '../fixtures/holidays.ts';

const at = (date: string, days: number) => formatDate(addDays(parseDate(date), days));
const two = (n: number) => n.toString().padStart(2, '0');
const timeOn = (date: string, minute: number, second = 0) =>
  `${date}T${two(Math.floor(minute / 60) % 24)}:${two(minute % 60)}:${two(second % 60)}Z`;

const scheduleWish = fc.oneof(
  fc.constant<Schedule>({ kind: 'once' }),
  fc.integer({ min: 1, max: 3 }).map((every): Schedule => ({ kind: 'weekly', every })),
  fc.integer({ min: 1, max: 31 }).map(
    (day): Schedule => ({
      kind: 'monthly',
      every: 1,
      on: { kind: 'day', day },
    }),
  ),
  fc.constant<Schedule>({ kind: 'monthly', every: 1, on: { kind: 'last-working-day' } }),
  fc.constant<Schedule>({
    kind: 'monthly',
    every: 1,
    on: { kind: 'day', day: 1 },
    leaveOut: [2, 3],
  }),
  fc.integer({ min: 2, max: 3 }).map(
    (every): Schedule => ({
      kind: 'monthly',
      every,
      on: { kind: 'day', day: 28 },
    }),
  ),
  // Filled in with real dates when the plan is built.
  fc.constant<Schedule>({ kind: 'dates', dates: [] }),
  fc.constant<Schedule>({ kind: 'irregular' }),
);

const endWish = fc.oneof(
  fc.constant({ kind: 'never' as const }),
  fc.integer({ min: 1, max: 8 }).map((payments) => ({ kind: 'after' as const, payments })),
  fc.integer({ min: 0, max: 200 }).map((days) => ({ kind: 'on' as const, days })),
);

const seriesWish = fc.record({
  account: fc.nat(),
  other: fc.nat(),
  direction: fc.constantFrom<Series['direction']>('in', 'out', 'out', 'transfer'),
  amount: fc.integer({ min: 0, max: 60_000 }),
  cycle: fc.option(fc.array(fc.integer({ min: 0, max: 60_000 }), { minLength: 1, maxLength: 4 })),
  cycleOffset: fc.integer({ min: -3, max: 3 }),
  schedule: scheduleWish,
  dateOffsets: fc.uniqueArray(fc.integer({ min: 0, max: 150 }), { minLength: 1, maxLength: 5 }),
  startOffset: fc.integer({ min: -60, max: 60 }),
  end: endWish,
  lastAmount: fc.option(fc.integer({ min: 0, max: 60_000 })),
  holidayRule: fc.constantFrom<Series['holidayRule']>(
    'keep',
    'working-day-before',
    'working-day-after',
  ),
  isEstimate: fc.boolean(),
  note: fc.option(fc.constant('A note')),
  familyTime: fc.integer({ min: 0, max: 3 }),
  name: fc.constantFrom('Rent', 'Pay', 'Bills', 'A', 'a'),
  // Money going out can pay off one of the plan's two debts (D98).
  debt: fc.option(fc.integer({ min: 0, max: 1 })),
});

const changeWish = fc.record({
  series: fc.nat(),
  k: fc.nat({ max: 40 }),
  moveBy: fc.option(fc.integer({ min: -20, max: 20 })),
  amount: fc.option(fc.integer({ min: 0, max: 60_000 })),
  note: fc.option(fc.constant('One-off note')),
  skipped: fc.boolean(),
});

const tickWish = fc.record({
  series: fc.nat(),
  k: fc.nat({ max: 40 }),
  tickedAfterDue: fc.integer({ min: -15, max: 15 }),
  minute: fc.integer({ min: 0, max: 1439 }),
  inUpdate: fc.boolean(),
});

const planWish = fc.record({
  today: fc.integer({ min: dayFromParts(2026, 1, 1), max: dayFromParts(2027, 12, 31) }),
  length: fc.integer({ min: 0, max: 120 }),
  accounts: fc.integer({ min: 1, max: 3 }),
  balances: fc.array(fc.integer({ min: -50_000, max: 150_000 }), { minLength: 3, maxLength: 3 }),
  series: fc.array(seriesWish, { minLength: 1, maxLength: 6 }),
  privateTransfer: fc.option(seriesWish),
  changes: fc.array(changeWish, { maxLength: 6 }),
  ticks: fc.array(tickWish, { maxLength: 5 }),
  mainPay: fc.option(fc.nat(), { freq: 6 }),
});

type PlanWish = typeof planWish extends fc.Arbitrary<infer T> ? T : never;
type SeriesWish = typeof seriesWish extends fc.Arbitrary<infer T> ? T : never;

const familyTimes = [
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z',
  '2026-01-02T00:00:00Z',
  '2026-01-03T00:00:00Z',
];

function seriesFrom(wish: SeriesWish, id: string, today: string, fields: Partial<Series>): Series {
  const start = at(today, wish.startOffset);
  const schedule: Schedule =
    wish.schedule.kind === 'dates'
      ? {
          kind: 'dates',
          dates: [...wish.dateOffsets].sort((a, b) => a - b).map((d) => at(start, d)),
        }
      : wish.schedule;
  const end: Series['end'] =
    wish.end.kind === 'on' ? { kind: 'on', date: at(start, wish.end.days) } : wish.end;
  const one: Series = {
    id,
    accountId: 'account-0',
    name: wish.name,
    direction: wish.direction,
    amount: wish.amount,
    start,
    schedule,
    end,
    holidayRule: wish.holidayRule,
    type: 'other',
    isEstimate: wish.isEstimate,
    familyId: id,
    familyCreatedAt: familyTimes[wish.familyTime] as string,
    ...fields,
  };
  return {
    ...one,
    ...(wish.cycle === null ? {} : { amountCycle: wish.cycle, cycleOffset: wish.cycleOffset }),
    ...(wish.lastAmount === null ? {} : { lastAmount: wish.lastAmount }),
    ...(wish.note === null || fields.mirrorOf !== undefined ? {} : { note: wish.note }),
  };
}

/** A plan with its debts. */
type PlanWithDebts = PlanInput & { readonly debts: readonly Debt[] };

/** Turns a wish into a plan, with each series its own family and any private transfer in step. */
function buildPlan(wish: PlanWish): PlanWithDebts {
  const today = formatDate(wish.today);
  const to = at(today, wish.length);
  const accounts: Account[] = Array.from({ length: wish.accounts }, (_, i) => ({
    id: `account-${i}`,
    kind: i === 1 ? 'joint' : 'current',
    overdraftLimit: 0,
    warningLevel: 2000,
  }));
  const balanceUpdates: BalanceUpdate[] = accounts.map((one, i) => ({
    id: `update-${i}`,
    accountId: one.id,
    balance: wish.balances[i] as number,
    checkedOn: today,
    checkedAt: timeOn(today, 60 * 8),
  }));

  const series: Series[] = wish.series.map((s, i) => {
    const from = s.account % accounts.length;
    const other = (from + 1 + (s.other % Math.max(1, accounts.length - 1))) % accounts.length;
    const transfer = s.direction === 'transfer' && accounts.length > 1;
    const direction = transfer ? 'transfer' : s.direction === 'transfer' ? 'out' : s.direction;
    return seriesFrom(s, `series-${i}`, today, {
      accountId: `account-${from}`,
      direction,
      ...(transfer ? { toAccountId: `account-${other}` } : {}),
      ...(direction === 'out' && s.debt !== null ? { debtId: `debt-${s.debt}` } : {}),
    });
  });
  const debts: Debt[] = [
    {
      id: 'debt-0',
      name: 'Card',
      kind: 'credit-card',
      currency: 'GBP',
      balance: 42099,
      balanceOn: today,
      balanceAt: timeOn(today, 60 * 8),
      startingBalance: 50000,
      interestRate: '24.9',
      statementDay: 10,
      minimumRule: { kind: 'rule', percent: '1', atLeast: 500 },
    },
    {
      id: 'debt-1',
      name: 'Loan',
      kind: 'owed-to-a-person',
      currency: 'EUR',
      rate: '1.1612',
      balance: 140057,
      balanceOn: today,
      balanceAt: timeOn(today, 60 * 8),
      startingBalance: 239693,
    },
  ];
  const halves: [Series, Series][] = [];
  if (wish.privateTransfer !== null && accounts.length > 1) {
    const t = wish.privateTransfer;
    const privateHalf = seriesFrom(t, 'to-joint', today, {
      accountId: 'account-0',
      direction: 'out',
      name: 'To the joint account',
    });
    const sharedHalf = seriesFrom(t, 'from-jess', today, {
      accountId: 'account-1',
      direction: 'in',
      name: 'From Jess',
      mirrorOf: 'to-joint',
    });
    series.push(privateHalf, sharedHalf);
    halves.push([privateHalf, sharedHalf]);
  }

  const paymentsOf = (one: Series, changes: readonly PaymentChange[]) =>
    workOutPayments({
      series: [one],
      changes,
      holidays: englandAndWales,
      from: at(today, -250),
      to: at(to, 250),
    });
  const sharedOf = (one: Series) => halves.find(([p]) => p.id === one.id)?.[1] ?? null;
  const pickable = series.filter((one) => one.mirrorOf === undefined);

  const changes: PaymentChange[] = [];
  const changed = new Set<string>();
  for (const c of wish.changes) {
    const one = pickable[c.series % pickable.length] as Series;
    const list = paymentsOf(one, []);
    const payment = list[c.k % Math.max(1, list.length)];
    if (payment === undefined || changed.has(`${one.id} ${payment.originalDate}`)) continue;
    changed.add(`${one.id} ${payment.originalDate}`);
    const change: PaymentChange = {
      seriesId: one.id,
      originalDate: payment.originalDate,
      ...(c.skipped ? { skipped: true } : {}),
      ...(c.moveBy === null ? {} : { newDate: at(payment.originalDate, c.moveBy) }),
      ...(c.amount === null ? {} : { amount: c.amount }),
    };
    changes.push(c.note === null ? change : { ...change, note: c.note });
    const shared = sharedOf(one);
    if (shared !== null) changes.push({ ...change, seriesId: shared.id });
  }

  const ticks: Tick[] = [];
  const ticked = new Set<string>();
  for (const t of wish.ticks) {
    const one = pickable[t.series % pickable.length] as Series;
    const list = paymentsOf(one, changes);
    const payment = list[t.k % Math.max(1, list.length)];
    if (payment === undefined || ticked.has(`${one.id} ${payment.originalDate}`)) continue;
    ticked.add(`${one.id} ${payment.originalDate}`);
    const tickedOn = [at(payment.date, t.tickedAfterDue), today].sort()[0] as string;
    const tick: Tick = {
      seriesId: one.id,
      originalDate: payment.originalDate,
      tickedAt: timeOn(tickedOn, t.minute, 30),
      paidOn: paidDate(payment.date, tickedOn),
      ...(t.inUpdate ? { inBalanceUpdate: 'update-0' } : {}),
    };
    ticks.push(tick);
    const shared = sharedOf(one);
    if (shared !== null) ticks.push({ ...tick, seriesId: shared.id });
  }

  const incoming = series.filter((one) => one.direction === 'in' && one.mirrorOf === undefined);
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
    debts,
    mainPayFamilyId: main,
    holidays: englandAndWales,
    today,
    to,
  };
}

const KINDS = [
  'just-this-one',
  'this-and-later',
  'remove-this-one',
  'remove-this-and-later',
  'move',
  'move-to-next-payday',
  'tick',
  'untick',
  'update-balance',
  'update-from-statement',
  'undo',
] as const;

const commandWish = fc.record({
  kind: fc.constantFrom(...KINDS),
  series: fc.nat(),
  k: fc.nat({ max: 40 }),
  amount: fc.option(fc.integer({ min: 0, max: 60_000 })),
  // For a series with a pattern: "Only this week of the pattern" (D97) instead of every payday.
  toStep: fc.boolean(),
  name: fc.option(fc.constantFrom('Rent', 'New name')),
  note: fc.option(fc.constantFrom('', 'New note')),
  isEstimate: fc.option(fc.boolean()),
  moveBy: fc.integer({ min: -10, max: 10 }),
  newDate: fc.option(fc.integer({ min: -3, max: 3 })),
  minute: fc.integer({ min: 0, max: 1439 }),
  balance: fc.integer({ min: -50_000, max: 150_000 }),
});

type CommandWish = typeof commandWish extends fc.Arbitrary<infer T> ? T : never;

/** The payments of every series, worked out together so families count. */
function allPayments(input: PlanInput) {
  return workOutPayments({
    series: input.series,
    changes: input.changes ?? [],
    holidays: input.holidays,
    from: at(input.today, -250),
    to: at(input.to, 250),
  });
}

/** A real command from a wish, aimed at a payment of the plan as it is now. */
function commandFrom(
  wish: CommandWish,
  input: PlanWithDebts,
  step: number,
  earlier: readonly Edit[],
): EditCommand | null {
  if (wish.kind === 'undo') {
    // Any earlier edit, not only the last: undo is refused if it would lose a later change.
    const edit = earlier[earlier.length - 1 - (wish.k % Math.max(1, earlier.length))];
    return edit === undefined ? null : { kind: 'undo', edit };
  }
  if (wish.kind === 'update-balance') {
    const account = input.accounts[wish.series % input.accounts.length] as Account;
    return {
      kind: 'update-balance',
      update: {
        id: `new-update-${step}`,
        accountId: account.id,
        balance: wish.balance,
        checkedOn: input.today,
        checkedAt: timeOn(input.today, wish.minute, step),
      },
    };
  }
  if (wish.kind === 'update-from-statement') {
    const debt = input.debts[wish.series % input.debts.length] as Debt;
    // Sometimes with a payment of this debt ticked in its steps (D62).
    const linked = allPayments(input).filter(
      (p) => input.series.find((one) => one.id === p.seriesId)?.debtId === debt.id,
    );
    const payment = wish.toStep ? linked[wish.k % Math.max(1, linked.length)] : undefined;
    return {
      kind: 'update-from-statement',
      debtId: debt.id,
      balance: Math.abs(wish.balance),
      balanceOn: input.today,
      balanceAt: timeOn(input.today, wish.minute, step),
      ticks:
        payment === undefined
          ? []
          : [
              {
                seriesId: payment.seriesId,
                originalDate: payment.originalDate,
                tickedAt: timeOn(input.today, wish.minute, step + 1),
              },
            ],
    };
  }
  if (wish.kind === 'untick') {
    // Aimed at a ticked payment, or there would be little to untick.
    const ticks = input.ticks ?? [];
    const tick = ticks[wish.k % Math.max(1, ticks.length)];
    return tick === undefined
      ? null
      : { kind: 'untick', seriesId: tick.seriesId, originalDate: tick.originalDate };
  }
  const one = input.series[wish.series % input.series.length] as Series;
  const list = allPayments(input).filter((p) => p.seriesId === one.id);
  const payment = list[wish.k % Math.max(1, list.length)];
  if (payment === undefined) return null;
  const ref = { seriesId: one.id, originalDate: payment.originalDate };
  const optional = <K extends string, V>(key: K, value: V | null) =>
    (value === null ? {} : { [key]: value }) as { [P in K]?: V };
  switch (wish.kind) {
    case 'just-this-one':
      return {
        ...ref,
        kind: 'just-this-one',
        edits: {
          ...optional('amount', wish.amount),
          ...optional('name', wish.name),
          ...optional('note', wish.note),
          ...optional('isEstimate', wish.isEstimate),
          ...(wish.moveBy === 0 ? {} : { date: at(payment.date, wish.moveBy) }),
        },
      };
    case 'this-and-later': {
      let dates = {};
      if (wish.newDate !== null) {
        const date = at(payment.originalDate, wish.newDate);
        const day = Number(date.slice(8));
        dates =
          one.schedule.kind === 'monthly'
            ? { date, schedule: { ...one.schedule, on: { kind: 'day', day } } }
            : { date };
      }
      const stepAmount = wish.toStep && one.amountCycle !== undefined ? wish.amount : null;
      return {
        ...ref,
        kind: 'this-and-later',
        edits: {
          ...(stepAmount === null ? optional('amount', wish.amount) : { stepAmount }),
          ...optional('name', one.mirrorOf === undefined ? wish.name : null),
          ...optional('note', one.mirrorOf === undefined ? wish.note : null),
          ...optional('isEstimate', wish.isEstimate),
          ...dates,
        },
        newSeriesId: `new-series-${step}`,
        newOtherHalfSeriesId: `new-half-${step}`,
      };
    }
    case 'remove-this-one':
    case 'remove-this-and-later':
    case 'move-to-next-payday':
      return { ...ref, kind: wish.kind };
    case 'move':
      return { ...ref, kind: 'move', date: at(payment.date, wish.moveBy) };
    case 'tick':
      return { ...ref, kind: 'tick', tickedAt: timeOn(input.today, wish.minute, 45) };
  }
}

/**
 * Each change and tick that belongs to a payment, as "kind|series|original
 * date", with the payment number it belongs to.
 */
function paymentOfRecord(input: PlanInput): Map<string, number> {
  // A wider window than commands are picked from, so a payment moved just
  // past its edge is still found.
  const wide = workOutPayments({
    series: input.series,
    changes: input.changes ?? [],
    holidays: input.holidays,
    from: at(input.today, -400),
    to: at(input.to, 400),
  });
  const numbers = new Map(wide.map((p) => [`${p.seriesId}|${p.originalDate}`, p.number]));
  const found = new Map<string, number>();
  for (const [kind, list] of [
    ['change', input.changes ?? []],
    ['tick', input.ticks ?? []],
  ] as const) {
    for (const record of list) {
      const number = numbers.get(`${record.seriesId}|${record.originalDate}`);
      if (number !== undefined)
        found.set(`${kind}|${record.seriesId}|${record.originalDate}`, number);
    }
  }
  return found;
}

/** Makes an edit, or null when the engine refuses it for a reason. */
function tryEdit(input: PlanWithDebts, command: EditCommand): Edit | null {
  try {
    return editPlan(input, command);
  } catch (error) {
    expect(error).toBeInstanceOf(EngineInputError);
    // Refusing because the result would break the plan is always the engine's own mistake.
    expect((error as EngineInputError).code, (error as Error).message).not.toBe('edit-breaks-plan');
    return null;
  }
}

const halves = (input: PlanWithDebts) =>
  halvesProblems(input, at(input.today, -250), at(input.to, 250));

describe('editing holds for any plan and any edits', () => {
  it('undoes every edit exactly, redoes it the same way, and keeps private transfers in step', () => {
    const made = new Map<string, number>();
    fc.assert(
      fc.property(
        planWish,
        fc.array(commandWish, { minLength: 1, maxLength: 8 }),
        (wish, wishes) => {
          let input = buildPlan(wish);
          expect(halves(input)).toEqual([]);
          const earlier: Edit[] = [];
          wishes.forEach((commandWishOne, step) => {
            const command = commandFrom(commandWishOne, input, step, earlier);
            if (command === null) return;
            const edit = tryEdit(input, command);
            if (edit === null) return;
            made.set(command.kind, (made.get(command.kind) ?? 0) + 1);
            if (command.kind === 'this-and-later' && command.edits.stepAmount !== undefined) {
              made.set('step-amount', (made.get('step-amount') ?? 0) + 1);
            }
            const after = applyWrites(input, edit.writes);

            // Undo gives back exactly the records from before.
            const undo = editPlan(after, { kind: 'undo', edit });
            const back = applyWrites(after, undo.writes);
            expect(canonical(back)).toEqual(canonical(input));

            // The same edit again gives the same records as the first time.
            const again = editPlan(back, command);
            expect(sameValue(again, edit)).toBe(true);
            expect(canonical(applyWrites(back, again.writes))).toEqual(canonical(after));

            // A change or tick the edit didn't touch still belongs to the same payment.
            const touched = new Set(
              edit.writes.flatMap((w) =>
                w.kind === 'change' || w.kind === 'tick'
                  ? [`${w.kind}|${w.seriesId}|${w.originalDate}`]
                  : [],
              ),
            );
            const nowAt = paymentOfRecord(after);
            for (const [key, number] of paymentOfRecord(input)) {
              if (touched.has(key)) continue;
              expect(nowAt.get(key), `${command.kind} left ${key} loose`).toBe(number);
            }

            // Both halves of a private transfer still match, and the plan and its debts still work.
            expect(halves(after)).toEqual([]);
            workOutPlan(after);
            workOutDebts(after);

            input = after;
            earlier.push(edit);
          });
        },
      ),
      { numRuns: 1000 },
    );
    // Every kind of edit must really have been made, many times, for this to mean anything.
    for (const kind of [...KINDS, 'step-amount']) {
      expect(made.get(kind) ?? 0, kind).toBeGreaterThan(20);
    }
  });

  it('gives exactly the same payments and balances after splitting a series without changing anything', () => {
    let splits = 0;
    fc.assert(
      fc.property(
        planWish,
        fc.array(commandWish, { maxLength: 4 }),
        fc.nat(),
        fc.nat({ max: 40 }),
        (wish, wishes, which, k) => {
          // Some edits first, so splits of splits and moved changes are covered.
          let input = buildPlan(wish);
          wishes.forEach((one, step) => {
            const command = commandFrom(one, input, step, []);
            const edit = command === null ? null : tryEdit(input, command);
            if (edit !== null) input = applyWrites(input, edit.writes);
          });
          const one = input.series[which % input.series.length] as Series;
          const list = allPayments(input).filter((p) => p.seriesId === one.id);
          const payment = list[k % Math.max(1, list.length)];
          if (payment === undefined) return;
          const edit = editPlan(input, {
            kind: 'this-and-later',
            seriesId: one.id,
            originalDate: payment.originalDate,
            edits: {},
            newSeriesId: 'split-new',
            newOtherHalfSeriesId: 'split-other',
          });
          const after = applyWrites(input, edit.writes);
          const fromSplit = new Map(
            after.series
              .filter((s) => s.id === 'split-new' || s.id === 'split-other')
              .map((s) => [s.id, s.splitFrom as string]),
          );
          if (fromSplit.size > 0) splits += 1;
          const asBefore = (text: string) =>
            text.replace(
              /"seriesId":"(split-new|split-other)"/g,
              (_, id: string) => `"seriesId":"${fromSplit.get(id)}"`,
            );
          // As a set: workOutPayments lists same-day payments in the order the
          // series are given, and the new series comes last in the list.
          const each = (one: PlanInput) =>
            allPayments(one)
              .map((p) => asBefore(JSON.stringify(p)))
              .sort();
          expect(each(after)).toEqual(each(input));
          expect(asBefore(JSON.stringify(workOutPlan(after)))).toBe(
            JSON.stringify(workOutPlan(input)),
          );
        },
      ),
      { numRuns: 300 },
    );
    expect(splits).toBeGreaterThan(100);
  });
});
