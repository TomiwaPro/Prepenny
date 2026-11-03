// What Home shows while the engine works in the background: the shapes of
// its cards, never a spinner (brief Part 6). Screen readers hear one line.

import { strings } from '../strings/en-GB.ts';
import styles from './HomeSkeleton.module.css';

export function HomeSkeleton() {
  return (
    <div className={styles.skeleton} data-testid="home-skeleton">
      <p className="visually-hidden">{strings.loading.plan}</p>
      <div className={`${styles.block} ${styles.balance}`} aria-hidden="true">
        <span className={`${styles.bar} ${styles.onNavy} ${styles.short}`} />
        <span className={`${styles.bar} ${styles.onNavy} ${styles.big}`} />
        <span className={`${styles.bar} ${styles.onNavy} ${styles.medium}`} />
        <span className={`${styles.raised}`} />
      </div>
      {['lowest', 'cover', 'due'].map((card) => (
        <div key={card} className={`${styles.block} ${styles.card}`} aria-hidden="true">
          <span className={`${styles.bar} ${styles.short}`} />
          <span className={`${styles.bar} ${styles.medium}`} />
          <span className={`${styles.bar} ${styles.long}`} />
        </div>
      ))}
    </div>
  );
}
