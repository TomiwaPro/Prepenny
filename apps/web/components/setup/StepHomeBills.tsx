'use client';

// Screen 3, home and bills (brief 4.1, D86, D231, D356): rent or mortgage at
// the top, with its amount, next payment, how often and from which account,
// or "I don't pay rent or a mortgage"; then the UK bills checklist, council
// tax, energy, water, phone, broadband, TV licence, insurance and
// subscriptions, each one ticked asking for its amount, next payment and how
// often, with council tax's "10 payments, April to January"; and "Add
// another bill". It asks everything the two steps it replaces asked.

import type { NewSeries } from '@prepenny/engine';
import { useId, useState } from 'react';
import { newId, timeInOrder } from '../../lib/ids.ts';
import { formatMoney } from '../../lib/money.ts';
import type { PaymentErrors } from '../../lib/new-payment.ts';
import { seriesWords } from '../../lib/schedule-words.ts';
import {
  blankWhen,
  buildOutgoing,
  type OutgoingForm,
  outgoingTyped,
} from '../../lib/setup-forms.ts';
import { BILLS, type BillKey } from '../../lib/setup-progress.ts';
import { strings } from '../../strings/en-GB.ts';
import { ChoiceList } from '../ChoiceList.tsx';
import { CheckOption, describedBy, Field } from '../Fields.tsx';
import formStyles from '../Form.module.css';
import { focusFirst } from './focus.ts';
import { OutgoingFields, outgoingFieldIds } from './OutgoingFields.tsx';
import { AddedList, focusAddAnother, SetupCard, StepFrame } from './StepFrame.tsx';
import { useStep } from './useStep.ts';

const t = strings.setup.bills;
const r = strings.setup.rent;

type Which = 'rent' | 'mortgage' | 'none';

interface BillDraft {
  readonly key: string;
  /** A bill from the checklist, or null for "Add another bill". */
  readonly bill: BillKey | null;
  readonly ticked: boolean;
  readonly form: OutgoingForm;
  /** Council tax only: 10 payments, April to January. */
  readonly tenMonths: boolean;
}

/** February and March, left out of council tax's 10 payments (brief 8.5). */
const NOT_FEBRUARY_OR_MARCH = [2, 3] as const;

function blankBill(bill: BillKey | null, accountId: string): BillDraft {
  return {
    key: bill ?? newId(),
    bill,
    ticked: false,
    tenMonths: bill === 'council-tax',
    form: {
      ...blankWhen('monthly'),
      name: bill === null ? '' : t.names[bill],
      amount: '',
      accountId,
      isEstimate: false,
    },
  };
}

/** The form as it's checked: council tax's 10 payments leave out February and March. */
function formFor(draft: BillDraft): OutgoingForm {
  if (draft.bill !== 'council-tax' || !draft.tenMonths) return draft.form;
  return {
    ...draft.form,
    howOften: 'monthly',
    months: '1',
    leaveOut: true,
    leftOut: [...NOT_FEBRUARY_OR_MARCH],
  };
}

