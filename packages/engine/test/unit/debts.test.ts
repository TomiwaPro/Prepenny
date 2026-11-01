// Debts (step 1d, brief 4.6 and 5.6, ARCHITECTURE.md 2.6): owner tests 1 to
// 4 on Sam's plan, ARCHITECTURE.md tests 28 and 30, D27, D34, D42, D43, D62,
// D63, the rules in D98 to D100, and the payment on the statement date (D105).

import { describe, expect, it } from 'vitest';
import {
  DEBTS_MONTHS_AHEAD,
  type Debt,
  type DebtPaymentRow,
  type DebtPlan,
  type DebtsInput,
  debtsLookAhead,
  EngineInputError,
  formatPounds,
  type PaymentChange,
  type Series,
  type Tick,
  workOutDebts,
  workOutPlan,
} from '../../src/index.ts';
import { edited } from '../fixtures/edit.ts';
import { noBankHolidays } from '../fixtures/holidays.ts';
import { pounds } from '../fixtures/plan.ts';
import { samChanges, samDebts, samDebtsInput, samPlan, samSeries } from '../fixtures/sam.ts';
import { series } from '../fixtures/series.ts';

function debtOf(input: DebtsInput, id: string): DebtPlan {
  const found = workOutDebts(input).debts.find((one) => one.debt.id === id);
  if (found === undefined) throw new Error(`No debt ${id}.`);
  return found;
}

const withoutDebt = ({ debtId: _, ...one }: Series): Series => one;

const paymentRows = (plan: DebtPlan) =>
  plan.rows.filter((row): row is DebtPaymentRow => row.kind === 'payment');

/** A tick on one of Sam's payments, paid on its own date unless it says otherwise. */
function samTick(
  seriesId: string,
  originalDate: string,
  tickedAt: string,
  paidOn = originalDate,
): Tick {
  return { seriesId, originalDate, tickedAt, paidOn };
}

/** Sam's debts with one debt's statement swapped for another (an Update from statement). */
function withStatement(id: string, fields: Partial<Debt>): readonly Debt[] {
  return samDebts.map((one) => (one.id === id ? { ...one, ...fields } : one));
}

function refusedWith(code: string, input: DebtsInput): void {
  let error: unknown = null;
  try {
    workOutDebts(input);
  } catch (caught) {
    error = caught;
  }
  expect(error, `expected a refusal: ${code}`).toBeInstanceOf(EngineInputError);
  expect((error as EngineInputError).code).toBe(code);
  // Never amounts or names (CLAUDE.md: privacy).
  expect((error as Error).message).not.toMatch(/Secret|987\.65|98765|Family loan|Sofa/);
}

const atEndOfFebruary = workOutDebts(samDebtsInput());
const lookingAhead = workOutDebts(samDebtsInput({ to: debtsLookAhead('2026-10-25') }));
const byId = (plan: typeof atEndOfFebruary) => new Map(plan.debts.map((one) => [one.debt.id, one]));

describe("owner test 1: Sam's debts (brief 8.3, D15)", () => {
  const debts = byId(atEndOfFebruary);

  it('pays off the Pay-later card on Thu 29 Oct 2026, Pay in 3 on Sun 6 Dec 2026, the Family loan on Fri 1 Jan 2027 and the Laptop loan on Sat 20 Feb 2027', () => {
    expect(
      ['pay-later-card', 'pay-in-3', 'family-loan', 'laptop-loan'].map(
        (id) => debts.get(id)?.paidOffOn,
      ),
    ).toEqual(['2026-10-29', '2026-12-06', '2027-01-01', '2027-02-20']);
  });

  it('still has £225.25 left on Sofa finance and £320.99 on the Credit card at the end of February 2027', () => {
    const left = (id: string) => {
      const debt = debts.get(id);
      return [debt?.paidOffOn, formatPounds(debt?.leftAtEnd ?? Number.NaN)];
    };
    expect(left('sofa-finance')).toEqual([null, '225.25']);
    expect(left('credit-card')).toEqual([null, '320.99']);
  });

  it('pays off Sofa finance on Mon 23 Aug 2027, looking further ahead', () => {
    expect(byId(lookingAhead).get('sofa-finance')).toMatchObject({
      paidOffOn: '2027-08-23',
      leftAtEnd: null,
    });
  });

  it('gives a paid-off debt no "left at the end"', () => {
    expect(debts.get('pay-later-card')?.leftAtEnd).toBeNull();
  });
});

