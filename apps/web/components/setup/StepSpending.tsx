'use client';

// Step 6, spending money (brief 4.1 and 4.5, D29, D31, D32, D152, step 2e):
// budgets such as Food and Travel, weekly or monthly, and how each leaves the
// account: all at the start, spread across the days, or as a pay-later bill.
// Each starts with the next week or month, so it never takes money for days
// already gone; the person can choose another day.

import type { BudgetEvery, BudgetLeaves, EditCommand } from '@prepenny/engine';
import { useId, useState } from 'react';
import { newId, timeInOrder } from '../../lib/ids.ts';
import { formatMoney } from '../../lib/money.ts';
import {
  type BudgetErrors,
  type BudgetForm,
  blankBudget,
  budgetTyped,
  buildBudget,
} from '../../lib/setup-forms.ts';
import { strings } from '../../strings/en-GB.ts';
import { ChoiceList } from '../ChoiceList.tsx';
import { DateField, describedBy, Field, MoneyInput } from '../Fields.tsx';
import formStyles from '../Form.module.css';
import { focusFirst } from './focus.ts';
import { AddedList, SetupCard, StepFrame } from './StepFrame.tsx';
import { useStep } from './useStep.ts';

const t = strings.setup.spending;

interface Draft {
  readonly key: string;
  readonly form: BudgetForm;
}

