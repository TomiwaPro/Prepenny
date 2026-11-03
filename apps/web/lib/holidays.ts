// The built-in GOV.UK bank holiday list (brief 5.7), read once. Fresher copies
// from PrePenny's own site come in Phase 4 (D57).

import {
  type BankHolidayCalendar,
  bankHolidayCalendar,
  type Nation,
  type OfficialBankHolidays,
  parseBankHolidayList,
} from '@prepenny/engine';
import officialList from '@prepenny/engine/data/bank-holidays.json';

let official: OfficialBankHolidays | null = null;

export function officialHolidays(): OfficialBankHolidays {
  official ??= parseBankHolidayList(officialList);
  return official;
}

export function holidaysFor(nation: Nation): BankHolidayCalendar {
  return bankHolidayCalendar(nation, officialHolidays());
}

export function englandAndWales(): BankHolidayCalendar {
  return holidaysFor('england-and-wales');
}
