// One row of the plan, from the engine's figures: the date tile, the name,
// its date (with "estimate" or "paid"), the amount and "Left after this",
// with Tight or Short in words (VOICE.md). Tapping it opens the edit sheet.

import { dateTile, formatDay } from '../lib/dates.ts';
import { formatMoney } from '../lib/money.ts';
import type { RowView } from '../lib/rows.ts';
import { strings } from '../strings/en-GB.ts';
import { PaymentRow } from './PaymentRow.tsx';

/** "Fri 30 Oct", "Fri 30 Oct, estimate", "Sun 25 Oct, paid". */
export function secondLine(row: RowView, today: string): string {
  const day = formatDay(row.date, today);
  if (row.isEstimate && row.ticked) return strings.rows.estimatePaid(day);
  if (row.isEstimate) return strings.rows.estimate(day);
  if (row.ticked) return strings.rows.paid(day);
  return day;
}

export function RowItem({
  row,
  today,
  onOpen,
}: {
  readonly row: RowView;
  readonly today: string;
  readonly onOpen: (row: RowView) => void;
}) {
  return (
    <PaymentRow
      rowKey={row.key}
      tile={dateTile(row.date)}
      name={row.name}
      second={secondLine(row, today)}
      third={row.isLowest ? strings.rows.lowestPoint : null}
      amount={formatMoney(row.change, { sign: 'always' })}
      moneyIn={row.change > 0}
      left={strings.rows.left(formatMoney(row.leftAfter))}
      status={row.status === 'ok' ? null : row.status}
      onOpen={() => onOpen(row)}
    />
  );
}
