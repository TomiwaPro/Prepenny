// Step 4c (D536 to D540): a bank holiday list's version and which copy is
// newer, why the weekend and bank holiday rule moved a payment, which
// payments a new bank holiday moves, and changing the rule for this and all
// later ones.

import { describe, expect, it } from 'vitest';
import {
  bankHolidayCalendar,
  bankHolidayVersion,
  checkBankHolidayCopy,
  type EditInput,
  EngineInputError,
  editPlan,
  formatDate,
  isNewerBankHolidayVersion,
  movedByNewBankHolidays,
  NATIONS,
  type Nation,
  parseBankHolidayList,
  ruleMoveOf,
  type Series,
  sameBankHolidayList,
  usualBankHolidays,
} from '../../src/index.ts';
import { canonical, edited, halvesProblems, paymentsOfSeries } from '../fixtures/edit.ts';
import { englandAndWales, officialJson, officialSource } from '../fixtures/holidays.ts';
import { account, balanceUpdate, planInput, pounds, tick } from '../fixtures/plan.ts';
import { paymentsOf, series } from '../fixtures/series.ts';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

interface Event {
  readonly title: string;
  readonly date: string;
  readonly notes: string;
  readonly bunting: boolean;
}
type List = Record<Nation, { division: string; events: Event[] }>;

/** A copy of the built-in list, to change in a test. */
function builtIn(): List {
  return structuredClone(officialJson) as List;
}

/** The built-in list with one more bank holiday, as GOV.UK adds a one-off. */
function withHoliday(date: string, nation: Nation = 'england-and-wales', from = builtIn()): List {
  from[nation].events.push({ title: 'A one-off bank holiday', date, notes: '', bunting: true });
  return from;
}

function withoutHoliday(date: string, nation: Nation = 'england-and-wales'): List {
  const list = builtIn();
  list[nation].events = list[nation].events.filter((event) => event.date !== date);
  return list;
}

const calendar = (list: List, nation: Nation = 'england-and-wales') =>
  bankHolidayCalendar(nation, parseBankHolidayList(list));

const monthlyOn = (day: number) =>
  ({ kind: 'monthly', every: 1, on: { kind: 'day', day } }) as const;

describe('a list version (D536)', () => {
  it('is the day it was downloaded and its checksum, as the source file gives them', () => {
    const version = bankHolidayVersion(officialSource.downloaded_on, officialSource.sha256);
    expect(version).toBe(`2026-10-29:${officialSource.sha256}`);
    expect(checkBankHolidayCopy({ version, list: officialJson }).copy.version).toBe(version);
  });

  it('is newer when the list is different and was downloaded later', () => {
    expect(isNewerBankHolidayVersion(`2026-11-16:${SHA_A}`, `2026-10-29:${SHA_B}`)).toBe(true);
    expect(isNewerBankHolidayVersion(`2026-10-29:${SHA_B}`, `2026-11-16:${SHA_A}`)).toBe(false);
  });

  it("isn't newer when it's the same list downloaded again on another day", () => {
    expect(isNewerBankHolidayVersion(`2026-11-16:${SHA_A}`, `2026-10-29:${SHA_A}`)).toBe(false);
    expect(sameBankHolidayList(`2026-11-16:${SHA_A}`, `2026-10-29:${SHA_A}`)).toBe(true);
    expect(sameBankHolidayList(`2026-11-16:${SHA_A}`, `2026-11-16:${SHA_B}`)).toBe(false);
  });

  it('on the same day, the larger checksum is newer, so every phone chooses the same', () => {
    expect(isNewerBankHolidayVersion(`2026-11-16:${SHA_B}`, `2026-11-16:${SHA_A}`)).toBe(true);
    expect(isNewerBankHolidayVersion(`2026-11-16:${SHA_A}`, `2026-11-16:${SHA_B}`)).toBe(false);
  });

  it('any list is newer than none', () => {
    expect(isNewerBankHolidayVersion(`2026-10-29:${SHA_A}`, null)).toBe(true);
  });

  it("refuses a version that is not a day and a checksum, and a list that is not GOV.UK's", () => {
    for (const version of [
      '',
      '2026-10-29',
      `2026-13-01:${SHA_A}`,
      `2026-10-29:${'A'.repeat(64)}`,
      7,
    ]) {
      expect(() => checkBankHolidayCopy({ version, list: officialJson })).toThrow(EngineInputError);
    }
    const noScotland: Partial<List> = builtIn();
    delete noScotland.scotland;
    expect(() =>
      checkBankHolidayCopy({ version: `2026-10-29:${SHA_A}`, list: noScotland }),
    ).toThrow(/no events for scotland/);
    expect(() => checkBankHolidayCopy(null)).toThrow(EngineInputError);
  });
});