describe('owner test 2 (D70, D63): the Credit card, looking 24 months ahead (D43)', () => {
  const card = byId(lookingAhead).get('credit-card') as DebtPlan;

  it('looks to Wed 25 Oct 2028, 24 months after Sun 25 Oct 2026', () => {
    expect(DEBTS_MONTHS_AHEAD).toBe(24);
    expect(lookingAhead.to).toBe('2028-10-25');
    expect(debtsLookAhead('2027-01-31')).toBe('2029-01-31');
    expect(debtsLookAhead('2028-02-29')).toBe('2030-02-28');
  });

  it('is paid off on Wed 15 Mar 2028, and that payment is £4.01 more than what is left', () => {
    expect(card.paidOffOn).toBe('2028-03-15');
    const rows = paymentRows(card);
    const last = rows.find((row) => row.date === '2028-03-15');
    expect(last).toMatchObject({ paidOff: true, leftAfter: 0, moreThanLeft: pounds('4.01') });
    expect(formatPounds(last?.balanceAfter ?? 0)).toBe('-4.01');
    // The payment before it leaves £20.99.
    expect(formatPounds(rows[rows.indexOf(last as DebtPaymentRow) - 1]?.leftAfter ?? 0)).toBe(
      '20.99',
    );
  });

  it('changes nothing on its own: the payment is still £25.00, and later ones are still planned (D63)', () => {
    const rows = paymentRows(card);
    expect(formatPounds(rows.find((row) => row.date === '2028-03-15')?.payment.amount ?? 0)).toBe(
      '25.00',
    );
    // Each later payment is all more than what's left, which is nothing.
    expect(
      rows.filter((row) => row.date > '2028-03-15').map((row) => [row.date, row.moreThanLeft]),
    ).toEqual(
      [
        '2028-04-15',
        '2028-05-15',
        '2028-06-15',
        '2028-07-15',
        '2028-08-15',
        '2028-09-15',
        '2028-10-15',
      ].map((date) => [date, pounds('25.00')]),
    );
    // The plan itself is untouched: the bank still sees every £25.00.
    const plan = workOutPlan(samPlan({ to: '2028-10-31' }));
    const cardRows = plan.accounts[0]?.rows.filter((row) => row.payment.seriesId === 'credit-card');
    expect(cardRows?.every((row) => row.change === -pounds('25.00'))).toBe(true);
  });

  it('is an estimate, because its payments are estimates; the Family loan is not', () => {
    expect(card.isEstimate).toBe(true);
    expect(byId(lookingAhead).get('family-loan')?.isEstimate).toBe(false);
  });
});

