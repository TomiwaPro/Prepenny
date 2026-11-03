// A page that's still being built: its heading and one line saying so.

import type { ReactNode } from 'react';
import styles from './SimplePage.module.css';

export function SimplePage({
  heading,
  line,
  children,
}: {
  readonly heading: string;
  readonly line: string;
  readonly children?: ReactNode;
}) {
  return (
    <>
      <h1 className={styles.heading}>{heading}</h1>
      <section className={styles.card}>
        <p>{line}</p>
      </section>
      {children}
    </>
  );
}
