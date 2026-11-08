'use client';

// "Signed in as sam@example.com." with "Sign out" beside it, on the screens
// that can't reach More: the welcome, every setup step, and "Choose which
// plan to keep" (D353). "Sign out" opens the same sheet as on More, which
// says first if anything would be lost.

import { useState } from 'react';
import { openDb, ownPlanOnPhone } from '../data/db.ts';
import { useAccount } from '../lib/account.ts';
import { setupDone } from '../lib/setup-progress.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import type { OwnPlan } from './PlanProvider.tsx';
import styles from './SignedInLine.module.css';
import { SignOutSheet } from './SignOutSheet.tsx';

const t = strings.account;

/**
 * The person's own plan on this phone, as the sign-out sheet needs it: a
 * plan with nothing in it yet has nothing to lose, so it counts as none.
 */
async function ownPlanNow(): Promise<OwnPlan> {
  try {
    const db = openDb();
    try {
      const own = await ownPlanOnPhone(db);
      if (own === undefined) return 'none';
      const something = await db.records
        .where('planId')
        .equals(own.id)
        .filter((record) => record.kind === 'account' || record.kind === 'series')
        .count();
      if (something === 0) return 'none';
      return setupDone(own.setup) ? 'ready' : 'setting-up';
    } finally {
      db.close();
    }
  } catch {
    // No database on this phone, as in some private windows: nothing is kept.
    return 'none';
  }
}

export function SignedInLine() {
  const account = useAccount();
  const [asking, setAsking] = useState(false);
  const [ownPlan, setOwnPlan] = useState<OwnPlan>('none');
  if (account.status !== 'signed-in') return null;
  return (
    <>
      <div className={styles.line} data-testid="signed-in">
        <p className={styles.who}>{t.signedInWelcome(account.email)}</p>
        <button
          type="button"
          className={`${formStyles.quiet} ${styles.signOut}`}
          aria-haspopup="dialog"
          onClick={async () => {
            setOwnPlan(await ownPlanNow());
            setAsking(true);
          }}
        >
          {t.signOut}
        </button>
      </div>
      {/* Outside the centred line, so the sheet reads as it does on More. */}
      <SignOutSheet open={asking} ownPlan={ownPlan} onClose={() => setAsking(false)} />
    </>
  );
}
