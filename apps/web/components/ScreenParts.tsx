// Parts shared by the screens under Debts and More (step 2f): the top of a
// screen, with a link back, its heading and what it's for in one plain
// sentence (D213); the progress bar with its words; and the "Estimate" word.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { strings } from '../strings/en-GB.ts';
import styles from './Screens.module.css';

export function ScreenHeader({
  heading,
  purpose,
  back,
}: {
  readonly heading: string;
  readonly purpose: string;
  /** A link back to the screen this one is under, in words: "Back to More". */
  readonly back?: { readonly label: string; readonly href: string };
}) {
  return (
    <header className={styles.header}>
      {back === undefined ? null : (
        <Link className={styles.back} href={back.href}>
          {back.label}
        </Link>
      )}
      <h1 className={styles.heading}>{heading}</h1>
      <p className={styles.purpose}>{purpose}</p>
    </header>
  );
}

/**
 * A progress bar. The bar is only a picture; its words, such as "42% paid",
 * say the same thing for everyone (brief Part 6: colour is never the only
 * signal).
 */
export function ProgressBar({
  percent,
  words,
}: {
  readonly percent: number;
  readonly words: string;
}) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div className={styles.progress}>
      <span className={styles.bar} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${width}%` }} />
      </span>
      <span className={`${styles.progressWords} num`}>{words}</span>
    </div>
  );
}

/** "Estimate", as a word beside a figure that depends on one (brief 4.6, D100). */
export function EstimateTag() {
  return <span className={styles.tag}>{strings.debts.estimate}</span>;
}

/** A line of muted words under a figure. */
export function Second({ children }: { readonly children: ReactNode }) {
  return <p className={styles.second}>{children}</p>;
}
