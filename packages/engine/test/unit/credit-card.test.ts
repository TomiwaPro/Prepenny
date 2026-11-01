// Credit cards with an interest rate (step 1d, brief 4.6 and 5.6): owner
// test 5, ARCHITECTURE.md test 29, the minimum rule (D101) and the
// comparison of the minimum, a fixed amount and the full balance (D102).
// Step 1e adds the owner's answers: interest in Left now (D104) and "0%
// until a date" (D106).

import { describe, expect, it } from 'vitest';
import {
  type CardComparisonInput,
  compareCardPayments,
  type Debt,
  type DebtPaymentRow,
  type DebtPlan,
  type DebtStatementRow,
  type DebtsInput,
  EngineInputError,
  formatPounds,
  type Series,
  sumPence,
  type Tick,
  workOutDebts,
} from '../../src/index.ts';
import { noBankHolidays } from '../fixtures/holidays.ts';
import { pounds } from '../fixtures/plan.ts';
import { series } from '../fixtures/series.ts';

/** The card worked out by hand: £420.99 on Sun 25 Oct 2026, 24.9% a year, statement day the 10th. */
const card: Debt = {
  id: 'card',
  name: 'Credit card',
  kind: 'credit-card',
  currency: 'GBP',
  balance: pounds('420.99'),
  balanceOn: '2026-10-25',
  balanceAt: '2026-10-25T08:30:00Z',
  startingBalance: pounds('420.99'),
  interestRate: '24.9',
  statementDay: 10,
  // "Interest plus 1% of the balance, at least £5".
  minimumRule: { kind: 'rule', percent: '1', atLeast: pounds('5.00') },
};

const monthlyOn15th = { kind: 'monthly', every: 1, on: { kind: 'day', day: 15 } } as const;

function cardPlan(
  fields: Partial<Debt> = {},
  linked: readonly Series[] = [],
  to = '2027-12-31',
): DebtPlan {
  const input: DebtsInput = {
    debts: [{ ...card, ...fields }],
    series: linked,
    holidays: noBankHolidays,
    today: '2026-10-25',
    to,
  };
  return workOutDebts(input).debts[0] as DebtPlan;
}

const statements = (plan: DebtPlan) =>
  plan.rows.filter((row): row is DebtStatementRow => row.kind === 'statement');
const payments = (plan: DebtPlan) =>
  plan.rows.filter((row): row is DebtPaymentRow => row.kind === 'payment');

const compare = (fields: Partial<CardComparisonInput> = {}) =>
  compareCardPayments({
    card,
    left: card.balance,
    from: '2026-10-25',
    paysOn: 15,
    fixed: pounds('25.00'),
    ...fields,
  });

function refusedWith(code: string, run: () => unknown): void {
  let error: unknown = null;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  expect(error, `expected a refusal: ${code}`).toBeInstanceOf(EngineInputError);
  expect((error as EngineInputError).code).toBe(code);
}

describe('owner test 5: a credit card worked out by hand', () => {
  it('adds £8.74 interest on the first statement, Tue 10 Nov, and the minimum is £12.95', () => {
    const first = statements(cardPlan())[0];
    expect(first).toMatchObject({ date: '2026-11-10' });
    expect(
      [first?.interest, first?.minimum, first?.balanceAfter].map((p) => formatPounds(p ?? 0)),
    ).toEqual(['8.74', '12.95', '429.73']);
  });

  it('takes 150 payments and £647.14 in interest, paying the minimum every month', () => {
    const { minimum } = compare();
    expect([minimum?.paidOff, minimum?.payments, formatPounds(minimum?.interest ?? 0)]).toEqual([
      true,
      150,
      '647.14',
    ]);
  });

  it('takes 21 payments and £102.32, paying £25 a month', () => {
    const { fixed } = compare();
    expect([fixed.payments, formatPounds(fixed.interest ?? 0), fixed.lastPaymentOn]).toEqual([
      21,
      '102.32',
      '2028-07-15',
    ]);
  });

  it('takes 1 payment and £8.74, paying the full balance', () => {
    expect(compare().full).toEqual({
      paidOff: true,
      payments: 1,
      interest: pounds('8.74'),
      lastPaymentOn: '2026-11-15',
    });
  });

  it("gives the same figures through the card's own rows when £25 goes out on the 15th", () => {
    const pay25 = series({
      id: 'card-payment',
      debtId: 'card',
      type: 'debt',
      amount: pounds('25.00'),
      start: '2026-11-15',
      schedule: monthlyOn15th,
    });
    const plan = cardPlan({}, [pay25], '2028-12-31');
    expect(plan.paidOffOn).toBe('2028-07-15');
    expect(formatPounds(sumPence(statements(plan).map((row) => row.interest)))).toBe('102.32');
    const upToPaidOff = payments(plan).filter((row) => row.date <= '2028-07-15');
    expect(upToPaidOff).toHaveLength(21);
    // The last £25.00 is more than what's left, by what the first 20 and the interest leave over.
    const last = upToPaidOff.at(-1);
    expect(last?.paidOff).toBe(true);
    expect((last?.moreThanLeft ?? 0) + (last?.balanceAfter ?? 0)).toBe(0);
    // No interest once it's paid off.
    expect(statements(plan).at(-1)?.date).toBe('2028-07-10');
  });
});

