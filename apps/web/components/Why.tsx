'use client';

// The "?" beside what can confuse people (step 4h, brief 4.16, D596), and the
// short sheet it opens: a statement for a title, the person's own figures,
// and a link to its help article. Only three, each beside something that
// really confuses: Home's lowest point, Coming up's "Not ticked yet", and
// the ticking step of Update balance.
//
// The button shows the mark and "Why" (D216), and screen readers hear the
// sheet's title, such as "Why your lowest point is on Sun 1 Nov". It's
// small enough to sit in a line of words without making it taller, with
// 44px to tap all the same. Nothing records that it was opened (D598).

import { HELP_ROUTES } from '../lib/help-routes.ts';
import type { WhyWords } from '../lib/why.ts';
import { strings } from '../strings/en-GB.ts';
import { Sheet } from './Sheet.tsx';
import styles from './Why.module.css';

const t = strings.why;

export function WhyButton({
  title,
  onOpen,
  testId,
}: {
  /** The sheet's title, which is what screen readers hear. */
  readonly title: string;
  readonly onOpen: () => void;
  readonly testId?: string;
}) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={title}
      aria-haspopup="dialog"
      data-testid={testId}
      onClick={onOpen}
    >
      <span className={styles.pill}>
        <span className={styles.mark} aria-hidden="true">
          {t.mark}
        </span>
        <span>{t.button}</span>
      </span>
    </button>
  );
}

export function WhySheet({
  open,
  title,
  intro,
  lines,
  article,
  onClose,
}: WhyWords & {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  return (
    <Sheet open={open} title={title} intro={intro} onClose={onClose}>
      <div className={styles.body} data-testid="why-sheet">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className={styles.readMore}>
          {t.readMore} {/* A plain link, as every link into help is (D588). */}
          <a href={HELP_ROUTES.app.article(article.slug)}>{article.title}</a>
        </p>
      </div>
    </Sheet>
  );
}