describe('why the rule moved a payment (D538)', () => {
  it("Dee's Universal Credit, due Mon 28 Dec 2026, a bank holiday, comes in on Thu 24 Dec: moved by the bank holiday", () => {
    const credit = series({
      id: 'credit',
      direction: 'in',
      start: '2026-11-28',
      schedule: monthlyOn(28),
      holidayRule: 'working-day-before',
    });
    const december = paymentsOf(credit, {
      from: '2026-12-01',
      to: '2026-12-31',
      holidays: englandAndWales,
    });
    expect(december.map((one) => [one.originalDate, one.date])).toEqual([
      ['2026-12-28', '2026-12-24'],
    ]);
    expect(
      ruleMoveOf({ series: credit, originalDate: '2026-12-28', holidays: englandAndWales }),
    ).toEqual({ from: '2026-12-28', because: 'bank-holiday' });
  });

  it('rent due on Sun 1 Nov 2026 and paid on Mon 2 Nov: moved by the weekend', () => {
    const rent = series({
      start: '2026-11-01',
      schedule: monthlyOn(1),
      holidayRule: 'working-day-after',
    });
    expect(
      ruleMoveOf({ series: rent, originalDate: '2026-11-01', holidays: englandAndWales }),
    ).toEqual({ from: '2026-11-01', because: 'weekend' });
  });

  it('a payment due on Sat 26 Dec 2026 that moves after lands on Tue 29 Dec: the weekend and the bank holiday', () => {
    const bill = series({
      start: '2026-12-26',
      schedule: monthlyOn(26),
      holidayRule: 'working-day-after',
    });
    expect(
      paymentsOf(bill, { from: '2026-12-01', to: '2026-12-31', holidays: englandAndWales })[0]
        ?.date,
    ).toBe('2026-12-29');
    expect(
      ruleMoveOf({ series: bill, originalDate: '2026-12-26', holidays: englandAndWales }),
    ).toEqual({ from: '2026-12-26', because: 'weekend-and-bank-holiday' });
  });

  it('nothing for a payment that keeps its date, or is due on a working day', () => {
    const kept = series({ start: '2026-11-01', schedule: monthlyOn(1), holidayRule: 'keep' });
    expect(
      ruleMoveOf({ series: kept, originalDate: '2026-11-01', holidays: englandAndWales }),
    ).toBeNull();
    const weekday = series({
      start: '2026-11-02',
      schedule: monthlyOn(2),
      holidayRule: 'working-day-before',
    });
    expect(
      ruleMoveOf({ series: weekday, originalDate: '2026-11-02', holidays: englandAndWales }),
    ).toBeNull();
  });

  it("pay on the last working day isn't moved by a weekend, only by a bank holiday on the month's last weekday (D145)", () => {
    const salary = series({
      id: 'salary',
      direction: 'in',
      start: '2026-10-31',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
      holidayRule: 'working-day-before',
    });
    // Sun 31 Jan 2027: lands on Fri 29 Jan, the last working day itself.
    expect(
      ruleMoveOf({ series: salary, originalDate: '2027-01-31', holidays: englandAndWales }),
    ).toBeNull();
    // With Fri 29 Jan 2027 a bank holiday, it lands on Thu 28 Jan.
    const newList = calendar(withHoliday('2027-01-29'));
    expect(
      paymentsOf(salary, { from: '2027-01-01', to: '2027-01-31', holidays: newList }).map(
        (one) => one.date,
      ),
    ).toEqual(['2027-01-28']);
    expect(ruleMoveOf({ series: salary, originalDate: '2027-01-31', holidays: newList })).toEqual({
      from: '2027-01-29',
      because: 'bank-holiday',
    });
  });
});

