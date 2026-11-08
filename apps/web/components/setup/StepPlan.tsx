'use client';

// Screen 6, here's your plan (brief 4.1, the sketch in ARCHITECTURE.md 4.6,
// step 2e, D356): the lowest point ahead, Left to spend, the first debt paid
// off and the first savings goal reached, worked out by the engine from what
// the person typed, then what to do from now on. Savings left setup, so a
// card below asks "Saving for something?" and "Add a goal" opens the savings
// goal sheet, the same as under More, saving each goal as one thing setup
// added. Then "Go to my plan". Nothing here can be skipped: it's the end of
// setup.

import type { EditCommand } from '@prepenny/engine';
import { useId, useMemo, useState } from 'react';
import { formatDay } from '../../lib/dates.ts';
import { timeInOrder } from '../../lib/ids.ts';
import { formatMoney } from '../../lib/money.ts';
import { NEW_ACCOUNT } from '../../lib/setup-forms.ts';
import type { SetupSummary } from '../../lib/setup-view.ts';
import { strings } from '../../strings/en-GB.ts';
import { FigureCard } from '../FigureCard.tsx';
import formStyles from '../Form.module.css';
import { GoalSheet, type GoalStart } from '../GoalSheet.tsx';
import { type ChangeOutcome, type PlanActions, PlanActionsOverride } from '../PlanProvider.tsx';
import styles from './Setup.module.css';
import { useSetup } from './SetupProvider.tsx';
import { AddedList, StepFrame } from './StepFrame.tsx';
import { useStep } from './useStep.ts';

const t = strings.setup.plan;

const notHere = async (): Promise<ChangeOutcome> => ({ ok: false, code: 'not-ready' });

function Summary({ summary, today }: { readonly summary: SetupSummary; readonly today: string }) {
  const day = (date: string) => formatDay(date, today);
  const lowest = summary.lowest;
  // One warning at a time, with the exact amount and date (VOICE.md).
  const warning =
    lowest.short !== null
      ? strings.home.shortOn(formatMoney(lowest.short.amount), day(lowest.short.date))
      : lowest.underWarningFrom !== null
        ? strings.home.underWarningFrom(
            formatMoney(summary.warningLevel, { wholePounds: true }),
            day(lowest.underWarningFrom),
          )
        : null;
  const left = summary.leftToSpend;
  return (
    <div className={styles.figures} data-testid="setup-summary">
      <FigureCard
        testId="setup-lowest"
        label={t.lowestPoint}
        status={lowest.status === 'ok' ? null : lowest.status}
        figure={formatMoney(lowest.balance)}
        detail={
          lowest.after === null ? day(lowest.date) : t.lowestOnAfter(day(lowest.date), lowest.after)
        }
        context={warning ?? t.inAccount(summary.accountName)}
      />
      {left === null ? null : (
        <FigureCard
          testId="setup-left-to-spend"
          label={
            left.runsTo === 'payday'
              ? t.leftToSpendUntil(day(left.until))
              : t.leftToSpendTo(day(left.until))
          }
          status={null}
          figure={formatMoney(left.amount)}
          detail={summary.accountName}
          context={null}
        />
      )}
      {summary.firstDebt === null ? null : (
        <section className={styles.reached} data-testid="setup-first-debt">
          <h2 className={styles.reachedLabel}>{t.firstDebt}</h2>
          <p className={styles.reachedLine}>
            {(summary.firstDebt.isEstimate ? t.onDateEstimate : t.onDate)(
              summary.firstDebt.name,
              day(summary.firstDebt.date),
            )}
          </p>
        </section>
      )}
      {summary.firstGoal === null ? null : (
        <section className={styles.reached} data-testid="setup-first-goal">
          <h2 className={styles.reachedLabel}>{t.firstGoal}</h2>
          <p className={styles.reachedLine}>
            {(summary.firstGoal.isEstimate ? t.onDateEstimate : t.onDate)(
              summary.firstGoal.name,
              day(summary.firstGoal.date),
            )}
          </p>
        </section>
      )}
    </div>
  );
}

/**
 * The plan's own actions for the savings goal sheet, so it saves into setup:
 * each goal is one thing setup added, which Remove takes back (D221, D356).
 */
