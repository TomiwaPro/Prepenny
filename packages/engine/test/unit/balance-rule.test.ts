// The balance rule (brief 5.5, ARCHITECTURE.md 2.4): test 14, and the extra
// 1b tests for D10, D11, D12 and D33, with D1, D39 and D83.

import { describe, expect, it } from 'vitest';
import {
  formatPounds,
  type Payment,
  type PlanInput,
  type Series,
  workOutPayments,
  workOutPlan,
} from '../../src/index.ts';
import {
  account,
  accountOf,
  balanceUpdate,
  daysText,
  planInput,
  pounds,
  rowsText,
  tick,
} from '../fixtures/plan.ts';
import { series } from '../fixtures/series.ts';

/** A one-off payment out of the current account. */
function once(id: string, date: string, amount: string, fields: Partial<Series> = {}): Series {
  return series({
    id,
    name: id,
    amount: pounds(amount),
    start: date,
    schedule: { kind: 'once' },
    ...fields,
  });
}

/** The payment a series makes on a date. */
function paymentOf(input: PlanInput, seriesId: string, date: string): Payment {
  const found = workOutPayments({
    series: input.series.filter((one) => one.id === seriesId),
    changes: input.changes ?? [],
    holidays: input.holidays,
    from: date,
    to: date,
  });
  if (found[0] === undefined) throw new Error(`No ${seriesId} payment on ${date}.`);
  return found[0];
}

