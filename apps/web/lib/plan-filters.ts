// The Plan screen's filters (brief 4.8): still to pay, money in, debts, and
// a type. The account is the switch at the top. Filters only hide rows: every
// figure, "Left after this" included, is still worked out from the whole
// plan (D184).

import type { PaymentType } from '@prepenny/engine';
import type { RowView } from './rows.ts';

export type Show = 'everything' | 'still-to-pay' | 'money-in' | 'debts';

export interface Filters {
  readonly show: Show;
  readonly type: PaymentType | 'all';
}

export const NO_FILTERS: Filters = { show: 'everything', type: 'all' };

/** How many filters are on: 0, 1 or 2. */
export function filtersOn(filters: Filters): number {
  return (filters.show === 'everything' ? 0 : 1) + (filters.type === 'all' ? 0 : 1);
}

function shows(row: RowView, show: Show): boolean {
  switch (show) {
    case 'still-to-pay':
      // Going out and not ticked as paid yet.
      return row.change < 0 && !row.ticked;
    case 'money-in':
      return row.change > 0;
    case 'debts':
      // Linked to a debt, or of the type Debt (D79).
      return row.linkedToDebt || row.type === 'debt';
    default:
      return true;
  }
}

export function rowMatches(row: RowView, filters: Filters): boolean {
  return shows(row, filters.show) && (filters.type === 'all' || row.type === filters.type);
}