describe('owner test 3: the Debts sketch (ARCHITECTURE.md 4.6)', () => {
  const debts = byId(atEndOfFebruary);
  const loan = debts.get('family-loan') as DebtPlan;

  it('owes £3,214.86 now, counting the Family loan’s €1,400.57 as £1,206.14 at €1.1612 per £1', () => {
    expect(formatPounds(atEndOfFebruary.owedNow)).toBe('3214.86');
    expect([formatPounds(loan.leftNow), formatPounds(loan.leftNowInPounds)]).toEqual([
      '1400.57',
      '1206.14',
    ]);
  });

  it('has the Family loan 42% paid: €996.36 of €2,396.93', () => {
    expect(loan.percentPaid).toBe(42);
    expect(formatPounds(loan.paidSoFar)).toBe('996.36');
    expect(formatPounds(loan.debt.startingBalance)).toBe('2396.93');
  });

  it('starts the other debts at 0% paid', () => {
    for (const id of ['pay-later-card', 'pay-in-3', 'laptop-loan', 'sofa-finance', 'credit-card']) {
      expect(debts.get(id)?.percentPaid, id).toBe(0);
    }
  });

  it("takes the Family loan's payments off as €145.15, €145.15, €290.30, €290.30, €290.30 and €239.38", () => {
    expect(
      paymentRows(loan).map((row) => [
        row.date,
        formatPounds(row.payment.amount),
        formatPounds(row.amount),
        row.paidOff ? 'Paid off' : formatPounds(row.leftAfter),
      ]),
    ).toEqual([
      ['2026-10-26', '125.00', '145.15', '1255.42'],
      ['2026-11-06', '125.00', '145.15', '1110.27'],
      ['2026-11-20', '250.00', '290.30', '819.97'],
      ['2026-12-04', '250.00', '290.30', '529.67'],
      ['2026-12-18', '250.00', '290.30', '239.37'],
      ['2027-01-01', '206.15', '239.38', 'Paid off'],
    ]);
  });

  it('D34: the last payment leaves −€0.01, which shows as Paid off and 0, with nothing "more than what\'s left"', () => {
    const last = paymentRows(loan).at(-1);
    expect(last).toMatchObject({
      balanceAfter: -1,
      leftAfter: 0,
      paidOff: true,
      moreThanLeft: null,
    });
  });
});

describe('owner test 4 (D27, D62): ticks and statement updates on the Family loan', () => {
  const tickedAt9 = samTick('family-loan-first', '2026-10-26', '2026-10-26T09:00:00Z');
  const onMonday = { today: '2026-10-26' };

  it('a. ticking the Mon 26 Oct payment at 9am leaves €1,255.42', () => {
    const loan = debtOf(samDebtsInput({ ...onMonday, ticks: [tickedAt9] }), 'family-loan');
    expect(formatPounds(loan.leftNow)).toBe('1255.42');
    expect(loan.paidOffOn).toBe('2027-01-01');
  });

  it('b. then a statement at 6pm showing €1,255.42 leaves €1,255.42, not €1,110.27', () => {
    const loan = debtOf(
      samDebtsInput({
        ...onMonday,
        ticks: [tickedAt9],
        debts: withStatement('family-loan', {
          balance: pounds('1255.42'),
          balanceOn: '2026-10-26',
          balanceAt: '2026-10-26T18:00:00Z',
        }),
      }),
      'family-loan',
    );
    expect(formatPounds(loan.leftNow)).toBe('1255.42');
    // The ticked payment is inside the statement, so it isn't taken off again.
    expect(paymentRows(loan).map((row) => row.date)).toEqual([
      '2026-11-06',
      '2026-11-20',
      '2026-12-04',
      '2026-12-18',
      '2027-01-01',
    ]);
    expect(loan.paidOffOn).toBe('2027-01-01');
  });

  it('c. the other way round, a statement at 9am showing €1,400.57 then the tick at 6pm, leaves €1,255.42', () => {
    const loan = debtOf(
      samDebtsInput({
        ...onMonday,
        ticks: [samTick('family-loan-first', '2026-10-26', '2026-10-26T18:00:00Z')],
        debts: withStatement('family-loan', {
          balanceOn: '2026-10-26',
          balanceAt: '2026-10-26T09:00:00Z',
        }),
      }),
      'family-loan',
    );
    expect(formatPounds(loan.leftNow)).toBe('1255.42');
    expect(paymentRows(loan)[0]).toMatchObject({
      date: '2026-10-26',
      ticked: true,
      atStart: false,
    });
    expect(loan.paidOffOn).toBe('2027-01-01');
  });

  it('counts a tick made inside the statement update steps as before it, even when its time is later (D62)', () => {
    const loan = debtOf(
      samDebtsInput({
        ...onMonday,
        ticks: [
          {
            ...samTick('family-loan-first', '2026-10-26', '2026-10-26T18:00:30Z'),
            inDebtUpdate: 'family-loan',
          },
        ],
        debts: withStatement('family-loan', {
          balance: pounds('1255.42'),
          balanceOn: '2026-10-26',
          balanceAt: '2026-10-26T18:00:00Z',
        }),
      }),
      'family-loan',
    );
    expect(formatPounds(loan.leftNow)).toBe('1255.42');
  });

  it("counts a tick made inside another debt's update steps only by its time", () => {
    const loan = debtOf(
      samDebtsInput({
        ...onMonday,
        ticks: [
          {
            ...samTick('family-loan-first', '2026-10-26', '2026-10-26T18:00:30Z'),
            inDebtUpdate: 'credit-card',
          },
        ],
        debts: withStatement('family-loan', {
          balanceOn: '2026-10-26',
          balanceAt: '2026-10-26T18:00:00Z',
        }),
      }),
      'family-loan',
    );
    expect(formatPounds(loan.leftNow)).toBe('1255.42');
  });
});

