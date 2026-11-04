'use client';

// The boxes for a debt (brief 4.6, D98, D101, D106), shared by setup's step 5
// and the Debts screen's add and change sheets, so both ask the same way:
// its name and kind, a currency and rate for money owed to a person, what's
// owed now and what it started at, and for a credit card its interest rate,
// "0% until", statement day and minimum payment.

import { DEBT_KINDS, type DebtKind } from '@prepenny/engine';
import {
  DEBT_CURRENCIES,
  type DebtCurrency,
  type DebtErrors,
  type DebtForm,
} from '../lib/setup-forms.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { DateField, describedBy, Field, MoneyInput } from './Fields.tsx';
import styles from './Form.module.css';

const t = strings.setup.debts;
const sheet = strings.debtSheet;

/** The words for a mistake in one of the debt's boxes. */
export function debtMistakeWords(
  field: keyof DebtErrors,
  mistake: DebtErrors[keyof DebtErrors],
): string | undefined {
  if (mistake === undefined) return undefined;
  if (field === 'name') return t.nameError;
  if (field === 'rate') return t.rateError;
  switch (mistake) {
    case 'statementDayNeeded':
      return sheet.statementDayNeeded;
    case 'zeroUntilError':
      return strings.form.dateError;
    case 'minimumError':
      return sheet.minimumError;
    case 'percentError':
      return sheet.percentError;
    default:
      return mistake in t ? (t as unknown as Record<string, string>)[mistake] : undefined;
  }
}

/** The boxes in the order they show, so focus can go to the first mistake. */
export const DEBT_FIELD_ORDER = [
  'name',
  'rate',
  'owed',
  'started',
  'interest',
  'zeroUntil',
  'statementDay',
  'minimumAmount',
  'minimumPercent',
  'minimumAtLeast',
] as const;

type Minimum = DebtForm['minimum'];

export function DebtFields({
  base,
  form,
  set,
  errors,
  today,
  showOwed,
}: {
  /** The start of every box's id. */
  readonly base: string;
  readonly form: DebtForm;
  readonly set: (change: Partial<DebtForm>) => void;
  readonly errors: DebtErrors;
  readonly today: string;
  /** "What you owe now": only when it's added. After that it changes with Update from statement. */
  readonly showOwed: boolean;
}) {
  const error = (field: keyof DebtErrors) => debtMistakeWords(field, errors[field]);
  const sign = (t.signs as Readonly<Record<DebtCurrency, string>>)[form.currency];
  const text = (
    field: 'rate' | 'interest' | 'statementDay' | 'minimumPercent',
    label: string,
    hint: string | null,
    inputMode: 'decimal' | 'numeric',
  ) => (
    <Field id={`${base}-${field}`} label={label} error={error(field)} hint={hint}>
      <input
        id={`${base}-${field}`}
        className={`${styles.input} num`}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        value={form[field]}
        aria-invalid={error(field) !== undefined}
        aria-describedby={describedBy(`${base}-${field}`, error(field), [
          hint === null ? null : `${base}-${field}-hint`,
        ])}
        onChange={(event) => set({ [field]: event.target.value })}
      />
    </Field>
  );
  const money = (
    field: 'owed' | 'started' | 'minimumAmount' | 'minimumAtLeast',
    label: string,
    hint: string | null,
  ) => (
    <Field id={`${base}-${field}`} label={label} error={error(field)} hint={hint}>
      <MoneyInput
        id={`${base}-${field}`}
        symbol={sign}
        value={form[field]}
        onChange={(value) => set({ [field]: value })}
        invalid={error(field) !== undefined}
        describedBy={describedBy(`${base}-${field}`, error(field), [
          hint === null ? null : `${base}-${field}-hint`,
        ])}
      />
    </Field>
  );

  return (
    <>
      <Field id={`${base}-name`} label={t.name} error={error('name')}>
        <input
          id={`${base}-name`}
          className={styles.input}
          type="text"
          autoComplete="off"
          value={form.name}
          aria-invalid={error('name') !== undefined}
          aria-describedby={describedBy(`${base}-name`, error('name'))}
          onChange={(event) => set({ name: event.target.value })}
        />
      </Field>
      <ChoiceList<DebtKind>
        legend={t.kind}
        name={`${base}-kind`}
        value={form.kind}
        options={DEBT_KINDS.map((value) => ({ value, label: t.kinds[value] }))}
        onChange={(kind) =>
          set({
            kind,
            // Only money owed to a person is offered in another currency.
            ...(kind === 'owed-to-a-person' ? {} : { currency: 'GBP' as const }),
          })
        }
      />
      {form.kind === 'owed-to-a-person' ? (
        <ChoiceList<DebtCurrency>
          legend={t.currency}
          name={`${base}-currency`}
          value={form.currency}
          options={DEBT_CURRENCIES.map((value) => ({ value, label: t.currencies[value] }))}
          onChange={(currency) => set({ currency })}
        />
      ) : null}
      {form.currency === 'GBP' ? null : text('rate', t.rate(form.currency), t.rateHint, 'decimal')}
      {showOwed ? money('owed', t.owed, null) : null}
      {money('started', t.started, t.startedHint)}
      {form.kind === 'credit-card' ? (
        <>
          {text('interest', t.interest, t.interestHint, 'decimal')}
          <DateField
            id={`${base}-zeroUntil`}
            label={sheet.zeroUntil}
            value={form.zeroUntil}
            today={today}
            onChange={(zeroUntil) => set({ zeroUntil })}
            error={error('zeroUntil')}
            extraHint={{ id: `${base}-zeroUntil-hint`, text: sheet.zeroUntilHint }}
          />
          {text('statementDay', t.statementDay, t.statementDayHint, 'numeric')}
          <ChoiceList<Minimum>
            legend={sheet.minimum}
            name={`${base}-minimum`}
            value={form.minimum}
            options={[
              { value: 'none', label: sheet.minimumNone },
              { value: 'typed', label: sheet.minimumTyped },
              { value: 'rule', label: sheet.minimumRule },
            ]}
            onChange={(minimum) => set({ minimum })}
          />
          {form.minimum === 'typed' ? money('minimumAmount', sheet.minimumAmount, null) : null}
          {form.minimum === 'rule' ? (
            <>
              {text('minimumPercent', sheet.minimumPercent, sheet.minimumPercentHint, 'decimal')}
              {money('minimumAtLeast', sheet.minimumAtLeast, null)}
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
