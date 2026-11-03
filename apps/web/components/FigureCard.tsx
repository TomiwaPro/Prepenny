// A figure card (DESIGN.md): a label, a status pill with its word, a big
// figure, its date and cause, and one line of context.

import { figureStyle } from '../lib/figure.ts';
import styles from './FigureCard.module.css';
import { type Status, StatusPill } from './StatusPill.tsx';

export interface FigureCardProps {
  readonly label: string;
  readonly status: Status | null;
  readonly figure: string;
  readonly detail: string;
  readonly context: string | null;
  readonly testId?: string;
}

export function FigureCard({ label, status, figure, detail, context, testId }: FigureCardProps) {
  return (
    <section className={styles.card} data-testid={testId}>
      <div className={styles.head}>
        <h2 className={styles.label}>{label}</h2>
        {status === null ? null : <StatusPill status={status} />}
      </div>
      <p className={`${styles.figure} num`} style={figureStyle(figure)}>
        {figure}
      </p>
      <p className={styles.detail}>{detail}</p>
      {context === null ? null : <p className={styles.context}>{context}</p>}
    </section>
  );
}