export function StepHomeBills() {
  const step = useStep(3);
  const id = useId();
  const rentId = `${id}-rent`;
  const savedRent = step.items('rent');
  const savedBills = step.items('bill');
  const savedKeys = new Set(
    savedBills.flatMap((item) => (item.bill === undefined ? [] : [item.bill])),
  );
  const firstAccount = step.accounts[0]?.id ?? '';
  const [which, setWhich] = useState<Which>(() =>
    step.progress.answers.noRent === true ? 'none' : 'rent',
  );
  const [rent, setRentState] = useState<OutgoingForm>(() => ({
    ...blankWhen('monthly'),
    name: r.rent,
    amount: '',
    accountId: firstAccount,
    isEstimate: false,
  }));
  const [rentErrors, setRentErrors] = useState<PaymentErrors>({});
  const setRent = (change: Partial<OutgoingForm>) => setRentState((now) => ({ ...now, ...change }));
  const [drafts, setDrafts] = useState<readonly BillDraft[]>(() =>
    BILLS.filter((bill) => !savedKeys.has(bill)).map((bill) => blankBill(bill, firstAccount)),
  );
  const [errors, setErrors] = useState<Readonly<Record<string, PaymentErrors>>>({});

  const update = (key: string, change: Partial<BillDraft>) =>
    setDrafts((now) => now.map((draft) => (draft.key === key ? { ...draft, ...change } : draft)));
  const setForm = (key: string, change: Partial<OutgoingForm>) =>
    setDrafts((now) =>
      now.map((draft) =>
        draft.key === key ? { ...draft, form: { ...draft.form, ...change } } : draft,
      ),
    );
  const formId = (key: string) => `${id}-${key}`;
  const inUse = (draft: BillDraft) =>
    draft.bill === null ? outgoingTyped(draft.form) || draft.form.name.trim() !== '' : draft.ticked;
  const asksRent = savedRent.length === 0;

  async function next() {
    step.setProblem(null);
    // Rent first, as it shows: a home payment, or "I don't pay rent or a mortgage".
    let rentSeries: Omit<NewSeries, 'id'> | null = null;
    let foundRent: PaymentErrors = {};
    if (asksRent && which !== 'none') {
      const built = buildOutgoing(
        { ...rent, name: which === 'rent' ? r.rent : r.mortgage },
        'rent',
        step.today,
        step.holidays,
      );
      if (built.ok) rentSeries = built.series;
      else foundRent = built.errors;
    }
    const found: Record<string, PaymentErrors> = {};
    const bills: { draft: BillDraft; series: Omit<NewSeries, 'id'> }[] = [];
    for (const draft of drafts) {
      if (!inUse(draft)) continue;
      const result = buildOutgoing(formFor(draft), 'bills', step.today, step.holidays);
      if (result.ok) bills.push({ draft, series: result.series });
      else found[draft.key] = result.errors;
    }
    setRentErrors(foundRent);
    setErrors(found);
    if (Object.keys(foundRent).length > 0 || Object.keys(found).length > 0) {
      focusFirst([
        ...outgoingFieldIds(rentId, foundRent),
        ...drafts.flatMap((draft) => {
          const mistakes = found[draft.key];
          if (mistakes === undefined) return [];
          return [
            ...(mistakes.name === undefined ? [] : [`${formId(draft.key)}-name`]),
            ...outgoingFieldIds(formId(draft.key), mistakes),
          ];
        }),
      ]);
      return;
    }
    step.setBusy(true);
    if (rentSeries !== null) {
      const seriesId = newId();
      const outcome = await step.save({
        commands: [
          { kind: 'add-payment', series: { ...rentSeries, id: seriesId }, madeAt: timeInOrder() },
        ],
        item: { kind: 'rent', id: seriesId },
        answers: { noRent: false },
      });
      if (!outcome.ok) {
        step.setBusy(false);
        step.setProblem(strings.setup.problem);
        return;
      }
    }
    for (const one of bills) {
      const seriesId = newId();
      const outcome = await step.save({
        commands: [
          { kind: 'add-payment', series: { ...one.series, id: seriesId }, madeAt: timeInOrder() },
        ],
        item: {
          kind: 'bill',
          id: seriesId,
          ...(one.draft.bill === null ? {} : { bill: one.draft.bill }),
        },
      });
      if (!outcome.ok) {
        step.setBusy(false);
        step.setProblem(strings.setup.problem);
        return;
      }
      setDrafts((now) => now.filter((draft) => draft.key !== one.draft.key));
    }
    const outcome = await step.save({
      commands: [],
      ...(asksRent && which === 'none' ? { answers: { noRent: true } } : {}),
      step: 4,
    });
    step.setBusy(false);
    if (!outcome.ok) step.setProblem(strings.setup.problem);
  }

  const accounts = step.accounts.map((one) => ({ value: one.id, label: one.name ?? '' }));
  const checklist = drafts.filter((draft) => draft.bill !== null);
  const others = drafts.filter((draft) => draft.bill === null);

  const billForm = (draft: BillDraft) => {
    const mistakes = errors[draft.key] ?? {};
    const nameError = mistakes.name === undefined ? undefined : strings.setup.nameError;
    const tenMonths = draft.bill === 'council-tax' && draft.tenMonths;
    return (
      <>
        <Field id={`${formId(draft.key)}-name`} label={t.name} error={nameError}>
          <input
            id={`${formId(draft.key)}-name`}
            className={formStyles.input}
            type="text"
            autoComplete="off"
            value={draft.form.name}
            aria-invalid={nameError !== undefined}
            aria-describedby={describedBy(`${formId(draft.key)}-name`, nameError)}
            onChange={(event) => setForm(draft.key, { name: event.target.value })}
          />
        </Field>
        <OutgoingFields
          id={formId(draft.key)}
          form={tenMonths ? formFor(draft) : draft.form}
          set={(change) => setForm(draft.key, change)}
          errors={mistakes}
          today={step.today}
          holidays={step.holidays}
          accounts={accounts}
          howOften={tenMonths ? ['monthly'] : ['monthly', 'weekly', 'once', 'dates']}
          amountLabel={t.amount}
          showLeaveOut={!tenMonths}
          afterWhen={
            draft.bill === 'council-tax' ? (
              <div
                className={formStyles.withHint}
                {...(tenMonths ? { id: `${formId(draft.key)}-leave-out` } : {})}
              >
                <CheckOption
                  checked={draft.tenMonths}
                  onChange={(value) => update(draft.key, { tenMonths: value })}
                  describedBy={`${formId(draft.key)}-ten-hint${tenMonths && mistakes.leaveOut !== undefined ? ` ${formId(draft.key)}-ten-error` : ''}`}
                >
                  {t.tenMonths}
                </CheckOption>
                <p id={`${formId(draft.key)}-ten-hint`} className={formStyles.hint}>
                  {t.tenMonthsHint}
                </p>
                {tenMonths && mistakes.leaveOut !== undefined ? (
                  <p id={`${formId(draft.key)}-ten-error`} className={formStyles.error}>
                    {t.tenMonthsDate}
                  </p>
                ) : null}
              </div>
            ) : null
          }
        />
      </>
    );
  };

  const added = [...savedRent, ...savedBills].flatMap((item) => {
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
  });

  return (
    <StepFrame
      step={3}
      title={strings.setup.homeBills.title}
      intro={strings.setup.homeBills.intro}
      onSkip={() => step.go(4)}
      onNext={next}
      onBack={() => step.go(2)}
      busy={step.busy}
      problem={step.problem}
    >
      <AddedList items={added} />

      {asksRent ? (
        <SetupCard heading={r.heading} testId="rent-form">
          <ChoiceList<Which>
            legend={r.which}
            name={`${id}-which`}
            value={which}
            options={[
              { value: 'rent', label: r.rent },
              { value: 'mortgage', label: r.mortgage },
              { value: 'none', label: r.none },
            ]}
            onChange={(value) => {
              setWhich(value);
              setRentErrors({});
            }}
          />
          {which === 'none' ? null : (
            <OutgoingFields
              id={rentId}
              form={rent}
              set={setRent}
              errors={rentErrors}
              today={step.today}
              holidays={step.holidays}
              accounts={accounts}
              howOften={['monthly', 'weekly', 'dates']}
              amountLabel={r.amount}
              amountError={r.amountError}
              showEstimate={false}
            />
          )}
        </SetupCard>
      ) : null}

      {checklist.length === 0 ? null : (
        <SetupCard heading={t.tick} testId="bills-checklist">
          {checklist.map((draft) => (
            <div key={draft.key} className={formStyles.stack} data-bill={draft.bill}>
              <CheckOption
                checked={draft.ticked}
                onChange={(ticked) => update(draft.key, { ticked })}
              >
                {draft.bill === null ? '' : t.names[draft.bill]}
              </CheckOption>
              {draft.ticked ? <div className={formStyles.group}>{billForm(draft)}</div> : null}
            </div>
          ))}
        </SetupCard>
      )}

      {others.map((draft) => (
        <SetupCard key={draft.key} heading={t.anotherHeading} testId="bill-form">
          {billForm(draft)}
          <button
            type="button"
            className={formStyles.quiet}
            onClick={() => {
              setDrafts((now) => now.filter((one) => one.key !== draft.key));
              focusAddAnother();
            }}
          >
            {t.removeBill}
          </button>
        </SetupCard>
      ))}

      <button
        data-add-another
        type="button"
        className={formStyles.outlined}
        onClick={() => {
          const draft = blankBill(null, firstAccount);
          setDrafts((now) => [...now, draft]);
          requestAnimationFrame(() =>
            document.getElementById(`${formId(draft.key)}-name`)?.focus(),
          );
        }}
      >
        {t.addAnother}
      </button>
    </StepFrame>
  );
}