function useSetupGoalActions(onAdded: (name: string) => void): PlanActions | null {
  const { state, save } = useSetup();
  return useMemo(() => {
    if (state.status !== 'ready' || state.plan === null) return null;
    const add = async (commands: readonly EditCommand[]): Promise<ChangeOutcome> => {
      const goal = commands.find((one) => one.kind === 'add-goal');
      if (goal === undefined || goal.kind !== 'add-goal') return { ok: false, code: 'unexpected' };
      const outcome = await save({ commands, item: { kind: 'goal', id: goal.goal.id } });
      if (!outcome.ok) return outcome;
      onAdded(goal.goal.name);
      return { ok: true, version: state.version + 1 };
    };
    return {
      loaded: {
        plan: state.plan,
        records: state.records,
        today: state.today,
        version: state.version,
      },
      needsSetup: true,
      ownPlan: 'setting-up',
      lastChange: null,
      makeChange: (command) => add([command]),
      makeChanges: (commands) => add(commands),
      undoLastChange: notHere,
      dismissLastChange: () => {},
      startAgainWithExample: notHere,
      showPlan: async () => {},
    };
  }, [state, save, onAdded]);
}

export function StepPlan() {
  const step = useStep(6);
  const summary = step.view?.summary ?? null;
  const askId = useId();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Said once a goal is added or removed, for everyone, screen reader or not.
  const [said, setSaid] = useState<string | null>(null);
  const actions = useSetupGoalActions(
    useMemo(() => (name: string) => setSaid(t.goalAdded(name)), []),
  );
  const goals = step.items('goal').flatMap((item) => {
    const goal = step.records.goals?.find((one) => one.id === item.id);
    if (goal === undefined) return [];
    const account = step.records.accounts.find((one) => one.id === goal.accountId);
    return [
      {
        id: item.id,
        name: goal.name,
        line: strings.setup.savings.card(formatMoney(goal.target), account?.name ?? ''),
        onRemove: async () => {
          if (await step.removeItem(item.id)) setSaid(t.goalRemoved(goal.name));
        },
        problem: step.removeProblem(item.id),
      },
    ];
  });
  // As setup's old savings step did: a savings account if there is one, the
  // second account, or a new savings account (D226).
  const start: GoalStart = (() => {
    const keptIn =
      step.accounts.find((one) => one.kind === 'savings')?.id ??
      (step.accounts.length > 1 ? (step.accounts[1]?.id ?? NEW_ACCOUNT) : NEW_ACCOUNT);
    const from = step.accounts.find((one) => one.id !== keptIn)?.id ?? step.accounts[0]?.id ?? '';
    return { keptIn, from };
  })();
  return (
    <StepFrame
      step={6}
      title={t.title}
      intro={t.intro}
      onNext={async () => {
        step.setBusy(true);
        const outcome = await step.save({ commands: [], step: 'done' });
        if (!outcome.ok) {
          step.setBusy(false);
          step.setProblem(strings.setup.problem);
        }
      }}
      onBack={() => step.go(5)}
      nextLabel={t.goToMyPlan}
      busy={step.busy}
      problem={step.problem}
      outside={
        actions === null ? null : (
          <PlanActionsOverride value={actions}>
            <GoalSheet
              open={sheetOpen}
              goal={null}
              onClose={() => setSheetOpen(false)}
              madeAt={timeInOrder}
              start={start}
            />
          </PlanActionsOverride>
        )
      }
    >
      {summary === null ? (
        <p className={styles.intro} aria-busy="true">
          {t.working}
        </p>
      ) : (
        <Summary summary={summary} today={step.today} />
      )}
      <p className={styles.fromNow} data-testid="from-now">
        {t.fromNow}
      </p>
      <section className={styles.card} aria-labelledby={askId} data-testid="add-goal">
        {/* A question to answer with the button, not a headline (VOICE.md). */}
        <p id={askId} className={styles.cardHeading}>
          {t.goalAsk}
        </p>
        <p className={styles.cardLine}>{t.goalLine}</p>
        <AddedList items={goals} />
        <p className={styles.said} role="status">
          {said}
        </p>
        <button
          data-add-another
          type="button"
          className={formStyles.outlined}
          aria-haspopup="dialog"
          onClick={() => {
            setSaid(null);
            setSheetOpen(true);
          }}
        >
          {goals.length === 0 ? t.addGoal : t.addAnotherGoal}
        </button>
      </section>
    </StepFrame>
  );
}