export function StepSpending() {
  const step = useStep(6);
  const id = useId();
  const saved = step.items('budget');
  const firstAccount = step.accounts[0]?.id ?? '';
  const [drafts, setDrafts] = useState<readonly Draft[]>(() =>
    saved.length > 0
      ? []
      : [
          { key: newId(), form: blankBudget(t.food, 'month', firstAccount, '') },
          { key: newId(), form: blankBudget(t.travel, 'week', firstAccount, '') },
        ],
  );
  const [errors, setErrors] = useState<Readonly<Record<string, BudgetErrors>>>({});
  const setForm = (key: string, change: Partial<BudgetForm>) =>
    setDrafts((now) =>
      now.map((draft) =>
        draft.key === key ? { ...draft, form: { ...draft.form, ...change } } : draft,
      ),
    );
  const formId = (key: string) => `${id}-${key}`;
  const starts = step.view?.budgetStarts ?? null;

  /** The day it starts: the start of its next week or month, unless the person chose another day. */
  const startsOn = (form: BudgetForm): string => {
    if (form.startsOnChanged) return form.startsOn;
    const every = form.leaves === 'pay-later' ? 'month' : form.every;
    return (every === 'week' ? starts?.week : starts?.month) ?? step.today;
  };

  async function next() {
    step.setProblem(null);
    const found: Record<string, BudgetErrors> = {};
    const built: { key: string; budgetId: string; command: EditCommand }[] = [];
    for (const draft of drafts) {
      if (!budgetTyped(draft.form)) continue;
      const budgetId = newId();
      const result = buildBudget(
        { ...draft.form, startsOn: startsOn(draft.form) },
        step.today,
        budgetId,
        timeInOrder(),
      );
      if (result.ok) built.push({ key: draft.key, budgetId, command: result.command });
      else found[draft.key] = result.errors;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirst(
        drafts.flatMap((draft) =>
          (['name', 'amount', 'billDay', 'startsOn'] as const)
            .filter((field) => found[draft.key]?.[field] !== undefined)
            .map((field) => `${formId(draft.key)}-${field}`),
        ),
      );
      return;
    }
    step.setBusy(true);
    for (const one of built) {
      const outcome = await step.save({
        commands: [one.command],
        item: { kind: 'budget', id: one.budgetId },
      });
      if (!outcome.ok) {
        step.setBusy(false);
        step.setProblem(strings.setup.problem);
        return;
      }
      setDrafts((now) => now.filter((draft) => draft.key !== one.key));
    }
    const outcome = await step.save({ commands: [], step: 7 });
    step.setBusy(false);
    if (!outcome.ok) step.setProblem(strings.setup.problem);
  }

  const accounts = step.accounts.map((one) => ({ value: one.id, label: one.name ?? '' }));

  return (
    <StepFrame
      step={6}
      title={t.title}
      intro={t.intro}
      onSkip={() => step.go(7)}
      onNext={next}
      onBack={() => step.go(5)}
      busy={step.busy}
      problem={step.problem}
    >
      <AddedList
        items={saved.flatMap((item) => {
          const budget = step.records.budgets?.find((one) => one.id === item.id);
          if (budget === undefined) return [];
          return [
            {
              id: item.id,
              name: budget.name,
              line: t.card(
                formatMoney(budget.amount),
                budget.every === 'week' ? t.aWeek : t.aMonth,
              ),
              onRemove: () => step.removeItem(item.id),
              problem: step.removeProblem(item.id),
            },
          ];
        })}
      />

      {drafts.map((draft, index) => {
        const form = draft.form;
        const base = formId(draft.key);
        const mistakes = errors[draft.key] ?? {};
        const error = (field: keyof BudgetErrors) => {
          const mistake = mistakes[field];
          if (mistake === undefined) return undefined;
          if (mistake === 'nameError') return strings.setup.nameError;
          if (mistake === 'amountError') return strings.setup.amountError;
          if (mistake === 'dateError') return strings.setup.dateError;
          if (mistake === 'startBeforeToday') return strings.setup.startBeforeToday;
          return t.billDayError;
        };
        const payLater = form.leaves === 'pay-later';
        const every: BudgetEvery = payLater ? 'month' : form.every;
        const name = form.name.trim();
        return (
          <SetupCard
            key={draft.key}
            heading={index < 2 && saved.length === 0 ? null : t.anotherHeading}
            testId="budget-form"
          >
            <Field id={`${base}-name`} label={t.name} error={error('name')}>
              <input
                id={`${base}-name`}
                className={formStyles.input}
                type="text"
                autoComplete="off"
                value={form.name}
                aria-invalid={error('name') !== undefined}
                aria-describedby={describedBy(`${base}-name`, error('name'))}
                onChange={(event) => setForm(draft.key, { name: event.target.value })}
              />
            </Field>
            <Field id={`${base}-amount`} label={t.amount} error={error('amount')}>
              <MoneyInput
                id={`${base}-amount`}
                value={form.amount}
                onChange={(amount) => setForm(draft.key, { amount })}
                invalid={error('amount') !== undefined}
                describedBy={describedBy(`${base}-amount`, error('amount'))}
              />
            </Field>
            {payLater ? (
              <p className={formStyles.hint}>{t.payLaterHint}</p>
            ) : (
              <ChoiceList<BudgetEvery>
                legend={t.every}
                name={`${base}-every`}
                value={every}
                options={[
                  { value: 'week', label: t.week },
                  { value: 'month', label: t.month },
                ]}
                onChange={(value) => setForm(draft.key, { every: value })}
              />
            )}
            <ChoiceList<BudgetLeaves>
              legend={name === '' ? t.leavesNoName : t.leaves(name)}
              name={`${base}-leaves`}
              value={form.leaves}
              options={[
                { value: 'at-start', label: t.atStart },
                { value: 'spread', label: t.spread },
                { value: 'pay-later', label: t.payLater },
              ]}
              onChange={(leaves) => setForm(draft.key, { leaves })}
            />
            {payLater ? (
              <Field id={`${base}-billDay`} label={t.billDay} error={error('billDay')}>
                <input
                  id={`${base}-billDay`}
                  className={`${formStyles.input} num`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.billDay}
                  aria-invalid={error('billDay') !== undefined}
                  aria-describedby={describedBy(`${base}-billDay`, error('billDay'))}
                  onChange={(event) => setForm(draft.key, { billDay: event.target.value })}
                />
              </Field>
            ) : null}
            {accounts.length > 1 ? (
              <ChoiceList<string>
                legend={t.from}
                name={`${base}-from`}
                value={form.accountId}
                options={accounts}
                onChange={(accountId) => setForm(draft.key, { accountId })}
              />
            ) : null}
            <DateField
              id={`${base}-startsOn`}
              label={t.starts}
              value={startsOn(form)}
              today={step.today}
              min={step.today}
              onChange={(value) => setForm(draft.key, { startsOn: value, startsOnChanged: true })}
              error={error('startsOn')}
              extraHint={
                form.startsOnChanged
                  ? null
                  : {
                      id: `${base}-startsOn-hint`,
                      text: every === 'week' ? t.startsWeek : t.startsMonth,
                    }
              }
            />
            <button
              type="button"
              className={formStyles.quiet}
              onClick={() => setDrafts((now) => now.filter((one) => one.key !== draft.key))}
            >
              {t.removeBudget}
            </button>
          </SetupCard>
        );
      })}

      <button
        type="button"
        className={formStyles.outlined}
        onClick={() => {
          const key = newId();
          setDrafts((now) => [...now, { key, form: blankBudget('', 'week', firstAccount, '') }]);
          requestAnimationFrame(() => document.getElementById(`${formId(key)}-name`)?.focus());
        }}
      >
        {t.addAnother}
      </button>
    </StepFrame>
  );
}
