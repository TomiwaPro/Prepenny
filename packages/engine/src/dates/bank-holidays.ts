import { EngineInputError } from '../errors.ts';
import { type BankHoliday, NATIONS, type Nation, usualBankHolidays } from './bank-holiday-rules.ts';
import { type Day, parseDate, partsOfDay } from './day.ts';
import type { BankHolidayLookup } from './working-days.ts';

/** GOV.UK's bank holiday list (brief 5.7), read and checked. */
export interface OfficialBankHolidays {
  readonly nations: Readonly<Record<Nation, OfficialNationList>>;
}

export interface OfficialNationList {
  /** Each year's bank holidays, in date order. */
  readonly byYear: ReadonlyMap<number, readonly BankHoliday[]>;
  /**
   * The years the list covers in full: those with at least one bank holiday in
   * January and one in December (D76). Every year starts with New Year's Day,
   * or its substitute, and ends with Christmas.
   */
  readonly coveredYears: ReadonlySet<number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNation(json: Record<string, unknown>, nation: Nation): OfficialNationList {
  const section = json[nation];
  if (!isRecord(section) || !Array.isArray(section.events)) {
    throw new EngineInputError(
      'bad-bank-holiday-list',
      `The bank holiday list has no events for ${nation}.`,
    );
  }
  const byYear = new Map<number, BankHoliday[]>();
  section.events.forEach((event: unknown, index: number) => {
    if (!isRecord(event) || typeof event.date !== 'string' || typeof event.title !== 'string') {
      throw new EngineInputError(
        'bad-bank-holiday-list',
        `Bank holiday ${index + 1} for ${nation} needs a date and a title.`,
      );
    }
    const day = parseDate(event.date, `Bank holiday ${index + 1} for ${nation}`);
    const notes = typeof event.notes === 'string' ? event.notes : '';
    const year = partsOfDay(day).year;
    const list = byYear.get(year) ?? [];
    list.push({ day, title: event.title, substitute: /substitute day/i.test(notes) });
    byYear.set(year, list);
  });

  const coveredYears = new Set<number>();
  for (const [year, holidays] of byYear) {
    holidays.sort((a, b) => a.day - b.day);
    const months = new Set(holidays.map((holiday) => partsOfDay(holiday.day).month));
    if (months.has(1) && months.has(12)) {
      coveredYears.add(year);
    }
  }
  return { byYear, coveredYears };
}

/**
 * Reads GOV.UK's bank holiday list, in the shape of
 * https://www.gov.uk/bank-holidays.json, and checks it. The app passes in the
 * built-in copy from `@prepenny/engine/data/bank-holidays.json`, or a fresher
 * copy (D57).
 */
export function parseBankHolidayList(json: unknown): OfficialBankHolidays {
  if (!isRecord(json)) {
    throw new EngineInputError('bad-bank-holiday-list', 'The bank holiday list must be an object.');
  }
  const nations = {} as Record<Nation, OfficialNationList>;
  for (const nation of NATIONS) {
    nations[nation] = readNation(json, nation);
  }
  return { nations };
}

/** Where a year's bank holidays came from. */
export type BankHolidaySource = 'official' | 'rules';

interface YearOfHolidays {
  readonly holidays: readonly BankHoliday[];
  readonly days: ReadonlySet<Day>;
  readonly source: BankHolidaySource;
}

/**
 * One nation's bank holidays, for any year. A year the official list covers
 * uses the official list. A year it doesn't reach yet uses the usual rules,
 * including substitute days (D74).
 */
export class BankHolidayCalendar implements BankHolidayLookup {
  readonly nation: Nation;
  readonly #official: OfficialNationList | null;
  readonly #years = new Map<number, YearOfHolidays>();

  constructor(nation: Nation, official: OfficialBankHolidays | null) {
    if (!NATIONS.includes(nation)) {
      throw new EngineInputError(
        'bad-nation',
        'The nation must be england-and-wales, scotland or northern-ireland.',
      );
    }
    this.nation = nation;
    this.#official = official === null ? null : official.nations[nation];
  }

  #year(year: number): YearOfHolidays {
    const known = this.#years.get(year);
    if (known !== undefined) {
      return known;
    }
    const official = this.#official;
    const fromList = official?.coveredYears.has(year) ? official.byYear.get(year) : undefined;
    const holidays = fromList ?? usualBankHolidays(this.nation, year);
    const found: YearOfHolidays = {
      holidays,
      days: new Set(holidays.map((holiday) => holiday.day)),
      source: fromList === undefined ? 'rules' : 'official',
    };
    this.#years.set(year, found);
    return found;
  }

  /** True when the day is a bank holiday in this nation. */
  isBankHoliday(day: Day): boolean {
    return this.#year(partsOfDay(day).year).days.has(day);
  }

  /** The year's bank holidays, in date order. */
  holidaysIn(year: number): readonly BankHoliday[] {
    return this.#year(year).holidays;
  }

  /** Whether the year's bank holidays come from the official list or the rules. */
  sourceFor(year: number): BankHolidaySource {
    return this.#year(year).source;
  }
}

/**
 * The bank holiday calendar for a plan's nation. Pass the official list when
 * there is one; with `null`, every year uses the rules.
 */
export function bankHolidayCalendar(
  nation: Nation,
  official: OfficialBankHolidays | null,
): BankHolidayCalendar {
  return new BankHolidayCalendar(nation, official);
}