describe('D27: a payment ticked early comes off once, even after Update from statement', () => {
  // On Fri 30 Oct, Sam pays the Fri 6 Nov Family loan payment early.
  const ticks = [
    samTick('family-loan-first', '2026-10-26', '2026-10-26T09:00:00Z'),
    samTick('family-loan-first', '2026-11-06', '2026-10-30T10:00:00Z', '2026-10-30'),
  ];
  const onFriday = { today: '2026-10-30', ticks };

  it('comes off on the day it was ticked, not its own date', () => {
    const loan = debtOf(samDebtsInput(onFriday), 'family-loan');
    expect(formatPounds(loan.leftNow)).toBe('1110.27');
    expect(
      paymentRows(loan)
        .slice(0, 3)
        .map((row) => [row.date, row.payment.originalDate]),
    ).toEqual([
      ['2026-10-26', '2026-10-26'],
      ['2026-10-30', '2026-11-06'],
      ['2026-11-20', '2026-11-20'],
    ]);
    expect(paymentRows(loan)).toHaveLength(6);
  });

  it('comes off once after a statement at noon showing €1,110.27', () => {
    const loan = debtOf(
      samDebtsInput({
        ...onFriday,
        debts: withStatement('family-loan', {
          balance: pounds('1110.27'),
          balanceOn: '2026-10-30',
          balanceAt: '2026-10-30T12:00:00Z',
        }),
      }),
      'family-loan',
    );
    expect(formatPounds(loan.leftNow)).toBe('1110.27');
    expect(paymentRows(loan).map((row) => row.date)).toEqual([
      '2026-11-20',
      '2026-12-04',
      '2026-12-18',
      '2027-01-01',
    ]);
    expect(loan.paidOffOn).toBe('2027-01-01');
  });
});

describe('D34: once every Family loan payment is ticked', () => {
  const ticks = [
    ['family-loan-first', '2026-10-26'],
    ['family-loan-first', '2026-11-06'],
    ['family-loan', '2026-11-20'],
    ['family-loan', '2026-12-04'],
    ['family-loan', '2026-12-18'],
    ['family-loan', '2027-01-01'],
  ].map(([id, date]) => samTick(id as string, date as string, `${date}T19:00:00Z`));
  const loan = debtOf(
    samDebtsInput({ today: '2027-01-02', to: '2027-02-28', ticks }),
    'family-loan',
  );

  it('shows Paid off and £0.00, never −€0.01', () => {
    expect([loan.leftNow, loan.leftNowInPounds, loan.paidOffNow]).toEqual([0, 0, true]);
    expect(loan.percentPaid).toBe(100);
    expect(formatPounds(loan.paidSoFar)).toBe('2396.93');
    expect(loan.paidOffOn).toBe('2027-01-01');
  });

  it('takes it out of Owed now', () => {
    const all = workOutDebts(samDebtsInput({ today: '2027-01-02', to: '2027-02-28', ticks }));
    expect(all.debts.find((one) => one.debt.id === 'family-loan')?.leftNowInPounds).toBe(0);
  });
});

