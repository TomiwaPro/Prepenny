// Sam's plan from brief Part 8 through the balance rule (step 1b): D8, D46,
// D69, brief 8.3's balances, brief 8.4 test 5, plan periods and next payday.
// Brief 8.3's balance tests are written again in step 1g (tests 47, 48, 52),
// once everything is built.

import { describe, expect, it } from 'vitest';
import {
  balanceAtEndOf,
  formatPounds,
  groupIntoPeriods,
  type PaymentChange,
  paidDate,
  type Tick,
  workOutPayments,
  workOutPlan,
} from '../../src/index.ts';
import { accountOf, daysText, pounds, rowText } from '../fixtures/plan.ts';
import { samChanges, samPlan, samSeries } from '../fixtures/sam.ts';

const plan = workOutPlan(samPlan());
const current = accountOf(plan, 'current');
const savings = accountOf(plan, 'savings');

describe("Sam's plan on Sun 25 Oct 2026", () => {
  it('starts from £267.54 and £500.00, checked on 25 Oct', () => {
    expect([current.start.checkedOn, formatPounds(current.start.balance)]).toEqual([
      '2026-10-25',
      '267.54',
    ]);
    expect([savings.start.checkedOn, formatPounds(savings.start.balance)]).toEqual([
      '2026-10-25',
      '500.00',
    ]);
  });

  it('shows Left after this on every row, in the same-day order (D12)', () => {
    expect(current.rows.slice(0, 8).map(rowText)).toEqual([
      '2026-10-25 Spending money until payday -30.00 237.54',
      // Family loan's family was made before Driving lesson's (brief 8.2 table order).
      '2026-10-26 Family loan -125.00 112.54',
      '2026-10-26 Driving lesson -100.00 12.54',
      '2026-10-28 From savings 500.00 512.54',
      '2026-10-29 Pay-later card -466.07 46.47',
      '2026-10-30 Pay 603.06 649.53',
      '2026-10-30 Spending money -45.00 604.53',
      '2026-11-01 Rent -600.00 4.53',
    ]);
  });

  it('has nothing Not ticked yet, and no shortfall', () => {
    expect(current.notTickedYet).toEqual([]);
    expect(current.shortfalls).toEqual([]);
    expect(savings.shortfalls).toEqual([]);
  });
});

describe('owner test 1 and D8: the first day under £20', () => {
  it('is Mon 26 Oct 2026, at £12.54 after Driving lesson', () => {
    const under = current.firstUnderWarning;
    expect(under?.date).toBe('2026-10-26');
    expect(formatPounds(under?.balance ?? 0)).toBe('12.54');
    expect(under?.status).toBe('tight');
    expect(under?.after?.payment.name).toBe('Driving lesson');
  });

  it('puts Family loan before Driving lesson only because its family was made first', () => {
    // By name alone, Driving lesson would go first. Swap the creation times
    // and the order swaps too, but the end of the day stays £12.54.
    const swapped = samPlan({
      series: samSeries.map((one) => {
        if (one.id === 'family-loan-first') {
          return { ...one, familyCreatedAt: '2026-10-25T08:33:30Z' };
        }
        return one;
      }),
    });
    const rows = accountOf(workOutPlan(swapped)).rows.slice(1, 3).map(rowText);
    expect(rows).toEqual([
      '2026-10-26 Driving lesson -100.00 137.54',
      '2026-10-26 Family loan -125.00 12.54',
    ]);
  });
});

describe("owner test 2: brief 8.3's balances, now rather than in step 1g", () => {
  it('has the lowest end-of-day balance £4.53 on Sun 1 Nov 2026, after Rent', () => {
    expect(current.lowestPoint.date).toBe('2026-11-01');
    expect(formatPounds(current.lowestPoint.balance)).toBe('4.53');
    expect(current.lowestPoint.after?.payment.name).toBe('Rent');
    expect(current.lowestPoint.status).toBe('tight');
  });

  it('has the current account at £604.53, £732.91, £1,024.60, £2,235.89 and £3,304.87 at the end of Oct to Feb', () => {
    const ends = ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'];
    expect(ends.map((date) => formatPounds(balanceAtEndOf(current, date)))).toEqual([
      '604.53',
      '732.91',
      '1024.60',
      '2235.89',
      '3304.87',
    ]);
  });

  it('has savings at £0 from 28 Oct, £150 from 13 Nov and £0 from 30 Nov', () => {
    const changes = savings.days.filter(
      (day, i) => i === 0 || day.balance !== savings.days[i - 1]?.balance,
    );
    expect(changes.map((day) => [day.date, formatPounds(day.balance)])).toEqual([
      ['2026-10-25', '500.00'],
      ['2026-10-28', '0.00'],
      ['2026-11-13', '150.00'],
      ['2026-11-30', '0.00'],
    ]);
    expect(savings.days.at(-1)?.date).toBe('2027-02-28');
  });
});

