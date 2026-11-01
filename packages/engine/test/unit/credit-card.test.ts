// Credit cards with an interest rate (step 1d, brief 4.6 and 5.6): owner
// test 5, ARCHITECTURE.md test 29, the minimum rule (D101) and the
// comparison of the minimum, a fixed amount and the full balance (D102).

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

  it('keeps left now as the balance minus ticked payments: interest is only in the rows ahead (brief 5.6)', () => {
    expect(cardPlan().leftNow).toBe(card.balance);
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
