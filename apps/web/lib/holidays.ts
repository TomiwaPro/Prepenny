// The bank holidays a plan's dates are worked out from (brief 5.7, step 4c).
//
// Each plan keeps the copy of GOV.UK's list it uses, with its version
// (`records.bankHolidays`, D536): in an account, the server's, so every
// phone in a shared plan gives the same dates whichever fetched a new list
// first. Without one, the copy built into the app, which also works with no
// signal. A newer copy comes from PrePenny's own site each week
// (data/bank-holidays.ts, D537). Sam's example always uses the built-in copy.

import {
  type BankHolidayCalendar,
  type BankHolidayCopy,
  bankHolidayCalendar,
  bankHolidayVersion,
  checkBankHolidayCopy,
  type HolidayMove,
  isNewerBankHolidayVersion,
  movedByNewBankHolidays,
  type Nation,
  type OfficialBankHolidays,
  type PlanRecords,
} from '@prepenny/engine';
import officialList from '@prepenny/engine/data/bank-holidays.json';
import officialSource from '@prepenny/engine/data/bank-holidays.source.json';

/** The copy of GOV.UK's list built into this version of PrePenny. */
export function builtInCopy(): BankHolidayCopy {
  return {
    version: bankHolidayVersion(officialSource.downloaded_on, officialSource.sha256),
    list: officialList,
  };
}

/** Lists read so far, by version: each is read once, and only a few ever exist. */
const read = new Map<string, OfficialBankHolidays>();
/** Calendars made so far, by nation and version. */
const calendars = new Map<string, BankHolidayCalendar>();

function officialOf(copy: BankHolidayCopy): OfficialBankHolidays {
  const known = read.get(copy.version);
  if (known !== undefined) return known;
  const { official } = checkBankHolidayCopy(copy);
  read.set(copy.version, official);
  return official;
}

/** The built-in list, read. */
export function officialHolidays(): OfficialBankHolidays {
  return officialOf(builtInCopy());
}

/** A nation's bank holidays from a copy of the list: the built-in one unless another is given. */
export function calendarOf(
  nation: Nation,
  copy: BankHolidayCopy = builtInCopy(),
): BankHolidayCalendar {
  const key = `${nation}|${copy.version}`;
  const known = calendars.get(key);
  if (known !== undefined) return known;
  const made = bankHolidayCalendar(nation, officialOf(copy));
  calendars.set(key, made);
  return made;
}

/** A nation's bank holidays from the built-in copy, where there's no plan yet. */
export function holidaysFor(nation: Nation): BankHolidayCalendar {
  return calendarOf(nation);
}

export function englandAndWales(): BankHolidayCalendar {
  return holidaysFor('england-and-wales');
}

/** The copy of the list a plan uses: its own, or the built-in one (D536). */
export function copyOf(records: PlanRecords): BankHolidayCopy {
  return records.bankHolidays ?? builtInCopy();
}

/** A plan's bank holidays: its nation's, from the plan's own copy of the list (D536). */
export function holidaysOf(records: PlanRecords): BankHolidayCalendar {
  return calendarOf(records.settings?.nation ?? 'england-and-wales', copyOf(records));
}

/** The newer of two copies, or the first when neither is newer (D536). */
export function newerCopy(a: BankHolidayCopy, b: BankHolidayCopy | null): BankHolidayCopy {
  return b !== null && isNewerBankHolidayVersion(b.version, a.version) ? b : a;
}

/**
 * The payments a newer copy of the list moves because of a new bank holiday,
 * from today to as far as Home looks (D539): for the note on Home.
 */
export function holidayMoves(
  records: PlanRecords,
  before: BankHolidayCopy,
  after: BankHolidayCopy,
  today: string,
  to: string,
): HolidayMove[] {
  if (!isNewerBankHolidayVersion(after.version, before.version)) return [];
  const nation = records.settings?.nation ?? 'england-and-wales';
  return movedByNewBankHolidays({
    series: records.series,
    changes: records.changes ?? [],
    ticks: records.ticks ?? [],
    before: calendarOf(nation, before),
    after: calendarOf(nation, after),
    from: today,
    to,
  });
}
