// The balance card (DESIGN.md): navy, the account, its balance and when it
// was checked, a thin brass line, then a raised block with Left to spend.
//
// Since step 3f-2 (D430), when money has moved since the bank was checked,
// the big figure is about what's there now, "About £237.54 now", and the line
// under it says what the bank showed and when. Sam's example says the day
// it's shown as on instead: "Example plan, as on Sun 25 Oct 2026" (D440).

import { type ReactNode, useId } from 'react';
import { figureStyle } from '../lib/figure.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './BalanceCard.module.css';

const t = strings.home;

/** Room for "About" and "now" beside the figure, in the figure's em, so all three fit on one line where they can. */
const ABOUT_NOW_WIDTH = 2.3;

export interface BalanceCardProps {
  readonly account: string;
  /** What the bank showed at the last check: "£267.54". */
  readonly balance: string;
  /**
   * When nothing has moved since the check: "Checked today, Sun 8 Nov",
   * under the bank's figure, or in Sam's example "Example plan, as on Sun 25
   * Oct 2026" (D440).
   */
  readonly checked: string;
  /**
   * When money has moved since the check: about what's there now, "£237.54",
   * shown as "About £237.54 now", with the bank's figure in the line under it.
   */
  readonly now?: {
    readonly amount: string;
    /** "today", or "on Sun 8 Nov", after "Bank: £267.54" (D450); none in Sam's example, whose next line says the day (D440). */
    readonly when?: string;
    /** Sam's example only: "Example plan, as on Sun 25 Oct 2026", under the bank's figure (D440). */
    readonly asOn?: string;
  };
  /** The raised block: "Left to spend until Fri 30 Oct", £30.00 and its lines. */
  readonly raised?: {
    readonly label: string;
    readonly amount: string;
    readonly lines: readonly ReactNode[];
  };
}

export function BalanceCard({ account, balance, checked, now, raised }: BalanceCardProps) {
  const headingId = useId();
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <div className={styles.top}>
        <h2 id={headingId} className={styles.account}>
          {account}
        </h2>
        {now === undefined ? (
          <>
            <p
              className={`${styles.balance} num`}
              style={figureStyle(balance)}
              data-testid="balance"
            >
              {balance}
            </p>
            <p className={styles.checked} data-testid="checked">
              {checked}
            </p>
          </>
        ) : (
          <>
            <p
              className={`${styles.balance} ${styles.aboutNow} num`}
              style={figureStyle(now.amount, ABOUT_NOW_WIDTH)}
              data-testid="now"
            >
              <span className={styles.aboutWord}>{t.about}</span>{' '}
              <span data-testid="now-amount">{now.amount}</span>{' '}
              <span className={styles.aboutWord}>{t.now}</span>
            </p>
            <p className={styles.checked} data-testid="bank-showed">
              {t.bankShowed}{' '}
              <span className="num" data-testid="balance">
                {balance}
              </span>
              {now.when === undefined ? null : ` ${now.when}`}
            </p>
            {now.asOn === undefined ? null : (
              <p className={styles.checked} data-testid="checked">
                {now.asOn}
              </p>
            )}
          </>
        )}
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
