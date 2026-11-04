'use client';

// The pay calculator in the app, under More (brief 4.15, step 2g). It starts
// from the plan's own pay: the next payday (D81), the main pay's tax
// settings, the payday's saved week (D5) and the last payslip's figures. With
// a result: "Add to plan as the Fri 30 Oct estimate", which makes that
// payday's pay the take-home amount, marked as an estimate, as one change
// with one Undo; and "Save as a pay week", which keeps the lines as one of
// the person's usual weeks, so "I did overtime" can work from them (D5).

import { type PlanRecords, takeHomeAsEstimate } from '@prepenny/engine';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { formatDay } from '../lib/dates.ts';
import { newId } from '../lib/ids.ts';
import { formatMoney } from '../lib/money.ts';
import { calculatorFromPlan, saveWeekCommands } from '../lib/pay-calculator.ts';
import type { PayView } from '../lib/pay-view.ts';
import { refusalMessage } from '../lib/refusals.ts';
import { strings } from '../strings/en-GB.ts';
import { askInBackground } from '../worker/client.ts';
import { describedBy, Field, Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { focusUndoBar } from './focusUndo.ts';
import styles from './PayCalculator.module.css';
import { PayCalculator, type Worked } from './PayCalculator.tsx';
import { usePlanActions } from './PlanProvider.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import screenStyles from './Screens.module.css';
import { Sheet } from './Sheet.tsx';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.pay;

/** What's offered with a result in the app. */
function PlanActions({ worked, view }: { readonly worked: Worked; readonly view: PayView }) {
  const { makeChange, makeChanges } = usePlanActions();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const today = view.today;
  const amount = formatMoney(Math.max(0, worked.result.takeHome));
  const payday = view.paydays.find((one) => one.date === worked.form.payDate) ?? null;
  const next = view.paydays[0] ?? null;
  const day = payday === null ? '' : formatDay(payday.date, today);

  let add: ReactNode;
  if (payday === null) {
    add = (
      <p className={screenStyles.second} data-testid="add-to-plan-note">
        {next === null ? t.noPay : t.notAPayday(formatDay(next.date, today))}
      </p>
    );
  } else if (!payday.isEstimate) {
    add = (
      <p className={screenStyles.second} data-testid="add-to-plan-note">
        {t.alreadyReal(day, formatMoney(payday.amount))}
      </p>
    );
  } else {
    const message = t.added(day, amount);
    add = (
      <div className={formStyles.withHint}>
        <button
          type="button"
          className={formStyles.main}
          aria-disabled={busy}
          aria-describedby="add-to-plan-hint"
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setProblem(null);
            const outcome = await makeChange(takeHomeAsEstimate(payday, worked.result), message);
            setBusy(false);
            if (outcome.ok) focusUndoBar(message);
            else setProblem(refusalMessage(outcome.code));
          }}
        >
          {t.addToPlan(day)}
        </button>
        <p id="add-to-plan-hint" className={formStyles.hint}>
          {payday.adjustment === 0
            ? t.addHint(amount, day)
            : t.addHintOvertime(amount, formatMoney(payday.adjustment), day)}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.actions}>
      {add}
      {view.main === null ? null : (
        <button
          type="button"
          className={formStyles.outlined}
          aria-haspopup="dialog"
          onClick={() => setSaving(true)}
        >
          {t.saveWeek}
        </button>
      )}
      <Problem text={problem} />
      {view.main === null ? null : (
        <SaveWeekSheet
          open={saving}
          worked={worked}
          view={view}
          onClose={() => setSaving(false)}
          makeChanges={makeChanges}
        />
      )}
    </div>
  );
}

function SaveWeekSheet({
  open,
  worked,
  view,
  onClose,
  makeChanges,
}: {
  readonly open: boolean;
  readonly worked: Worked;
  readonly view: PayView;
  readonly onClose: () => void;
  readonly makeChanges: ReturnType<typeof usePlanActions>['makeChanges'];
}) {
  const opened = useOpenCount(open);
  return (
    <Sheet open={open} title={t.saveWeek} intro={t.saveWeekIntro} onClose={onClose}>
      {opened === 0 ? null : (
        <SaveWeekForm
          key={opened}
          worked={worked}
          view={view}
          onDone={onClose}
          makeChanges={makeChanges}
        />
      )}
    </Sheet>
  );
}

function SaveWeekForm({
  worked,
  view,
  onDone,
  makeChanges,
}: {
  readonly worked: Worked;
  readonly view: PayView;
  readonly onDone: () => void;
  readonly makeChanges: ReturnType<typeof usePlanActions>['makeChanges'];
}) {
  const id = useId();
  const [name, setName] = useState<string>(t.saveWeekDefault);
  const [error, setError] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={formStyles.form}
      noValidate
      aria-label={t.saveWeek}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || view.main === null) return;
        const typed = name.trim();
        if (typed === '') {
          setError(t.saveWeekNameError);
          document.getElementById(`${id}-name`)?.focus();
          return;
        }
        setError(undefined);
        setBusy(true);
        const message = t.savedWeek(typed);
        const outcome = await makeChanges(
          saveWeekCommands(worked.input, view.main, typed, { weekId: newId(), profileId: newId() }),
          message,
        );
        setBusy(false);
        if (!outcome.ok) {
          setProblem(refusalMessage(outcome.code));
          return;
        }
        onDone();
        focusUndoBar(message);
      }}
    >
      <Field id={`${id}-name`} label={t.saveWeekName} error={error}>
        <input
          id={`${id}-name`}
          className={formStyles.input}
          type="text"
          autoComplete="off"
          value={name}
          aria-invalid={error !== undefined}
          aria-describedby={describedBy(`${id}-name`, error)}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <button type="submit" className={formStyles.main} aria-disabled={busy}>
        {t.saveWeekSave}
      </button>
      <Problem text={problem} />
    </form>
  );
}

/** The plan's pay, worked out once the plan is loaded, and again after each change. */
function usePayView(records: PlanRecords | null, today: string | null) {
  const [view, setView] = useState<PayView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (records === null || today === null) return;
    let current = true;
    askInBackground({ kind: 'pay', records, today }).then(
      (answer) => {
        if (current) setView(answer);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [records, today]);
  return { view, failed };
}

export function PayScreen() {
  const { loaded } = usePlanActions();
  const { view, failed } = usePayView(loaded?.records ?? null, loaded?.today ?? null);
  // The boxes start from the plan once, the first time its pay is known.
  const [startedFrom, setStartedFrom] = useState<PayView | null>(null);
  if (view !== null && startedFrom === null) setStartedFrom(view);
  const initial = useMemo(() => {
    if (startedFrom === null) return null;
    const next = startedFrom.paydays[0] ?? null;
    const week = startedFrom.weeks.find((one) => one.id === next?.weekId) ?? null;
    return calculatorFromPlan(next?.date ?? startedFrom.today, startedFrom.profile, week);
  }, [startedFrom]);

  return (
    <>
      <ScreenHeader
        heading={t.heading}
        purpose={t.purpose}
        back={{ label: t.back, href: '/app/more/' }}
      />
      {initial === null || view === null ? (
        <p className={screenStyles.card} role={failed ? 'alert' : undefined}>
          {failed ? strings.errors.plan : t.loading}
        </p>
      ) : (
        <PayCalculator
          initial={initial}
          today={view.today}
          weeks={view.weeks}
          actions={(worked) => <PlanActions worked={worked} view={view} />}
        />
      )}
    </>
  );
}