describe('test 28 and D98 to D100: left now and paid off on', () => {
  const card: Debt = {
    id: 'card',
    name: 'Secret Shop card',
    kind: 'loan',
    currency: 'GBP',
    balance: 10000,
    balanceOn: '2026-11-01',
    balanceAt: '2026-11-01T09:00:00Z',
    startingBalance: 10000,
  };
  const weekly = series({
    id: 'weekly',
    debtId: 'card',
    type: 'debt',
    amount: 2500,
    start: '2026-11-02',
    schedule: { kind: 'weekly', every: 1 },
  });
  const input = (fields: Partial<DebtsInput> = {}): DebtsInput => ({
    debts: [card],
    series: [weekly],
    holidays: noBankHolidays,
    today: '2026-11-01',
    to: '2026-12-31',
    ...fields,
  });
  const plan = (fields: Partial<DebtsInput> = {}) => debtOf(input(fields), 'card');

  it('takes off the planned payments after the balance date, in order', () => {
    expect(
      paymentRows(plan())
        .slice(0, 4)
        .map((row) => [row.date, row.leftAfter]),
    ).toEqual([
      ['2026-11-02', 7500],
      ['2026-11-09', 5000],
      ['2026-11-16', 2500],
      ['2026-11-23', 0],
    ]);
    expect(plan().paidOffOn).toBe('2026-11-23');
  });

  it('counts 1p or less as paid off, but not 2p (D34)', () => {
    expect(plan({ debts: [{ ...card, balance: 10001 }] }).paidOffOn).toBe('2026-11-23');
    const twoPence = plan({ debts: [{ ...card, balance: 10002 }] });
    expect(paymentRows(twoPence)[3]).toMatchObject({ paidOff: false, leftAfter: 2 });
    expect(twoPence.paidOffOn).toBe('2026-11-30');
    // The fifth payment is £24.98 more than the 2p left.
    expect(paymentRows(twoPence)[4]?.moreThanLeft).toBe(2498);
  });

  it('is paid off on the balance date when nothing is owed', () => {
    expect(plan({ debts: [{ ...card, balance: 0 }] })).toMatchObject({
      paidOffOn: '2026-11-01',
      paidOffNow: true,
      leftNow: 0,
    });
  });

  it('takes off a payment due on the balance date unless it was ticked at or before the update (D105)', () => {
    // The statement was typed in at 9am on Sun 1 Nov, before that day's payment went.
    const fromTheFirst = series({ ...weekly, start: '2026-11-01' });
    const notTicked = plan({ series: [fromTheFirst] });
    expect(paymentRows(notTicked)[0]).toMatchObject({
      date: '2026-11-01',
      ticked: false,
      leftAfter: 7500,
    });
    // Ticked after the update: it comes off once, on its date.
    const tickedAfter = plan({
      series: [fromTheFirst],
      ticks: [samTick('weekly', '2026-11-01', '2026-11-01T10:00:00Z')],
    });
    expect([tickedAfter.leftNow, paymentRows(tickedAfter)[0]?.date]).toEqual([7500, '2026-11-01']);
    expect(paymentRows(tickedAfter)[1]?.date).toBe('2026-11-08');
    // Ticked at 8am, before the update: it's already inside the balance, so it never comes off.
    const tickedBefore = plan({
      series: [fromTheFirst],
      ticks: [samTick('weekly', '2026-11-01', '2026-11-01T08:00:00Z')],
    });
    expect([tickedBefore.leftNow, paymentRows(tickedBefore)[0]?.date]).toEqual([
      10000,
      '2026-11-08',
    ]);
  });

  it('ignores a tick made before the balance was typed in: it is already inside it (D62)', () => {
    const early = plan({
      ticks: [samTick('weekly', '2026-11-02', '2026-11-01T08:00:00Z', '2026-11-01')],
    });
    expect(early.leftNow).toBe(10000);
    expect(paymentRows(early).map((row) => row.date)[0]).toBe('2026-11-09');
  });

  it('takes off a tick made after the update but paid before the balance date first (as D39)', () => {
    const fromOctober = series({ ...weekly, start: '2026-10-26' });
    const late = plan({
      series: [fromOctober],
      ticks: [samTick('weekly', '2026-10-26', '2026-11-01T10:00:00Z')],
    });
    expect(late.leftNow).toBe(7500);
    expect(paymentRows(late)[0]).toMatchObject({
      date: '2026-10-26',
      atStart: true,
      leftAfter: 7500,
    });
  });

  it('counts in left now a tick paid early for a payment after the view, but takes it off on its paid date', () => {
    const ticked = plan({
      to: '2026-11-10',
      ticks: [samTick('weekly', '2027-01-04', '2026-11-01T10:00:00Z', '2026-11-01')],
    });
    expect(ticked.leftNow).toBe(7500);
    expect(paymentRows(ticked).map((row) => row.date)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-09',
    ]);
  });

  it('takes nothing off for a removed payment, unless it was ticked (D4, D83)', () => {
    const removed: PaymentChange = {
      seriesId: 'weekly',
      originalDate: '2026-11-09',
      skipped: true,
    };
    expect(
      paymentRows(plan({ changes: [removed] }))
        .slice(0, 4)
        .map((row) => row.date),
    ).toEqual(['2026-11-02', '2026-11-16', '2026-11-23', '2026-11-30']);
    const tickedAnyway = plan({
      changes: [removed],
      ticks: [samTick('weekly', '2026-11-09', '2026-11-09T10:00:00Z')],
      today: '2026-11-09',
    });
    expect(tickedAnyway.leftNow).toBe(7500);
    expect(tickedAnyway.paidOffOn).toBe('2026-11-23');
  });

  it('takes a moved payment off on its new date, at its new amount', () => {
    const moved: PaymentChange = {
      seriesId: 'weekly',
      originalDate: '2026-11-09',
      newDate: '2026-11-12',
      amount: 5000,
    };
    expect(
      paymentRows(plan({ changes: [moved] }))
        .slice(0, 3)
        .map((row) => [row.date, row.amount]),
    ).toEqual([
      ['2026-11-02', 2500],
      ['2026-11-12', 5000],
      ['2026-11-16', 2500],
    ]);
  });

  it('gives what is still left at the end when it is not paid off in the view', () => {
    expect(plan({ to: '2026-11-10' })).toMatchObject({ paidOffOn: null, leftAtEnd: 5000 });
  });

  it("keeps a split series linked, so a split doesn't change the paid-off date", () => {
    const sam = { ...samPlan(), debts: samDebts };
    const { after } = edited(sam, {
      kind: 'this-and-later',
      seriesId: 'family-loan',
      originalDate: '2026-12-04',
      edits: { note: 'Split' },
      newSeriesId: 'family-loan-2',
    });
    expect(after.series.find((one) => one.id === 'family-loan-2')?.debtId).toBe('family-loan');
    expect(debtOf(samDebtsInput({ series: after.series }), 'family-loan').paidOffOn).toBe(
      '2027-01-01',
    );
  });

  it('caps progress at 99% until it is paid off, rounding to the nearest percent (D99)', () => {
    const percent = (balance: number) =>
      plan({ debts: [{ ...card, balance, startingBalance: 100000 }] }).percentPaid;
    expect([percent(100000), percent(58432), percent(50500), percent(400), percent(1)]).toEqual([
      0, 42, 50, 99, 100,
    ]);
    // A balance above the starting balance has paid nothing so far.
    expect(plan({ debts: [{ ...card, startingBalance: 5000 }] })).toMatchObject({
      paidSoFar: 0,
      percentPaid: 0,
    });
  });

  it('leaves a closed debt out of Owed now', () => {
    const both = workOutDebts(
      input({ debts: [card, { ...card, id: 'old', closed: true, balance: 99999 }] }),
    );
    expect(both.owedNow).toBe(10000);
    expect(both.debts).toHaveLength(2);
  });
});

