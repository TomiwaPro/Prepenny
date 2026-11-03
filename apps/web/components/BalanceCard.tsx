// The balance card (DESIGN.md): navy, the account, its balance and when it
// was checked, a thin brass line, then a raised block with Left to spend.

import type { ReactNode } from 'react';
import styles from './BalanceCard.module.css';

export interface BalanceCardProps {
  readonly account: string;
  readonly balance: string;
  readonly checked: string;
  /** The raised block: "Left to spend until Fri 30 Oct", £30.00 and its lines. */
  readonly raised?: {
    readonly label: string;
    readonly amount: string;
    readonly lines: readonly ReactNode[];
  };
}

export function BalanceCard({ account, balance, checked, raised }: BalanceCardProps) {
  return (
    <section className={styles.card} aria-labelledby="balance-account">
      <div className={styles.top}>
        <h2 id="balance-account" className={styles.account}>
          {account}
        </h2>
        <p className={`${styles.balance} num`} data-testid="balance">
          {balance}
        </p>
        <p className={styles.checked}>{checked}</p>
      </div>
      {raised === undefined ? null : (
        <>
          <hr className={styles.line} />
          <div className={styles.raised}>
            <div className={styles.raisedTop}>
              <h3 className={styles.raisedLabel}>{raised.label}</h3>
              <p className={`${styles.raisedAmount} num`} data-testid="left-to-spend">
                {raised.amount}
              </p>
            </div>
            {raised.lines.map((line, index) => (
              // The lines never change order, so their place is their key.
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of lines
              <p key={index} className={styles.raisedLine}>
                {line}
              </p>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
