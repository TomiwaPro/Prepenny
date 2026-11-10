'use client';

// "This is my pay" (D314, D418, step 3f): shared pay that someone else
// added, such as the pay Tom typed in for Jess before she joined, becomes
// the pay of the person it's for. Then they can change it, even with "Can
// view only" (D311), and add their overtime or a missed shift to it (D303).
// The server refuses while the other person has overtime or job details on
// it, which only they can take off.

import { useState } from 'react';
import { syncNow } from '../data/sync.ts';
import { claimPay } from '../lib/sharing.ts';
import { strings } from '../strings/en-GB.ts';
import { Problem } from './Fields.tsx';
import styles from './Form.module.css';

const t = strings.share;

export function ClaimPay({
  planId,
  familyId,
  who,
}: {
  readonly planId: string;
  readonly familyId: string;
  /** The person whose pay it is now. */
  readonly who: string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className={styles.lede} role="status" data-testid="claimed">
        {t.claimed}
      </p>
    );
  }
  return (
    <div className={styles.actions} data-testid="claim-pay">
      <p className={styles.lede}>{t.paidBy(who)}</p>
      <p className={styles.lede}>{t.claimLine}</p>
      <Problem text={problem} />
      <button
        type="button"
        className={styles.outlined}
        aria-disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setProblem(null);
          const answer = await claimPay(planId, familyId);
          setBusy(false);
          if (answer.ok) {
            setDone(true);
            void syncNow();
            return;
          }
          const kind = answer.problem.kind;
          setProblem(
            kind === 'pay-has-details'
              ? t.claimHasDetails(who)
              : kind === 'offline'
                ? t.offline
                : t.problem,
          );
        }}
      >
        {t.claim}
      </button>
    </div>
  );
}
