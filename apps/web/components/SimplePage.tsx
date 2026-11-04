// A page that's still being built: its heading, what it's for in one plain
// sentence (D213), and one line saying it's still being built.

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
  /** "This page is still being built.", in a card under the sentence. */
  readonly line?: string;
  readonly children?: ReactNode;
}) {
  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.heading}>{heading}</h1>
        <p className={styles.purpose}>{purpose}</p>
      </header>
      {line === undefined ? null : (
        <section className={styles.card}>
          <p>{line}</p>
        </section>
      )}
      {children}
    </>
  );
}
