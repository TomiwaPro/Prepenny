'use client';

// When a payment happens (brief 4.4, D86, D150, D199): the "Next payment"
// date, how often it repeats, and when it ends with a different last amount.
// Shared by Add a payment and setup (step 2e), so both ask the same way.

import type { BankHolidayLookup } from '@prepenny/engine';
import { type RefObject, useRef, useState } from 'react';
import { formatDay, weekdayName } from '../lib/dates.ts';
import {
  type Ends,
  type HowOften,
  type MonthlyOn,
  monthlyChoices,
  monthOf,
  type PaymentErrors,
  type PaymentField,
  positionInMonth,
  type WhenForm,
} from '../lib/new-payment.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { CheckOption, DateField, describedBy, Field, MoneyInput } from './Fields.tsx';
import styles from './Form.module.css';

const t = strings.addPayment;

/** The words for each mistake (lib/new-payment.ts). */
export const paymentMistakes = {
  ...t,
  amountError: strings.form.amountError,
  dateError: strings.form.dateError,
};

/** The boxes, and groups of choices, of the when fields, so focus can go to the first mistake. */
export interface WhenRefs {
  readonly date: RefObject<HTMLInputElement | null>;
  readonly weeks: RefObject<HTMLInputElement | null>;
  readonly months: RefObject<HTMLInputElement | null>;
  readonly count: RefObject<HTMLInputElement | null>;
  readonly endDate: RefObject<HTMLInputElement | null>;
  readonly lastAmount: RefObject<HTMLInputElement | null>;
  readonly leaveOut: RefObject<HTMLFieldSetElement | null>;
  readonly dates: RefObject<HTMLFieldSetElement | null>;
}

export function useWhenRefs(): WhenRefs {
  return {
    date: useRef<HTMLInputElement>(null),
    weeks: useRef<HTMLInputElement>(null),
    months: useRef<HTMLInputElement>(null),
    count: useRef<HTMLInputElement>(null),
    endDate: useRef<HTMLInputElement>(null),
    lastAmount: useRef<HTMLInputElement>(null),
    leaveOut: useRef<HTMLFieldSetElement>(null),
    dates: useRef<HTMLFieldSetElement>(null),
  };
}

/** Moves focus to the box of a mistake: in a group, the month or choice that's wrong, or its first box. */
export function focusField(
  element: HTMLElement | null | undefined,
  found: PaymentErrors,
  form: Pick<WhenForm, 'date'>,
) {
  if (element === null || element === undefined) return;
  if (element instanceof HTMLInputElement) {
    element.focus();
    return;
  }
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(form.date) && form.date >= '1900-01-01';
  const month =
    found.leaveOut === 'leaveOutNext' && validDate
      ? element.querySelector<HTMLInputElement>(`input[data-month="${monthOf(form.date)}"]`)
      : null;
  (
    month ??
    element.querySelector<HTMLInputElement>('input:checked') ??
    element.querySelector<HTMLInputElement>('input')
  )?.focus();
}

/** "The 13th of the month", "The second Friday of the month" and so on (D199). */
export function monthlyLabel(on: MonthlyOn, date: string): string {
  const weekday = weekdayName(date);
  switch (on) {
    case 'day':
      return t.onDay(strings.dates.ordinal(Number(date.slice(8, 10))));
    case 'weekday':
      return t.onWeekday(t.positions[positionInMonth(date) - 1] ?? '', weekday);
    case 'last-weekday':
      return t.onWeekday(t.last, weekday);
    case 'last-day':
      return t.onLastDay;
    case 'last-working-day':
      return t.onLastWorkingDay;
  }
}

/** Whether a date box holds a date the choices can be worked out from. */
export function isDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && text >= '1900-01-01';
}

/** The monthly choice that applies: the one picked, if the date gives it. */
export function monthlyOnFor(form: WhenForm, holidays: BankHolidayLookup): MonthlyOn {
  const choices = isDate(form.date) ? monthlyChoices(form.date, holidays) : ['day'];
  return choices.includes(form.monthlyOn) ? form.monthlyOn : 'day';
}

/** The full set of how-often choices (D199). */
export const ALL_HOW_OFTEN: readonly HowOften[] = ['once', 'weekly', 'monthly', 'dates'];

