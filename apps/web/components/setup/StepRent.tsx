'use client';

// Step 3, rent or mortgage (brief 4.1, D86, step 2e): the amount, the next
// payment, how often and from which account, or "I don't pay rent".

import { useId, useState } from 'react';
import { newId, timeInOrder } from '../../lib/ids.ts';
import { formatMoney } from '../../lib/money.ts';
import type { PaymentErrors } from '../../lib/new-payment.ts';
import { seriesWords } from '../../lib/schedule-words.ts';
import { blankWhen, buildOutgoing, type OutgoingForm } from '../../lib/setup-forms.ts';
import { strings } from '../../strings/en-GB.ts';
import { ChoiceList } from '../ChoiceList.tsx';
import formStyles from '../Form.module.css';
import { focusFirst } from './focus.ts';
import { OutgoingFields, outgoingFieldIds } from './OutgoingFields.tsx';
import styles from './Setup.module.css';
import { AddedList, StepFrame } from './StepFrame.tsx';
import { useStep } from './useStep.ts';

const t = strings.setup.rent;

type Which = 'rent' | 'mortgage';

export function StepRent() {
  const step = useStep(3);
  const id = useId();
  const saved = step.items('rent');
  const [which, setWhich] = useState<Which>('rent');
  const [form, setFormState] = useState<OutgoingForm>(() => ({
    ...blankWhen('monthly'),
    name: t.rent,
    amount: '',
    accountId: step.accounts[0]?.id ?? '',
    isEstimate: false,
  }));
  const [errors, setErrors] = useState<PaymentErrors>({});
  const set = (change: Partial<OutgoingForm>) => setFormState((now) => ({ ...now, ...change }));

  async function next() {
    step.setProblem(null);
    if (saved.length > 0) {
      await step.go(4);
      return;
    }
    const built = buildOutgoing(
      { ...form, name: which === 'rent' ? t.rent : t.mortgage },
      'rent',
      step.today,
      step.holidays,
    );
    if (!built.ok) {
      setErrors(built.errors);
      focusFirst(outgoingFieldIds(id, built.errors));
      return;
    }
    setErrors({});
    step.setBusy(true);
    const seriesId = newId();
    const outcome = await step.save({
      commands: [
        { kind: 'add-payment', series: { ...built.series, id: seriesId }, madeAt: timeInOrder() },
      ],
      item: { kind: 'rent', id: seriesId },
      step: 4,
    });
    step.setBusy(false);
    if (!outcome.ok) step.setProblem(strings.setup.problem);
  }

  const accounts = step.accounts.map((one) => ({ value: one.id, label: one.name ?? '' }));

  return (
    <StepFrame
      step={3}
      title={t.title}
      intro={t.intro}
      onSkip={() => step.go(4)}
      onNext={next}
      onBack={() => step.go(2)}
      busy={step.busy}
      problem={step.problem}
    >
      <AddedList
        items={saved.flatMap((item) => {
          const series = step.records.series.find((one) => one.id === item.id);
          if (series === undefined) return [];
          return [
            {
              id: item.id,
              name: series.name,
              line: t.card(formatMoney(series.amount), seriesWords(series, step.today)),
              onRemove: () => step.removeItem(item.id),
              problem: step.removeProblem(item.id),
            },
          ];
        })}
      />
      {saved.length > 0 ? null : (
        <>
          <div className={styles.card}>
            <ChoiceList<Which>
              legend={t.which}
              name={`${id}-which`}
              value={which}
              options={[
                { value: 'rent', label: t.rent },
                { value: 'mortgage', label: t.mortgage },
              ]}
              onChange={setWhich}
            />
            <OutgoingFields
              id={id}
              form={form}
              set={set}
              errors={errors}
              today={step.today}
              holidays={step.holidays}
              accounts={accounts}
              howOften={['monthly', 'weekly', 'dates']}
              amountLabel={t.amount}
              amountError={t.amountError}
              showEstimate={false}
            />
          </div>
          <button
            type="button"
            className={formStyles.outlined}
            onClick={async () => {
              await step.save({ commands: [], answers: { noRent: true }, step: 4 });
            }}
          >
            {t.none}
          </button>
        </>
      )}
    </StepFrame>
  );
}
