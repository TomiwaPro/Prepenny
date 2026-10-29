// The usual UK bank holidays worked out by the standard rules, including
// substitute days (D74). Used only for years the official GOV.UK list doesn't
// cover yet. One-off days, such as a coronation, can't be worked out by rules;
// they come from the official list.

import { addDays, type Day, dayFromParts, MONDAY, weekdayOfMonth } from './day.ts';
import { isWeekend } from './working-days.ts';

/** The three UK bank holiday lists, named as GOV.UK names them. */
export type Nation = 'england-and-wales' | 'scotland' | 'northern-ireland';

export const NATIONS: readonly Nation[] = ['england-and-wales', 'scotland', 'northern-ireland'];

export interface BankHoliday {
  readonly day: Day;
  readonly title: string;
  /** True when the day replaces one that fell on a weekend. */
  readonly substitute: boolean;
}

/**
 * Easter Sunday in the Gregorian calendar (the Meeus, Jones and Butcher
 * method). Easter 2026 is Sun 5 Apr.
 */
export function easterSunday(year: number): Day {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayFromParts(year, month, day);
}

interface FixedHoliday {
  readonly month: number;
  readonly day: number;
  readonly title: string;
}

const NEW_YEARS_DAY: FixedHoliday = { month: 1, day: 1, title: 'New Year’s Day' };
const SECOND_JANUARY: FixedHoliday = { month: 1, day: 2, title: '2nd January' };
const ST_PATRICKS_DAY: FixedHoliday = { month: 3, day: 17, title: 'St Patrick’s Day' };
const BATTLE_OF_THE_BOYNE: FixedHoliday = {
  month: 7,
  day: 12,
  title: 'Battle of the Boyne (Orangemen’s Day)',
};
const ST_ANDREWS_DAY: FixedHoliday = { month: 11, day: 30, title: 'St Andrew’s Day' };
const CHRISTMAS_DAY: FixedHoliday = { month: 12, day: 25, title: 'Christmas Day' };
const BOXING_DAY: FixedHoliday = { month: 12, day: 26, title: 'Boxing Day' };

const FIXED: Readonly<Record<Nation, readonly FixedHoliday[]>> = {
  'england-and-wales': [NEW_YEARS_DAY, CHRISTMAS_DAY, BOXING_DAY],
  scotland: [NEW_YEARS_DAY, SECOND_JANUARY, ST_ANDREWS_DAY, CHRISTMAS_DAY, BOXING_DAY],
  'northern-ireland': [
    NEW_YEARS_DAY,
    ST_PATRICKS_DAY,
    BATTLE_OF_THE_BOYNE,
    CHRISTMAS_DAY,
    BOXING_DAY,
  ],
};

function movingHolidays(nation: Nation, year: number): BankHoliday[] {
  const easter = easterSunday(year);
  const holidays: BankHoliday[] = [
    { day: addDays(easter, -2), title: 'Good Friday', substitute: false },
    {
      day: weekdayOfMonth(year, 5, MONDAY, 1),
      title: 'Early May bank holiday',
      substitute: false,
    },
    {
      day: weekdayOfMonth(year, 5, MONDAY, 'last'),
      title: 'Spring bank holiday',
      substitute: false,
    },
    {
      // Scotland's summer bank holiday is the first Monday of August; elsewhere the last.
      day: weekdayOfMonth(year, 8, MONDAY, nation === 'scotland' ? 1 : 'last'),
      title: 'Summer bank holiday',
      substitute: false,
    },
  ];
  if (nation !== 'scotland') {
    holidays.push({ day: addDays(easter, 1), title: 'Easter Monday', substitute: false });
  }
  return holidays;
}

/**
 * The usual bank holidays for one nation and year, in date order.
 *
 * Fixed-date holidays that fall on a weekend move to the next weekday that
 * isn't already a bank holiday. So when Christmas Day is a Saturday, it moves
 * to Mon 27 Dec and Boxing Day to Tue 28 Dec; when it's a Sunday, Boxing Day
 * stays on Mon 26 Dec and Christmas Day moves to Tue 27 Dec.
 */
export function usualBankHolidays(nation: Nation, year: number): BankHoliday[] {
  const holidays = movingHolidays(nation, year);
  const taken = new Set(holidays.map((holiday) => holiday.day));
  const onWeekends: FixedHoliday[] = [];

  for (const fixed of FIXED[nation]) {
    const day = dayFromParts(year, fixed.month, fixed.day);
    if (isWeekend(day)) {
      onWeekends.push(fixed);
    } else {
      holidays.push({ day, title: fixed.title, substitute: false });
      taken.add(day);
    }
  }

  for (const fixed of onWeekends) {
    let day = dayFromParts(year, fixed.month, fixed.day);
    while (isWeekend(day) || taken.has(day)) {
      day = addDays(day, 1);
    }
    holidays.push({ day, title: fixed.title, substitute: true });
    taken.add(day);
  }

  return holidays.sort((a, b) => a.day - b.day);
}
