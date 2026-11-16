'use client';

// "Home screen" on More (step 4d, D546, D548): the steps to add PrePenny to
// the home screen are always here, in one row that opens them.

import Link from 'next/link';
import { useHomeScreen } from '../lib/install.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './Screens.module.css';

const t = strings.homeScreen.more;

export function InstallMoreCard() {
  const { asApp } = useHomeScreen();
  return (
    <nav className={styles.card} aria-labelledby="home-screen-heading" data-testid="home-screen">
      <h2 id="home-screen-heading" className={styles.cardTitle}>
        {t.heading}
      </h2>
      <ul className={styles.list}>
        <li>
          <Link className={styles.rowLink} href="/app/home-screen/">
            <span className={styles.rowBody}>
              <span className={styles.rowName}>{t.link}</span>
              <span className={styles.second}>{asApp ? t.lineAdded : t.line}</span>
            </span>
            <span className={styles.arrow} aria-hidden="true" />
          </Link>
        </li>
      </ul>
    </nav>
  );
}
