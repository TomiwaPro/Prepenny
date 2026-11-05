'use client';

// Step 5, debts (brief 4.1 and 4.6, D98, D153, step 2e): any debt, of each
// kind in brief 4.6, with what's owed now and its payments, or "I have no
// debts". Money owed to a person can be in another currency, at the rate
// the person sets.

import type { EditCommand } from '@prepenny/engine';
import { useId, useState } from 'react';
import { newId, timeInOrder } from '../../lib/ids.ts';
import { formatIn, formatMoney } from '../../lib/money.ts';
import type { PaymentErrors } from '../../lib/new-payment.ts';
import { seriesWords } from '../../lib/schedule-words.ts';
import {
  blankDebt,
  buildDebt,
  type DebtErrors,
  type DebtForm,
  debtTyped,
} from '../../lib/setup-forms.ts';
import { strings } from '../../strings/en-GB.ts';
import { DEBT_FIELD_ORDER, DebtFields } from '../DebtFields.tsx';
import { CheckOption } from '../Fields.tsx';
import formStyles from '../Form.module.css';
import { focusFirst } from './focus.ts';
import { OutgoingFields, outgoingFieldIds } from './OutgoingFields.tsx';
import { AddedList, focusAddAnother, SetupCard, StepFrame } from './StepFrame.tsx';
import { useStep } from './useStep.ts';

const t = strings.setup.debts;

interface Draft {
  readonly key: string;
  readonly form: DebtForm;
}

export function StepDebts() {
  const step = useStep(5);
  const id = useId();
  const saved = step.items('debt');
  const firstAccount = step.accounts[0]?.id ?? '';
  const [drafts, setDrafts] = useState<readonly Draft[]>([]);
  const [errors, setErrors] = useState<Readonly<Record<string, DebtErrors>>>({});
  const setForm = (key: string, change: Partial<DebtForm>) =>
    setDrafts((now) =>
      now.map((draft) =>
        draft.key === key ? { ...draft, form: { ...draft.form, ...change } } : draft,
      ),
    );
  const formId = (key: string) => `${id}-${key}`;

  async function next() {
    step.setProblem(null);
    const found: Record<string, DebtErrors> = {};
    const built: { key: string; debtId: string; commands: EditCommand[] }[] = [];
    for (const draft of drafts) {
      if (!debtTyped(draft.form)) continue;
      const debtId = newId();
      const result = buildDebt(
        draft.form,
        step.today,
        step.holidays,
        { debtId, seriesId: newId() },
        timeInOrder(),
      );
      if (result.ok) built.push({ key: draft.key, debtId, commands: result.commands });
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
            ...DEBT_FIELD_ORDER.filter((field) => mistakes[field] !== undefined).map(
              (field) => `${base}-${field}`,
            ),
            ...outgoingFieldIds(`${base}-pay`, mistakes as PaymentErrors),
          ];
        }),
      );
      return;
    }
    step.setBusy(true);
    for (const one of built) {
      const outcome = await step.save({
        commands: one.commands,
        item: { kind: 'debt', id: one.debtId },
      });
      if (!outcome.ok) {
        step.setBusy(false);
        step.setProblem(strings.setup.problem);
        return;
      }
      setDrafts((now) => now.filter((draft) => draft.key !== one.key));
    }
    const outcome = await step.save({ commands: [], step: 6 });
    step.setBusy(false);
    if (!outcome.ok) step.setProblem(strings.setup.problem);
  }

  const accounts = step.accounts.map((one) => ({ value: one.id, label: one.name ?? '' }));

  return (
    <StepFrame
      step={5}
      title={t.title}
      intro={t.intro}
      onSkip={() => step.go(6)}
      onNext={next}
      onBack={() => step.go(4)}
      busy={step.busy}
      problem={step.problem}
    >
      <AddedList
        items={saved.flatMap((item) => {
          const debt = step.records.debts?.find((one) => one.id === item.id);
          if (debt === undefined) return [];
          const payment = step.records.series.find((one) => one.debtId === debt.id);
          return [
            {
              id: item.id,
              name: debt.name,
              line:
                payment === undefined
                  ? t.card(formatIn(debt.balance, debt.currency), t.kinds[debt.kind])
                  : `${t.card(formatIn(debt.balance, debt.currency), t.kinds[debt.kind])}. ${t.cardPayment(formatMoney(payment.amount), seriesWords(payment, step.today))}`,
              onRemove: () => step.removeItem(item.id),
              problem: step.removeProblem(item.id),
            },
          ];
        })}
      />

      {drafts.map((draft) => {
        const form = draft.form;
        const mistakes = errors[draft.key] ?? {};
        const base = formId(draft.key);
        return (
          <SetupCard key={draft.key} heading={t.heading} testId="debt-form">
            <DebtFields
              base={base}
              form={form}
              set={(change) => setForm(draft.key, change)}
              errors={mistakes}
              today={step.today}
              showOwed
            />
            <div className={formStyles.group}>
              <h2 className={formStyles.subheading}>{t.payments}</h2>
              <CheckOption
                checked={form.noPayments}
                onChange={(noPayments) => setForm(draft.key, { noPayments })}
              >
                {t.noPayments}
              </CheckOption>
              {form.noPayments ? null : (
                <OutgoingFields
                  id={`${base}-pay`}
                  form={form}
                  set={(change) => setForm(draft.key, change)}
                  errors={mistakes as PaymentErrors}
                  today={step.today}
                  holidays={step.holidays}
                  accounts={accounts}
                  howOften={['monthly', 'weekly', 'once', 'dates']}
                  amountLabel={t.payment}
                  showEnds
                />
              )}
            </div>
            <button
              type="button"
              className={formStyles.quiet}
              onClick={() => {
                setDrafts((now) => now.filter((one) => one.key !== draft.key));
                focusAddAnother();
              }}
            >
              {t.removeForm}
            </button>
          </SetupCard>
        );
      })}

      <div className={formStyles.withHint}>
        <button
          data-add-another
          type="button"
          className={formStyles.outlined}
          aria-describedby={`${id}-add-hint`}
          onClick={() => {
            const key = newId();
            setDrafts((now) => [...now, { key, form: blankDebt(firstAccount) }]);
            requestAnimationFrame(() => document.getElementById(`${formId(key)}-name`)?.focus());
          }}
        >
          {t.add}
        </button>
        <p id={`${id}-add-hint`} className={formStyles.hint}>
          {t.addKinds}
        </p>
      </div>

      {saved.length === 0 && drafts.length === 0 ? (
        <button
          type="button"
          className={formStyles.outlined}
          onClick={async () => {
            await step.save({ commands: [], answers: { noDebts: true }, step: 6 });
          }}
        >
          {t.none}
        </button>
      ) : null}
    </StepFrame>
  );
}
