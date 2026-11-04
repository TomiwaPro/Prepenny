'use client';

// Step 7, savings (brief 4.1 and 4.7, D114, D153, step 2e): a goal with a
// target, a date if there is one, the account it's kept in, and the money
// moved into it, each payday or another way.

import type { EditCommand } from '@prepenny/engine';
import { useId, useMemo, useState } from 'react';
import { newId, timeInOrder } from '../../lib/ids.ts';
import { formatMoney } from '../../lib/money.ts';
import type { PaymentErrors } from '../../lib/new-payment.ts';
import {
  blankGoal,
  buildGoal,
  eachPaydayOf,
  type GoalErrors,
  type GoalForm,
  goalTyped,
  NEW_ACCOUNT,
} from '../../lib/setup-forms.ts';
import { strings } from '../../strings/en-GB.ts';
import formStyles from '../Form.module.css';
import { GOAL_FIELD_ORDER, GoalFields } from '../GoalFields.tsx';
import { useWhenRefs } from '../WhenFields.tsx';
import { focusFirst } from './focus.ts';
import { outgoingFieldIds } from './OutgoingFields.tsx';
import { AddedList, SetupCard, StepFrame } from './StepFrame.tsx';
import { useStep } from './useStep.ts';

const t = strings.setup.savings;

interface Draft {
  readonly key: string;
  readonly form: GoalForm;
}

export function StepSavings() {
  const step = useStep(7);
  const id = useId();
  const saved = step.items('goal');
  const refs = useWhenRefs();
  const eachPayday = useMemo(
    () =>
      eachPaydayOf(
        step.records.series,
        step.records.settings?.mainPayFamilyId ?? null,
        step.today,
        step.holidays,
      ),
    [step.records, step.today, step.holidays],
  );
  const savingsAccount = step.accounts.find((one) => one.kind === 'savings');
  const fresh = (): GoalForm => {
    const keptIn =
      savingsAccount?.id ??
      (step.accounts.length > 1 ? (step.accounts[1]?.id ?? NEW_ACCOUNT) : NEW_ACCOUNT);
    const from = step.accounts.find((one) => one.id !== keptIn)?.id ?? step.accounts[0]?.id ?? '';
    return blankGoal(keptIn, from, eachPayday !== null);
  };
  const [drafts, setDrafts] = useState<readonly Draft[]>(() =>
    saved.length > 0 ? [] : [{ key: newId(), form: fresh() }],
  );
  const [errors, setErrors] = useState<Readonly<Record<string, GoalErrors>>>({});
  const setForm = (key: string, change: Partial<GoalForm>) =>
    setDrafts((now) =>
      now.map((draft) =>
        draft.key === key ? { ...draft, form: { ...draft.form, ...change } } : draft,
      ),
    );
  const formId = (key: string) => `${id}-${key}`;

  async function next() {
    step.setProblem(null);
    const found: Record<string, GoalErrors> = {};
    const built: { key: string; goalId: string; commands: EditCommand[] }[] = [];
    for (const draft of drafts) {
      if (!goalTyped(draft.form)) continue;
      const goalId = newId();
      const result = buildGoal(
        draft.form,
        step.today,
        step.holidays,
        { goalId, seriesId: newId(), accountId: newId(), balanceId: newId() },
        timeInOrder(),
        eachPayday,
        t.moveName,
      );
      if (result.ok) built.push({ key: draft.key, goalId, commands: result.commands });
      else found[draft.key] = result.errors;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirst(
        drafts.flatMap((draft) => {
          const mistakes = found[draft.key];
          if (mistakes === undefined) return [];
          const base = formId(draft.key);
          return [
            ...GOAL_FIELD_ORDER.filter((field) => mistakes[field] !== undefined).map(
              (field) => `${base}-${field}`,
            ),
            ...outgoingFieldIds(`${base}-move`, mistakes as PaymentErrors),
          ];
        }),
      );
      return;
    }
    step.setBusy(true);
    for (const one of built) {
      const outcome = await step.save({
        commands: one.commands,
        item: { kind: 'goal', id: one.goalId },
      });
      if (!outcome.ok) {
        step.setBusy(false);
        step.setProblem(strings.setup.problem);
        return;
      }
      setDrafts((now) => now.filter((draft) => draft.key !== one.key));
    }
    const outcome = await step.save({ commands: [], step: 8 });
    step.setBusy(false);
    if (!outcome.ok) step.setProblem(strings.setup.problem);
  }

  const accounts = step.accounts.map((one) => ({ value: one.id, label: one.name ?? '' }));

  return (
    <StepFrame
      step={7}
      title={t.title}
      intro={t.intro}
      onSkip={() => step.go(8)}
      onNext={next}
      onBack={() => step.go(6)}
      busy={step.busy}
      problem={step.problem}
    >
      <AddedList
        items={saved.flatMap((item) => {
          const goal = step.records.goals?.find((one) => one.id === item.id);
          if (goal === undefined) return [];
          const account = step.records.accounts.find((one) => one.id === goal.accountId);
          return [
            {
              id: item.id,
              name: goal.name,
              line: t.card(formatMoney(goal.target), account?.name ?? ''),
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
        return (
          <SetupCard
            key={draft.key}
            heading={index === 0 && saved.length === 0 ? null : t.anotherHeading}
            testId="goal-form"
          >
            <GoalFields
              base={base}
              form={form}
              set={(change) => setForm(draft.key, change)}
              errors={mistakes}
              today={step.today}
              holidays={step.holidays}
              accounts={accounts}
              eachPayday={eachPayday}
              refs={refs}
            />
          </SetupCard>
        );
      })}

      <button
        type="button"
        className={formStyles.outlined}
        onClick={() => {
          const key = newId();
          setDrafts((now) => [...now, { key, form: fresh() }]);
          requestAnimationFrame(() => document.getElementById(`${formId(key)}-name`)?.focus());
        }}
      >
        {t.addAnother}
      </button>
    </StepFrame>
  );
}
