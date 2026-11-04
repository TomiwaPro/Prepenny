// A plain page: its heading, what it's for in one plain sentence (D213),
// what's on it, then one line saying what's still being built.

import type { ReactNode } from 'react';
import styles from './SimplePage.module.css';

export function SimplePage({
  heading,
  purpose,
  line,
  children,
}: {
  readonly heading: string;
  readonly purpose: string;
  /** "Help and your account are still being built.", in a card after what's on the page. */
  readonly line?: string;
  readonly children?: ReactNode;
}) {
  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.heading}>{heading}</h1>
        <p className={styles.purpose}>{purpose}</p>
      </header>
      {children}
      {line === undefined ? null : (
        <section className={styles.card}>
          <p>{line}</p>
        </section>
      )}
    </>
  );
}
