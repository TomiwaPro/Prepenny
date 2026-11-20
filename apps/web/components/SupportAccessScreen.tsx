'use client';

// "Let support see my plan", under More, Security (step 4j, brief 4.16,
// question 13, D618). For 7 days PrePenny support can see the plan exactly
// as this person sees it, read only: their own accounts and the shared ones,
// never their partner's private ones. In a shared plan the partner is told
// in Activity. It can be stopped at any time, and stops by itself after 7
// days. The database decides all of it (supabase/migrations, step 4j).

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { hasPartner, partnerOf, useSharedPlan } from '../data/shared-plan.ts';
import { useAccount } from '../lib/account.ts';
import { momentWords } from '../lib/device-words.ts';
import {
  type AccessState,
  endSupportAccess,
  giveSupportAccess,
  mySupportAccess,
  type ToolsProblem,
} from '../lib/support-tools.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';

const t = strings.supportAccess;

type Loaded =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly offline: boolean }
  | { readonly kind: 'ready'; readonly access: AccessState };

function problemWords(problem: ToolsProblem): string {
  if (problem === 'offline') return t.offline;
  if (problem === 'no-plan') return t.noPlan;
  return t.server;
}

export function SupportAccessScreen() {
  const account = useAccount();
  const { loaded: plan } = usePlanActions();
  const planId = plan !== null && !plan.plan.isExample ? plan.plan.id : null;
  const shared = useSharedPlan(planId, plan?.version ?? 0);
  const other = hasPartner(shared) ? partnerOf(shared) : null;
  const partner = other === null ? null : (other.name ?? strings.together.yourPartner);
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const card = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    const answer = await mySupportAccess();
    setLoaded(
      answer.ok
        ? { kind: 'ready', access: answer.value }
        : { kind: 'failed', offline: answer.problem === 'offline' },
    );
  }, []);

  useEffect(() => {
    if (account.status === 'signed-in') void load();
  }, [account.status, load]);

  async function change(give: boolean) {
    if (busy !== null) return;
    setProblem(null);
    setSaid('');
    setBusy(give ? t.giving : t.ending);
    const done = give ? await giveSupportAccess() : await endSupportAccess();
    setBusy(null);
    if (!done.ok) {
      setProblem(problemWords(done.problem));
      return;
    }
    setLoaded({ kind: 'ready', access: done.value });
    setSaid(
      done.value.on && done.value.endsAt !== null
        ? t.given(momentWords(done.value.endsAt))
        : t.ended,
    );
    // The button tapped has gone: focus goes to the card, which says what's true now.
    card.current?.focus();
  }

  const header = (
    <ScreenHeader
      heading={t.heading}
      purpose={t.purpose}
      back={{ label: t.back, href: '/app/more/' }}
    />
  );

  if (account.status !== 'signed-in') {
    return (
      <>
        {header}
        <section className={styles.card} data-testid="support-access">
          <p className={styles.line}>{t.signedOut}</p>
          <div className={styles.actions}>
            <Link className={formStyles.outlined} href="/sign-in/?from=more">
              {t.signIn}
            </Link>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {header}
      {partner === null ? null : <p className={styles.line}>{t.shared(partner)}</p>}
      {/* Heard, not shown: the card below says the same in its own words. */}
      <p className="visually-hidden" role="status" data-testid="support-access-said">
        {busy ?? said}
      </p>
      {loaded.kind === 'loading' ? (
        <section className={styles.card}>
          <p className={styles.line}>{t.loading}</p>
        </section>
      ) : loaded.kind === 'failed' ? (
        <section className={styles.card}>
          <p className={styles.line}>{loaded.offline ? t.offline : t.server}</p>
          <div className={styles.actions}>
            <button type="button" className={formStyles.outlined} onClick={() => void load()}>
              {t.tryAgain}
            </button>
          </div>
        </section>
      ) : (
        <section ref={card} tabIndex={-1} className={styles.card} data-testid="support-access">
          {loaded.access.on && loaded.access.endsAt !== null ? (
            <>
              <p className={styles.line}>{t.on(momentWords(loaded.access.endsAt))}</p>
              <p className={styles.second}>
                {loaded.access.lastLookedAt === null
                  ? t.notLooked
                  : t.lastLooked(momentWords(loaded.access.lastLookedAt))}
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={formStyles.outlined}
                  aria-disabled={busy !== null}
                  onClick={() => void change(false)}
                >
                  {t.end}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.line}>{t.off}</p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={formStyles.main}
                  aria-disabled={busy !== null}
                  onClick={() => void change(true)}
                >
                  {t.give}
                </button>
              </div>
            </>
          )}
        </section>
      )}
      <div role="alert">
        {problem === null ? null : <p className={formStyles.problem}>{problem}</p>}
      </div>
    </>
  );
}
