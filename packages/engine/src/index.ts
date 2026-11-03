// @prepenny/engine: PrePenny's money engine. Pure TypeScript with no screens,
// no network, no storage and no clock: "today" and the bank holiday list are
// passed in (brief Part 5, ARCHITECTURE.md section 2).
//
// Step 1a: money, dates, bank holidays and repeating payments.
// Step 1b: the balance rule, lowest point, warnings, shortfalls and periods.
// Step 1c: editing, moving, skipping, ticking and undo.
// Step 1d: debts, currencies and credit cards, and "Only this week of the pattern".
// Step 1e: budgets, spends, Left to spend, savings goals and "Set aside".
// Step 1f: the take-home pay calculator, "I did overtime" and "I missed a shift".
// Step 1g: What if, the last day of work a payday covers, and speed.

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
  type LeftToSpend,
  type MainPayKind,
  type PayLaterLeft,
  type Plan,
  type PlanInput,
  type PlanRow,
  type RowKind,
  type Shortfall,
  type ShortOnDay,
  type Tick,
} from './balance/types.ts';
export {
  BUDGET_EVERY,
  BUDGET_LEAVES,
  type Budget,
  type BudgetBill,
  type BudgetEvery,
  type BudgetLeaves,
  type BudgetPeriod,
  type BudgetPlan,
  type Spend,
} from './budgets/types.ts';
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
export { workOutGoals } from './goals/goals.ts';
export type { Goal, GoalPlan, GoalRow, GoalsInput, GoalsPlan } from './goals/types.ts';
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
  payAdjustmentForOne,
  type TaxForPeriod,
  type TaxTable,
  taxForPeriod,
} from './pay/income-tax.ts';
export { employeeNationalInsurance, niRound } from './pay/national-insurance.ts';
export {
  checkPayslip,
  PAYSLIP_FIGURES,
  type Payslip,
  type PayslipCheck,
  type PayslipDifference,
  type PayslipFigure,
  takeHomeAsEstimate,
} from './pay/payslip.ts';
export {
  coveredToFromDates,
  lastDayCovered,
  type PayChange,
  workOutPayChange,
} from './pay/shifts.ts';
export {
  checkStudentLoans,
  studentLoanDeduction,
  studentLoanThreshold,
} from './pay/student-loans.ts';
export {
  checkSettings,
  type PayPeriod,
  payPeriodOf,
  pensionOn,
  workOutTakeHome,
} from './pay/take-home.ts';
export { parseTaxCode, type TaxCode } from './pay/tax-code.ts';
export {
  checkTaxYear,
  checkTaxYearFiles,
  PAY_FREQUENCIES,
  type PayFrequency,
  type SourcedFigure,
  STUDENT_LOAN_PLANS,
  type StudentLoanPlan,
  TAX_REGIMES,
  TAX_YEAR_FILES,
  type TaxBand,
  type TaxRegime,
  type TaxYear,
  type TaxYearCheck,
  type TaxYearFile,
  taxYearFor,
  taxYearName,
  taxYearsOf,
} from './pay/tax-year.ts';
export {
  type CoveredTo,
  type EstimateReason,
  type FixedPay,
  type OtherDeduction,
  PAY_LINE_KINDS,
  type PayAdjustment,
  type PayLine,
  type PayLineKind,
  type PayProfile,
  type PaySettings,
  type PayWeek,
  type Pension,
  type TakeHome,
  type TakeHomeInput,
  type WorkedPayLine,
  type YearSoFar,
} from './pay/types.ts';
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
  type SetAside,
} from './schedule/types.ts';
export {
  type AccountOutcome,
  type DebtOutcome,
  type GoalOutcome,
  type WhatIf,
  type WhatIfInput,
  type WhatIfSide,
  whatIf,
} from './whatif/whatif.ts';
