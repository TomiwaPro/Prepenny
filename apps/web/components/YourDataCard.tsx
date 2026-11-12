'use client';

// "Your data" on More (brief 4.12, 4.13, step 3h): Download my data, Import
// a backup and Delete my account and all my data, each a whole row that
// opens its screen, with a line saying what's there (D213).

import Link from 'next/link';
import { useAccount } from '../lib/account.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './Screens.module.css';

const t = strings.yourData;

function Row({
  href,
  label,
  line,
}: {
  readonly href: string;
  readonly label: string;
  readonly line: string;
}) {
  return (
    <li>
      <Link className={styles.rowLink} href={href}>
        <span className={styles.rowBody}>
          <span className={styles.rowName}>{label}</span>
          <span className={styles.second}>{line}</span>
        </span>
        <span className={styles.arrow} aria-hidden="true" />
      </Link>
    </li>
  );
}

export function YourDataCard() {
  const account = useAccount();
  return (
    <nav className={styles.card} aria-labelledby="your-data-heading" data-testid="your-data">
      <h2 id="your-data-heading" className={styles.cardTitle}>
        {t.heading}
      </h2>
      <p className={styles.second}>{t.purpose}</p>
      <ul className={styles.list}>
        <Row href="/app/download/" label={t.download} line={t.downloadLine} />
        <Row href="/app/import/" label={t.import} line={t.importLine} />
        <Row
          href="/app/delete/"
          label={t.delete}
          line={account.status === 'signed-in' ? t.deleteLine : t.deleteLineHere}
        />
      </ul>
    </nav>
  );
}