describe('owner test 3 and D69: payments that could move', () => {
  const lowerPay: PaymentChange[] = samChanges.map((change) =>
    change.seriesId === 'pay' ? { ...change, amount: pounds('503.06') } : change,
  );
  const short = accountOf(workOutPlan(samPlan({ changes: lowerPay }))).shortfalls;

  it('makes Sam £95.47 short on Sun 1 Nov when the Fri 30 Oct pay is £503.06', () => {
    expect(short).toHaveLength(1);
    expect(short[0]?.date).toBe('2026-11-01');
    expect(formatPounds(short[0]?.amount ?? 0)).toBe('95.47');
    expect(short[0]?.after?.payment.name).toBe('Rent');
    // Still £95.47 short until Fri 6 Nov's pay.
    expect(short[0]?.lastDate).toBe('2026-11-05');
    expect(short[0]?.deepest.amount).toBe(9547);
    expect(short[0]?.moveTo).toBe('2026-11-06');
  });

  it('lists Pay-later card −£466.07, Family loan −£125.00 and Driving lesson −£100.00, in that order', () => {
    expect(
      short[0]?.couldMove.map((row) => [row.payment.name, row.date, formatPounds(row.change)]),
    ).toEqual([
      ['Pay-later card', '2026-10-29', '-466.07'],
      ['Family loan', '2026-10-26', '-125.00'],
      ['Driving lesson', '2026-10-26', '-100.00'],
    ]);
  });

  it('leaves out Spending money −£30.00: moved, Sam is still £65.47 short', () => {
    const names = short[0]?.couldMove.map((row) => row.payment.name);
    expect(names).not.toContain('Spending money until payday');
    const moved = workOutPlan(
      samPlan({
        changes: [
          ...lowerPay,
          { seriesId: 'spending-until-payday', originalDate: '2026-10-25', newDate: '2026-11-06' },
        ],
      }),
    );
    expect(formatPounds(balanceAtEndOf(accountOf(moved), '2026-11-01'))).toBe('-65.47');
  });

  it('fixes the shortfall, with no new short day, for each payment in the list', () => {
    const moves: [string, string][] = [
      ['pay-later-card-in-full', '2026-10-29'],
      ['family-loan-first', '2026-10-26'],
      ['driving-lessons', '2026-10-26'],
    ];
    for (const [seriesId, originalDate] of moves) {
      const moved = workOutPlan(
        samPlan({ changes: [...lowerPay, { seriesId, originalDate, newDate: '2026-11-06' }] }),
      );
      for (const one of moved.accounts) {
        expect(one.shortfalls, seriesId).toEqual([]);
      }
    }
  });
});

describe('owner test 4: Sam’s pay periods on Sun 25 Oct', () => {
  const periods = groupIntoPeriods(plan, 'pay');
  const ofCurrent = periods.accounts.find((one) => one.accountId === 'current')?.periods ?? [];
  const summary = ofCurrent.map((period) => [
    period.start,
    period.end,
    formatPounds(period.cameIn),
    formatPounds(period.leftAtEnd),
  ]);

  it('runs from one Friday payday to the Thursday before the next (D14)', () => {
    expect(periods.by).toBe('pay');
    expect(summary.slice(0, 3)).toEqual([
      // Nothing earlier is Sam's pay, so the first period starts today. The
      // £500.00 from savings is what came in (D84).
      ['2026-10-25', '2026-10-29', '500.00', '46.47'],
      ['2026-10-30', '2026-11-05', '603.06', '4.53'],
      ['2026-11-06', '2026-11-12', '618.46', '155.69'],
    ]);
  });

  it('has each period’s rows in date order', () => {
    expect(ofCurrent[1]?.rows.map(rowText)).toEqual([
      '2026-10-30 Pay 603.06 649.53',
      '2026-10-30 Spending money -45.00 604.53',
      '2026-11-01 Rent -600.00 4.53',
    ]);
    expect(ofCurrent[0]?.rows.map((row) => row.payment.name)).toEqual([
      'Spending money until payday',
      'Family loan',
      'Driving lesson',
      'From savings',
      'Pay-later card',
    ]);
  });

  it('has the short first period and one for each of the 18 paydays, the last cut short at the end of February', () => {
    expect(ofCurrent).toHaveLength(19);
    expect(ofCurrent.at(-1)).toMatchObject({
      start: '2027-02-26',
      end: '2027-03-04',
      from: '2027-02-26',
      to: '2027-02-28',
    });
    expect(formatPounds(ofCurrent.at(-1)?.leftAtEnd ?? 0)).toBe('3304.87');
    // Every row from today on is in exactly one period.
    expect(ofCurrent.flatMap((period) => period.rows)).toEqual(current.rows);
  });

  it('also groups by calendar month, ending each on brief 8.3’s balance', () => {
    const months = groupIntoPeriods(plan, 'months').accounts[0]?.periods ?? [];
    expect(
      months.map((period) => [
        period.start,
        period.from,
        period.end,
        formatPounds(period.cameIn),
        formatPounds(period.leftAtEnd),
      ]),
    ).toEqual([
      ['2026-10-01', '2026-10-25', '2026-10-31', '1103.06', '604.53'],
      // 4 paydays, and £150.00 back from savings on 30 Nov.
      ['2026-11-01', '2026-11-01', '2026-11-30', '2281.86', '732.91'],
      ['2026-12-01', '2026-12-01', '2026-12-31', '2131.86', '1024.60'],
      // 5 paydays in January.
      ['2027-01-01', '2027-01-01', '2027-01-31', '2750.32', '2235.89'],
      ['2027-02-01', '2027-02-01', '2027-02-28', '2131.86', '3304.87'],
    ]);
  });
});