describe('test 14: the balance rule, steps 1 to 6 and 8', () => {
  // Balance £100.00, checked Wed 28 Oct 2026 at 10:00. Today is Thu 29 Oct.
  const wages = series({
    id: 'Wages',
    name: 'Wages',
    direction: 'in',
    amount: pounds('200.00'),
    start: '2026-10-30',
    schedule: { kind: 'weekly', every: 1 },
    type: 'pay',
  });
  const base = planInput({
    today: '2026-10-29',
    to: '2026-11-08',
    balanceUpdates: [balanceUpdate('current', '100.00', '2026-10-28', '2026-10-28T10:00:00Z')],
    series: [
      once('Gym', '2026-10-25', '20.00'),
      once('Phone', '2026-10-26', '15.00'),
      once('Bus pass', '2026-10-27', '10.00'),
      once('Coffee', '2026-10-28', '5.00'),
      once('Lunch', '2026-10-28', '6.00'),
      once('Snacks', '2026-10-29', '45.00'),
      once('Rent', '2026-10-30', '300.00'),
      wages,
    ],
    mainPayFamilyId: 'Wages',
  });
  const input: PlanInput = {
    ...base,
    ticks: [
      // Ticked before the update, so already inside the £100 (step 1).
      tick(paymentOf(base, 'Bus pass', '2026-10-27'), '2026-10-27T18:00:00Z'),
      // Ticked the same morning, before the update: inside it too (D33).
      tick(paymentOf(base, 'Coffee', '2026-10-28'), '2026-10-28T08:00:00Z'),
    ],
  };
  const plan = workOutPlan(input);
  const current = accountOf(plan);

  it('ignores ticked payments, applies overdue ones first, then everything from the balance date', () => {
    expect(rowsText(plan)).toEqual([
      '2026-10-25 Gym -20.00 80.00', // overdue, oldest first (step 2)
      '2026-10-26 Phone -15.00 65.00', // overdue
      '2026-10-28 Lunch -6.00 59.00', // from the balance date on (step 3)
      '2026-10-29 Snacks -45.00 14.00',
      '2026-10-30 Wages 200.00 214.00', // money in first on the same day
      '2026-10-30 Rent -300.00 -86.00',
      '2026-11-06 Wages 200.00 114.00',
    ]);
    expect(current.rows.map((row) => row.atStart)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("gives each day's figure as the balance after its last row (step 4)", () => {
    expect(daysText(plan, 'current', '2026-10-28', '2026-11-08')).toEqual([
      ['2026-10-28', '59.00'],
      ['2026-10-29', '14.00'],
      ['2026-10-30', '-86.00'],
      ['2026-10-31', '-86.00'],
      ['2026-11-01', '-86.00'],
      ['2026-11-02', '-86.00'],
      ['2026-11-03', '-86.00'],
      ['2026-11-04', '-86.00'],
      ['2026-11-05', '-86.00'],
      ['2026-11-06', '114.00'],
      ['2026-11-07', '114.00'],
      ['2026-11-08', '114.00'],
    ]);
  });

  it('finds the lowest point ahead, with its date and the payment that caused it (step 5)', () => {
    expect(current.lowestPoint.date).toBe('2026-10-30');
    expect(formatPounds(current.lowestPoint.balance)).toBe('-86.00');
    expect(current.lowestPoint.after?.payment.name).toBe('Rent');
  });

  it('marks Tight under the warning level and Short under the floor (step 8)', () => {
    expect(current.rows.map((row) => row.status)).toEqual([
      'ok',
      'ok',
      'ok',
      'tight',
      'ok',
      'short',
      'ok',
    ]);
    expect(current.firstUnderWarning?.date).toBe('2026-10-29');
    expect(formatPounds(current.firstUnderWarning?.balance ?? 0)).toBe('14.00');
    expect(current.firstUnderWarning?.after?.payment.name).toBe('Snacks');

    expect(current.shortfalls).toHaveLength(1);
    const [short] = current.shortfalls;
    expect(short?.date).toBe('2026-10-30');
    expect(formatPounds(short?.amount ?? 0)).toBe('86.00');
    expect(short?.after?.payment.name).toBe('Rent');
    expect(short?.lastDate).toBe('2026-11-05');
    expect(short?.deepest).toEqual({ date: '2026-10-30', amount: 8600, after: short?.after });
    expect(short?.moveTo).toBe('2026-11-06');
    // Snacks (£45.00) is the only unticked payment from today to the day
    // before, and it's too small to fix £86.00 on its own (D69).
    expect(short?.couldMove).toEqual([]);
  });

  it('expects the balance at the end of today in Update balance (D46)', () => {
    expect(formatPounds(current.expected)).toBe('14.00');
  });
});

describe('D10: below means strictly below', () => {
  const at = (balance: string, fields = {}) =>
    accountOf(
      workOutPlan(
        planInput({
          today: '2026-11-02',
          to: '2026-11-02',
          accounts: [account('current', fields)],
          balanceUpdates: [balanceUpdate('current', balance, '2026-11-02')],
        }),
      ),
    );

  it('treats exactly £20.00 as not under a £20 warning level', () => {
    expect(at('20.00').lowestPoint.status).toBe('ok');
    expect(at('20.00').firstUnderWarning).toBeNull();
    expect(at('19.99').lowestPoint.status).toBe('tight');
    expect(at('19.99').firstUnderWarning?.date).toBe('2026-11-02');
  });

  it('treats exactly £0.00 with no overdraft as Tight, not Short', () => {
    expect(at('0.00').lowestPoint.status).toBe('tight');
    expect(at('0.00').shortfalls).toEqual([]);
    expect(at('-0.01').lowestPoint.status).toBe('short');
    expect(at('-0.01').shortfalls.map((s) => [s.date, s.amount])).toEqual([['2026-11-02', 1]]);
  });

  it('treats exactly the overdraft floor as Tight, not Short', () => {
    const overdraft = { overdraftLimit: pounds('1000.00') };
    expect(at('-1000.00', overdraft).lowestPoint.status).toBe('tight');
    expect(at('-1000.00', overdraft).shortfalls).toEqual([]);
    expect(at('-1000.01', overdraft).shortfalls.map((s) => s.amount)).toEqual([1]);
  });
});

describe('D11: Not ticked yet', () => {
  const base = planInput({
    today: '2026-10-30',
    to: '2026-11-05',
    balanceUpdates: [balanceUpdate('current', '500.00', '2026-10-27', '2026-10-27T12:00:00Z')],
    series: [
      once('Before the balance date', '2026-10-25', '1.00'),
      once('On the balance date', '2026-10-27', '2.00'),
      once('After it, before today', '2026-10-29', '3.00'),
      once('Ticked after the update', '2026-10-28', '4.00'),
      once('Today', '2026-10-30', '5.00'),
      once('Tomorrow', '2026-10-31', '6.00'),
    ],
  });
  const input = {
    ...base,
    ticks: [tick(paymentOf(base, 'Ticked after the update', '2026-10-28'), '2026-10-29T08:00:00Z')],
  };
  const current = accountOf(workOutPlan(input));

  it('lists unticked payments dated before today, whatever the balance date', () => {
    expect(current.notTickedYet.map((row) => row.payment.name)).toEqual([
      'Before the balance date',
      'On the balance date',
      'After it, before today',
    ]);
  });

  it('still follows brief 5.5 for the sums: only the one before the balance date goes first', () => {
    expect(current.rows.map((row) => [row.payment.name, row.atStart, row.ticked])).toEqual([
      ['Before the balance date', true, false],
      ['On the balance date', false, false],
      ['Ticked after the update', false, true],
      ['After it, before today', false, false],
      ['Today', false, false],
      ['Tomorrow', false, false],
    ]);
    expect(formatPounds(current.expected)).toBe('485.00');
  });
});

describe('D12: the same-day order', () => {
  const day = '2026-11-06';
  const made = (minute: number) => `2026-10-25T09:${minute.toString().padStart(2, '0')}:00Z`;
  const make = (id: string, minute: number, fields: Partial<Series>): Series =>
    once(id, day, '10.00', { familyCreatedAt: made(minute), ...fields });
  const all: Series[] = [
    make('Out made first', 1, {}),
    make('Out made last', 9, {}),
    make('B out, same time', 5, {}),
    make('A out, same time', 5, {}),
    make('Same name, family z', 6, { name: 'Same name', familyId: 'z' }),
    make('Same name, family y', 6, { name: 'Same name', familyId: 'y' }),
    make('Transfer out', 8, { direction: 'transfer', toAccountId: 'savings' }),
    make('Transfer in', 2, { direction: 'transfer', accountId: 'savings', toAccountId: 'current' }),
    make('Pay made late', 7, { direction: 'in' }),
    make('Pay made early', 3, { direction: 'in' }),
  ];
  const input = (list: readonly Series[]) =>
    planInput({
      today: day,
      to: day,
      accounts: [account('current'), account('savings', { kind: 'savings' })],
      balanceUpdates: [
        balanceUpdate('current', '100.00', day),
        balanceUpdate('savings', '100.00', day),
      ],
      series: list,
    });

  it('puts money in first, then transfers, then money out; within each, the family made first', () => {
    expect(rowsText(workOutPlan(input(all))).map((row) => row.slice(11))).toEqual([
      'Pay made early 10.00 110.00',
      'Pay made late 10.00 120.00',
      'Transfer in 10.00 130.00',
      'Transfer out -10.00 120.00',
      'Out made first -10.00 110.00',
      'A out, same time -10.00 100.00', // same time: by name
      'B out, same time -10.00 90.00',
      'Same name -10.00 80.00', // same time and name: by family id, y before z
      'Same name -10.00 70.00',
      'Out made last -10.00 60.00',
    ]);
    const sameName = accountOf(workOutPlan(input(all))).rows.filter(
      (row) => row.payment.name === 'Same name',
    );
    expect(sameName.map((row) => row.payment.seriesId)).toEqual([
      'Same name, family y',
      'Same name, family z',
    ]);
  });

  it('never changes between runs, whatever order the series are given in', () => {
    const first = workOutPlan(input(all));
    const orders = [
      [...all].reverse(),
      [...all.slice(5), ...all.slice(0, 5)],
      [...all].sort((a, b) => (a.id < b.id ? 1 : -1)),
    ];
    for (const order of orders) {
      expect(workOutPlan(input(order))).toEqual(first);
    }
  });
});

describe('D33: balance updates store the time', () => {
  // Sun 25 Oct 2026 is the day the clocks go back: 02:00 BST becomes 01:00 GMT.
  const day = '2026-10-25';
  const base = planInput({
    today: day,
    to: '2026-10-26',
    // Typed at 01:30 BST, which is 00:30 UTC.
    balanceUpdates: [balanceUpdate('current', '100.00', day, '2026-10-25T00:30:00Z', 'update')],
    series: [
      once('Ticked before the update', day, '1.00'),
      once('Ticked after, clock reads earlier', day, '2.00'),
      once('Ticked after the update', day, '4.00'),
      once('Ticked inside the update steps', day, '8.00'),
    ],
  });
  const p = (name: string) => paymentOf(base, name, day);
  const input = {
    ...base,
    ticks: [
      // 01:20 BST, before the update.
      tick(p('Ticked before the update'), '2026-10-25T00:20:00Z'),
      // 01:15 GMT: after the clocks went back, so after the update, though
      // the clock on the wall says 01:15, before 01:30.
      tick(p('Ticked after, clock reads earlier'), '2026-10-25T01:15:00Z'),
      // Later the same day.
      tick(p('Ticked after the update'), '2026-10-25T20:00:00Z'),
      // In step 3 of the same update, just after the balance was typed.
      tick(p('Ticked inside the update steps'), '2026-10-25T00:31:00Z', {
        inBalanceUpdate: 'update',
      }),
    ],
  };

  it('counts a tick after the update, even on the same day, as not inside its balance', () => {
    const current = accountOf(workOutPlan(input));
    // Same family time, so by name, character by character (D12, D80).
    expect(current.rows.map((row) => [row.payment.name, row.ticked])).toEqual([
      ['Ticked after the update', true],
      ['Ticked after, clock reads earlier', true],
    ]);
    expect(formatPounds(current.expected)).toBe('94.00');
  });

  it('counts a tick made inside the Update balance steps as inside that balance', () => {
    const current = accountOf(workOutPlan(input));
    expect(current.rows.map((row) => row.payment.name)).not.toContain(
      'Ticked inside the update steps',
    );
    // Without the link to the update, the same tick is after it, so it goes out.
    const unlinked = {
      ...input,
      ticks: input.ticks.map(({ inBalanceUpdate: _, ...rest }) => rest),
    };
    expect(formatPounds(accountOf(workOutPlan(unlinked)).expected)).toBe('86.00');
  });

  it('counts a tick at exactly the same moment as the update as inside it ("at or before")', () => {
    const sameMoment = {
      ...base,
      ticks: [tick(p('Ticked after the update'), '2026-10-25T00:30:00Z')],
    };
    const current = accountOf(workOutPlan(sameMoment));
    expect(current.rows.map((row) => row.payment.name)).not.toContain('Ticked after the update');
    const aMicrosecondLater = {
      ...base,
      ticks: [tick(p('Ticked after the update'), '2026-10-25T00:30:00.000001Z')],
    };
    expect(accountOf(workOutPlan(aMicrosecondLater)).rows.map((row) => row.ticked)).toContain(true);
  });

  it('uses the latest update by time, not by the order given', () => {
    const later = balanceUpdate('current', '50.00', day, '2026-10-25T21:00:00Z', 'later');
    for (const updates of [
      [...input.balanceUpdates, later],
      [later, ...input.balanceUpdates],
    ]) {
      const current = accountOf(workOutPlan({ ...input, balanceUpdates: updates }));
      // Every tick was before 21:00, so all are inside the £50.00.
      expect(current.start.id).toBe('later');
      expect(current.rows).toEqual([]);
      expect(formatPounds(current.expected)).toBe('50.00');
    }
  });
});

describe('D1 and D71: paying early', () => {
  const base = planInput({
    today: '2026-11-02',
    to: '2026-11-30',
    balanceUpdates: [balanceUpdate('current', '300.00', '2026-11-01', '2026-11-01T09:00:00Z')],
    series: [once('Phone', '2026-11-14', '20.00')],
  });
  const phone = paymentOf(base, 'Phone', '2026-11-14');

  it('takes a payment ticked early off on the day it was ticked', () => {
    const current = accountOf(
      workOutPlan({ ...base, ticks: [tick(phone, '2026-11-02T08:00:00Z')] }),
    );
    expect(current.rows.map((row) => [row.date, row.payment.date, row.ticked])).toEqual([
      ['2026-11-02', '2026-11-14', true],
    ]);
    expect(formatPounds(current.expected)).toBe('280.00');
  });

  it('counts it as inside the balance once a later update is typed', () => {
    const current = accountOf(
      workOutPlan({
        ...base,
        balanceUpdates: [
          ...base.balanceUpdates,
          balanceUpdate('current', '280.00', '2026-11-02', '2026-11-02T18:00:00Z'),
        ],
        ticks: [tick(phone, '2026-11-02T08:00:00Z')],
      }),
    );
    expect(current.rows).toEqual([]);
    expect(formatPounds(current.lowestPoint.balance)).toBe('280.00');
  });

  it('includes a payment paid early even when its own date is after the plan ends', () => {
    const current = accountOf(
      workOutPlan({ ...base, to: '2026-11-10', ticks: [tick(phone, '2026-11-02T08:00:00Z')] }),
    );
    expect(current.rows.map((row) => [row.date, row.payment.date])).toEqual([
      ['2026-11-02', '2026-11-14'],
    ]);
  });
});

describe('D39: ticked after a balance update, with an earlier paid date', () => {
  // A plan with a balance typed on Tue 27 Oct, today Thu 29 Oct. Rent was due
  // Mon 26 Oct and wasn't ticked in the update; it's ticked on Wed 28 Oct.
  const base = planInput({
    today: '2026-10-29',
    to: '2026-11-03',
    balanceUpdates: [balanceUpdate('current', '700.00', '2026-10-27', '2026-10-27T20:00:00Z')],
    series: [
      once('Rent', '2026-10-26', '500.00'),
      once('Lunch', '2026-10-27', '7.00'),
      once('Bus', '2026-10-30', '3.00'),
    ],
  });
  const rent = paymentOf(base, 'Rent', '2026-10-26');
  const ticked = workOutPlan({ ...base, ticks: [tick(rent, '2026-10-28T09:00:00Z')] });

  it('goes out at the start, with the overdue payments, shown as ticked', () => {
    const current = accountOf(ticked);
    expect(current.rows[0]).toMatchObject({
      date: '2026-10-26',
      atStart: true,
      ticked: true,
      notTickedYet: false,
    });
    expect(current.rows[0]?.payment.name).toBe('Rent');
    expect(current.notTickedYet.map((row) => row.payment.name)).toEqual(['Lunch']);
  });

  it('gives the same balances from today on as if it went out today', () => {
    const today = workOutPlan({
      ...base,
      changes: [{ seriesId: 'Rent', originalDate: '2026-10-26', newDate: '2026-10-29' }],
    });
    expect(daysText(ticked, 'current', '2026-10-29', '2026-11-03')).toEqual(
      daysText(today, 'current', '2026-10-29', '2026-11-03'),
    );
    expect(daysText(ticked, 'current', '2026-10-29', '2026-10-29')).toEqual([
      ['2026-10-29', '193.00'],
    ]);
  });
});

describe('D83: ticks', () => {
  it('still takes off a removed payment when it was ticked, because the money went', () => {
    const base = planInput({
      today: '2026-11-02',
      to: '2026-11-05',
      balanceUpdates: [balanceUpdate('current', '100.00', '2026-11-01', '2026-11-01T09:00:00Z')],
      series: [once('Gift', '2026-11-03', '30.00')],
      changes: [{ seriesId: 'Gift', originalDate: '2026-11-03', skipped: true }],
    });
    expect(accountOf(workOutPlan(base)).rows).toEqual([]);
    const gift = paymentOf(base, 'Gift', '2026-11-03');
    const plan = workOutPlan({ ...base, ticks: [tick(gift, '2026-11-02T10:00:00Z')] });
    expect(rowsText(plan)).toEqual(['2026-11-02 Gift -30.00 70.00']);
    expect(accountOf(plan).rows[0]?.ticked).toBe(true);
  });

  it('counts a transfer ticked inside one account’s update steps as inside that account only', () => {
    const base = planInput({
      today: '2026-10-30',
      to: '2026-10-31',
      accounts: [account('current'), account('savings', { kind: 'savings', warningLevel: 0 })],
      balanceUpdates: [
        balanceUpdate('current', '600.00', '2026-10-30', '2026-10-30T09:14:00Z', 'current-update'),
        balanceUpdate('savings', '500.00', '2026-10-25', '2026-10-25T08:30:00Z'),
      ],
      series: [
        once('From savings', '2026-10-28', '500.00', {
          direction: 'transfer',
          accountId: 'savings',
          toAccountId: 'current',
        }),
      ],
    });
    const transfer = paymentOf(base, 'From savings', '2026-10-28');
    const plan = workOutPlan({
      ...base,
      ticks: [tick(transfer, '2026-10-30T09:15:00Z', { inBalanceUpdate: 'current-update' })],
    });
    // Inside the £600 the person typed for the current account.
    expect(accountOf(plan, 'current').rows).toEqual([]);
    // Not inside the savings balance from 25 Oct: it leaves savings on 28 Oct.
    expect(rowsText(plan, 'savings')).toEqual(['2026-10-28 From savings -500.00 0.00']);
  });
});

describe('D69: a transfer that could move must not leave the other account short', () => {
  // Today is Mon 2 Nov 2026. Pay comes in every Friday from 6 Nov.
  const input = (withJointBill: boolean) =>
    planInput({
      today: '2026-11-02',
      to: '2026-11-08',
      accounts: [account('current'), account('joint', { kind: 'joint', warningLevel: 0 })],
      balanceUpdates: [
        balanceUpdate('current', '420.00', '2026-11-02'),
        balanceUpdate('joint', '0.00', '2026-11-02'),
      ],
      series: [
        series({
          id: 'pay',
          name: 'Pay',
          direction: 'in',
          amount: pounds('400.00'),
          start: '2026-11-06',
          schedule: { kind: 'weekly', every: 1 },
          type: 'pay',
        }),
        once('To joint', '2026-11-03', '200.00', { direction: 'transfer', toAccountId: 'joint' }),
        once('Lesson', '2026-11-03', '120.00'),
        once('Rent', '2026-11-05', '200.00'),
        ...(withJointBill
          ? [once('Joint bill', '2026-11-04', '150.00', { accountId: 'joint' })]
          : []),
      ],
      mainPayFamilyId: 'pay',
    });

  it('leaves out the transfer when the joint account needs it before payday', () => {
    const current = accountOf(workOutPlan(input(true)));
    expect(current.shortfalls.map((s) => [s.date, formatPounds(s.amount), s.moveTo])).toEqual([
      ['2026-11-05', '100.00', '2026-11-06'],
    ]);
    // Moving the £200 to Fri 6 Nov would fix it, but the £150 joint bill on
    // Wed 4 Nov would then take the joint account under zero.
    expect(current.shortfalls[0]?.couldMove.map((row) => row.payment.name)).toEqual(['Lesson']);
  });

  it('lists it, biggest first, when moving it makes no other day short', () => {
    const current = accountOf(workOutPlan(input(false)));
    expect(current.shortfalls[0]?.couldMove.map((row) => row.payment.name)).toEqual([
      'To joint',
      'Lesson',
    ]);
  });
});
