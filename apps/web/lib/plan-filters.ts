// What the Coming up page shows (brief 4.8, D210): everything, still to pay,
// money coming in, debt payments, or one type. The account is chosen with
// "Switch account", not here. What's shown only hides rows: every figure,
// "Left after this" included, is still worked out from the whole plan (D184).

import type { PaymentType } from '@prepenny/engine';
import type { RowView } from './rows.ts';

export type Show = 'everything' | 'still-to-pay' | 'money-in' | 'debts' | 'type';

export interface Filters {
  readonly show: Show;
  /** The type shown when `show` is "type". Kept while another choice is picked. */
  readonly type: PaymentType;
}

/** "One type, such as Bills": Bills is the type it starts on. */
export const NO_FILTERS: Filters = { show: 'everything', type: 'bills' };

/** True when some rows may be hidden. */
export function filtersOn(filters: Filters): boolean {
  return filters.show !== 'everything';
}

export function rowMatches(row: RowView, filters: Filters): boolean {
  switch (filters.show) {
    case 'still-to-pay':
      // Going out and not ticked as paid yet.
      return row.change < 0 && !row.ticked;
    case 'money-in':
      return row.change > 0;
    case 'debts':
      // Linked to a debt, or of the type Debt (D79).
      return row.linkedToDebt || row.type === 'debt';
    case 'type':
      return row.type === filters.type;
    default:
      return true;
  }
}
