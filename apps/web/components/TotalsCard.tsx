// A card of totals, such as "This pay has to cover": a heading, an optional
// line under it, such as "Pay £603.06, came in today", then each label with
// its amount on the right.

import styles from './TotalsCard.module.css';

export interface TotalsCardProps {
  readonly heading: string;
  /** A line under the heading. */
  readonly lead?: string | null;
  readonly rows: readonly { readonly label: string; readonly amount: string }[];
  readonly testId?: string;
}

export function TotalsCard({ heading, lead = null, rows, testId }: TotalsCardProps) {
  return (
    <section className={styles.card} data-testid={testId}>
      <h2 className={styles.heading}>{heading}</h2>
      {lead === null ? null : <p className={`${styles.lead} num`}>{lead}</p>}
      <dl className={styles.list}>
        {rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <dt className={styles.label}>{row.label}</dt>
            <dd className={`${styles.amount} num`}>{row.amount}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
