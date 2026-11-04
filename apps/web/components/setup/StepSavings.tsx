'use client';

// Step 7, savings (brief 4.1 and 4.7, D114, D153, step 2e): a goal with a
// target, a date if there is one, the account it's kept in, and the money
// moved into it, each payday or another way.

import type { EditCommand } from '@prepenny/engine';
import { useId, useMemo, useState } from 'react';
import { formatDay } from '../../lib/dates.ts';
import { newId, timeInOrder } from '../../lib/ids.ts';
import { formatMoney } from '../../lib/money.ts';
import type { PaymentErrors, WhenForm } from '../../lib/new-payment.ts';
import {
  blankGoal,
  buildGoal,
  eachPaydayOf,
  type GoalErrors,
  type GoalForm,
  goalTyped,
  type MoveOften,
  NEW_ACCOUNT,
} from '../../lib/setup-forms.ts';
import { strings } from '../../strings/en-GB.ts';
import { ChoiceList } from '../ChoiceList.tsx';
import { DateField, describedBy, Field, MoneyInput } from '../Fields.tsx';
import formStyles from '../Form.module.css';
import { paymentMistakes, useWhenRefs, WhenFields } from '../WhenFields.tsx';
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
            ...(
              [
                'name',
                'target',
                'targetDate',
                'newName',
                'newBalance',
                'saved',
                'move',
                'fromAccount',
              ] as const
            )
              .filter((field) => mistakes[field] !== undefined)
              .map((field) => `${base}-${field}`),
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
        const error = (field: keyof GoalErrors) => {
          const mistake = mistakes[field];
          if (mistake === undefined) return undefined;
          if (mistake === 'sameAccount') return strings.setup.sameAccount;
          if (mistake === 'balanceError') return strings.setup.account.balanceError;
          if (mistake in t) return (t as unknown as Record<string, string>)[mistake];
          return paymentMistakes[mistake as keyof typeof paymentMistakes] as string | undefined;
        };
        const keptIn = form.keptIn;
        const fromOptions = accounts.filter((one) => one.value !== keptIn);
        const moving = form.move.trim() !== '';
        const often: MoveOften = eachPayday === null ? 'own' : form.moveOften;
        return (
          <SetupCard
            key={draft.key}
            heading={index === 0 && saved.length === 0 ? null : t.anotherHeading}
            testId="goal-form"
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
            <Field id={`${base}-target`} label={t.target} error={error('target')}>
              <MoneyInput
                id={`${base}-target`}
                value={form.target}
                onChange={(target) => setForm(draft.key, { target })}
                invalid={error('target') !== undefined}
                describedBy={describedBy(`${base}-target`, error('target'))}
              />
            </Field>
            <DateField
              id={`${base}-targetDate`}
              label={t.targetDate}
              value={form.targetDate}
              today={step.today}
              min={step.today}
              onChange={(targetDate) => setForm(draft.key, { targetDate })}
              error={error('targetDate')}
            />
            <ChoiceList<string>
              legend={t.keptIn}
              name={`${base}-kept-in`}
              value={keptIn}
              options={[...accounts, { value: NEW_ACCOUNT, label: t.newAccount }]}
              onChange={(value) =>
                setForm(draft.key, {
                  keptIn: value,
                  // Money moves in from another account.
                  ...(value === form.fromAccountId
                    ? {
                        fromAccountId:
                          accounts.find((one) => one.value !== value)?.value ?? form.fromAccountId,
                      }
                    : {}),
                })
              }
            />
            {keptIn === NEW_ACCOUNT ? (
              <>
                <Field id={`${base}-newName`} label={t.newName} error={error('newName')}>
                  <input
                    id={`${base}-newName`}
                    className={formStyles.input}
                    type="text"
                    autoComplete="off"
                    value={form.newName}
                    aria-invalid={error('newName') !== undefined}
                    aria-describedby={describedBy(`${base}-newName`, error('newName'))}
                    onChange={(event) => setForm(draft.key, { newName: event.target.value })}
                  />
                </Field>
                <Field id={`${base}-newBalance`} label={t.newBalance} error={error('newBalance')}>
                  <MoneyInput
                    id={`${base}-newBalance`}
                    value={form.newBalance}
                    onChange={(newBalance) => setForm(draft.key, { newBalance })}
                    invalid={error('newBalance') !== undefined}
                    describedBy={describedBy(`${base}-newBalance`, error('newBalance'))}
                  />
                </Field>
              </>
            ) : null}
            <Field id={`${base}-saved`} label={t.saved} error={error('saved')} hint={t.savedHint}>
              <MoneyInput
                id={`${base}-saved`}
                value={form.saved}
                onChange={(value) => setForm(draft.key, { saved: value })}
                invalid={error('saved') !== undefined}
                describedBy={describedBy(`${base}-saved`, error('saved'), [`${base}-saved-hint`])}
              />
            </Field>
            <div className={formStyles.group}>
              <Field id={`${base}-move`} label={t.move} error={error('move')} hint={t.moveHint}>
                <MoneyInput
                  id={`${base}-move`}
                  value={form.move}
                  onChange={(move) => setForm(draft.key, { move })}
                  invalid={error('move') !== undefined}
                  describedBy={describedBy(`${base}-move`, error('move'), [`${base}-move-hint`])}
                />
              </Field>
              {moving ? (
                <>
                  {eachPayday === null ? null : (
                    <ChoiceList<MoveOften>
                      legend={t.moveOften}
                      name={`${base}-often`}
                      value={often}
                      options={[
                        {
                          value: 'payday',
                          label: t.eachPayday(formatDay(eachPayday.start, step.today)),
                        },
                        { value: 'own', label: t.ownWhen },
                      ]}
                      onChange={(moveOften) => setForm(draft.key, { moveOften })}
                    />
                  )}
                  {often === 'own' ? (
                    <WhenFields
                      id={`${base}-move`}
                      form={form}
                      set={<K extends keyof WhenForm>(key: K, value: WhenForm[K]) =>
                        setForm(draft.key, { [key]: value } as Partial<GoalForm>)
                      }
                      errors={mistakes as PaymentErrors}
                      refs={refs}
                      today={step.today}
                      holidays={step.holidays}
                      howOften={['monthly', 'weekly', 'once', 'dates']}
                      showEnds={false}
                    />
                  ) : null}
                  {fromOptions.length > 0 ? (
                    <div id={`${base}-fromAccount`}>
                      <ChoiceList<string>
                        legend={t.from}
                        name={`${base}-from`}
                        value={form.fromAccountId}
                        options={fromOptions}
                        onChange={(fromAccountId) => setForm(draft.key, { fromAccountId })}
                        describedBy={
                          error('fromAccount') === undefined ? undefined : `${base}-from-error`
                        }
                      />
                      {error('fromAccount') === undefined ? null : (
                        <p id={`${base}-from-error`} className={formStyles.error}>
                          {error('fromAccount')}
                        </p>
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
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
