'use client';

// Savings goals, under More (brief 4.7, D114, D139, D153): what it's for in
// one plain sentence (D213), then each goal with what's saved so far against
// its target, its progress, and the date the plan reaches it, looking 24
// months ahead, marked as an estimate when it depends on one. Each can be
// changed or closed, and money can be planned into it.

import { useState } from 'react';
import { formatDay } from '../lib/dates.ts';
import { formatMoney } from '../lib/money.ts';
import type { GoalCard, GoalsView } from '../lib/money-views.ts';
import { strings } from '../strings/en-GB.ts';
import { AddPaymentSheet } from './AddPaymentSheet.tsx';
import { ConfirmSheet } from './ConfirmSheet.tsx';
import formStyles from './Form.module.css';
import { GoalSheet } from './GoalSheet.tsx';
import { usePlanActions } from './PlanProvider.tsx';
import { ProgressBar, ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { useScreenView } from './useScreenView.ts';

const t = strings.goals;

type Open = { readonly kind: 'change' | 'move' | 'close'; readonly id: string } | 'new' | null;

function reachedWords(goal: GoalCard, view: GoalsView): string {
  const day = (date: string) => formatDay(date, view.today);
  if (goal.reachedNow && goal.reachedOn === null) return t.reached;
  if (goal.reachedOn === null) return t.notReached(formatMoney(goal.savedAtEnd), day(view.to));
  return (goal.isEstimate ? t.reachedOnEstimate : t.reachedOn)(day(goal.reachedOn));
}

function Goal({
  goal,
  view,
  onOpen,
}: {
  readonly goal: GoalCard;
  readonly view: GoalsView;
  readonly onOpen: (kind: 'change' | 'move' | 'close') => void;
}) {
  return (
    <section
      className={styles.card}
      aria-labelledby={`goal-${goal.id}`}
      data-testid="goal"
      data-goal={goal.name}
    >
      <h2 id={`goal-${goal.id}`} className={styles.cardTitle}>
        {goal.name}
      </h2>
      <p className={`${styles.line} num`}>
        {t.savedOf(formatMoney(goal.savedSoFar), formatMoney(goal.target))}
      </p>
      <ProgressBar percent={goal.percentSaved} words={t.percentSaved(goal.percentSaved)} />
      {goal.closed ? (
        <p className={styles.second}>{t.closedLine}</p>
      ) : (
        <>
          <p className={styles.line} data-testid="goal-reached">
            {reachedWords(goal, view)}
          </p>
          {goal.targetDate === null ? null : (
            <p className={styles.second}>
              {t.yourDate(formatDay(goal.targetDate, view.today))}{' '}
              {goal.byTargetDate === true
                ? t.beforeDate
                : goal.byTargetDate === false && goal.reachedOn !== null
                  ? t.afterDate
                  : null}
            </p>
          )}
          <p className={styles.second}>{t.keptIn(goal.accountName)}</p>
          {goal.moves === 0 ? <p className={styles.second}>{t.noMoves}</p> : null}
          <div className={styles.actions}>
            <button
              type="button"
              className={formStyles.outlined}
              aria-haspopup="dialog"
              onClick={() => onOpen('move')}
            >
              {t.addMove(goal.name)}
            </button>
            <button
              type="button"
              className={formStyles.outlined}
              aria-haspopup="dialog"
              onClick={() => onOpen('change')}
            >
              {t.change(goal.name)}
            </button>
            <button
              type="button"
              className={formStyles.quiet}
              aria-haspopup="dialog"
              onClick={() => onOpen('close')}
            >
              {t.close(goal.name)}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function GoalsScreen() {
  const { view, failed } = useScreenView('goals');
  const { makeChange } = usePlanActions();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const chosen =
    open === null || open === 'new'
      ? null
      : (view?.goals.find((one) => one.id === open.id) ?? null);
  const from = view?.accounts.find((one) => one.id !== chosen?.accountId)?.id;
  return (
    <>
      <ScreenHeader
        heading={t.heading}
        purpose={t.purpose}
        back={{ label: t.back, href: '/app/more/' }}
      />
      {view === null ? (
        <p className={styles.card} role={failed ? 'alert' : undefined}>
          {failed ? strings.errors.plan : t.loading}
        </p>
      ) : view.goals.length === 0 ? (
        <section className={styles.card} data-testid="no-goals">
          <h2 className={styles.cardTitle}>{t.none}</h2>
          <p className={styles.line}>{t.noneLine}</p>
        </section>
      ) : (
        view.goals.map((goal) => (
          <Goal
            key={goal.id}
            goal={goal}
            view={view}
            onOpen={(kind) => setOpen({ kind, id: goal.id })}
          />
        ))
      )}
      <button
        type="button"
        className={formStyles.main}
        aria-haspopup="dialog"
        onClick={() => setOpen('new')}
      >
        {t.add}
      </button>
      {view !== null && view.closed.length > 0 ? (
        <>
          <h2 className={styles.sectionHeading}>{t.closedHeading}</h2>
          {view.closed.map((goal) => (
            <Goal key={goal.id} goal={goal} view={view} onOpen={() => {}} />
          ))}
        </>
      ) : null}
      <GoalSheet
        open={open === 'new' || (open !== null && open.kind === 'change' && chosen !== null)}
        goal={open === 'new' ? null : chosen}
        onClose={close}
      />
      <AddPaymentSheet
        open={open !== null && open !== 'new' && open.kind === 'move' && chosen !== null}
        onClose={close}
        preset={
          chosen === null
            ? {}
            : {
                direction: 'transfer',
                name: strings.setup.savings.moveName(chosen.name),
                ...(from === undefined ? {} : { accountId: from }),
                toAccountId: chosen.accountId,
                type: 'savings',
                link: `goal:${chosen.id}`,
              }
        }
      />
      <ConfirmSheet
        open={open !== null && open !== 'new' && open.kind === 'close' && chosen !== null}
        title={strings.closing.goalTitle}
        intro={strings.closing.goalIntro}
        confirm={strings.closing.goalConfirm}
        keep={strings.closing.keep}
        onConfirm={() =>
          makeChange(
            { kind: 'close-goal', goalId: chosen?.id ?? '' },
            strings.closing.goalClosed(chosen?.name ?? ''),
          )
        }
        onClose={close}
      />
    </>
  );
}
