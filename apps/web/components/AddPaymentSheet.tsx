'use client';

// Add a payment (brief 4.3 and 4.4, D86, D150, D160, D199): money going
// out, coming in, or moving between accounts; its name and amount; the
// "Next payment" date, today or later; how often; when it ends, with a
// different last amount; the weekend and bank holiday rule; its type (D79);
// a debt or savings goal it's linked to; whether it's an estimate; and a
// note. It's saved at once as one change, the plan updates, and the undo
// bar can take it back.

import {
  type Direction,
  type HolidayRule,
  PAYMENT_TYPES,
  type PaymentType,
} from '@prepenny/engine';
import { type RefObject, useId, useMemo, useRef, useState } from 'react';
import { holidaysFor } from '../lib/holidays.ts';
import { newId, timeNow } from '../lib/ids.ts';
import {
  blankPayment,
  buildPayment,
  FIELD_ORDER,
  type PaymentErrors,
  type PaymentField,
  type PaymentForm,
  typeFor,
  type WhenForm,
} from '../lib/new-payment.ts';
import { refusalMessage } from '../lib/refusals.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { CheckOption, describedBy, Field, MoneyInput, Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import { type ShownActions, useActionsView } from './useActionsView.ts';
import { useOpenCount } from './useOpenCount.ts';
import {
  focusField,
  monthlyOnFor,
  paymentMistakes,
  useWhenRefs,
  WhenFields,
} from './WhenFields.tsx';

const t = strings.addPayment;

const mistakes = paymentMistakes;

export function AddPaymentSheet({
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
      {opened === 0 ? null : <AddPaymentForm key={opened} shown={shown} onDone={onClose} />}
    </Sheet>
  );
}

function AddPaymentForm({
  shown,
  onDone,
}: {
  readonly shown: ShownActions;
  readonly onDone: () => void;
}) {
  const view = shown.view;
  if (view === null) {
    return shown.failed ? <Problem text={strings.errors.plan} /> : <p>{strings.sheet.working}</p>;
  }
  return <PaymentFields view={view} onDone={onDone} />;
}

