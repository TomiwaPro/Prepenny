'use client';

// I spent (brief 4.5, D2, D115, D119, D198): pick the budget, type the
// amount, and it's saved for today, or an earlier day if the date is
// changed (never a later one, D119). The sheet shows what's spent and left
// for that budget this week or month, and what it will be with this spend.
// With no budgets, it says how to add one.

import type { Pence } from '@prepenny/engine';
import { useId, useRef, useState } from 'react';
import type { BudgetView } from '../lib/actions-view.ts';
import { parseAmount } from '../lib/amount.ts';
import { formatDay } from '../lib/dates.ts';
import { newId, timeNow } from '../lib/ids.ts';
import { formatMoney } from '../lib/money.ts';
import { refusalMessage } from '../lib/refusals.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { DateField, describedBy, Field, MoneyInput, Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import { type ShownActions, useActionsView } from './useActionsView.ts';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.spent;

export function SpentSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const opened = useOpenCount(open);
  const shown = useActionsView(open);
  return (
    <Sheet open={open} title={t.title} intro={t.intro} onClose={onClose}>
      {opened === 0 ? null : <SpentForm key={opened} shown={shown} onDone={onClose} />}
    </Sheet>
  );
}

/** Spent and left for a budget's week or month: "This week, to Thu 29 Oct". */
function Period({ budget, today }: { readonly budget: BudgetView; readonly today: string }) {
  const period = budget.current;
  const end = formatDay(period.end, today);
  return (
    <section className={styles.panel} data-testid="budget-period">
      <h3 className={styles.panelLabel}>
        {budget.every === 'week' ? t.thisWeek(end) : t.thisMonth(end)}
      </h3>
      <dl className={styles.totals}>
        <div className={styles.total}>
          <dt>{t.spentSoFar}</dt>
          <dd className="num">{formatMoney(period.spent)}</dd>
        </div>
        <div className={styles.total}>
          <dt>{t.left}</dt>
          <dd className="num">{formatMoney(period.left)}</dd>
        </div>
      </dl>
      {period.rolledOver === 0 ? null : (
        <p className={`${styles.hint} num`}>
          {t.rolledOver(formatMoney(period.base), formatMoney(period.rolledOver))}
        </p>
      )}
    </section>
  );
}

/** Spent and left in the budget's week or month once this spend is in, or null when it's in another one. */
function withThis(budget: BudgetView, amount: Pence, date: string) {
  const period = budget.current;
  if (date < period.start || date > period.end) return null;
  const spent = period.spent + amount;
  return { spent, left: Math.max(0, period.amount - spent) };
}

function SpentForm({
  shown,
  onDone,
}: {
  readonly shown: ShownActions;
  readonly onDone: () => void;
}) {
  const { makeChange } = usePlanActions();
  const id = useId();
  const [budgetId, setBudgetId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const view = shown.view;
  if (view === null) {
    return shown.failed ? <Problem text={strings.errors.plan} /> : <p>{strings.sheet.working}</p>;
  }
  const today = view.today;
  if (view.budgets.length === 0) {
    return (
      <p className={styles.note} data-testid="no-budgets">
        {t.noBudgets}
      </p>
    );
  }
  const budget = view.budgets.find((one) => one.id === budgetId) ?? view.budgets[0];
  if (budget === undefined) return null;
  const day = date ?? today;
  const amount = parseAmount(amountText);
  const preview = amount === null || amount === 0 ? null : withThis(budget, amount, day);
  // Dated before this week or month, when the budget's week or month has today in it.
  const earlier = day !== '' && budget.current.start <= today && day < budget.current.start;

  async function save() {
    if (busy || budget === undefined) return;
    const found: { amount?: string; date?: string } = {};
    if (amount === null || amount === 0) found.amount = strings.form.amountError;
    if (day === '' || day > today) found.date = t.dayError;
    setErrors(found);
    if (found.amount !== undefined) {
      amountRef.current?.focus();
      return;
    }
    if (found.date !== undefined || amount === null) {
      dateRef.current?.focus();
      return;
    }
    setBusy(true);
    setProblem(null);
    const after = withThis(budget, amount, day);
    const words = formatMoney(amount);
    const message =
      after === null
        ? strings.undo.spent(words, budget.name)
        : (budget.every === 'week' ? strings.undo.spentWeek : strings.undo.spentMonth)(
            words,
            budget.name,
            formatMoney(after.spent),
            formatMoney(after.left),
          );
    const outcome = await makeChange(
      {
        kind: 'spend',
        spend: {
          id: newId(),
          budgetId: budget.id,
          amount,
          spentOn: day,
          recordedAt: timeNow(),
        },
      },
      message,
    );
    setBusy(false);
    if (outcome.ok) onDone();
    else setProblem(refusalMessage(outcome.code));
  }

  return (
    <form
      className={styles.form}
      noValidate
      aria-label={t.title}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {view.budgets.length > 1 ? (
        <ChoiceList<string>
          legend={t.whichBudget}
          name={`${id}-budget`}
          value={budget.id}
          options={view.budgets.map((one) => ({ value: one.id, label: one.name }))}
          onChange={setBudgetId}
        />
      ) : (
        <h3 className={styles.subheading}>{budget.name}</h3>
      )}
      <Period budget={budget} today={today} />
      <Field id={`${id}-amount`} label={t.amount} error={errors.amount}>
        <MoneyInput
          id={`${id}-amount`}
          inputRef={amountRef}
          value={amountText}
          onChange={setAmountText}
          invalid={errors.amount !== undefined}
          describedBy={describedBy(`${id}-amount`, errors.amount, [
            preview === null && !earlier ? null : `${id}-preview`,
          ])}
        />
      </Field>
      <DateField
        id={`${id}-date`}
        label={t.day}
        value={day}
        today={today}
        max={today}
        onChange={setDate}
        error={errors.date}
        inputRef={dateRef}
      />
      {preview === null && !earlier ? null : (
        <p id={`${id}-preview`} className={`${styles.hint} num`} aria-live="polite">
          {earlier
            ? t.earlier
            : preview === null
              ? null
              : t.withThis(formatMoney(preview.spent), formatMoney(preview.left))}
        </p>
      )}
      <button type="submit" className={styles.main} aria-disabled={busy}>
        {strings.sheet.save}
      </button>
      <Problem text={problem} />
    </form>
  );
}
