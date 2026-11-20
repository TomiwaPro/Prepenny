'use client';

// PrePenny's own screen when something goes wrong while drawing a screen, in
// place of Next.js's. It shows no details of the problem: they could hold an
// amount or a name (CLAUDE.md).

import Link from 'next/link';
import { useEffect } from 'react';
import styles from '../app/welcome.module.css';
import { noteErrorCode } from '../lib/error-codes.ts';
import { strings } from '../strings/en-GB.ts';

export function ErrorScreen({ onTryAgain }: { readonly onTryAgain: () => void }) {
  // Its code alone, with the screen's name, for support's account page (step 4j, D619).
  useEffect(() => noteErrorCode('screen-broke'), []);
  return (
    <main className={styles.page}>
      <h1 className={styles.tagline}>{strings.errors.screenHeading}</h1>
      <p className={styles.description}>{strings.errors.screen}</p>
      <button type="button" className={styles.button} onClick={onTryAgain}>
        {strings.errors.tryAgain}
      </button>
      <Link className={styles.secondary} href="/app/">
        {strings.notFound.goHome}
      </Link>
    </main>
  );
}
