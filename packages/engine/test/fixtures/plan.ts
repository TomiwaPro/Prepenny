// Short ways to write accounts, balance updates, ticks and whole plans in
// tests, and to read a plan back as plain text.

import {
  type Account,
  type AccountPlan,
  type BalanceUpdate,
  formatPounds,
  type Payment,
  type Plan,
  type PlanInput,
  type PlanRow,
  paidDate,
  parsePounds,
  type Tick,
} from '../../src/index.ts';
import { noBankHolidays } from './holidays.ts';

export const pounds = parsePounds;

export function account(id: string, fields: Partial<Account> = {}): Account {
  return { id, kind: 'current', overdraftLimit: 0, warningLevel: pounds('20.00'), ...fields };
}

export function balanceUpdate(
  accountId: string,
  balance: string,
  checkedOn: string,
  checkedAt = `${checkedOn}T09:00:00Z`,
  id = `${accountId}-${checkedAt}`,
): BalanceUpdate {
  return { id, accountId, balance: pounds(balance), checkedOn, checkedAt };
}

/** A tick on a payment, with its paid date worked out as D71 says. */
export function tick(
  payment: Payment,
  tickedAt: string,
  fields: { tickedOn?: string; inBalanceUpdate?: string } = {},
): Tick {
  const tickedOn = fields.tickedOn ?? tickedAt.slice(0, 10);
  return {
    seriesId: payment.seriesId,
    originalDate: payment.originalDate,
    tickedAt,
    paidOn: paidDate(payment.date, tickedOn),
    ...(fields.inBalanceUpdate === undefined ? {} : { inBalanceUpdate: fields.inBalanceUpdate }),
  };
}

export function planInput(fields: Partial<PlanInput> & Pick<PlanInput, 'today' | 'to'>): PlanInput {
  return {
    accounts: [account('current')],
    balanceUpdates: [],
    series: [],
    changes: [],
    ticks: [],
    mainPayFamilyId: null,
    holidays: noBankHolidays,
    ...fields,
  };
}

export function accountOf(plan: Plan, id = 'current'): AccountPlan {
  const found = plan.accounts.find((one) => one.account.id === id);
  if (found === undefined) throw new Error(`No account ${id} in the plan.`);
  return found;
}

/** A row as text: "2026-10-26 Driving lesson -100.00 12.54". */
export function rowText(row: PlanRow): string {
  return `${row.date} ${row.payment.name} ${formatPounds(row.change)} ${formatPounds(row.leftAfter)}`;
}

/** Every row of an account, as text. */
export function rowsText(plan: Plan, id = 'current'): string[] {
  return accountOf(plan, id).rows.map(rowText);
}

/** The end-of-day balances of an account from `from` to `to`, as [date, pounds]. */
export function daysText(plan: Plan, id: string, from: string, to: string): [string, string][] {
  return accountOf(plan, id)
    .days.filter((day) => day.date >= from && day.date <= to)
    .map((day) => [day.date, formatPounds(day.balance)]);
}
