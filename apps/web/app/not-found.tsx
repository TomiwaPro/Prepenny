import Link from 'next/link';
import { strings } from '../strings/en-GB.ts';
import styles from './welcome.module.css';

export default function NotFound() {
  return (
    <main className={styles.page}>
      <h1 className={styles.tagline}>{strings.notFound.heading}</h1>
      <Link className={styles.button} href="/app/">
        {strings.notFound.goHome}
      </Link>
    </main>
  );
}
