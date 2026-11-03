// A payment row (DESIGN.md): a date tile (day number over month), the name
// with its date below, then the amount with "£X left" below, on the right.
// "Left after this" carries a Tight or Short pill when it's under (D85).
//
// With `onOpen`, the whole row is a button that opens the edit sheet (brief
// 4.4): the row is the "first tap" of brief Part 3, principle 4.

import styles from './PaymentRow.module.css';
import { type Status, StatusPill } from './StatusPill.tsx';

export interface PaymentRowProps {
  readonly tile: { readonly day: string; readonly month: string };
  readonly name: string;
  /** "Sun 25 Oct", and "estimate" or "paid" when it is one. */
  readonly second: string;
  /** A third line under the name, such as "Lowest point ahead". */
  readonly third?: string | null;
  readonly amount: string;
  /** Money coming in: its amount is green (brief Part 6), and the plus sign says so too. */
  readonly moneyIn: boolean;
  readonly left: string;
  readonly status: Status | null;
  /** Opens the edit sheet for this row. */
  readonly onOpen?: () => void;
  /** Finds the row again after the plan changes, to put focus back on it. */
  readonly rowKey?: string;
}

export function PaymentRow({
  tile,
  name,
  second,
  third = null,
  amount,
  moneyIn,
  left,
  status,
  onOpen,
  rowKey,
}: PaymentRowProps) {
  const inside = (
    <>
      <span className={styles.tile} aria-hidden="true">
        <span className={`${styles.day} num`}>{tile.day}</span>
        <span className={styles.month}>{tile.month}</span>
      </span>
      <span className={styles.middle}>
        <span className={styles.name}>{name}</span>
        <span className={styles.second}>{second}</span>
        {third === null ? null : <span className={styles.third}>{third}</span>}
      </span>
      <span className={styles.right}>
        <span className={`${styles.amount} ${moneyIn ? styles.in : ''} num`}>{amount}</span>
        <span className={styles.leftLine}>
          <span className={`${styles.left} num`}>{left}</span>
          {status === null ? null : <StatusPill status={status} />}
        </span>
      </span>
    </>
  );
  return (
    <li className={styles.item}>
      {onOpen === undefined ? (
        <div className={styles.row}>{inside}</div>
      ) : (
        <button
          type="button"
          className={`${styles.row} ${styles.button}`}
          aria-haspopup="dialog"
          data-row-key={rowKey}
          onClick={onOpen}
        >
          {inside}
        </button>
      )}
    </li>
  );
}
