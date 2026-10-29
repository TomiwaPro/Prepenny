// @prepenny/engine: PrePenny's money engine. Pure TypeScript with no screens,
// no network, no storage and no clock: "today" and the bank holiday list are
// passed in (brief Part 5, ARCHITECTURE.md section 2).
//
// Step 1a: money, dates, bank holidays and repeating payments.
// Step 1b: the balance rule, lowest point, warnings, shortfalls and periods.
// Step 1c: editing, moving, skipping, ticking and undo.
// Step 1d: debts, currencies and credit cards, and "Only this week of the pattern".

export { balanceAtEndOf, workOutPlan } from './balance/plan.ts';
export { paidDate } from './balance/ticks.ts';
export {
  ACCOUNT_KINDS,
  type Account,
  type AccountKind,
  type AccountPlan,
  type BalanceStatus,
  type BalanceUpdate,
  type DayBalance,
  type Flow,
  type MainPayKind,
  type Plan,
  type PlanInput,
  type PlanRow,
  type Shortfall,
  type ShortOnDay,
  type Tick,
} from './balance/types.ts';
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
export { type Moment, parseTime } from './dates/time.ts';
export {
  type BankHolidayLookup,
  isWeekend,
  isWorkingDay,
  LONGEST_RUN_WITHOUT_A_WORKING_DAY,
  lastWorkingDayOfMonth,
  workingDayOnOrAfter,
  workingDayOnOrBefore,
} from './dates/working-days.ts';
export { compareCardPayments } from './debts/compare.ts';
export {
  DEBTS_MONTHS_AHEAD,
  debtsLookAhead,
  workOutDebts,
} from './debts/debts.ts';
export {
  type CardComparison,
  type CardComparisonInput,
  DEBT_KINDS,
  type Debt,
  type DebtKind,
  type DebtPaymentRow,
  type DebtPlan,
  type DebtRow,
  type DebtStatementRow,
  type DebtsInput,
  type DebtsPlan,
  type MinimumRule,
  type PayingOff,
} from './debts/types.ts';
export { editPlan } from './edit/edit.ts';
export { scheduleForNewDate } from './edit/new-date.ts';
export { applyWrites, sameValue } from './edit/records.ts';
export type {
  Edit,
  EditCommand,
  EditInput,
  JustThisOneEdits,
  PaymentRef,
  PlanRecords,
  RecordWrite,
  ThisAndLaterEdits,
  TickInUpdate,
} from './edit/types.ts';
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
  type AccountPeriods,
  groupIntoPeriods,
  type PeriodGrouping,
  type PlanPeriod,
  type PlanPeriods,
} from './periods/periods.ts';
export {
  applyHolidayRule,
  type PaymentNumberRequest,
  type PaymentsRequest,
  paymentByNumber,
  workOutPayments,
} from './schedule/payments.ts';
export {
  type Direction,
  type EndRule,
  type HolidayRule,
  type MonthlyDay,
  PAYMENT_TYPES,
  type Payment,
  type PaymentChange,
  type PaymentType,
  type Schedule,
  type Series,
} from './schedule/types.ts';