function PaymentFields({
  view,
  onDone,
}: {
  readonly view: NonNullable<ShownActions['view']>;
  readonly onDone: () => void;
}) {
  const { makeChange, loaded } = usePlanActions();
  const id = useId();
  const today = view.today;
  const first = view.accounts.find((one) => one.id === view.homeAccountId) ?? view.accounts[0];
  const other = view.accounts.find((one) => one.id !== first?.id) ?? first;
  const [form, setForm] = useState<PaymentForm>(() =>
    blankPayment(today, first?.id ?? '', other?.id ?? ''),
  );
  const [errors, setErrors] = useState<PaymentErrors>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const holidays = useMemo(
    () => holidaysFor(loaded?.records.settings?.nation ?? 'england-and-wales'),
    [loaded?.records.settings?.nation],
  );
  // Each box, or for a group of choices the group, so focus can go to the first mistake.
  const when = useWhenRefs();
  const inputs = {
    name: useRef<HTMLInputElement>(null),
    amount: useRef<HTMLInputElement>(null),
  };
  const groups = {
    toAccount: useRef<HTMLDivElement>(null),
  };
  const refs: Record<PaymentField, RefObject<HTMLElement | null>> = {
    ...when,
    ...inputs,
    ...groups,
  };

  const set = <K extends keyof PaymentForm>(key: K, value: PaymentForm[K]) =>
    setForm((now) => ({ ...now, [key]: value }));
  const setWhen = <K extends keyof WhenForm>(key: K, value: WhenForm[K]) =>
    setForm((now) => ({ ...now, [key]: value }));
  const error = (field: PaymentField) => {
    const mistake = errors[field];
    return mistake === undefined ? undefined : mistakes[mistake];
  };
  const monthlyOn = monthlyOnFor(form, holidays);
  const canMove = view.accounts.length > 1;

  // A payment can be linked to a debt only when it's going out (D98), and to
  // a savings goal when it moves money into or out of the goal's account (D114).
  const goals = view.goals.filter(
    (goal) =>
      goal.accountId === form.accountId ||
      (form.direction === 'transfer' && goal.accountId === form.toAccountId),
  );
  const debts = form.direction === 'out' ? view.debts : [];
  const links = [
    { value: '', label: t.nothing },
    ...debts.map((debt) => ({ value: `debt:${debt.id}`, label: t.debt(debt.name) })),
    ...goals.map((goal) => ({ value: `goal:${goal.id}`, label: t.goal(goal.name) })),
  ];
  const link = links.some((one) => one.value === form.link) ? form.link : '';

  function focusFirst(found: PaymentErrors) {
    const field = FIELD_ORDER.find((one) => found[one] !== undefined);
    if (field === undefined) return;
    focusField(refs[field].current, found, form);
  }

  async function save() {
    if (busy) return;
    setProblem(null);
    const built = buildPayment({ ...form, monthlyOn, link }, today, holidays);
    if (!built.ok) {
      setErrors(built.errors);
      focusFirst(built.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    const outcome = await makeChange(
      { kind: 'add-payment', series: { ...built.series, id: newId() }, madeAt: timeNow() },
      strings.undo.added(built.series.name),
    );
    setBusy(false);
    if (outcome.ok) {
      onDone();
      return;
    }
    // A refusal about one box is explained beside it; anything else under Save.
    const field: Partial<Record<string, [PaymentField, PaymentErrors[PaymentField]]>> = {
      'payment-before-today': ['date', 'beforeToday'],
      'same-account': ['toAccount', 'sameAccount'],
      'needs-name': ['name', 'nameError'],
    };
    const found = field[outcome.code];
    if (found === undefined) {
      setProblem(refusalMessage(outcome.code));
      return;
    }
    const next = { [found[0]]: found[1] } as PaymentErrors;
    setErrors(next);
    focusFirst(next);
  }

  const accountOptions = view.accounts.map((one) => ({ value: one.id, label: one.name }));
  const directions: { value: Direction; label: string }[] = [
    { value: 'out', label: t.out },
    { value: 'in', label: t.in },
    ...(canMove ? [{ value: 'transfer' as const, label: t.transfer }] : []),
  ];

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
      <ChoiceList<Direction>
        legend={t.kind}
        name={`${id}-direction`}
        value={form.direction}
        options={directions}
        onChange={(direction) =>
          setForm((now) => ({ ...now, direction, type: typeFor(direction) }))
        }
      />

      <Field id={`${id}-name`} label={t.name} error={error('name')}>
        <input
          ref={inputs.name}
          id={`${id}-name`}
          className={styles.input}
          type="text"
          autoComplete="off"
          value={form.name}
          aria-invalid={errors.name !== undefined}
          aria-describedby={describedBy(`${id}-name`, error('name'))}
          onChange={(event) => set('name', event.target.value)}
        />
      </Field>

      <Field id={`${id}-amount`} label={t.amount} error={error('amount')}>
        <MoneyInput
          id={`${id}-amount`}
          inputRef={inputs.amount}
          value={form.amount}
          onChange={(value) => set('amount', value)}
          invalid={errors.amount !== undefined}
          describedBy={describedBy(`${id}-amount`, error('amount'))}
        />
      </Field>

      {canMove ? (
        <ChoiceList<string>
          legend={form.direction === 'in' ? t.into : t.from}
          name={`${id}-account`}
          value={form.accountId}
          options={accountOptions}
          onChange={(value) => set('accountId', value)}
        />
      ) : null}
      {form.direction === 'transfer' ? (
        <div className={styles.field} ref={groups.toAccount}>
          <ChoiceList<string>
            legend={t.to}
            name={`${id}-to`}
            value={form.toAccountId}
            options={accountOptions}
            onChange={(value) => set('toAccountId', value)}
            describedBy={errors.toAccount === undefined ? undefined : `${id}-to-error`}
          />
          {errors.toAccount === undefined ? null : (
            <p id={`${id}-to-error`} className={styles.error}>
              {error('toAccount')}
            </p>
          )}
        </div>
      ) : null}

      <WhenFields
        id={id}
        form={form}
        set={setWhen}
        errors={errors}
        refs={when}
        today={today}
        holidays={holidays}
      />

      {form.howOften === 'monthly' && monthlyOn === 'last-working-day' ? null : (
        <ChoiceList<HolidayRule>
          legend={t.weekend}
          name={`${id}-weekend`}
          value={form.holidayRule}
          options={[
            { value: 'keep', label: t.keep },
            { value: 'working-day-before', label: t.before },
            { value: 'working-day-after', label: t.afterDay },
          ]}
          onChange={(value) => set('holidayRule', value)}
        />
      )}

      <Field id={`${id}-type`} label={t.type}>
        <select
          id={`${id}-type`}
          className={styles.select}
          value={form.type}
          onChange={(event) => set('type', event.target.value as PaymentType)}
        >
          {PAYMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {strings.types[type]}
            </option>
          ))}
        </select>
      </Field>

      {links.length > 1 ? (
        <Field id={`${id}-link`} label={t.linked}>
          <select
            id={`${id}-link`}
            className={styles.select}
            value={link}
            onChange={(event) => set('link', event.target.value)}
          >
            {links.map((one) => (
              <option key={one.value} value={one.value}>
                {one.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <CheckOption checked={form.isEstimate} onChange={(value) => set('isEstimate', value)}>
        {t.isEstimate}
      </CheckOption>

      <Field id={`${id}-note`} label={t.note}>
        <input
          id={`${id}-note`}
          className={styles.input}
          type="text"
          autoComplete="off"
          value={form.note}
          onChange={(event) => set('note', event.target.value)}
        />
      </Field>

      <button type="submit" className={styles.main} aria-disabled={busy}>
        {t.save}
      </button>
      <Problem text={problem} />
    </form>
  );
}
