// A card of payment rows with a heading, such as "Next due", and an optional
// link on the right, such as "See the plan".

import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './PaymentList.module.css';

export interface PaymentListProps {
  readonly heading: string;
  readonly link?: { readonly label: string; readonly href: string };
  /** Shown when there are no rows. */
  readonly empty: string;
  readonly children: ReactNode;
  readonly testId?: string;
}

export function PaymentList({ heading, link, empty, children, testId }: PaymentListProps) {
  const hasRows = Array.isArray(children) ? children.length > 0 : children != null;
  return (
    <section className={styles.card} data-testid={testId}>
      <div className={styles.head}>
        <h2 className={styles.heading}>{heading}</h2>
        {link === undefined ? null : (
          <Link className={styles.link} href={link.href}>
            {link.label}
          </Link>
        )}
      </div>
      {hasRows ? (
        <ul className={styles.rows}>{children}</ul>
      ) : (
        <p className={styles.empty}>{empty}</p>
      )}
    </section>
  );
}
