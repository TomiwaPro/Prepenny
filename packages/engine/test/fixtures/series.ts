// A short way to write a series in tests. Every field can be overridden.

import {
  type BankHolidayLookup,
  type Payment,
  type PaymentChange,
  type Series,
  workOutPayments,
} from '../../src/index.ts';
import { noBankHolidays } from './holidays.ts';

export function series(fields: Partial<Series> & Pick<Series, 'start' | 'schedule'>): Series {
  return {
    id: 'test-series',
    accountId: 'current',
    name: 'Test payment',
    direction: 'out',
    amount: 1000,
    end: { kind: 'never' },
    holidayRule: 'keep',
    isEstimate: false,
    ...fields,
  };
}

export interface Window {
  readonly from: string;
  readonly to: string;
  readonly holidays?: BankHolidayLookup;
  readonly changes?: readonly PaymentChange[];
}

/** The payments of one series in a window. */
export function paymentsOf(one: Series, window: Window): Payment[] {
  return workOutPayments({
    series: [one],
    changes: window.changes ?? [],
    holidays: window.holidays ?? noBankHolidays,
    from: window.from,
    to: window.to,
  });
}

/** Just the dates of one series' payments in a window. */
export function datesOf(one: Series, window: Window): string[] {
  return paymentsOf(one, window).map((payment) => payment.date);
}