describe('payments moved by a new bank holiday (D539)', () => {
  // The owner's example: rent on the 8th, moved to the working day before.
  const rent = series({
    id: 'rent',
    name: 'Rent',
    start: '2026-11-08',
    schedule: monthlyOn(8),
    holidayRule: 'working-day-before',
  });
  const before = englandAndWales;
  const after = calendar(withHoliday('2028-05-08'));
  const window = { from: '2028-04-01', to: '2028-06-30' };

  it('A new bank holiday on Mon 8 May 2028 moved Rent to Fri 5 May', () => {
    expect(movedByNewBankHolidays({ series: [rent], before, after, ...window })).toEqual([
      {
        seriesId: 'rent',
        originalDate: '2028-05-08',
        name: 'Rent',
        accountId: 'current',
        holiday: '2028-05-08',
        to: '2028-05-05',
      },
    ]);
  });

  it('a payment that moves to the working day after goes past it, and one that keeps its date stays', () => {
    const gym = series({
      id: 'gym',
      name: 'Gym',
      start: '2026-11-06',
      schedule: monthlyOn(6),
      holidayRule: 'working-day-after',
    });
    const phone = series({
      id: 'phone',
      name: 'Phone',
      start: '2026-11-08',
      schedule: monthlyOn(8),
    });
    // Sat 6 May 2028 was paid on Mon 8 May, and now on Tue 9 May.
    expect(
      movedByNewBankHolidays({ series: [rent, gym, phone], before, after, ...window }).map(
        (move) => [move.name, move.holiday, move.to],
      ),
    ).toEqual([
      ['Rent', '2028-05-08', '2028-05-05'],
      ['Gym', '2028-05-08', '2028-05-09'],
    ]);
  });

  it('leaves out a payment ticked, skipped or moved by the person, and one outside the window', () => {
    const paid = {
      seriesId: 'rent',
      originalDate: '2028-05-08',
      tickedAt: '2028-05-04T09:00:00Z',
      paidOn: '2028-05-04',
    };
    expect(
      movedByNewBankHolidays({ series: [rent], ticks: [paid], before, after, ...window }),
    ).toEqual([]);
    for (const change of [{ skipped: true }, { newDate: '2028-05-10' }]) {
      expect(
        movedByNewBankHolidays({
          series: [rent],
          changes: [{ seriesId: 'rent', originalDate: '2028-05-08', ...change }],
          before,
          after,
          ...window,
        }),
      ).toEqual([]);
    }
    expect(
      movedByNewBankHolidays({
        series: [rent],
        before,
        after,
        from: '2028-06-01',
        to: '2028-12-31',
      }),
    ).toEqual([]);
  });

  it("a one-off change to the amount or name doesn't stop it being told, with the name it has now", () => {
    expect(
      movedByNewBankHolidays({
        series: [rent],
        changes: [
          { seriesId: 'rent', originalDate: '2028-05-08', name: 'Rent and service charge' },
        ],
        before,
        after,
        ...window,
      }).map((move) => move.name),
    ).toEqual(['Rent and service charge']);
  });

  it("a day that's no longer a bank holiday moves a payment back without being listed", () => {
    // Mon 1 May 2028 is the early May bank holiday in the built-in list.
    const onFirst = series({
      id: 'first',
      name: 'First',
      start: '2026-11-01',
      schedule: monthlyOn(1),
      holidayRule: 'working-day-before',
    });
    const fewer = calendar(withoutHoliday('2028-05-01'));
    expect(
      paymentsOf(onFirst, { from: '2028-04-25', to: '2028-05-05', holidays: before })[0]?.date,
    ).toBe('2028-04-28');
    expect(
      paymentsOf(onFirst, { from: '2028-04-25', to: '2028-05-05', holidays: fewer })[0]?.date,
    ).toBe('2028-05-01');
    expect(movedByNewBankHolidays({ series: [onFirst], before, after: fewer, ...window })).toEqual(
      [],
    );
  });

  it("a new year on GOV.UK's list with the days the rules gave moves nothing (D74)", () => {
    const list = builtIn();
    for (const nation of NATIONS) {
      for (const holiday of usualBankHolidays(nation, 2029)) {
        list[nation].events.push({
          title: holiday.title,
          date: formatDate(holiday.day),
          notes: holiday.substitute ? 'Substitute day' : '',
          bunting: true,
        });
      }
    }
    const newer = calendar(list);
    expect(newer.sourceFor(2029)).toBe('official');
    expect(englandAndWales.sourceFor(2029)).toBe('rules');
    const weekly = series({
      id: 'weekly',
      name: 'Weekly',
      start: '2026-11-02',
      schedule: { kind: 'weekly', every: 1 },
      holidayRule: 'working-day-after',
    });
    expect(
      movedByNewBankHolidays({
        series: [rent, weekly],
        before,
        after: newer,
        from: '2029-01-01',
        to: '2029-12-31',
      }),
    ).toEqual([]);
  });

  it('pay on the last working day moved off a new bank holiday is told (D145)', () => {
    const salary = series({
      id: 'salary',
      name: 'Salary',
      direction: 'in',
      start: '2026-10-31',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
      holidayRule: 'working-day-before',
    });
    expect(
      movedByNewBankHolidays({
        series: [salary],
        before,
        after: calendar(withHoliday('2027-01-29')),
        from: '2026-11-15',
        to: '2027-11-15',
      }),
    ).toEqual([
      {
        seriesId: 'salary',
        originalDate: '2027-01-31',
        name: 'Salary',
        accountId: 'current',
        holiday: '2027-01-29',
        to: '2027-01-28',
      },
    ]);
  });

  it("only the nation's own new bank holidays count", () => {
    const scottish = calendar(withHoliday('2028-05-08', 'scotland'));
    expect(movedByNewBankHolidays({ series: [rent], before, after: scottish, ...window })).toEqual(
      [],
    );
  });

  it('the two halves of a private transfer are one payment, told once (D94)', () => {
    const privateHalf = series({
      id: 'to-joint',
      name: 'To the joint account',
      start: '2026-11-08',
      schedule: monthlyOn(8),
      holidayRule: 'working-day-before',
    });
    const sharedHalf = series({
      ...privateHalf,
      id: 'from-jess',
      accountId: 'joint',
      name: 'From Jess',
      direction: 'in',
      familyId: 'from-jess',
      mirrorOf: 'to-joint',
    });
    expect(
      movedByNewBankHolidays({ series: [privateHalf, sharedHalf], before, after, ...window }).map(
        (one) => one.seriesId,
      ),
    ).toEqual(['to-joint']);
    // On the partner's phone only the shared half is there, and it's told.
    const { mirrorOf: _private, ...partners }: Series = sharedHalf;
    expect(
      movedByNewBankHolidays({ series: [partners], before, after, ...window }).map(
        (one) => one.seriesId,
      ),
    ).toEqual(['from-jess']);
  });
});

