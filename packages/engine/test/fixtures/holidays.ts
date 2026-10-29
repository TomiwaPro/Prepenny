// The official GOV.UK bank holiday list, as downloaded into packages/engine/data
// by .github/workflows/bank-holidays.yml, and a calendar for each nation.

import list from '../../data/bank-holidays.json' with { type: 'json' };
import source from '../../data/bank-holidays.source.json' with { type: 'json' };
import { bankHolidayCalendar, type Nation, parseBankHolidayList } from '../../src/index.ts';

export const officialJson: unknown = list;
export const officialSource = source;
export const official = parseBankHolidayList(list);

export const englandAndWales = bankHolidayCalendar('england-and-wales', official);
export const scotland = bankHolidayCalendar('scotland', official);
export const northernIreland = bankHolidayCalendar('northern-ireland', official);

export function calendarFor(nation: Nation) {
  return bankHolidayCalendar(nation, official);
}

/** No bank holidays at all: only weekends are non-working days. */
export const noBankHolidays = { isBankHoliday: () => false };
