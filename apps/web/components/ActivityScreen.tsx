'use client';

// Activity, under More (brief 4.12 and 4.14, step 3g, D456 and D457): every
// change to the plan for as long as it exists (D469), newest first, by day,
// each in plain words with its time, from what to what: "Tom changed Rent on
// Tue 1 Dec from £550.00 to £560.00." A
// person's own changes have "Undo this change", while nothing they changed
// has been changed again since; their partner's never do. The server decides
// what each person sees: their own changes, and their partner's shared ones,
// with nothing private (supabase/migrations, step 3g).
//
// Activity is the account's history, so it needs signing in and a signal.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { partnerOf, useSharedPlan } from '../data/shared-plan.ts';
import { allSent, onPlanBroughtDown, syncNow, useSync } from '../data/sync.ts';
import { useAccount } from '../lib/account.ts';
import {
  type ActivityContext,
  type ActivityEdit,
  activityEditsFrom,
  activityPeopleFrom,
  activityWords,
  shownAt,
} from '../lib/activity-words.ts';
import { formatDay, formatTime } from '../lib/dates.ts';
import { planActivity, undoChange } from '../lib/sharing.ts';
import { localToday } from '../lib/today.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './ActivityScreen.module.css';
import { Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import screenStyles from './Screens.module.css';

const t = strings.together;

type Loaded =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly offline: boolean }
  | {
      readonly kind: 'ready';
      readonly edits: readonly ActivityEdit[];
      readonly more: boolean;
      /** Everyone who is or was in the plan, by name: someone who left still has theirs (D468). */
      readonly people: Readonly<Record<string, string>>;
    };

/** "Today", "Yesterday" or "Tue 10 Nov", by this phone's own dates. */
function dayHeading(day: string, today: string): string {
  if (day === today) return t.today;
  const [year, month, date] = today.split('-').map(Number) as [number, number, number];
  const yesterday = new Date(year, month - 1, date - 1);
  if (day === localToday(yesterday)) return t.yesterdayHeading;
  return formatDay(day, today);
}

