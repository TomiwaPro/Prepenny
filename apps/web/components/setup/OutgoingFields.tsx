'use client';

// A payment going out, as setup asks for it (brief 4.1, D86, D150, step
// 2e): its amount, "Next payment", how often, and which account it comes
// from when there's more than one. Rent, bills and debt payments all use it.

import type { BankHolidayLookup } from '@prepenny/engine';
import type { ReactNode } from 'react';
import type { HowOften, PaymentErrors, WhenForm } from '../../lib/new-payment.ts';
import type { OutgoingForm } from '../../lib/setup-forms.ts';
import { strings } from '../../strings/en-GB.ts';
import { ChoiceList } from '../ChoiceList.tsx';
import { CheckOption, describedBy, Field, MoneyInput } from '../Fields.tsx';
import { useWhenRefs, WhenFields } from '../WhenFields.tsx';

export function OutgoingFields<F extends OutgoingForm>({
  id,
  form,
  set,
  errors,
  today,
  holidays,
  accounts,
  howOften,
  amountLabel,
  amountError,
  showEstimate = true,
  showEnds = false,
  showLeaveOut = true,
  afterWhen,
}: {
  readonly id: string;
  readonly form: F;
  readonly set: (change: Partial<OutgoingForm>) => void;
  readonly errors: PaymentErrors;
  readonly today: string;
  readonly holidays: BankHolidayLookup;
  readonly accounts: readonly { readonly value: string; readonly label: string }[];
  readonly howOften: readonly HowOften[];
  readonly amountLabel: string;
  /** Words for a missing amount, when they're special to the step. */
  readonly amountError?: string;
  readonly showEstimate?: boolean;
  readonly showEnds?: boolean;
  readonly showLeaveOut?: boolean;
  /** Anything to show between "how often" and the account, such as council tax's 10 payments. */
  readonly afterWhen?: ReactNode;
}) {
  const refs = useWhenRefs();
  const amount =
    errors.amount === undefined ? undefined : (amountError ?? strings.setup.amountError);
  return (
    <>
      <Field id={`${id}-amount`} label={amountLabel} error={amount}>
        <MoneyInput
          id={`${id}-amount`}
          value={form.amount}
          onChange={(value) => set({ amount: value })}
          invalid={amount !== undefined}
          describedBy={describedBy(`${id}-amount`, amount)}
        />
      </Field>
      <WhenFields
        id={id}
        form={form}
        set={<K extends keyof WhenForm>(key: K, value: WhenForm[K]) =>
          set({ [key]: value } as Partial<OutgoingForm>)
        }
        errors={errors}
        refs={refs}
        today={today}
        holidays={holidays}
        howOften={howOften}
        showEnds={showEnds}
        showLeaveOut={showLeaveOut}
      />
      {afterWhen}
      {accounts.length > 1 ? (
        <ChoiceList<string>
          legend={strings.setup.bills.from}
          name={`${id}-from`}
          value={form.accountId}
          options={accounts}
          onChange={(accountId) => set({ accountId })}
        />
      ) : null}
      {showEstimate ? (
        <CheckOption checked={form.isEstimate} onChange={(isEstimate) => set({ isEstimate })}>
          {strings.setup.bills.isEstimate}
        </CheckOption>
      ) : null}
    </>
  );
}

/** The ids of an outgoing payment's boxes, in order, for focusing the first mistake. */
export function outgoingFieldIds(id: string, errors: PaymentErrors): string[] {
  const order: [keyof PaymentErrors, string][] = [
    ['amount', `${id}-amount`],
    ['date', `${id}-date`],
    ['weeks', `${id}-weeks`],
    ['months', `${id}-months`],
    ['leaveOut', `${id}-leave-out`],
    ['dates', `${id}-dates`],
    ['count', `${id}-count`],
    ['endDate', `${id}-end`],
    ['lastAmount', `${id}-last`],
  ];
  return order.filter(([field]) => errors[field] !== undefined).map(([, element]) => element);
}