describe('changing the weekend and bank holiday rule for this and all later ones (D540)', () => {
  const rent = series({
    id: 'rent',
    name: 'Rent',
    type: 'rent',
    amount: pounds('550.00'),
    start: '2026-11-01',
    schedule: monthlyOn(1),
    holidayRule: 'keep',
  });
  const input: EditInput = {
    ...planInput({
      today: '2026-10-25',
      to: '2027-12-31',
      accounts: [account('current')],
      balanceUpdates: [balanceUpdate('current', '1000.00', '2026-10-25')],
      series: [rent],
      holidays: englandAndWales,
    }),
  };
  const dates = (records: EditInput, from = '2026-11-01', to = '2027-08-31') =>
    paymentsOfSeries(records, 'rent', from, to).map((one) => one.date);

  it('on the first payment, the whole series moves off weekends and bank holidays, and undo puts it back exactly', () => {
    const { edit, after } = edited(input, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2026-11-01',
      edits: { holidayRule: 'working-day-after' },
      newSeriesId: 'rent-2',
    });
    expect(after.series).toEqual([{ ...rent, holidayRule: 'working-day-after' }]);
    // Sun 1 Nov 2026, Fri 1 Jan 2027 (New Year's Day) and Sun 1 Aug 2027 move.
    expect(dates(after)).toEqual([
      '2026-11-02',
      '2026-12-01',
      '2027-01-04',
      '2027-02-01',
      '2027-03-01',
      '2027-04-01',
      '2027-05-04',
      '2027-06-01',
      '2027-07-01',
      '2027-08-02',
    ]);
    const undone = edited(after, { kind: 'undo', edit }).after;
    expect(canonical(undone)).toEqual(canonical(input));
  });

  it('from a later payment, the series splits there: earlier payments keep their dates', () => {
    const { after } = edited(input, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2027-05-01',
      edits: { holidayRule: 'working-day-before' },
      newSeriesId: 'rent-2',
    });
    expect(after.series.map((one) => [one.id, one.holidayRule])).toEqual([
      ['rent', 'keep'],
      ['rent-2', 'working-day-before'],
    ]);
    const all = [
      ...paymentsOfSeries(after, 'rent', '2026-11-01', '2027-08-31'),
      ...paymentsOfSeries(after, 'rent-2', '2026-11-01', '2027-08-31'),
    ];
    expect(all.map((one) => one.date)).toEqual([
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
      '2027-03-01',
      '2027-04-01',
      // Sat 1 May 2027 to Fri 30 Apr; Sun 1 Aug 2027 to Fri 30 Jul.
      '2027-04-30',
      '2027-06-01',
      '2027-07-01',
      '2027-07-30',
    ]);
  });

  it('ticks and one-off changes stay on their payments, as the dates from the schedule never change', () => {
    const [november] = paymentsOfSeries(input, 'rent', '2026-11-01', '2026-11-30');
    const records: EditInput = {
      ...input,
      ticks: [tick(november as NonNullable<typeof november>, '2026-10-30T09:00:00Z')],
      changes: [{ seriesId: 'rent', originalDate: '2027-08-01', amount: pounds('560.00') }],
    };
    const { after } = edited(records, {
      kind: 'this-and-later',
      seriesId: 'rent',
      originalDate: '2026-11-01',
      edits: { holidayRule: 'working-day-after' },
      newSeriesId: 'rent-2',
    });
    expect(after.ticks).toEqual(records.ticks);
    expect(after.changes).toEqual(records.changes);
    const august = paymentsOfSeries(after, 'rent', '2027-08-01', '2027-08-31')[0];
    expect([august?.date, august?.amount]).toEqual(['2027-08-02', pounds('560.00')]);
  });

  it('both halves of a private transfer change together (D94)', () => {
    const privateHalf = series({
      id: 'to-joint',
      accountId: 'jess',
      name: 'To the joint account',
      amount: pounds('600.00'),
      start: '2026-11-01',
      schedule: monthlyOn(1),
    });
    const sharedHalf = series({
      id: 'from-jess',
      accountId: 'joint',
      name: 'From Jess',
      direction: 'in',
      amount: pounds('600.00'),
      start: '2026-11-01',
      schedule: monthlyOn(1),
      mirrorOf: 'to-joint',
    });
    const jess: EditInput = planInput({
      today: '2026-10-25',
      to: '2027-12-31',
      accounts: [account('jess'), account('joint', { kind: 'joint' })],
      balanceUpdates: [
        balanceUpdate('jess', '310.00', '2026-10-25'),
        balanceUpdate('joint', '95.00', '2026-10-25'),
      ],
      series: [privateHalf, sharedHalf],
      holidays: englandAndWales,
    });
    const { after } = edited(jess, {
      kind: 'this-and-later',
      seriesId: 'from-jess',
      originalDate: '2027-01-01',
      edits: { holidayRule: 'working-day-before' },
      newSeriesId: 'from-jess-2',
      newOtherHalfSeriesId: 'to-joint-2',
    });
    expect(after.series.map((one) => [one.id, one.holidayRule])).toEqual([
      ['to-joint', 'keep'],
      ['from-jess', 'keep'],
      ['from-jess-2', 'working-day-before'],
      ['to-joint-2', 'working-day-before'],
    ]);
    expect(halvesProblems(after, '2026-11-01', '2027-12-31')).toEqual([]);
  });

  it('refuses a rule it does not know, and a new rule for pay on the last working day (D145)', () => {
    const refused = (records: EditInput, seriesId: string, originalDate: string, rule: unknown) => {
      try {
        editPlan(records, {
          kind: 'this-and-later',
          seriesId,
          originalDate,
          edits: { holidayRule: rule as 'keep' },
          newSeriesId: 'new',
        });
      } catch (error) {
        return error instanceof EngineInputError ? error.code : 'other';
      }
      return null;
    };
    expect(refused(input, 'rent', '2026-11-01', 'never')).toBe('bad-command');
    const salary = series({
      id: 'salary',
      direction: 'in',
      type: 'pay',
      start: '2026-10-31',
      schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
      holidayRule: 'working-day-before',
    });
    expect(refused({ ...input, series: [rent, salary] }, 'salary', '2026-11-30', 'keep')).toBe(
      'holiday-rule-fixed',
    );
  });
});