describe('test 30: another currency', () => {
  it('converts each payment once, at the rate the person set (D9)', () => {
    const loan = debtOf(samDebtsInput(), 'family-loan');
    // £206.15 at €1.1612 per £1 is €239.38138, so €239.38.
    expect(paymentRows(loan).at(-1)?.amount).toBe(23938);
    // Both currencies: €1,400.57, about £1,206.14.
    expect([loan.leftNow, loan.leftNowInPounds, loan.debt.currency]).toEqual([
      140057,
      120614,
      'EUR',
    ]);
  });

  it('counts 1 cent or less as paid off (D42)', () => {
    const loan = debtOf(samDebtsInput(), 'family-loan');
    expect(paymentRows(loan).at(-1)?.balanceAfter).toBe(-1);
    expect(loan.paidOffOn).toBe('2027-01-01');
  });

  it('follows a new rate', () => {
    const loan = debtOf(
      samDebtsInput({ debts: withStatement('family-loan', { rate: '1.2' }) }),
      'family-loan',
    );
    expect([loan.leftNowInPounds, paymentRows(loan)[0]?.amount]).toEqual([116714, 15000]);
  });
});

describe('D98: what a debt and its links must be', () => {
  const base = samDebtsInput();
  const debts = (fields: Partial<Debt>) => withStatement('pay-in-3', fields);

  it('refuses a debt it cannot work with', () => {
    refusedWith('bad-rate', { ...base, debts: debts({ rate: '1.1612' }) });
    refusedWith('bad-rate', { ...base, debts: samDebts.map(({ rate: _, ...one }) => one) });
    refusedWith('bad-rate', { ...base, debts: withStatement('family-loan', { rate: '0' }) });
    refusedWith('bad-debt', { ...base, debts: debts({ currency: 'euros' }) });
    refusedWith('bad-debt', { ...base, debts: debts({ kind: 'mortgage' as Debt['kind'] }) });
    refusedWith('not-pence', { ...base, debts: debts({ balance: 12.5 }) });
    refusedWith('negative-pence', { ...base, debts: debts({ startingBalance: -1 }) });
    refusedWith('balance-after-today', { ...base, debts: debts({ balanceOn: '2026-10-26' }) });
    refusedWith('bad-time', { ...base, debts: debts({ balanceAt: '2026-10-25 08:30' }) });
    refusedWith('repeated-debt', { ...base, debts: [...samDebts, samDebts[0] as Debt] });
  });

  it('gives only a credit card an interest rate, a statement day and a minimum', () => {
    refusedWith('credit-card-only', { ...base, debts: debts({ interestRate: '24.9' }) });
    refusedWith('credit-card-only', { ...base, debts: debts({ statementDay: 10 }) });
    refusedWith('credit-card-only', {
      ...base,
      debts: debts({ minimumRule: { kind: 'typed', amount: 500 } }),
    });
    refusedWith('needs-statement-day', {
      ...base,
      debts: withStatement('credit-card', { interestRate: '24.9' }),
    });
    refusedWith('bad-debt', {
      ...base,
      debts: withStatement('credit-card', { statementDay: 32 }),
    });
  });

  it('links only money going out to a debt that is in the plan', () => {
    const linked = (fields: Partial<Series>) =>
      samSeries.map((one) => (one.id === 'rent' ? { ...one, ...fields } : one));
    refusedWith('unknown-debt', { ...base, series: linked({ debtId: 'no-such-debt' }) });
    refusedWith('bad-debt-link', {
      ...base,
      series: samSeries.map((one) => (one.id === 'pay' ? { ...one, debtId: 'pay-in-3' } : one)),
    });
    refusedWith('bad-debt-link', {
      ...base,
      series: samSeries.map((one) =>
        one.id === 'to-savings' ? { ...one, debtId: 'pay-in-3' } : one,
      ),
    });
  });

  it('never links either half of a private transfer (D16)', () => {
    const jess = series({
      id: 'to-joint',
      debtId: 'pay-in-3',
      start: '2026-10-28',
      schedule: { kind: 'once' },
    });
    const shared = series({
      id: 'from-jess',
      accountId: 'joint',
      direction: 'in',
      start: '2026-10-28',
      schedule: { kind: 'once' },
      mirrorOf: 'to-joint',
    });
    refusedWith('bad-debt-link', { ...base, series: [...samSeries, jess, shared] });
    refusedWith('bad-debt-link', {
      ...base,
      series: [
        ...samSeries,
        withoutDebt(jess),
        { ...shared, direction: 'out', debtId: 'pay-in-3' },
      ],
    });
  });

  it('checks the links in the plan records too, once debts are given', () => {
    const bad = samSeries.map((one) => (one.id === 'rent' ? { ...one, debtId: 'nope' } : one));
    expect(() => workOutPlan(samPlan({ series: bad }))).not.toThrow();
    const sam = { ...samPlan({ series: bad }), debts: samDebts };
    let error: unknown = null;
    try {
      edited(sam, { kind: 'remove-this-one', seriesId: 'rent', originalDate: '2026-12-01' });
    } catch (caught) {
      error = caught;
    }
    expect((error as EngineInputError).code).toBe('unknown-debt');
  });

  it('needs "to" on or after today', () => {
    refusedWith('bad-window', { ...base, to: '2026-10-24' });
  });

  it('works the same whatever order the changes are given in', () => {
    const reversed = workOutDebts(samDebtsInput({ changes: [...samChanges].reverse() }));
    expect(reversed).toEqual(atEndOfFebruary);
  });
});