describe('test 29 and D101: interest and the minimum on the statement day', () => {
  it('works out interest as balance × yearly rate ÷ 12, rounded once (D9)', () => {
    // £420.99 × 24.9% ÷ 12 = £8.7355..., so £8.74; then £429.73 × 24.9% ÷ 12 = £8.9169..., so £8.92.
    expect(
      statements(cardPlan())
        .slice(0, 2)
        .map((row) => row.interest),
    ).toEqual([874, 892]);
  });

  it('uses 1% of the balance before that month’s interest, plus the interest', () => {
    // £429.73 before: 1% is £4.2973, so £4.30; plus £8.92 is £13.22.
    expect(statements(cardPlan())[1]?.minimum).toBe(pounds('13.22'));
  });

  it('is at least the floor amount', () => {
    // £100.00: interest £2.08 (£2.075 rounded up), 1% £1.00, so £3.08, at least £5.00.
    const row = statements(cardPlan({ balance: pounds('100.00') }))[0];
    expect([row?.interest, row?.minimum]).toEqual([208, pounds('5.00')]);
  });

  it('is never more than the balance', () => {
    // £3.00: interest £0.06, so the minimum is the whole £3.06, not £5.00.
    const row = statements(cardPlan({ balance: pounds('3.00') }))[0];
    expect([row?.interest, row?.minimum, row?.balanceAfter]).toEqual([6, 306, 306]);
  });

  it('takes that day’s payments off before the interest on a statement day', () => {
    const onThe10th = series({
      id: 'card-payment',
      debtId: 'card',
      type: 'debt',
      amount: pounds('20.99'),
      start: '2026-11-10',
      schedule: { kind: 'once' },
    });
    const plan = cardPlan({}, [onThe10th]);
    expect(plan.rows.slice(0, 2).map((row) => row.kind)).toEqual(['payment', 'statement']);
    // Interest on £400.00: £8.30.
    expect(statements(plan)[0]?.interest).toBe(830);
  });

  it('uses the month’s last day when the statement day is past it', () => {
    const dates = statements(cardPlan({ statementDay: 31 }, [], '2027-03-31')).map(
      (row) => row.date,
    );
    expect(dates).toEqual([
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });

  it('adds nothing on a statement day that is the balance date itself', () => {
    expect(statements(cardPlan({ statementDay: 25 }))[0]?.date).toBe('2026-11-25');
  });

  it('stops adding interest once the card is paid off', () => {
    const inFull = series({
      id: 'card-payment',
      debtId: 'card',
      type: 'debt',
      amount: pounds('429.73'),
      start: '2026-11-15',
      schedule: { kind: 'once' },
    });
    const plan = cardPlan({}, [inFull]);
    expect(plan.paidOffOn).toBe('2026-11-15');
    expect(statements(plan).map((row) => row.date)).toEqual(['2026-11-10']);
  });

  it('labels the paid-off date as an estimate when interest is added, even when the payments are not estimates', () => {
    expect(cardPlan().isEstimate).toBe(true);
    expect(cardPlan({ interestRate: '0' }).isEstimate).toBe(false);
  });

  it('still works out the minimum from the rule on a card without interest', () => {
    const { interestRate: _, ...noInterest } = card;
    const plan = workOutDebts({
      debts: [noInterest],
      series: [],
      holidays: noBankHolidays,
      today: '2026-10-25',
      to: '2026-12-31',
    }).debts[0] as DebtPlan;
    expect(statements(plan).map((row) => [row.interest, row.minimum])).toEqual([
      [0, pounds('5.00')],
      [0, pounds('5.00')],
    ]);
    expect(plan.isEstimate).toBe(false);
  });

  it('gives no minimum on the statement rows when the minimum is typed', () => {
    const typed = cardPlan({ minimumRule: { kind: 'typed', amount: pounds('12.95') } });
    expect(statements(typed)[0]).toMatchObject({ interest: 874, minimum: null });
  });

  it('leaves out the statement rows for a card with no interest and no rule', () => {
    const { interestRate: _, minimumRule: __, ...plain } = card;
    const plan = workOutDebts({
      debts: [plain],
      series: [],
      holidays: noBankHolidays,
      today: '2026-10-25',
      to: '2026-12-31',
    }).debts[0] as DebtPlan;
    expect(plan.rows).toEqual([]);
    expect(plan.leftAtEnd).toBe(card.balance);
  });

  it('has no interest in left now on the balance date itself (D104)', () => {
    expect(cardPlan()).toMatchObject({
      leftNow: card.balance,
      interestSinceUpdate: 0,
      leftNowIsEstimate: false,
    });
  });
});

describe("D104: a credit card's left now includes the interest since the last update", () => {
  const pay25 = series({
    id: 'card-payment',
    debtId: 'card',
    type: 'debt',
    amount: pounds('25.00'),
    start: '2026-11-15',
    schedule: monthlyOn15th,
  });
  const ticked15Nov: Tick = {
    seriesId: 'card-payment',
    originalDate: '2026-11-15',
    tickedAt: '2026-11-15T18:00:00Z',
    paidOn: '2026-11-15',
  };
  const on = (today: string, fields: Partial<DebtsInput> = {}): DebtsInput => ({
    debts: [card],
    series: [pay25],
    ticks: [ticked15Nov],
    holidays: noBankHolidays,
    today,
    to: '2027-12-31',
    ...fields,
  });
  const cardOn = (today: string, fields: Partial<DebtsInput> = {}) =>
    workOutDebts(on(today, fields)).debts[0] as DebtPlan;

  it("shows £404.73 on Fri 20 Nov for owner test 5's card, with the £25.00 on 15 Nov ticked, as an estimate", () => {
    const plan = cardOn('2026-11-20');
    expect(formatPounds(plan.leftNow)).toBe('404.73');
    expect([formatPounds(plan.interestSinceUpdate), plan.leftNowIsEstimate]).toEqual([
      '8.74',
      true,
    ]);
    expect(plan.leftNowInPounds).toBe(pounds('404.73'));
  });

  it('adds nothing before the first statement day after the update', () => {
    expect(cardOn('2026-11-09', { ticks: [] })).toMatchObject({
      leftNow: card.balance,
      interestSinceUpdate: 0,
      leftNowIsEstimate: false,
    });
  });

  it('adds the interest on the statement day itself, before its own payment is due', () => {
    expect(formatPounds(cardOn('2026-11-10', { ticks: [] }).leftNow)).toBe('429.73');
  });

  it("works the interest out on what's left after ticked payments only: one not ticked yet hasn't reached the card", () => {
    // Nothing ticked by Sun 20 Dec: £420.99 + £8.74 on 10 Nov, then 24.9% ÷ 12 of £429.73 is £8.92 on 10 Dec.
    const plan = cardOn('2026-12-20', { ticks: [] });
    expect([formatPounds(plan.leftNow), formatPounds(plan.interestSinceUpdate)]).toEqual([
      '438.65',
      '17.66',
    ]);
    // With 15 Nov ticked, 10 Dec's interest is on £404.73: £8.40.
    expect(formatPounds(cardOn('2026-12-20').leftNow)).toBe('413.13');
  });

  it('counts the interest in progress and in Owed now, which becomes an estimate too', () => {
    const all = workOutDebts(on('2026-11-20'));
    expect([all.owedNow, all.owedNowIsEstimate]).toEqual([pounds('404.73'), true]);
    expect((all.debts[0] as DebtPlan).paidSoFar).toBe(pounds('16.26'));
  });

  it('starts again from an Update from statement: the interest before it is inside the new balance', () => {
    const updated: Debt = {
      ...card,
      balance: pounds('404.73'),
      balanceOn: '2026-11-20',
      balanceAt: '2026-11-20T19:00:00Z',
    };
    expect(cardOn('2026-11-20', { debts: [updated] })).toMatchObject({
      leftNow: pounds('404.73'),
      interestSinceUpdate: 0,
      leftNowIsEstimate: false,
    });
  });

  it('adds no interest once it is paid off', () => {
    const inFull = series({
      id: 'card-payment',
      debtId: 'card',
      type: 'debt',
      amount: pounds('429.73'),
      start: '2026-11-15',
      schedule: { kind: 'once' },
    });
    const plan = cardOn('2027-03-01', { series: [inFull] });
    expect([plan.leftNow, plan.paidOffNow, plan.interestSinceUpdate]).toEqual([0, true, 874]);
  });

  it('never adds interest to a card with a 0% rate, or with no rate, and says when no rate is set', () => {
    const zero = cardOn('2026-11-20', { debts: [{ ...card, interestRate: '0' }] });
    expect([formatPounds(zero.leftNow), zero.leftNowIsEstimate, zero.interestNotIncluded]).toEqual([
      '395.99',
      false,
      false,
    ]);
    const { interestRate: _, ...noRate } = card;
    const none = cardOn('2026-11-20', { debts: [noRate] });
    expect([formatPounds(none.leftNow), none.leftNowIsEstimate, none.interestNotIncluded]).toEqual([
      '395.99',
      false,
      true,
    ]);
    expect(cardOn('2026-11-20').interestNotIncluded).toBe(false);
  });

  it("says Interest not included only for a credit card: other debts' payments already include it (D98)", () => {
    const loan: Debt = {
      id: 'card',
      name: 'Loan',
      kind: 'loan',
      currency: 'GBP',
      balance: 10000,
      balanceOn: '2026-10-25',
      balanceAt: '2026-10-25T08:30:00Z',
      startingBalance: 10000,
    };
    expect(cardOn('2026-11-20', { debts: [loan] }).interestNotIncluded).toBe(false);
  });
});

describe('D106: 0% until a date, then the normal rate', () => {
  const pay25 = series({
    id: 'card-payment',
    debtId: 'card',
    type: 'debt',
    amount: pounds('25.00'),
    start: '2026-11-15',
    schedule: monthlyOn15th,
  });
  const zeroUntil30Nov = { zeroInterestUntil: '2026-11-30' };

  it("adds nothing on Tue 10 Nov and £8.22 on Thu 10 Dec: £395.99, then £404.21 and £379.21 (the owner's test)", () => {
    const plan = cardPlan(zeroUntil30Nov, [pay25], '2026-12-31');
    expect(
      plan.rows.map((row) => [
        row.date,
        row.kind,
        formatPounds(row.kind === 'statement' ? row.interest : row.amount),
        formatPounds(row.leftAfter),
      ]),
    ).toEqual([
      ['2026-11-10', 'statement', '0.00', '420.99'],
      ['2026-11-15', 'payment', '25.00', '395.99'],
      ['2026-12-10', 'statement', '8.22', '404.21'],
      ['2026-12-15', 'payment', '25.00', '379.21'],
    ]);
  });

  it('adds nothing on a statement day that is the 0% date itself', () => {
    const plan = cardPlan({ zeroInterestUntil: '2026-12-10' }, [pay25], '2027-01-31');
    expect(statements(plan).map((row) => [row.date, row.interest])).toEqual([
      ['2026-11-10', 0],
      ['2026-12-10', 0],
      // £370.99 at 24.9% ÷ 12 is £7.698..., so £7.70.
      ['2027-01-10', 770],
    ]);
  });

  it('still works out the minimum from the rule while the rate is 0%: 1% of the balance, at least £5', () => {
    expect(statements(cardPlan(zeroUntil30Nov))[0]?.minimum).toBe(pounds('5.00'));
  });

  it('is in left now too: nothing until the 0% ends', () => {
    const left = (today: string) =>
      (
        workOutDebts({
          debts: [{ ...card, ...zeroUntil30Nov }],
          series: [pay25],
          holidays: noBankHolidays,
          today,
          to: '2027-12-31',
        }).debts[0] as DebtPlan
      ).interestSinceUpdate;
    // Nothing is ticked, so 10 Dec's interest is on £420.99: £8.74.
    expect([left('2026-11-20'), left('2026-12-10')]).toEqual([0, 874]);
  });

  it('is in the comparison: the first statement after the 0% ends adds the interest', () => {
    const full = compare({ card: { ...card, ...zeroUntil30Nov } }).full;
    expect(full).toEqual({
      paidOff: true,
      payments: 1,
      interest: 0,
      lastPaymentOn: '2026-11-15',
    });
    // £25 a month: no interest on 10 Nov, so it costs less than the £102.32 without the 0%.
    const fixed = compare({ card: { ...card, ...zeroUntil30Nov } }).fixed;
    expect(fixed.payments).toBeLessThanOrEqual(21);
    expect(fixed.interest).toBeLessThan(pounds('102.32') - pounds('8.00'));
  });

  it('is only for credit cards, and must be a real date', () => {
    const loan: Debt = {
      id: 'loan',
      name: 'Loan',
      kind: 'loan',
      currency: 'GBP',
      balance: 1000,
      balanceOn: '2026-10-25',
      balanceAt: '2026-10-25T08:30:00Z',
      startingBalance: 1000,
      zeroInterestUntil: '2026-11-30',
    };
    const input = (debt: Debt): DebtsInput => ({
      debts: [debt],
      series: [],
      holidays: noBankHolidays,
      today: '2026-10-25',
      to: '2026-12-31',
    });
    refusedWith('credit-card-only', () => workOutDebts(input(loan)));
    refusedWith('bad-date', () =>
      workOutDebts(input({ ...card, zeroInterestUntil: '2026-11-31' })),
    );
  });
});

describe('D102: comparing the minimum, a fixed amount and the full balance', () => {
  it('says when a way of paying never clears it, rather than counting for ever', () => {
    // £5 a month never gets ahead of £8.74 interest.
    expect(compare({ fixed: pounds('5.00') }).fixed).toEqual({
      paidOff: false,
      payments: null,
      interest: null,
      lastPaymentOn: null,
    });
  });

  it('needs no payments when nothing is left', () => {
    expect(compare({ left: 1 }).full).toEqual({
      paidOff: true,
      payments: 0,
      interest: 0,
      lastPaymentOn: null,
    });
  });

  it('pays before the next statement when it starts between a statement and its payment', () => {
    // On Thu 12 Nov, after the 10 Nov statement: paying in full on Sun 15 Nov adds no more interest.
    const after10th = compare({ from: '2026-11-12', left: pounds('429.73') });
    expect(after10th.full).toEqual({
      paidOff: true,
      payments: 1,
      interest: 0,
      lastPaymentOn: '2026-11-15',
    });
    // Before a statement in the comparison, the minimum is the rule with no interest: £5.00 here.
    const oneMonth = compare({ from: '2026-11-12', left: pounds('5.00') });
    expect(oneMonth.minimum?.payments).toBe(1);
  });

  it('gives no minimum to compare when the minimum is typed', () => {
    expect(
      compare({ card: { ...card, minimumRule: { kind: 'typed', amount: 1295 } } }).minimum,
    ).toBeNull();
  });

  it('refuses anything but a credit card with a statement day', () => {
    refusedWith('credit-card-only', () =>
      compare({
        card: {
          id: 'loan',
          name: 'Loan',
          kind: 'loan',
          currency: 'GBP',
          balance: 1000,
          balanceOn: '2026-10-25',
          balanceAt: '2026-10-25T08:30:00Z',
          startingBalance: 1000,
        },
      }),
    );
    const { statementDay: _, interestRate: __, minimumRule: ___, ...noStatementDay } = card;
    refusedWith('needs-statement-day', () => compare({ card: noStatementDay }));
    refusedWith('bad-day', () => compare({ paysOn: 0 }));
    refusedWith('negative-pence', () => compare({ fixed: -1 }));
  });
});