describe('owner test 5 and D46: what Update balance expects', () => {
  it('expects £604.53 on Fri 30 Oct, before anything is ticked', () => {
    const friday = accountOf(workOutPlan(samPlan({ today: '2026-10-30' })));
    expect(formatPounds(friday.expected)).toBe('604.53');
    // Everything from 25 Oct to 29 Oct is Not ticked yet by then (D11).
    expect(friday.notTickedYet.map((row) => row.date)).toEqual([
      '2026-10-25',
      '2026-10-26',
      '2026-10-26',
      '2026-10-28',
      '2026-10-29',
    ]);
  });

  it('expects £237.54 on Sun 25 Oct', () => {
    expect(formatPounds(current.expected)).toBe('237.54');
  });
});

describe('owner test 7: the next main payday', () => {
  it('is Fri 30 Oct for Sam on Sun 25 Oct', () => {
    expect(plan.mainPay).toBe('regular');
    expect(plan.nextMainPayday).toBe('2026-10-30');
  });

  it('is the payday after today, not today, on payday itself', () => {
    expect(workOutPlan(samPlan({ today: '2026-10-30' })).nextMainPayday).toBe('2026-11-06');
  });
});

describe('test 15, brief 8.4 test 5: update the balance on 30 Oct to £600 and tick everything up to then', () => {
  const update = {
    id: 'current-30-oct',
    accountId: 'current',
    balance: pounds('600.00'),
    checkedOn: '2026-10-30',
    checkedAt: '2026-10-30T09:14:00Z',
  };
  const upToThen = workOutPayments({
    series: samSeries,
    changes: samChanges,
    holidays: samPlan().holidays,
    from: '2026-10-25',
    to: '2026-10-30',
  });
  const ticksInside: Tick[] = upToThen.map((payment) => ({
    seriesId: payment.seriesId,
    originalDate: payment.originalDate,
    // Ticked in step 3, a minute after the balance was typed.
    tickedAt: '2026-10-30T09:15:00Z',
    inBalanceUpdate: update.id,
    paidOn: paidDate(payment.date, '2026-10-30'),
  }));
  const after = workOutPlan(
    samPlan({
      today: '2026-10-30',
      balanceUpdates: [...samPlan().balanceUpdates, update],
      ticks: ticksInside,
    }),
  );
  const currentAfter = accountOf(after, 'current');

  it('ticks seven payments: everything dated up to Fri 30 Oct', () => {
    expect(upToThen).toHaveLength(7);
  });

  it('works forward from £600, with nothing ticked counted twice', () => {
    expect(currentAfter.rows[0] && rowText(currentAfter.rows[0])).toBe(
      '2026-11-01 Rent -600.00 0.00',
    );
    expect(currentAfter.rows.some((row) => row.ticked)).toBe(false);
    expect(currentAfter.notTickedYet).toEqual([]);
    expect(formatPounds(currentAfter.expected)).toBe('600.00');
    // Every balance from then on is the old plan's, less the £4.53 difference.
    const ends = ['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'];
    expect(ends.map((date) => balanceAtEndOf(currentAfter, date))).toEqual(
      ends.map((date) => balanceAtEndOf(current, date) - pounds('4.53')),
    );
  });

  it('shows the lowest point as £0.00 on Sun 1 Nov after Rent: Tight, not Short (D10)', () => {
    expect(currentAfter.lowestPoint.date).toBe('2026-11-01');
    expect(currentAfter.lowestPoint.balance).toBe(0);
    expect(currentAfter.lowestPoint.after?.payment.name).toBe('Rent');
    expect(currentAfter.lowestPoint.status).toBe('tight');
    expect(currentAfter.shortfalls).toEqual([]);
  });

  it('still takes the £500 out of savings on 28 Oct, once', () => {
    expect(daysText(after, 'savings', '2026-10-27', '2026-10-28')).toEqual([
      ['2026-10-27', '500.00'],
      ['2026-10-28', '0.00'],
    ]);
  });

  it('gives the same plan when the ticks were made before the update instead', () => {
    const before = workOutPlan(
      samPlan({
        today: '2026-10-30',
        balanceUpdates: [...samPlan().balanceUpdates, update],
        ticks: ticksInside.map(({ inBalanceUpdate: _, ...rest }) => ({
          ...rest,
          tickedAt: '2026-10-30T09:13:00Z',
        })),
      }),
    );
    expect(accountOf(before, 'current').days).toEqual(currentAfter.days);
    // The savings balance was typed on 25 Oct, before the tick, so the
    // transfer still leaves savings on 28 Oct.
    expect(accountOf(before, 'savings').days).toEqual(accountOf(after, 'savings').days);
  });
});