export function WhenFields<F extends WhenForm>({
  id,
  form,
  set,
  errors,
  refs,
  today,
  holidays,
  howOften = ALL_HOW_OFTEN,
  dateLabel = t.nextPayment,
  showEnds = true,
  showLeaveOut = true,
}: {
  readonly id: string;
  readonly form: F;
  readonly set: <K extends keyof WhenForm>(key: K, value: WhenForm[K]) => void;
  readonly errors: PaymentErrors;
  readonly refs: WhenRefs;
  readonly today: string;
  readonly holidays: BankHolidayLookup;
  /** Which how-often choices to offer, in this order. */
  readonly howOften?: readonly HowOften[];
  readonly dateLabel?: string;
  /** Offer "When it ends" and a different last amount for a payment that repeats. */
  readonly showEnds?: boolean;
  /** Offer "Leave out some months", unless the step asks in its own way (council tax). */
  readonly showLeaveOut?: boolean;
}) {
  const error = (field: PaymentField) => {
    const mistake = errors[field];
    return mistake === undefined ? undefined : paymentMistakes[mistake];
  };
  const validDate = isDate(form.date);
  const choices = validDate ? monthlyChoices(form.date, holidays) : (['day'] as MonthlyOn[]);
  const monthlyOn = choices.includes(form.monthlyOn) ? form.monthlyOn : 'day';
  const repeats = form.howOften === 'weekly' || form.howOften === 'monthly';
  const howOftenLabels: Record<HowOften, string> = {
    once: t.once,
    weekly: t.weekly,
    monthly: t.monthly,
    dates: t.dates,
  };

  return (
    <>
      <DateField
        id={`${id}-date`}
        label={dateLabel}
        value={form.date}
        today={today}
        min={today}
        onChange={(value) => set('date', value)}
        error={error('date')}
        inputRef={refs.date}
      />

      {howOften.length > 1 ? (
        <ChoiceList<HowOften>
          legend={t.howOften}
          name={`${id}-often`}
          value={form.howOften}
          options={howOften.map((value) => ({ value, label: howOftenLabels[value] }))}
          onChange={(value) => set('howOften', value)}
        />
      ) : null}

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
              options={choices.map((value) => ({ value, label: monthlyLabel(value, form.date) }))}
              onChange={(value) => set('monthlyOn', value)}
            />
          ) : null}
          {showLeaveOut ? (
            <LeaveOut id={id} form={form} set={set} error={error('leaveOut')} refs={refs} />
          ) : null}
        </>
      ) : null}

      {form.howOften === 'dates' ? (
        <ChosenDates
          id={id}
          form={form}
          set={set}
          error={error('dates')}
          refs={refs}
          today={today}
        />
      ) : null}

      {repeats && showEnds ? (
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
    </>
  );
}

/** "Leave out some months", with the months in two columns (D203). */
export function LeaveOut({
  id,
  form,
  set,
  error,
  refs,
}: {
  readonly id: string;
  readonly form: WhenForm;
  readonly set: <K extends keyof WhenForm>(key: K, value: WhenForm[K]) => void;
  readonly error: string | undefined;
  readonly refs: WhenRefs;
}) {
  return (
    <>
      <CheckOption
        checked={form.leaveOut}
        onChange={(value) => set('leaveOut', value)}
        describedBy={error === undefined ? undefined : `${id}-leave-out-error`}
      >
        {t.leaveOut}
      </CheckOption>
      {form.leaveOut ? (
        <fieldset
          id={`${id}-leave-out`}
          className={styles.months}
          ref={refs.leaveOut}
          aria-describedby={error === undefined ? undefined : `${id}-leave-out-error`}
        >
          <legend>{t.leaveOutLegend}</legend>
          {strings.dates.monthsLong.map((name, index) => {
            const month = index + 1;
            return (
              <label key={name} className={styles.option}>
                <input
                  type="checkbox"
                  data-month={month}
                  checked={form.leftOut.includes(month)}
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
      {error === undefined ? null : (
        <p id={`${id}-leave-out-error`} className={styles.error}>
          {error}
        </p>
      )}
    </>
  );
}

/** "On chosen dates": the dates after the next one, each with its own box (D199). */
export function ChosenDates({
  id,
  form,
  set,
  error,
  refs,
  today,
}: {
  readonly id: string;
  readonly form: WhenForm;
  readonly set: <K extends keyof WhenForm>(key: K, value: WhenForm[K]) => void;
  readonly error: string | undefined;
  readonly refs: WhenRefs;
  readonly today: string;
}) {
  // A key for each later date's box, so removing one keeps the others' boxes as they are.
  const [dateKeys, setDateKeys] = useState<readonly number[]>(() =>
    form.laterDates.map((_, index) => index + 1),
  );
  const addDate = useRef<HTMLButtonElement>(null);
  return (
    <fieldset
      id={`${id}-dates`}
      className={`${styles.stack} ${styles.plain}`}
      ref={refs.dates}
      aria-describedby={error === undefined ? undefined : `${id}-dates-error`}
    >
      <legend className={styles.label}>{t.chosenDates}</legend>
      {form.laterDates.map((date, index) => (
        <div className={styles.dateRow} key={dateKeys[index] ?? `extra-${date}`}>
          <DateField
            id={`${id}-date-${index}`}
            label={t.laterDate(index + 2)}
            value={date}
            today={today}
            min={form.date}
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
              // The box and its button go: focus moves to "Add a date".
              addDate.current?.focus();
            }}
          >
            {t.removeDate(date === '' ? t.laterDate(index + 2) : formatDay(date, today))}
          </button>
        </div>
      ))}
      <button
        ref={addDate}
        type="button"
        className={styles.outlined}
        onClick={() => {
          set('laterDates', [...form.laterDates, '']);
          setDateKeys([...dateKeys, (dateKeys.at(-1) ?? 0) + 1]);
        }}
      >
        {t.addDate}
      </button>
      {error === undefined ? null : (
        <p id={`${id}-dates-error`} className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
