'use client';

// Plans on the support screen, read only (step 4j, D618):
// - the plan someone let support see, exactly as their own phone gets it
//   (support_plan gives the same rows as plan_changes does to them), turned
//   into records the same way their phone does, and worked out by the engine;
// - a plan copy sent with Something looks wrong, read as Import reads it.
// Once their access ends, the database refuses at once, and this says so.

import type { PlanRecords } from '@prepenny/engine';
import { useEffect, useState } from 'react';
import { readBackup } from '../lib/backup.ts';
import { newId } from '../lib/ids.ts';
import { supportFile, supportPlan } from '../lib/support-tools.ts';
import { type PlanChangesRows, recordsFromRows, rowsOfChanges } from '../lib/sync-rows.ts';
import { supportStrings } from '../strings/support-en-GB.ts';
import { ReadOnlyPlan } from './ReadOnlyPlan.tsx';
import styles from './Screens.module.css';
import { supportToday, ViewHeader, when } from './SupportScreen.tsx';

const t = supportStrings.supportTools;

type Loaded =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly words: string }
  | {
      readonly kind: 'ready';
      readonly records: PlanRecords;
      readonly endsAt: string | null;
    };

/** The plan someone let support see, while they let it. */
export function SupportPlanView({ person }: { readonly person: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [look, setLook] = useState(0);

  // Looked at again every minute, and the moment it ends, so a plan never
  // stays on screen after the person has stopped it (D638).
  useEffect(() => {
    const timer = setInterval(() => setLook((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
  const endsAt = loaded.kind === 'ready' ? loaded.endsAt : null;
  useEffect(() => {
    if (endsAt === null) return;
    const wait = Date.parse(endsAt) - Date.now();
    if (!(wait > 0 && wait < 2 ** 31 - 1)) return;
    const timer = setTimeout(() => setLook((n) => n + 1), wait + 1000);
    return () => clearTimeout(timer);
  }, [endsAt]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: looked at again when `look` counts up
  useEffect(() => {
    void supportPlan(person).then((answer) => {
      if (!answer.ok) {
        setLoaded({
          kind: 'failed',
          words:
            answer.problem === 'no-access'
              ? t.accessEnded
              : answer.problem === 'no-plan'
                ? t.noPlan
                : t.couldNotLoad,
        });
        return;
      }
      try {
        const rows = rowsOfChanges(answer.value as unknown as PlanChangesRows);
        const { records } = recordsFromRows(rows, person);
        setLoaded({
          kind: 'ready',
          records,
          endsAt: typeof answer.value.ends_at === 'string' ? answer.value.ends_at : null,
        });
      } catch {
        setLoaded({ kind: 'failed', words: t.notAPlan });
      }
    });
  }, [person, look]);

  return (
    <>
      <ViewHeader
        heading={t.planViewHeading}
        purpose={t.planViewPurpose}
        back={{ label: t.backToAccount, href: `#account=${person}` }}
      />
      {loaded.kind === 'ready' ? (
        <>
          {loaded.endsAt === null ? null : (
            <p className={styles.line} data-testid="support-plan-until">
              {t.accessUntil(when(loaded.endsAt))}
            </p>
          )}
          <ReadOnlyPlan records={loaded.records} today={supportToday()} />
        </>
      ) : (
        <section className={styles.card} data-testid="support-plan-needs">
          <p className={styles.line}>{loaded.kind === 'failed' ? loaded.words : t.loading}</p>
        </section>
      )}
    </>
  );
}

/** A plan copy sent with Something looks wrong, worked out as from today. */
export function SupportCopyView({ message }: { readonly message: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });

  useEffect(() => {
    void supportFile(message).then((answer) => {
      if (!answer.ok || answer.value.contentType !== 'application/json') {
        setLoaded({ kind: 'failed', words: answer.ok ? t.notAPlan : t.couldNotLoad });
        return;
      }
      try {
        const bytes = Uint8Array.from(atob(answer.value.data), (char) => char.charCodeAt(0));
        const text = new TextDecoder().decode(bytes);
        const read = readBackup(text, { today: supportToday(), newId: () => newId() });
        setLoaded(
          read.ok
            ? { kind: 'ready', records: read.records, endsAt: null }
            : { kind: 'failed', words: t.notAPlan },
        );
      } catch {
        setLoaded({ kind: 'failed', words: t.notAPlan });
      }
    });
  }, [message]);

  return (
    <>
      <ViewHeader
        heading={t.planCopyHeading}
        purpose={t.planCopyPurpose}
        back={{ label: t.backToMessage, href: `#message=${message}` }}
      />
      {loaded.kind === 'ready' ? (
        <ReadOnlyPlan records={loaded.records} today={supportToday()} />
      ) : (
        <section className={styles.card} data-testid="support-plan-needs">
          <p className={styles.line}>{loaded.kind === 'failed' ? loaded.words : t.loading}</p>
        </section>
      )}
    </>
  );
}
