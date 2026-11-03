// A payment row (DESIGN.md): a date tile (day number over month), the name
// with its date below, then the amount with "£X left" below, on the right.
// "Left after this" carries a Tight or Short pill when it's under (D85).

import styles from './PaymentRow.module.css';
import { type Status, StatusPill } from './StatusPill.tsx';

export interface PaymentRowProps {
  readonly tile: { readonly day: string; readonly month: string };
  readonly name: string;
  /** "Sun 25 Oct", and "Estimate" when it is one. */
  readonly second: string;
  readonly amount: string;
  /** Money coming in: its amount is green (brief Part 6), and the plus sign says so too. */
  readonly moneyIn: boolean;
  readonly left: string;
  readonly status: Status | null;
}

export function PaymentRow({ tile, name, second, amount, moneyIn, left, status }: PaymentRowProps) {
  return (
    <li className={styles.row}>
      <span className={styles.tile} aria-hidden="true">
        <span className={`${styles.day} num`}>{tile.day}</span>
        <span className={styles.month}>{tile.month}</span>
      </span>
      <span className={styles.middle}>
        <span className={styles.name}>{name}</span>
        <span className={styles.second}>{second}</span>
      </span>
      <span className={styles.right}>
        <span className={`${styles.amount} ${moneyIn ? styles.in : ''} num`}>{amount}</span>
        <span className={styles.leftLine}>
          <span className={`${styles.left} num`}>{left}</span>
          {status === null ? null : <StatusPill status={status} />}
        </span>
      </span>
    </li>
  );
}
