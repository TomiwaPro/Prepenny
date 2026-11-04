'use client';

// Step 8, here's your plan (brief 4.1, the sketch in ARCHITECTURE.md 4.6,
// step 2e): the lowest point ahead, Left to spend, the first debt paid off
// and the first savings goal reached, worked out by the engine from what the
// person typed, then "Go to my plan". Nothing here can be skipped: it's the
// end of setup.

import { formatDay } from '../../lib/dates.ts';
import { formatMoney } from '../../lib/money.ts';
import type { SetupSummary } from '../../lib/setup-view.ts';
import { strings } from '../../strings/en-GB.ts';
import { FigureCard } from '../FigureCard.tsx';
import styles from './Setup.module.css';
import { StepFrame } from './StepFrame.tsx';
import { useStep } from './useStep.ts';

const t = strings.setup.plan;

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
        <section className={styles.card} data-testid="setup-first-debt">
          <h2 className={styles.cardHeading}>{t.firstDebt}</h2>
          <p>
            {(summary.firstDebt.isEstimate ? t.onDateEstimate : t.onDate)(
              summary.firstDebt.name,
              day(summary.firstDebt.date),
            )}
          </p>
        </section>
      )}
      {summary.firstGoal === null ? null : (
        <section className={styles.card} data-testid="setup-first-goal">
          <h2 className={styles.cardHeading}>{t.firstGoal}</h2>
          <p>
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

export function StepPlan() {
  const step = useStep(8);
  const summary = step.view?.summary ?? null;
  return (
    <StepFrame
      step={8}
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
      onBack={() => step.go(7)}
      nextLabel={t.goToMyPlan}
      busy={step.busy}
      problem={step.problem}
    >
      {summary === null ? (
        <p className={styles.intro} aria-busy="true">
          {t.working}
        </p>
      ) : (
        <Summary summary={summary} today={step.today} />
      )}
    </StepFrame>
  );
}
