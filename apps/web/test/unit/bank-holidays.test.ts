// Step 4c on the phone (D536 to D540): the weekly fetch from PrePenny's own
// site, the built-in copy with no signal, a plan kept only on the phone
// taking a newer list with the note for Home, the plan's list kept with its
// records and brought down from the server, and the edit sheet's reason a
// payment moved.

import 'fake-indexeddb/auto';
import {
  type BankHolidayCopy,
  bankHolidayVersion,
  type PlanRecords,
  type Series,
  workOutPlan,
} from '@prepenny/engine';
import list from '@prepenny/engine/data/bank-holidays.json';
import source from '@prepenny/engine/data/bank-holidays.source.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dismissHolidayNote,
  FETCH_EVERY_MS,
  fetchDue,
  fetchNewList,
  holidayNoteFor,
  newestOnPhone,
  noteMoves,
  takeNewerList,
} from '../../data/bank-holidays.ts';
import {
  loadRecords,
  openDb,
  type PrePennyDb,
  recordsOf,
  rowsOf,
  savePlan,
} from '../../data/db.ts';
import { recordsForBackup } from '../../lib/backup.ts';
import { builtInCopy, holidaysOf } from '../../lib/holidays.ts';
import { rowMaker } from '../../lib/rows.ts';
import { mirrorRowOf, recordsFromRows, writesFor } from '../../lib/sync-rows.ts';

const PLAN = '01900000-0000-7000-8000-000000000001';
const JESS = '01900000-0000-7000-8000-00000000000a';
const TODAY = '2026-11-15';

/** The built-in list with one more bank holiday in England and Wales, as GOV.UK adds a one-off. */
function copyWith(
  date: string,
  downloadedOn = '2026-11-16',
  sha = 'c'.repeat(64),
): BankHolidayCopy {
  const changed = structuredClone(list) as typeof list;
  changed['england-and-wales'].events.push({
    title: 'A one-off bank holiday',
    date,
    notes: '',
    bunting: true,
  });
  return { version: `${downloadedOn}:${sha}`, list: changed };
}

const monthlyOn = (day: number) =>
  ({ kind: 'monthly', every: 1, on: { kind: 'day', day } }) as const;

function series(
  fields: Partial<Series> & Pick<Series, 'id' | 'name' | 'start' | 'schedule'>,
): Series {
  return {
    accountId: 'current',
    direction: 'out',
    amount: 55000,
    end: { kind: 'never' },
    holidayRule: 'working-day-before',
    type: 'rent',
    isEstimate: false,
    familyId: fields.id,
    familyCreatedAt: '2026-11-01T09:00:00Z',
    ...fields,
  };
}

// Rent on the 8th, moved to the working day before, as in the owner's example.
const records: PlanRecords = {
  accounts: [
    {
      id: 'current',
      name: 'Current account',
      kind: 'current',
      overdraftLimit: 0,
      warningLevel: 2000,
    },
  ],
  balanceUpdates: [
    {
      id: 'b1',
      accountId: 'current',
      balance: 100000,
      checkedOn: TODAY,
      checkedAt: `${TODAY}T09:00:00Z`,
    },
  ],
  series: [
    series({ id: 'rent', name: 'Rent', start: '2026-12-08', schedule: monthlyOn(8) }),
    series({
      id: 'gym',
      name: 'Gym',
      start: '2026-12-08',
      schedule: monthlyOn(8),
      holidayRule: 'keep',
      type: 'bills',
    }),
  ],
  settings: { nation: 'england-and-wales', mainPayFamilyId: null },
};

let db: PrePennyDb;
let count = 0;

beforeEach(async () => {
  count += 1;
  db = openDb(`bank-holidays-${count}`);
  await db.open();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  db.close();
  await db.delete();
});

