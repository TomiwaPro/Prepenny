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
import { formatDay, weekdayName } from '../lib/dates.ts';
import { holidaysFor } from '../lib/holidays.ts';
import { newId, timeNow } from '../lib/ids.ts';
import {
  blankPayment,
  buildPayment,
  type Ends,
  FIELD_ORDER,
  type HowOften,
  type MonthlyOn,
  monthlyChoices,
  monthOf,
  type PaymentErrors,
  type PaymentField,
  type PaymentForm,
  positionInMonth,
  typeFor,
} from '../lib/new-payment.ts';
import { refusalMessage } from '../lib/refusals.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { CheckOption, DateField, describedBy, Field, MoneyInput, Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import { type ShownActions, useActionsView } from './useActionsView.ts';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.addPayment;

/** The words for each mistake (lib/new-payment.ts). */
const mistakes = {
  ...t,
  amountError: strings.form.amountError,
  dateError: strings.form.dateError,
};

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
    <Sheet open={open} title={t.title} onClose={onClose}>
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
  // A key for each later date's box, so removing one keeps the others' boxes as they are.
  const [dateKeys, setDateKeys] = useState<readonly number[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const holidays = useMemo(
    () => holidaysFor(loaded?.records.settings?.nation ?? 'england-and-wales'),
    [loaded?.records.settings?.nation],
  );
  const refs: Record<PaymentField, RefObject<HTMLInputElement | null>> = {
    name: useRef<HTMLInputElement>(null),
    amount: useRef<HTMLInputElement>(null),
    toAccount: useRef<HTMLInputElement>(null),
    date: useRef<HTMLInputElement>(null),
    weeks: useRef<HTMLInputElement>(null),
    months: useRef<HTMLInputElement>(null),
    leaveOut: useRef<HTMLInputElement>(null),
    dates: useRef<HTMLInputElement>(null),
    count: useRef<HTMLInputElement>(null),
    endDate: useRef<HTMLInputElement>(null),
    lastAmount: useRef<HTMLInputElement>(null),
  };

  const set = <K extends keyof PaymentForm>(key: K, value: PaymentForm[K]) =>
    setForm((now) => ({ ...now, [key]: value }));
  const error = (field: PaymentField) => {
    const mistake = errors[field];
    return mistake === undefined ? undefined : mistakes[mistake];
  };
  const day = (date: string) => formatDay(date, today);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(form.date) && form.date >= '1900-01-01';
  const choices = validDate ? monthlyChoices(form.date, holidays) : (['day'] as MonthlyOn[]);
  const monthlyOn = choices.includes(form.monthlyOn) ? form.monthlyOn : 'day';
  const canMove = view.accounts.length > 1;
  const repeats = form.howOften === 'weekly' || form.howOften === 'monthly';

  const monthlyLabel = (on: MonthlyOn): string => {
    const weekday = weekdayName(form.date);
    switch (on) {
      case 'day':
        return t.onDay(strings.dates.ordinal(Number(form.date.slice(8, 10))));
      case 'weekday':
        return t.onWeekday(t.positions[positionInMonth(form.date) - 1] ?? '', weekday);
      case 'last-weekday':
        return t.onWeekday(t.last, weekday);
      case 'last-day':
        return t.onLastDay;
      case 'last-working-day':
        return t.onLastWorkingDay;
    }
  };

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
    if (field !== undefined) refs[field].current?.focus();
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
          ref={refs.name}
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
          inputRef={refs.amount}
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
        <div className={styles.field}>
          <ChoiceList<string>
            legend={t.to}
            name={`${id}-to`}
            value={form.toAccountId}
            options={accountOptions}
            onChange={(value) => set('toAccountId', value)}
          />
          {errors.toAccount === undefined ? null : (
            <p className={styles.error} role="alert">
              {error('toAccount')}
            </p>
          )}
        </div>
      ) : null}

      <DateField
        id={`${id}-date`}
        label={t.nextPayment}
        value={form.date}
        today={today}
        min={today}
        onChange={(value) => set('date', value)}
        error={error('date')}
        inputRef={refs.date}
      />

      <ChoiceList<HowOften>
        legend={t.howOften}
        name={`${id}-often`}
        value={form.howOften}
        options={[
          { value: 'once', label: t.once },
          { value: 'weekly', label: t.weekly },
          { value: 'monthly', label: t.monthly },
          { value: 'dates', label: t.dates },
        ]}
        onChange={(value) => set('howOften', value)}
      />

      {form.howOften === 'weekly' ? (
        <Field
          id={`${id}-weeks`}
          label={t.weeksApart}
          error={error('weeks')}
          hint={
            validDate && /^\d+$/.test(form.weeks) && Number(form.weeks) >= 1
              ? `${t.weeksApartHint} ${t.everyWeeks(Number(form.weeks), weekdayName(form.date))}`
              : t.weeksApartHint
          }
        >
          <input
            ref={refs.weeks}
            id={`${id}-weeks`}
            className={`${styles.input} num`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={form.weeks}
            aria-invalid={errors.weeks !== undefined}
            aria-describedby={describedBy(`${id}-weeks`, error('weeks'), [`${id}-weeks-hint`])}
            onChange={(event) => set('weeks', event.target.value)}
          />
        </Field>
      ) : null}

      {form.howOften === 'monthly' ? (
        <>
          <Field
            id={`${id}-months`}
            label={t.monthsApart}
            error={error('months')}
            hint={t.monthsApartHint}
          >
            <input
              ref={refs.months}
              id={`${id}-months`}
              className={`${styles.input} num`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={form.months}
              aria-invalid={errors.months !== undefined}
              aria-describedby={describedBy(`${id}-months`, error('months'), [`${id}-months-hint`])}
              onChange={(event) => set('months', event.target.value)}
            />
          </Field>
          {validDate ? (
            <ChoiceList<MonthlyOn>
              legend={t.onWhichDay}
              name={`${id}-on`}
              value={monthlyOn}
              options={choices.map((value) => ({ value, label: monthlyLabel(value) }))}
              onChange={(value) => set('monthlyOn', value)}
            />
          ) : null}
          <CheckOption
            checked={form.leaveOut}
            onChange={(value) => set('leaveOut', value)}
            describedBy={errors.leaveOut === undefined ? undefined : `${id}-leave-out-error`}
          >
            {t.leaveOut}
          </CheckOption>
          {form.leaveOut ? (
            <fieldset className={styles.months}>
              <legend>{t.leaveOutLegend}</legend>
              {strings.dates.monthsLong.map((name, index) => {
                const month = index + 1;
                return (
                  <label key={name} className={styles.option}>
                    <input
                      ref={index === 0 ? refs.leaveOut : undefined}
                      type="checkbox"
                      checked={form.leftOut.includes(month)}
                      disabled={validDate && monthOf(form.date) === month}
                      onChange={(event) =>
                        set(
                          'leftOut',
                          event.target.checked
                            ? [...form.leftOut, month]
                            : form.leftOut.filter((one) => one !== month),
                        )
                      }
                    />
                    <span>{name}</span>
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          {errors.leaveOut === undefined ? null : (
            <p id={`${id}-leave-out-error`} className={styles.error}>
              {error('leaveOut')}
            </p>
          )}
        </>
      ) : null}

      {form.howOften === 'dates' ? (
        <div className={styles.stack}>
          <p className={styles.label}>{t.chosenDates}</p>
          {form.laterDates.map((date, index) => (
            <div className={styles.dateRow} key={dateKeys[index] ?? `extra-${date}`}>
              <DateField
                id={`${id}-date-${index}`}
                label={t.laterDate(index + 2)}
                value={date}
                today={today}
                min={form.date}
                inputRef={index === 0 ? refs.dates : undefined}
                onChange={(value) =>
                  set(
                    'laterDates',
                    form.laterDates.map((one, at) => (at === index ? value : one)),
                  )
                }
              />
              <button
                type="button"
                className={styles.quiet}
                onClick={() => {
                  set(
                    'laterDates',
                    form.laterDates.filter((_, at) => at !== index),
                  );
                  setDateKeys(dateKeys.filter((_, at) => at !== index));
                }}
              >
                {t.removeDate(date === '' ? t.laterDate(index + 2) : day(date))}
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.outlined}
            onClick={() => {
              set('laterDates', [...form.laterDates, '']);
              setDateKeys([...dateKeys, (dateKeys.at(-1) ?? 0) + 1]);
            }}
          >
            {t.addDate}
          </button>
          {errors.dates === undefined ? null : (
            <p className={styles.error} role="alert">
              {error('dates')}
            </p>
          )}
        </div>
      ) : null}

      {repeats ? (
        <>
          <ChoiceList<Ends>
            legend={t.ends}
            name={`${id}-ends`}
            value={form.ends}
            options={[
              { value: 'never', label: t.never },
              { value: 'after', label: t.after },
              { value: 'on', label: t.onDate },
            ]}
            onChange={(value) => set('ends', value)}
          />
          {form.ends === 'after' ? (
            <Field id={`${id}-count`} label={t.howMany} error={error('count')}>
              <input
                ref={refs.count}
                id={`${id}-count`}
                className={`${styles.input} num`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={form.count}
                aria-invalid={errors.count !== undefined}
                aria-describedby={describedBy(`${id}-count`, error('count'))}
                onChange={(event) => set('count', event.target.value)}
              />
            </Field>
          ) : null}
          {form.ends === 'on' ? (
            <DateField
              id={`${id}-end`}
              label={t.lastDate}
              value={form.endDate}
              today={today}
              min={form.date}
              onChange={(value) => set('endDate', value)}
              error={error('endDate')}
              inputRef={refs.endDate}
            />
          ) : null}
          {form.ends === 'never' ? null : (
            <>
              <CheckOption
                checked={form.differentLast}
                onChange={(value) => set('differentLast', value)}
              >
                {t.differentLast}
              </CheckOption>
              {form.differentLast ? (
                <Field id={`${id}-last`} label={t.lastAmount} error={error('lastAmount')}>
                  <MoneyInput
                    id={`${id}-last`}
                    inputRef={refs.lastAmount}
                    value={form.lastAmount}
                    onChange={(value) => set('lastAmount', value)}
                    invalid={errors.lastAmount !== undefined}
                    describedBy={describedBy(`${id}-last`, error('lastAmount'))}
                  />
                </Field>
              ) : null}
            </>
          )}
        </>
      ) : null}

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