export function ActivityScreen() {
  const account = useAccount();
  const sync = useSync();
  const { loaded } = usePlanActions();
  const planId = loaded !== null && !loaded.plan.isExample ? loaded.plan.id : null;
  const shared = useSharedPlan(planId, loaded?.version ?? 0);
  const [found, setFound] = useState<Loaded>({ kind: 'loading' });
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [older, setOlder] = useState(false);
  const kept = account.status === 'signed-in' && sync.kept && planId !== null;

  const load = useCallback(async () => {
    if (planId === null) return;
    const answer = await planActivity(planId);
    if (!answer.ok) {
      setFound({ kind: 'failed', offline: answer.problem.kind === 'offline' });
      return;
    }
    const more = (answer.value as { more?: unknown } | null)?.more === true;
    setFound({
      kind: 'ready',
      edits: activityEditsFrom(answer.value),
      more,
      people: activityPeopleFrom(answer.value),
    });
  }, [planId]);

  useEffect(() => {
    if (kept) void load();
  }, [kept, load]);
  // A change from the other phone, or this one, shows here as soon as it's brought down.
  useEffect(() => onPlanBroughtDown(() => void load()), [load]);

  const partner = partnerOf(shared);
  const header = (
    <ScreenHeader
      heading={t.heading}
      purpose={
        partner === null ? t.purpose : t.purposeShared(partner.name ?? strings.share.someone)
      }
      back={{ label: t.back, href: '/app/more/' }}
    />
  );

  if (loaded?.plan.isExample === true) {
    return (
      <>
        {header}
        <section className={screenStyles.card}>
          <p className={screenStyles.line}>{t.onExample}</p>
        </section>
      </>
    );
  }
  if (!kept) {
    return (
      <>
        {header}
        <section className={screenStyles.card} data-testid="activity-sign-in">
          <p className={screenStyles.line}>{t.signInFirst}</p>
          {account.status === 'signed-out' ? (
            <div className={screenStyles.actions}>
              <Link className={formStyles.main} href="/sign-in/?from=more">
                {t.signIn}
              </Link>
            </div>
          ) : null}
        </section>
      </>
    );
  }
  if (found.kind !== 'ready') {
    return (
      <>
        {header}
        <section className={screenStyles.card}>
          <p className={screenStyles.line} role={found.kind === 'failed' ? 'alert' : undefined}>
            {found.kind === 'loading' ? t.loading : found.offline ? t.offline : t.couldNotLoad}
          </p>
          {found.kind === 'failed' ? (
            <div className={screenStyles.actions}>
              <button
                type="button"
                className={formStyles.outlined}
                onClick={() => {
                  setFound({ kind: 'loading' });
                  void load();
                }}
              >
                {t.tryAgain}
              </button>
            </div>
          ) : null}
        </section>
      </>
    );
  }

  const records = loaded?.records;
  const today = localToday();
  const context: ActivityContext = {
    me: shared?.personId ?? (account.status === 'signed-in' ? account.id : ''),
    nicknames: { ...found.people, ...(shared?.nicknames ?? {}) },
    today,
    nameOf: (table, id) => {
      const list =
        table === 'series'
          ? records?.series
          : table === 'accounts'
            ? records?.accounts
            : table === 'budgets'
              ? records?.budgets
              : table === 'debts'
                ? records?.debts
                : table === 'goals'
                  ? records?.goals
                  : undefined;
      const name = (list as readonly { id: string; name?: string }[] | undefined)?.find(
        (one) => one.id === id,
      )?.name;
      return name === undefined || name === '' ? null : name;
    },
    comesIn: (seriesId) => {
      const series = records?.series.find((one) => one.id === seriesId);
      return series === undefined ? null : series.direction === 'in';
    },
  };

  async function undo(edit: ActivityEdit) {
    if (undoing !== null || planId === null) return;
    setUndoing(edit.id);
    setProblem(null);
    setSaid(t.undoing);
    // Undone on the server, on what the account has now: nothing waiting here first.
    if (!(await allSent())) {
      setUndoing(null);
      setSaid('');
      setProblem(t.undoWaiting);
      return;
    }
    const done = await undoChange(planId, edit.id);
    setUndoing(null);
    if (!done.ok) {
      setSaid('');
      const kind = done.problem.kind;
      setProblem(
        kind === 'changed-since'
          ? t.undoChangedSince
          : kind === 'not-allowed' || kind === 'view-only'
            ? t.undoViewOnly
            : kind === 'offline'
              ? t.offline
              : t.undoProblem,
      );
      if (kind === 'changed-since' || kind === 'undone-already') void load();
      return;
    }
    await syncNow();
    setSaid(t.undoneDone);
    await load();
  }

  async function showOlder() {
    if (planId === null || found.kind !== 'ready' || older) return;
    const last = found.edits.at(-1);
    if (last === undefined) return;
    setOlder(true);
    const answer = await planActivity(planId, shownAt(last));
    setOlder(false);
    if (!answer.ok) {
      setProblem(answer.problem.kind === 'offline' ? t.offline : t.couldNotLoad);
      return;
    }
    const more = (answer.value as { more?: unknown } | null)?.more === true;
    const next = activityEditsFrom(answer.value).filter(
      (one) => !found.edits.some((had) => had.id === one.id),
    );
    setFound({ ...found, edits: [...found.edits, ...next], more });
  }

  const days: { day: string; edits: ActivityEdit[] }[] = [];
  for (const edit of found.edits) {
    const day = localToday(new Date(shownAt(edit)));
    const last = days.at(-1);
    if (last?.day === day) last.edits.push(edit);
    else days.push({ day, edits: [edit] });
  }

  return (
    <>
      {header}
      <p className={screenStyles.line} role="status" data-testid="activity-said">
        {said}
      </p>
      <Problem text={problem} />
      {days.length === 0 ? (
        <section className={screenStyles.card} data-testid="activity-empty">
          <p className={screenStyles.line}>{t.empty}</p>
        </section>
      ) : (
        days.map(({ day, edits }) => (
          <section
            key={day}
            className={screenStyles.card}
            aria-labelledby={`day-${day}`}
            data-testid="activity-day"
          >
            <h2 id={`day-${day}`} className={screenStyles.cardTitle}>
              {dayHeading(day, today)}
            </h2>
            <ul className={screenStyles.list}>
              {edits.map((edit) => {
                const words = activityWords(edit, context);
                return (
                  <li
                    key={edit.id}
                    className={styles.entry}
                    data-testid="activity-entry"
                    data-mine={edit.mine}
                  >
                    <p className={styles.words} id={`edit-${edit.id}`}>
                      {words}
                    </p>
                    <p className={styles.when}>
                      {t.at(formatTime(shownAt(edit)))}
                      {edit.undone ? <span className={styles.undone}>{t.undone}</span> : null}
                    </p>
                    {edit.mine && edit.canUndo && !edit.undone ? (
                      <button
                        type="button"
                        className={formStyles.outlined}
                        aria-describedby={`edit-${edit.id}`}
                        aria-disabled={undoing !== null}
                        onClick={() => void undo(edit)}
                      >
                        {t.undo}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {found.more ? (
        <button
          type="button"
          className={formStyles.outlined}
          aria-disabled={older}
          onClick={() => void showOlder()}
        >
          {older ? t.showingOlder : t.showOlder}
        </button>
      ) : null}
    </>
  );
}
