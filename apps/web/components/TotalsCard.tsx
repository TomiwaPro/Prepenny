// A card of totals, such as "This pay has to cover": a heading, then each
// label with its amount on the right.

import styles from './TotalsCard.module.css';

export interface TotalsCardProps {
  readonly heading: string;
  readonly rows: readonly { readonly label: string; readonly amount: string }[];
  readonly testId?: string;
}

export function TotalsCard({ heading, rows, testId }: TotalsCardProps) {
  return (
    <section className={styles.card} data-testid={testId}>
      <h2 className={styles.heading}>{heading}</h2>
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