describe('edge cases found by review', () => {
  const small: Debt = {
    id: 'small',
    name: 'Secret Shop',
    kind: 'loan',
    currency: 'GBP',
    balance: pounds('26.01'),
    balanceOn: '2026-10-25',
    balanceAt: '2026-10-25T08:00:00Z',
    startingBalance: pounds('26.01'),
  };
  const once = (id: string, date: string, amount: string): Series =>
    series({
      id,
      debtId: 'small',
      type: 'debt',
      amount: pounds(amount),
      start: date,
      schedule: { kind: 'once' },
    });
  const input = (fields: Partial<DebtsInput>): DebtsInput => ({
    debts: [small],
    series: [],
    holidays: noBankHolidays,
    today: '2026-10-25',
    to: '2026-12-31',
    ...fields,
  });

  it('counts a payment after a debt is paid off with 1p left as all more than what is left (D100)', () => {
    const plan = debtOf(
      input({
        series: [once('first', '2026-11-01', '26.00'), once('second', '2026-12-01', '25.00')],
      }),
      'small',
    );
    expect(paymentRows(plan).map((row) => [row.leftAfter, row.moreThanLeft])).toEqual([
      [0, null],
      [0, pounds('25.00')],
    ]);
  });

  it('never gives a Paid off on before the balance date: a late tick comes off at the start (as D39)', () => {
    const plan = debtOf(
      input({
        debts: [{ ...small, balance: pounds('100.00') }],
        series: [once('paid', '2026-10-20', '100.00')],
        ticks: [samTick('paid', '2026-10-20', '2026-10-25T10:00:00Z')],
      }),
      'small',
    );
    expect(paymentRows(plan)[0]).toMatchObject({
      date: '2026-10-20',
      atStart: true,
      paidOff: true,
    });
    expect([plan.leftNow, plan.paidOffOn]).toEqual([0, '2026-10-25']);
  });

  it('works up to the last day the engine knows, 31 Dec 2999', () => {
    const card: Debt = {
      ...small,
      kind: 'credit-card',
      balanceOn: '2999-11-01',
      balanceAt: '2999-11-01T08:00:00Z',
      interestRate: '24.9',
      statementDay: 10,
    };
    const plan = workOutDebts(input({ debts: [card], today: '2999-12-01', to: '2999-12-31' }));
    expect(plan.debts[0]?.rows.map((row) => row.date)).toEqual(['2999-11-10', '2999-12-10']);
    expect(debtsLookAhead('2998-06-01')).toBe('2999-12-31');
  });

  it('refuses input that is not records with an engine error, not a crash', () => {
    for (const bad of [
      null,
      { ...input({}), changes: {} as never },
      { ...input({}), debts: null as never },
    ]) {
      expect(() => workOutDebts(bad as DebtsInput)).toThrow(EngineInputError);
    }
  });
});
