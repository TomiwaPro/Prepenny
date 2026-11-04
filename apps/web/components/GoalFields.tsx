'use client';

// The boxes for a savings goal (brief 4.7, D114, D153, D226), shared by
// setup's step 7 and the Savings goals screen: what it's for, the target,
// a date if there is one, the account it's kept in (or a new savings
// account), what's already saved, and the money moved into it, each payday
// or another way. Changing a goal asks only for the goal's own details.

import type { BankHolidayLookup } from '@prepenny/engine';
import { formatDay } from '../lib/dates.ts';
import type { PaymentErrors, WhenForm } from '../lib/new-payment.ts';
import {
  type EachPayday,
  type GoalErrors,
  type GoalForm,
  type MoveOften,
  NEW_ACCOUNT,
} from '../lib/setup-forms.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { DateField, describedBy, Field, MoneyInput } from './Fields.tsx';
import formStyles from './Form.module.css';
import { paymentMistakes, WhenFields, type WhenRefs } from './WhenFields.tsx';

const t = strings.setup.savings;

/** The words for a mistake in one of the goal's boxes. */
export function goalMistakeWords(errors: GoalErrors, field: keyof GoalErrors): string | undefined {
  const mistake = errors[field];
  if (mistake === undefined) return undefined;
  if (mistake === 'sameAccount') return strings.setup.sameAccount;
  if (mistake === 'balanceError') return strings.setup.account.balanceError;
  if (mistake in t) return (t as unknown as Record<string, string>)[mistake];
  return paymentMistakes[mistake as keyof typeof paymentMistakes] as string | undefined;
}

/** The boxes in the order they show, so focus can go to the first mistake. */
export const GOAL_FIELD_ORDER = [
  'name',
  'target',
  'targetDate',
  'newName',
  'newBalance',
  'saved',
  'move',
  'fromAccount',
] as const;

export function GoalFields({
  base,
  form,
  set,
  errors,
  today,
  holidays,
  accounts,
  eachPayday,
  refs,
  changing = false,
}: {
  readonly base: string;
  readonly form: GoalForm;
  readonly set: (change: Partial<GoalForm>) => void;
  readonly errors: GoalErrors;
  readonly today: string;
  readonly holidays: BankHolidayLookup;
  readonly accounts: readonly { readonly value: string; readonly label: string }[];
  readonly eachPayday: EachPayday | null;
  readonly refs: WhenRefs;
  /** Changing a goal: no new account and no money to move, which are payments of their own. */
  readonly changing?: boolean;
}) {
  const error = (field: keyof GoalErrors) => goalMistakeWords(errors, field);
  const keptIn = form.keptIn;
  const fromOptions = accounts.filter((one) => one.value !== keptIn);
  const moving = form.move.trim() !== '';
  const often: MoveOften = eachPayday === null ? 'own' : form.moveOften;
  return (
    <>
      <Field id={`${base}-name`} label={t.name} error={error('name')}>
        <input
          id={`${base}-name`}
          className={formStyles.input}
          type="text"
          autoComplete="off"
          value={form.name}
          aria-invalid={error('name') !== undefined}
          aria-describedby={describedBy(`${base}-name`, error('name'))}
          onChange={(event) => set({ name: event.target.value })}
        />
      </Field>
      <Field id={`${base}-target`} label={t.target} error={error('target')}>
        <MoneyInput
          id={`${base}-target`}
          value={form.target}
          onChange={(target) => set({ target })}
          invalid={error('target') !== undefined}
          describedBy={describedBy(`${base}-target`, error('target'))}
        />
      </Field>
      <DateField
        id={`${base}-targetDate`}
        label={t.targetDate}
        value={form.targetDate}
        today={today}
        min={today}
        onChange={(targetDate) => set({ targetDate })}
        error={error('targetDate')}
      />
      <ChoiceList<string>
        legend={t.keptIn}
        name={`${base}-kept-in`}
        value={keptIn}
        options={changing ? accounts : [...accounts, { value: NEW_ACCOUNT, label: t.newAccount }]}
        onChange={(value) =>
          set({
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
              onChange={(event) => set({ newName: event.target.value })}
            />
          </Field>
          <Field id={`${base}-newBalance`} label={t.newBalance} error={error('newBalance')}>
            <MoneyInput
              id={`${base}-newBalance`}
              value={form.newBalance}
              onChange={(newBalance) => set({ newBalance })}
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
          onChange={(value) => set({ saved: value })}
          invalid={error('saved') !== undefined}
          describedBy={describedBy(`${base}-saved`, error('saved'), [`${base}-saved-hint`])}
        />
      </Field>
      {changing ? null : (
        <div className={formStyles.group}>
          <Field id={`${base}-move`} label={t.move} error={error('move')} hint={t.moveHint}>
            <MoneyInput
              id={`${base}-move`}
              value={form.move}
              onChange={(move) => set({ move })}
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
                      label: t.eachPayday(formatDay(eachPayday.start, today)),
                    },
                    { value: 'own', label: t.ownWhen },
                  ]}
                  onChange={(moveOften) => set({ moveOften })}
                />
              )}
              {often === 'own' ? (
                <WhenFields
                  id={`${base}-move`}
                  form={form}
                  set={<K extends keyof WhenForm>(key: K, value: WhenForm[K]) =>
                    set({ [key]: value } as Partial<GoalForm>)
                  }
                  errors={errors as PaymentErrors}
                  refs={refs}
                  today={today}
                  holidays={holidays}
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
                    onChange={(fromAccountId) => set({ fromAccountId })}
                    describedBy={
                      error('fromAccount') === undefined ? undefined : `${base}-from-error`
                    }
                    invalid={error('fromAccount') !== undefined}
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
      )}
    </>
  );
}
