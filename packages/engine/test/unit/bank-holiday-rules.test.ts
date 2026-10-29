// D74: when the official list doesn't reach a year, the engine works out that
// year's usual bank holidays by the standard rules, including substitute days.
// The rules must give exactly the official list for every year it covers,
// apart from the one-off days no rule can predict (D74's note and D75).

import { describe, expect, it } from 'vitest';
import {
  easterSunday,
  formatDate,
  NATIONS,
  type Nation,
  usualBankHolidays,
} from '../../src/index.ts';
import { official } from '../fixtures/holidays.ts';

const rules = (nation: Nation, year: number) =>
  usualBankHolidays(nation, year).map((holiday) => formatDate(holiday.day));

describe('the standard rules', () => {
  it('find Easter Sunday', () => {
    const easter: Record<number, string> = {
      2019: '2019-04-21',
      2020: '2020-04-12',
      2021: '2021-04-04',
      2022: '2022-04-17',
      2023: '2023-04-09',
      2024: '2024-03-31',
      2025: '2025-04-20',
      2026: '2026-04-05',
      2027: '2027-03-28',
      2028: '2028-04-16',
      2029: '2029-04-01',
      2030: '2030-04-21',
    };
    for (const [year, date] of Object.entries(easter)) {
      expect(formatDate(easterSunday(Number(year))), year).toBe(date);
    }
  });

  it('move a weekend Christmas and Boxing Day to the next free weekdays', () => {
    // 2027: Christmas Day is a Saturday, Boxing Day a Sunday.
    expect(rules('england-and-wales', 2027).slice(-2)).toEqual(['2027-12-27', '2027-12-28']);
    // 2022: Christmas Day is a Sunday, so Boxing Day stays on Monday and
    // Christmas Day moves to Tuesday.
    expect(rules('england-and-wales', 2022).slice(-2)).toEqual(['2022-12-26', '2022-12-27']);
    // 2026: Boxing Day is a Saturday (brief 8.5).
    expect(rules('england-and-wales', 2026).slice(-2)).toEqual(['2026-12-25', '2026-12-28']);
  });

  it("give Scotland 2 January, with its own substitute days", () => {
    expect(rules('scotland', 2022).slice(0, 2)).toEqual(['2022-01-03', '2022-01-04']);
    expect(rules('scotland', 2023).slice(0, 2)).toEqual(['2023-01-02', '2023-01-03']);
    expect(rules('scotland', 2027).slice(0, 2)).toEqual(['2027-01-01', '2027-01-04']);
  });

  it("move St Andrew's Day, St Patrick's Day and the Boyne to the Monday after a weekend", () => {
    expect(rules('scotland', 2025)).toContain('2025-12-01');
    expect(rules('northern-ireland', 2024)).toContain('2024-03-18');
    expect(rules('northern-ireland', 2026)).toContain('2026-07-13');
  });

  it('give Scotland no Easter Monday and an early summer holiday', () => {
    expect(rules('scotland', 2026)).not.toContain('2026-04-06');
    expect(rules('scotland', 2026)).toContain('2026-08-03');
    expect(rules('england-and-wales', 2026)).toContain('2026-08-31');
  });
});

// The one-off days in the official list (D74's note of 29 Oct 2026, and D75).
// Where a one-off moved a usual bank holiday, the usual day it replaced is part
// of the same exception.
const ONE_OFFS: readonly {
  readonly nations: readonly Nation[];
  readonly year: number;
  readonly what: string;
  readonly onlyInOfficialList: readonly string[];
  readonly onlyInRules: readonly string[];
}[] = [
  {
    nations: NATIONS,
    year: 2020,
    what: 'VE Day: the Early May bank holiday moved from Mon 4 May to Fri 8 May',
    onlyInOfficialList: ['2020-05-08'],
    onlyInRules: ['2020-05-04'],
  },
  {
    nations: NATIONS,
    year: 2022,
    what: 'the Platinum Jubilee: the Spring bank holiday moved to Thu 2 Jun, plus Fri 3 Jun',
    onlyInOfficialList: ['2022-06-02', '2022-06-03'],
    onlyInRules: ['2022-05-30'],
  },
  {
    nations: NATIONS,
    year: 2022,
    what: "the Queen's funeral, Mon 19 Sep",
    onlyInOfficialList: ['2022-09-19'],
    onlyInRules: [],
  },
  {
    nations: NATIONS,
    year: 2023,
    what: 'the coronation, Mon 8 May',
    onlyInOfficialList: ['2023-05-08'],
    onlyInRules: [],
  },
  {
    nations: ['scotland'],
    year: 2026,
    what: "Scotland's World Cup bank holiday, Mon 15 Jun (D75)",
    onlyInOfficialList: ['2026-06-15'],
    onlyInRules: [],
  },
];

describe('the rules against the official list (D74)', () => {
  it('give exactly the official list for every year it covers, apart from the named one-offs', () => {
    const differences: string[] = [];
    const expected: string[] = [];
    let yearsCompared = 0;

    for (const nation of NATIONS) {
      const list = official.nations[nation];
      for (const year of [...list.coveredYears].sort()) {
        yearsCompared += 1;
        const fromList = new Set((list.byYear.get(year) ?? []).map((h) => formatDate(h.day)));
        const fromRules = new Set(rules(nation, year));
        for (const date of fromList) {
          if (!fromRules.has(date)) differences.push(`${nation} ${date}: only in the official list`);
        }
        for (const date of fromRules) {
          if (!fromList.has(date)) differences.push(`${nation} ${date}: only in the rules`);
        }
        for (const oneOff of ONE_OFFS) {
          if (oneOff.year !== year || !oneOff.nations.includes(nation)) continue;
          for (const date of oneOff.onlyInOfficialList) {
            expected.push(`${nation} ${date}: only in the official list`);
          }
          for (const date of oneOff.onlyInRules) {
            expected.push(`${nation} ${date}: only in the rules`);
          }
        }
      }
    }

    // 3 nations × 2019 to 2028, so the comparison really ran.
    expect(yearsCompared).toBe(30);
    expect(differences.sort()).toEqual(expected.sort());
  });
});
