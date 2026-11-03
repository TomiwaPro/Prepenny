// The website's first page for now: the name, the tagline (brief Part 6) and
// a way into the example plan. Setup comes in step 2e, the full landing page
// in Phase 5.

import Link from 'next/link';
import { strings } from '../strings/en-GB.ts';
import styles from './welcome.module.css';

export default function Welcome() {
  return (
    <main className={styles.page}>
      <h1 className={styles.name}>{strings.app.name}</h1>
      <p className={styles.tagline}>{strings.app.tagline}</p>
      <p className={styles.description}>{strings.app.description}</p>
      <Link className={styles.button} href="/app/">
        {strings.welcome.lookAtExample}
      </Link>
    </main>
  );
}
