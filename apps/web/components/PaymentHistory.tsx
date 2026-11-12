'use client';

// A payment's History, at the foot of its edit sheet (step 3g, D469): every
// change to this one payment, newest first, who made it and when, from what
// to what: "Tom changed it from £550.00 to £560.00, Tue 10 Nov, 2:05pm". Kept
// for as long as the plan exists. The server gives only what this person
// could see when each change was made and can still see now.
//
// It's the account's history, so it's only here for a plan kept in an
// account, and only looked up when asked for: "Show its history".

import { useId, useState } from 'react';
import {
  type ActivityContext,
  activityEditsFrom,
  activityPeopleFrom,
} from '../lib/activity-words.ts';
import { type HistoryLine, type HistoryPayment, historyLines } from '../lib/payment-history.ts';
import { paymentHistory } from '../lib/sharing.ts';
import { localToday } from '../lib/today.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './Form.module.css';

const h = strings.together.history;

type Found =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly offline: boolean }
  | { readonly kind: 'ready'; readonly lines: readonly HistoryLine[] };

export function PaymentHistory({
  planId,
  me,
  nicknames,
  payment,
}: {
  readonly planId: string;
  readonly me: string;
  readonly nicknames: Readonly<Record<string, string>>;
  readonly payment: HistoryPayment;
}) {
  const id = useId();
  const [found, setFound] = useState<Found>({ kind: 'hidden' });

  async function show() {
    setFound({ kind: 'loading' });
    const answer = await paymentHistory(planId, payment.familyId, payment.originalDate);
    if (!answer.ok) {
      setFound({ kind: 'failed', offline: answer.problem.kind === 'offline' });
      return;
    }
    const context: ActivityContext = {
      me,
      // Someone who has left the plan still has their name here (D468).
      nicknames: { ...activityPeopleFrom(answer.value), ...nicknames },
      today: localToday(),
      nameOf: () => null,
      comesIn: () => payment.comesIn,
    };
    setFound({
      kind: 'ready',
      lines: historyLines(activityEditsFrom(answer.value), payment, context),
    });
  }

  return (
    <section className={styles.history} aria-labelledby={`${id}-heading`} data-testid="history">
      <h3 id={`${id}-heading`} className={styles.subheading}>
        {h.heading}
      </h3>
      <p className={styles.hint}>{h.intro}</p>
      {found.kind === 'ready' ? (
        found.lines.length === 0 ? (
          <p className={styles.lede} role="status">
            {h.empty}
          </p>
        ) : (
          <ul className={styles.historyList} data-testid="history-lines">
            {found.lines.map((line) => (
              <li key={line.id} className={styles.historyLine} data-testid="history-line">
                {line.words}
                {line.undone ? <span className={styles.historyUndone}>{h.undone}</span> : null}
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className={styles.lede} role="status">
          {found.kind === 'loading'
            ? h.loading
            : found.kind === 'failed'
              ? found.offline
                ? h.offline
                : h.problem
              : ''}
        </p>
      )}
      <button
        type="button"
        className={styles.outlined}
        aria-expanded={found.kind === 'ready'}
        aria-disabled={found.kind === 'loading'}
        onClick={() => {
          if (found.kind === 'loading') return;
          if (found.kind === 'ready') setFound({ kind: 'hidden' });
          else void show();
        }}
      >
        {found.kind === 'ready' ? h.hide : h.show}
      </button>
    </section>
  );
}
