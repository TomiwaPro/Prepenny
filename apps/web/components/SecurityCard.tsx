'use client';

// "Security" on More (brief 4.13, step 3e): App lock, for this phone, and,
// once signed in, Signed-in devices, Two-step sign-in and Email addresses,
// each a whole row that opens its screen, with a line saying what's there (D213).

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { useAccount } from '../lib/account.ts';
import { lockOn } from '../lib/app-lock.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './Screens.module.css';

const t = strings.security;

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

export function SecurityCard() {
  const account = useAccount();
  const locked = useSyncExternalStore(
    () => () => undefined,
    lockOn,
    () => false,
  );
  return (
    <nav className={styles.card} aria-labelledby="security-heading" data-testid="security">
      <h2 id="security-heading" className={styles.cardTitle}>
        {t.heading}
      </h2>
      <p className={styles.second}>{t.purpose}</p>
      <ul className={styles.list}>
        <Row href="/app/lock/" label={t.lock} line={locked ? t.lockOn : t.lockOff} />
        {account.status === 'signed-in' ? (
          <>
            <Row href="/app/devices/" label={t.devices} line={t.devicesLine} />
            <Row href="/app/two-step/" label={t.twoStep} line={t.twoStepOff} />
            <Row href="/app/email/" label={t.emails} line={t.emailsLine} />
          </>
        ) : null}
      </ul>
    </nav>
  );
}
