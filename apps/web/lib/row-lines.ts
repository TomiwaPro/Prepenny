// A row's second line, in words: its date, with "estimate", "paid" or
// "arrived" (D278). Used by the plan's rows and by the read-only plan on
// the support dashboard, which has none of the app's plan storage (D642).

import { strings } from '../strings/en-GB.ts';
import { formatDay } from './dates.ts';
import type { RowView } from './rows.ts';

/** "Fri 30 Oct", "Fri 30 Oct, estimate", "Sun 25 Oct, paid", or "arrived" for money coming in (D278). */
export function secondLine(row: RowView, today: string): string {
  const day = formatDay(row.date, today);
  const comingIn = row.flow === 'in' || row.flow === 'transfer-in';
  if (row.isEstimate && row.ticked)
    return comingIn ? strings.rows.estimateArrived(day) : strings.rows.estimatePaid(day);
  if (row.isEstimate) return strings.rows.estimate(day);
  if (row.ticked) return comingIn ? strings.rows.arrived(day) : strings.rows.paid(day);
  return day;
}