/** PrePenny's site answering with this file, or with nothing (no signal). */
function siteAnswers(body: unknown | 'no signal') {
  const fetch = vi.fn(async () => {
    if (body === 'no signal') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe("the weekly fetch from PrePenny's own site (D537)", () => {
  it('is due the first time, then once a week', () => {
    expect(fetchDue(null, 1000)).toBe(true);
    expect(fetchDue(1000, 1000 + FETCH_EVERY_MS - 1)).toBe(false);
    expect(fetchDue(1000, 1000 + FETCH_EVERY_MS)).toBe(true);
    // A phone whose clock went back fetches again rather than waiting.
    expect(fetchDue(5000, 1000)).toBe(true);
  });

  it('fetches /bank-holidays.json fresh, keeps a newer list, and not again for a week', async () => {
    const newer = copyWith('2027-02-08');
    const fetch = siteAnswers({ ...newer, source: 'https://www.gov.uk/bank-holidays.json' });
    expect(await fetchNewList(db, 1000)).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      '/bank-holidays.json',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect((await newestOnPhone(db)).version).toBe(newer.version);
    expect(await fetchNewList(db, 2000)).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('with no signal, the phone uses the built-in copy, and tries again next time', async () => {
    siteAnswers('no signal');
    expect(await fetchNewList(db, 1000)).toBe(false);
    expect((await newestOnPhone(db)).version).toBe(
      bankHolidayVersion(source.downloaded_on, source.sha256),
    );
    const newer = copyWith('2027-02-08');
    siteAnswers(newer);
    expect(await fetchNewList(db, 2000)).toBe(true);
  });

  it("keeps the newer list it has when the site's is older, or isn't GOV.UK's", async () => {
    const newer = copyWith('2027-02-08', '2026-11-20');
    siteAnswers(newer);
    await fetchNewList(db, 1000);
    siteAnswers(copyWith('2027-03-08', '2026-11-16', 'd'.repeat(64)));
    expect(await fetchNewList(db, 1000 + FETCH_EVERY_MS)).toBe(false);
    siteAnswers({ version: 'not a version', list });
    await fetchNewList(db, 1000 + 2 * FETCH_EVERY_MS);
    siteAnswers({ version: `2026-12-01:${'e'.repeat(64)}`, list: { scotland: {} } });
    await fetchNewList(db, 1000 + 3 * FETCH_EVERY_MS);
    expect((await newestOnPhone(db)).version).toBe(newer.version);
  });
});

describe('a plan kept only on this phone takes a newer list (D536, D539)', () => {
  const plan = { id: PLAN, isExample: false };

  it('moves Rent off the new bank holiday, keeps the list with the plan, and notes it for Home', async () => {
    await savePlan(db, plan, records);
    expect(holidaysOf(records).isBankHoliday(20_000)).toBe(false);
    const newer = copyWith('2027-02-08');
    siteAnswers(newer);
    await fetchNewList(db, 1000);
    const after = await takeNewerList(db, plan, records, TODAY);
    expect(after?.bankHolidays?.version).toBe(newer.version);
    expect((await loadRecords(db, PLAN)).bankHolidays?.version).toBe(newer.version);
    const plannedRent = (r: PlanRecords) =>
      workOutPlan({
        ...r,
        mainPayFamilyId: null,
        holidays: holidaysOf(r),
        today: TODAY,
        to: '2027-03-31',
      })
        .accounts[0]?.rows.filter((row) => row.payment.seriesId === 'rent')
        .map((row) => row.date);
    expect(plannedRent(records)).toEqual(['2026-12-08', '2027-01-08', '2027-02-08', '2027-03-08']);
    expect(plannedRent(after as PlanRecords)).toEqual([
      '2026-12-08',
      '2027-01-08',
      '2027-02-05',
      '2027-03-08',
    ]);
    expect(await holidayNoteFor(db, PLAN)).toEqual({
      planId: PLAN,
      moves: [
        {
          seriesId: 'rent',
          originalDate: '2027-02-08',
          name: 'Rent',
          accountId: 'current',
          holiday: '2027-02-08',
          to: '2027-02-05',
        },
      ],
    });
    // Gym keeps its date, so it isn't in the note. Taken once, it isn't taken again.
    expect(await takeNewerList(db, plan, after as PlanRecords, TODAY)).toBeNull();
    await dismissHolidayNote(db);
    expect(await holidayNoteFor(db, PLAN)).toBeNull();
  });

  it('takes nothing when the phone has nothing newer, and never for the example or a plan in an account', async () => {
    await savePlan(db, plan, records);
    expect(await takeNewerList(db, plan, records, TODAY)).toBeNull();
    siteAnswers(copyWith('2027-02-08'));
    await fetchNewList(db, 1000);
    expect(await takeNewerList(db, { id: 'example', isExample: true }, records, TODAY)).toBeNull();
    await db.links.put({ planId: PLAN, personId: JESS, shared: 0, mine: 0 });
    expect(await takeNewerList(db, plan, records, TODAY)).toBeNull();
    expect(await holidayNoteFor(db, PLAN)).toBeNull();
  });

  it('a note adds later moves, tells a payment once, and is for one plan only', async () => {
    const move = (seriesId: string, to: string) => ({
      seriesId,
      originalDate: '2027-02-08',
      name: seriesId,
      accountId: 'current',
      holiday: '2027-02-08',
      to,
    });
    await noteMoves(db, PLAN, [move('rent', '2027-02-05')]);
    await noteMoves(db, PLAN, [move('rent', '2027-02-04'), move('gym', '2027-02-09')]);
    expect((await holidayNoteFor(db, PLAN))?.moves.map((one) => [one.seriesId, one.to])).toEqual([
      ['rent', '2027-02-04'],
      ['gym', '2027-02-09'],
    ]);
    expect(await holidayNoteFor(db, 'another plan')).toBeNull();
    await noteMoves(db, 'another plan', [move('pay', '2027-02-05')]);
    expect(await holidayNoteFor(db, PLAN)).toBeNull();
  });
});

describe("the plan's list with its records (D536)", () => {
  it('is kept on the phone with the plan, and read back', () => {
    const withList = { ...records, bankHolidays: copyWith('2027-02-08') };
    const back = recordsOf(rowsOf(PLAN, withList));
    expect(back.bankHolidays).toEqual(withList.bankHolidays);
    expect(back).toMatchObject(withList);
  });

  it("comes down from the server as the plan's list, and is never sent with an edit", () => {
    const newer = copyWith('2027-02-08');
    const row = mirrorRowOf('bank_holidays', {
      id: 'list-id',
      version: 2,
      seq: 9,
      deleted: false,
      changed_at: '2026-11-16T07:00:00Z',
      list_version: newer.version,
      list: newer.list,
    });
    const back = recordsFromRows([row], JESS).records;
    expect(back.bankHolidays).toEqual(newer);
    // The server's own row: no edit adds, changes or removes it.
    expect(writesFor(back, { planId: PLAN, personId: JESS }, [row], undefined)).toEqual([]);
    const { bankHolidays: _gone, ...without } = back;
    expect(
      writesFor(
        without,
        { planId: PLAN, personId: JESS },
        [row],
        undefined,
      ),
    ).toEqual([]);
  });

  it('stays out of a backup: the plan it goes into keeps its own', () => {
    expect(
      recordsForBackup({ ...records, bankHolidays: copyWith('2027-02-08') }).bankHolidays,
    ).toBeUndefined();
  });

  it('without one, a plan uses the built-in copy', () => {
    expect(builtInCopy().version).toBe(bankHolidayVersion(source.downloaded_on, source.sha256));
    expect(holidaysOf(records)).toBe(holidaysOf({ ...records, bankHolidays: builtInCopy() }));
  });
});

describe("the edit sheet's reason and rule (D538, D540)", () => {
  const credit = series({
    id: 'credit',
    name: 'Universal Credit',
    direction: 'in',
    type: 'benefits',
    start: '2026-11-28',
    schedule: monthlyOn(28),
  });
  const salary = series({
    id: 'salary',
    name: 'Salary',
    direction: 'in',
    type: 'pay',
    start: '2026-11-30',
    schedule: { kind: 'monthly', every: 1, on: { kind: 'last-working-day' } },
  });
  const dee: PlanRecords = { ...records, series: [credit, salary] };

  it("Dee's Universal Credit, due Mon 28 Dec 2026, says it moved from there for the bank holiday", () => {
    const plan = workOutPlan({
      ...dee,
      mainPayFamilyId: null,
      holidays: holidaysOf(dee),
      today: TODAY,
      to: '2027-01-31',
    });
    const make = rowMaker(plan, dee);
    const rows = (plan.accounts[0]?.rows ?? []).map((row) => make(row, null));
    const december = rows.find(
      (row) => row.seriesId === 'credit' && row.originalDate === '2026-12-28',
    );
    expect([december?.paymentDate, december?.ruleMove, december?.holidayRule]).toEqual([
      '2026-12-24',
      { from: '2026-12-28', because: 'bank-holiday' },
      'working-day-before',
    ]);
    const november = rows.find(
      (row) => row.seriesId === 'credit' && row.originalDate === '2026-11-28',
    );
    // Sat 28 Nov 2026 comes in on Fri 27 Nov: the weekend.
    expect([november?.paymentDate, november?.ruleMove]).toEqual([
      '2026-11-27',
      { from: '2026-11-28', because: 'weekend' },
    ]);
    // Pay on the last working day: no reason, and no rule to change (D145).
    const jan = rows.find((row) => row.seriesId === 'salary' && row.originalDate === '2027-01-31');
    expect([jan?.paymentDate, jan?.ruleMove, jan?.holidayRule]).toEqual(['2027-01-29', null, null]);
  });
});
