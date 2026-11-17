'use client';

// "Reminders" on More (step 4e, D560): one row that opens them.

import Link from 'next/link';
import { strings } from '../strings/en-GB.ts';
import styles from './Screens.module.css';

const t = strings.reminders.more;

export function RemindersCard() {
  return (
    <nav className={styles.card} aria-labelledby="reminders-heading" data-testid="reminders-card">
      <h2 id="reminders-heading" className={styles.cardTitle}>
        {t.heading}
      </h2>
      <ul className={styles.list}>
        <li>
          <Link className={styles.rowLink} href="/app/reminders/">
            <span className={styles.rowBody}>
              <span className={styles.rowName}>{t.link}</span>
              <span className={styles.second}>{t.line}</span>
            </span>
            <span className={styles.arrow} aria-hidden="true" />
          </Link>
        </li>
      </ul>
    </nav>
  );
}
