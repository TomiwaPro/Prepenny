'use client';

// Import a backup (brief 4.12, step 3h): a file from Download my data takes
// the place of the person's own plan, once every part of it has been
// checked (lib/backup.ts) and the person has said yes.
//
// - Signed in: in their account and on this phone (data/sync.ts,
//   importIntoAccount), never into a plan shared with someone else.
// - Not signed in: on this phone (importOnPhone).
// - With no plan of their own yet: the backup becomes their plan.
// The file is read on the phone and never sent anywhere as it is.

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { hasPartner, partnerOf, useSharedPlan } from '../data/shared-plan.ts';
import { importIntoAccount, importOnPhone } from '../data/sync.ts';
import { useOwnPlanId } from '../data/your-data.ts';
import { useAccount } from '../lib/account.ts';
import { MOST_BYTES, type ReadBackup, readBackup } from '../lib/backup.ts';
import { formatDay } from '../lib/dates.ts';
import { newId } from '../lib/ids.ts';
import { localToday } from '../lib/today.ts';
import { strings } from '../strings/en-GB.ts';
import { Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { todayOf, usePlanActions } from './PlanProvider.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { Sheet } from './Sheet.tsx';

const t = strings.yourData;

type Ready = Extract<ReadBackup, { ok: true }>;

export function ImportScreen() {
  const account = useAccount();
  const { loaded } = usePlanActions();
  const ownId = useOwnPlanId(loaded?.version ?? 0);
  const shared = useSharedPlan(ownId ?? null, loaded?.version ?? 0);
  const partner = hasPartner(shared) ? partnerOf(shared) : null;
  const signedIn = account.status === 'signed-in';
  const file = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const [ready, setReady] = useState<Ready | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Back from importing: the page was loaded afresh with the new plan.
    if (new URLSearchParams(window.location.search).has('imported')) {
      setDone(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  async function read(chosen: File | undefined) {
    setProblem(null);
    setReady(null);
    if (chosen === undefined) return;
    if (chosen.size > MOST_BYTES) {
      setProblem(t.problems['too-big'] ?? null);
      return;
    }
    setSaid(t.checking);
    let text: string;
    try {
      text = await chosen.text();
    } catch {
      setSaid('');
      setProblem(t.problems.unreadable ?? null);
      return;
    }
    const got = readBackup(text, {
      today: todayOf({ isExample: false, id: '' }),
      newId: () => newId(),
    });
    setSaid('');
    if (!got.ok) {
      setProblem(t.problems[got.problem] ?? t.problems.server ?? null);
      return;
    }
    setReady(got);
  }

  async function bringIn(backup: Ready) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setSaid(t.importing);
    const planId = newId();
    if (signedIn) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setBusy(false);
        setSaid('');
        setProblem(t.problems.offline ?? null);
        return;
      }
      const result = await importIntoAccount(planId, backup.records);
      if (!result.ok) {
        setBusy(false);
        setSaid('');
        setReady(null);
        setProblem(
          result.problem === 'shared-plan'
            ? t.sharedNoImport(partner?.name ?? strings.share.someone)
            : (t.problems[result.problem] ?? t.problems.server ?? null),
        );
        return;
      }
    } else {
      try {
        await importOnPhone(planId, backup.records);
      } catch {
        setBusy(false);
        setSaid('');
        setReady(null);
        setProblem(t.problems.server ?? null);
        return;
      }
    }
    // Loaded afresh, so every screen starts from the plan that came in.
    window.location.replace('/app/import/?imported');
  }

  const header = (
    <ScreenHeader
      heading={t.import}
      purpose={t.importPurpose}
      back={{ label: t.backToMore, href: '/app/more/' }}
    />
  );

  if (done) {
    return (
      <>
        {header}
        <section className={styles.card} data-testid="imported">
          <p className={styles.line} role="status">
            {t.imported}
          </p>
          <div className={styles.actions}>
            <Link className={formStyles.main} href="/app/">
              {t.goHome}
            </Link>
          </div>
        </section>
      </>
    );
  }

  if (partner !== null) {
    return (
      <>
        {header}
        <section className={styles.card} data-testid="import-shared">
          <p className={styles.line}>{t.sharedNoImport(partner.name ?? strings.share.someone)}</p>
          <div className={styles.actions}>
            <Link className={formStyles.outlined} href="/app/share/">
              {t.goToShare}
            </Link>
          </div>
        </section>
      </>
    );
  }

  const hasPlan = ownId !== null && ownId !== undefined;
  return (
    <>
      {header}
      <section className={styles.card} aria-labelledby="what-happens-heading">
        <h2 id="what-happens-heading" className={styles.cardTitle}>
          {t.whatHappensHeading}
        </h2>
        <p className={styles.line}>
          {!hasPlan ? t.becomesPlan : signedIn ? t.replacesPlan : t.replacesPlanHere}
        </p>
        {hasPlan ? (
          <p className={styles.line}>
            <Link href="/app/download/">{t.downloadFirst}</Link>
          </p>
        ) : null}
      </section>
      <section className={styles.card} aria-labelledby="choose-heading">
        <h2 id="choose-heading" className={styles.cardTitle}>
          {t.chooseFile}
        </h2>
        <p className={styles.line} id="choose-hint">
          {t.chooseFileHint}
        </p>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="backup-file"
          onChange={(event) => {
            void read(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={formStyles.main}
            aria-describedby="choose-hint"
            aria-disabled={busy}
            onClick={() => file.current?.click()}
          >
            {t.chooseFile}
          </button>
        </div>
        <p className={styles.line} role="status">
          {said}
        </p>
        <Problem text={problem} />
      </section>
      <Sheet
        open={ready !== null}
        title={t.confirmTitle}
        intro={
          ready === null
            ? null
            : [
                ready.madeAt === null
                  ? null
                  : t.madeOn(
                      formatDay(
                        localToday(new Date(ready.madeAt)),
                        todayOf({ isExample: false, id: '' }),
                      ),
                    ),
                t.holds(
                  ready.counts.accounts,
                  ready.counts.payments,
                  ready.counts.debts,
                  ready.counts.goals,
                ),
                hasPlan ? t.replaceWarning : null,
              ]
                .filter((one) => one !== null)
                .join(' ')
        }
        closeLabel={strings.sheet.goBack}
        onClose={() => {
          if (!busy) setReady(null);
        }}
      >
        <div className={formStyles.actions}>
          <button
            type="button"
            className={formStyles.main}
            aria-disabled={busy}
            onClick={() => {
              if (ready !== null) void bringIn(ready);
            }}
          >
            {hasPlan ? t.confirmReplace : t.confirmImport}
          </button>
          <button
            type="button"
            className={formStyles.quiet}
            onClick={() => {
              if (!busy) setReady(null);
            }}
          >
            {t.keepPlan}
          </button>
          <p className={styles.line} role="status">
            {busy ? t.importing : ''}
          </p>
        </div>
      </Sheet>
    </>
  );
}
