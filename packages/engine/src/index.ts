// @prepenny/engine: PrePenny's money engine. Pure TypeScript with no screens,
// no network, no storage and no clock: "today" and the bank holiday list are
// passed in (brief Part 5, ARCHITECTURE.md section 2).
//
// Step 1a: money, dates, bank holidays and repeating payments.

export {
  type BankHoliday,
  easterSunday,
  NATIONS,
  type Nation,
  usualBankHolidays,
} from './dates/bank-holiday-rules.ts';
export {
  BankHolidayCalendar,
  type BankHolidaySource,
  bankHolidayCalendar,
  type OfficialBankHolidays,
  type OfficialNationList,
  parseBankHolidayList,
} from './dates/bank-holidays.ts';
export {
  addDays,
  addMonths,
  type DateParts,
  type Day,
  dayFromParts,
  dayOfMonthOrLast,
  daysInMonth,
  FIRST_YEAR,
  FRIDAY,
  formatDate,
  isLeapYear,
  LAST_YEAR,
  lastDayOfMonth,
  MONDAY,
  monthFromNumber,
  monthNumber,
  monthNumberOfDay,
  parseDate,
  partsOfDay,
  SATURDAY,
  SUNDAY,
  THURSDAY,
  TUESDAY,
  WEDNESDAY,
  type Weekday,
  type WeekdayPosition,
  weekday,
  weekdayOfMonth,
} from './dates/day.ts';
export {
  type BankHolidayLookup,
  isWeekend,
  isWorkingDay,
  LONGEST_RUN_WITHOUT_A_WORKING_DAY,
  lastWorkingDayOfMonth,
  workingDayOnOrAfter,
  workingDayOnOrBefore,
} from './dates/working-days.ts';
export { EngineInputError } from './errors.ts';
export { fromOtherCurrency, type MinorUnits, toOtherCurrency } from './money/currency.ts';
export {
  type Decimal,
  divideRounded,
  multiplyDecimals,
  parseDecimal,
  roundDecimal,
} from './money/decimal.ts';
export {
  checkPence,
  checkPenceNotNegative,
  formatPounds,
  isPence,
  multiplyPence,
  multiplyToPence,
  type Pence,
  parsePounds,
  poundsToPence,
  sumPence,
} from './money/pence.ts';
export {
  applyHolidayRule,
  type PaymentNumberRequest,
  type PaymentsRequest,
  paymentByNumber,
  workOutPayments,
} from './schedule/payments.ts';
export type {
  Direction,
  EndRule,
  HolidayRule,
  MonthlyDay,
  Payment,
  PaymentChange,
  Schedule,
  Series,
} from './schedule/types.ts';
