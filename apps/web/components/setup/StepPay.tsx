'use client';

// Step 2, how you're paid (brief 4.1 and 4.3, D5, D14, D64, D86, D131,
// D142, step 2e): every pay choice, "Next payday", "My pay changes in a
// pattern" with up to 8 amounts, the weekend and bank holiday rule, money
// set aside, and "Add another income". With more than one income, "Which is
// your main pay?". Then one question, "Do you ever work extra hours or miss
// shifts?", and only if yes: the overtime rate, the last day of work the
// next payday covers, and the usual week, with "Do this later".

import type { HolidayRule, Series } from '@prepenny/engine';
import { useEffect, useId, useState } from 'react';
import { formatDay } from '../../lib/dates.ts';
import { newId, timeInOrder } from '../../lib/ids.ts';
import { formatMoney, rateWords } from '../../lib/money.ts';
import { type MonthlyOn, monthlyChoices } from '../../lib/new-payment.ts';
import { incomeFromDraft, takePayDraft } from '../../lib/pay-draft.ts';
import { seriesWords } from '../../lib/schedule-words.ts';
import {
  blankIncome,
  blankPayDetails,
  buildIncome,
  buildPayDetails,
  firstPaydays,
  type IncomeErrors,
  type IncomeForm,
  incomeTyped,
  MOST_IN_PATTERN,
  nextLastWorkingDay,
  PAY_OFTEN,
  type PayDetailsErrors,
  type PayDetailsForm,
  type PayOften,
  payFrequencyOf,
  payScheduleOf,
} from '../../lib/setup-forms.ts';
import { strings } from '../../strings/en-GB.ts';
import { ChoiceList } from '../ChoiceList.tsx';
import { CheckOption, DateField, describedBy, Field, MoneyInput } from '../Fields.tsx';
import formStyles from '../Form.module.css';
import { ChosenDates, isDate, monthlyLabel, useWhenRefs } from '../WhenFields.tsx';
import { focusFirst } from './focus.ts';
import styles from './Setup.module.css';
import { AddedList, SetupCard, StepFrame } from './StepFrame.tsx';
import { useStep } from './useStep.ts';

const t = strings.setup.pay;

interface Draft {
  /** Also the id the income is saved with. */
  readonly key: string;
  readonly form: IncomeForm;
}

/** Pay a pay profile can be set up for (D154): from work, every week, 2 or 4 weeks, or monthly. */
const WITH_SHIFTS: readonly PayOften[] = [
  'weekly',
  'two-weekly',
  'four-weekly',
  'monthly',
  'last-working-day',
];

/** A whole series from a built income, to work out its paydays. */
function asSeries(
  key: string,
  series: Omit<Series, 'id' | 'familyId' | 'familyCreatedAt'>,
): Series {
  return { ...series, id: key, familyId: key, familyCreatedAt: '1970-01-01T00:00:00Z' };
}

export function StepPay() {
  const step = useStep(2);
  const id = useId();
  const savedIncomes = step.items('income');
  const savedDetails = step.items('pay-details');
  const first = step.accounts[0]?.id ?? '';
  const second = step.accounts[1]?.id ?? first;
  const canSetAside = step.accounts.length > 1;
  const [drafts, setDrafts] = useState<readonly Draft[]>(() =>
    savedIncomes.length === 0
      ? [{ key: newId(), form: blankIncome(first, second, t.firstName) }]
      : [],
  );
  const [errors, setErrors] = useState<Readonly<Record<string, IncomeErrors>>>({});
  const [mainPay, setMainPay] = useState<string | null>(
    step.records.settings?.mainPayFamilyId ?? null,
  );
  const [mainPayError, setMainPayError] = useState(false);
  const [extraHours, setExtraHours] = useState<'yes' | 'no' | null>(
    step.progress.answers.extraHours ?? null,
  );
  const [details, setDetails] = useState<PayDetailsForm | null>(null);
  const [detailsErrors, setDetailsErrors] = useState<PayDetailsErrors>({});
  const refs = useWhenRefs();
  // "Start a free plan with this pay" on the public calculator (step 2g): its
  // pay fills in the first income, once.
  const [fromCalculator, setFromCalculator] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read once, when the step first opens
  useEffect(() => {
    if (savedIncomes.length > 0) return;
    const draft = takePayDraft();
    if (draft === null) return;
    setDrafts((now) => {
      const only = now[0];
      return now.length === 1 && only !== undefined
        ? [{ ...only, form: { ...only.form, ...incomeFromDraft(draft, step.today) } }]
        : now;
    });
    setFromCalculator(true);
  }, []);

  const setForm = (key: string, change: Partial<IncomeForm>) =>
    setDrafts((now) =>
      now.map((draft) =>
        draft.key === key ? { ...draft, form: { ...draft.form, ...change } } : draft,
      ),
    );
  const fieldId = (key: string, field: string) => `${id}-${key}-${field}`;

  const savedSeries = savedIncomes.flatMap((item) => {
    const found = step.records.series.find((one) => one.id === item.id);
    return found === undefined ? [] : [found];
  });

  /**
   * Each draft as a series once its paydays are known, so they can be shown
   * before the amounts are typed: "Fri 30 Oct pays for work up to".
   */
  const draftSeries = (draft: Draft): Series | null => {
    const form = draft.form;
    const preview: IncomeForm = {
      ...form,
      name: form.name.trim() === '' ? t.anotherHeading : form.name,
      amount: form.amount.trim() === '' ? '0' : form.amount,
      amounts: form.amounts.map((one) => (one.trim() === '' ? '0' : one)),
      setAside: false,
    };
    const built = buildIncome(preview, step.today, step.holidays, canSetAside);
    return built.ok ? asSeries(draft.key, built.series) : null;
  };

  // Every income: saved ones, then the ones being typed.
  const incomes: {
    id: string;
    name: string;
    series: Series | null;
    often: PayOften | null;
    kind: string;
  }[] = [
    ...savedSeries.map((series) => ({
      id: series.id,
      name: series.name,
      series,
      often: null,
      kind: series.type,
    })),
    ...drafts
      .filter((draft, index) => index === 0 || incomeTyped(draft.form, ''))
      .map((draft) => ({
        id: draft.key,
        name: draft.form.name.trim() === '' ? t.anotherHeading : draft.form.name.trim(),
        series: draftSeries(draft),
        often: draft.form.often,
        kind: draft.form.kind,
      })),
  ];
  const withShifts = incomes.filter((one) => {
    if (one.kind !== 'pay') return false;
    if (one.series !== null) return payFrequencyOf(one.series.schedule) !== null;
    return one.often !== null && WITH_SHIFTS.includes(one.often);
  });
  const shiftsIncome =
    withShifts.find((one) => one.id === details?.seriesId) ?? withShifts[0] ?? null;
  const shiftsSteps = shiftsIncome?.series?.amountCycle?.length ?? 1;
  const detailsForm =
    details ?? (shiftsIncome === null ? null : blankPayDetails(shiftsIncome.id, shiftsSteps));
  const shiftsPaydays =
    shiftsIncome?.series === null || shiftsIncome?.series === undefined
      ? []
      : firstPaydays(shiftsIncome.series, step.today, step.holidays, Math.max(shiftsSteps, 1));
  const setDetailsForm = (change: Partial<PayDetailsForm>) => {
    if (detailsForm === null) return;
    const next = { ...detailsForm, ...change };
    // The usual weeks follow the pattern of the pay they're for.
    const steps =
      withShifts.find((one) => one.id === next.seriesId)?.series?.amountCycle?.length ?? 1;
    const weeks =
      next.weeks.length === steps
        ? next.weeks
        : Array.from(
            { length: steps },
            (_, index) => next.weeks[index] ?? { hours: '', extras: '' },
          );
    setDetails({ ...next, weeks });
  };

  async function next() {
    step.setProblem(null);
    const found: Record<string, IncomeErrors> = {};
    const built: { key: string; series: Series }[] = [];
    drafts.forEach((draft, index) => {
      const needed =
        incomeTyped(draft.form, index === 0 ? t.firstName : '') ||
        (index === 0 && savedSeries.length === 0);
      if (!needed) return;
      const result = buildIncome(draft.form, step.today, step.holidays, canSetAside);
      if (result.ok) built.push({ key: draft.key, series: asSeries(draft.key, result.series) });
      else found[draft.key] = result.errors;
    });
    setErrors(found);

    const all = [...savedSeries.map((one) => one.id), ...built.map((one) => one.key)];
    const chosen = all.length === 1 ? (all[0] ?? null) : mainPay;
    const needsMainPay = all.length > 1 && (chosen === null || !all.includes(chosen));
    setMainPayError(needsMainPay);

    let detailsCommands: Parameters<typeof step.save>[0]['commands'] = [];
    let profileId: string | null = null;
    let foundDetails: PayDetailsErrors = {};
    if (extraHours === 'yes' && savedDetails.length === 0 && detailsForm !== null) {
      const series =
        [...savedSeries, ...built.map((one) => one.series)].find(
          (one) => one.id === detailsForm.seriesId,
        ) ?? null;
      const payday =
        series === null ? undefined : firstPaydays(series, step.today, step.holidays, 1)[0];
      if (series !== null && payday !== undefined) {
        profileId = newId();
        const steps = series.amountCycle?.length ?? 1;
        const result = buildPayDetails(
          detailsForm,
          { series, payday: payday.originalDate },
          { profileId, weekIds: Array.from({ length: steps }, () => newId()) },
          { week: t.weekName, basic: t.basicLine, extras: t.extrasLine },
        );
        if (result.ok) detailsCommands = result.commands;
        else foundDetails = result.errors;
      }
    }
    setDetailsErrors(foundDetails);

    if (Object.keys(found).length > 0 || needsMainPay || Object.keys(foundDetails).length > 0) {
      focusFirst([
        ...drafts.flatMap((draft) =>
          (['name', 'date', 'dates', 'amount', 'amounts', 'percent', 'setAsideTo'] as const)
            .filter((field) => found[draft.key]?.[field] !== undefined)
            .map((field) => fieldId(draft.key, field)),
        ),
        ...(needsMainPay ? [`${id}-main-pay`] : []),
        ...(['overtimeRate', 'taxCode', 'coveredTo', 'rate', 'weeks'] as const)
          .filter((field) => foundDetails[field] !== undefined)
          .map((field) => `${id}-details-${field}`),
      ]);
      return;
    }

    step.setBusy(true);
    const fail = () => {
      step.setBusy(false);
      step.setProblem(strings.setup.problem);
    };
    for (const one of built) {
      const { id: seriesId, familyId: _family, familyCreatedAt: _made, ...fields } = one.series;
      const outcome = await step.save({
        commands: [
          { kind: 'add-payment', series: { ...fields, id: seriesId }, madeAt: timeInOrder() },
        ],
        item: { kind: 'income', id: one.key },
      });
      if (!outcome.ok) return fail();
      setDrafts((now) => now.filter((draft) => draft.key !== one.key));
    }
    if (chosen !== null && chosen !== step.records.settings?.mainPayFamilyId) {
      const outcome = await step.save({
        commands: [{ kind: 'choose-main-pay', familyId: chosen }],
      });
      if (!outcome.ok) return fail();
    }
    if (detailsCommands.length > 0 && profileId !== null) {
      const outcome = await step.save({
        commands: detailsCommands,
        item: { kind: 'pay-details', id: profileId },
      });
      if (!outcome.ok) return fail();
    }
    const outcome = await step.save({
      commands: [],
      step: 3,
      ...(extraHours === null ? {} : { answers: { extraHours } }),
    });
    step.setBusy(false);
    if (!outcome.ok) step.setProblem(strings.setup.problem);
  }

  const accountOptions = step.accounts.map((one) => ({ value: one.id, label: one.name ?? '' }));
  const mainPayFamily = step.records.settings?.mainPayFamilyId ?? null;

  return (
    <StepFrame
      step={2}
      title={t.title}
      intro={t.intro}
      onSkip={() => step.go(3)}
      onNext={next}
      onBack={() => step.go(1)}
      busy={step.busy}
      problem={step.problem}
    >
      {fromCalculator ? (
        <p className={formStyles.note} data-testid="from-calculator">
          {t.fromCalculator}
        </p>
      ) : null}
      <AddedList
        items={[
          ...savedSeries.map((series) => ({
            id: series.id,
            name: series.name,
            line: t.card(formatMoney(series.amount), seriesWords(series, step.today)),
            label:
              series.familyId === mainPayFamily && savedSeries.length > 1 ? t.mainPayLabel : null,
            onRemove: async () => {
              const removed = await step.removeItem(series.id);
              // Removing the main pay leaves no main pay until another is chosen (D14).
              if (removed && series.familyId === mainPayFamily) {
                await step.save({ commands: [{ kind: 'choose-main-pay', familyId: null }] });
              }
            },
            problem: step.removeProblem(series.id),
          })),
          ...savedDetails.flatMap((item) => {
            const profile = step.records.payProfiles?.find((one) => one.id === item.id);
            if (profile === undefined) return [];
            return [
              {
                id: item.id,
                name: t.details,
                line: t.detailsCard(profile.name ?? '', rateWords(profile.overtimeRate ?? '')),
                onRemove: () => step.removeItem(item.id),
                problem: step.removeProblem(item.id),
              },
            ];
          }),
        ]}
      />

      {drafts.map((draft, index) => (
        <IncomeFields
          key={draft.key}
          id={id}
          draft={draft}
          heading={index === 0 && savedSeries.length === 0 ? null : t.anotherHeading}
          errors={errors[draft.key] ?? {}}
          setForm={(change) => setForm(draft.key, change)}
          onRemove={
            index === 0 && savedSeries.length === 0
              ? null
              : () => setDrafts((now) => now.filter((one) => one.key !== draft.key))
          }
          fieldId={(field) => fieldId(draft.key, field)}
          today={step.today}
          holidays={step.holidays}
          accounts={accountOptions}
          canSetAside={canSetAside}
          refs={refs}
        />
      ))}

      <button
        type="button"
        className={formStyles.outlined}
        onClick={() => {
          const key = newId();
          setDrafts((now) => [...now, { key, form: blankIncome(first, second) }]);
          requestAnimationFrame(() => document.getElementById(fieldId(key, 'name'))?.focus());
        }}
      >
        {t.addAnother}
      </button>

      {incomes.length > 1 ? (
        <div className={styles.card} id={`${id}-main-pay`}>
          <ChoiceList<string>
            legend={t.mainPay}
            name={`${id}-main-pay-choice`}
            value={mainPay ?? ''}
            options={incomes.map((one) => ({ value: one.id, label: one.name }))}
            onChange={(value) => {
              setMainPay(value);
              setMainPayError(false);
            }}
            describedBy={`${id}-main-pay-hint${mainPayError ? ` ${id}-main-pay-error` : ''}`}
          />
          <p id={`${id}-main-pay-hint`} className={formStyles.hint}>
            {t.mainPayHint}
          </p>
          {mainPayError ? (
            <p id={`${id}-main-pay-error`} className={formStyles.error}>
              {t.mainPayError}
            </p>
          ) : null}
        </div>
      ) : null}

      {savedDetails.length === 0 && withShifts.length > 0 && detailsForm !== null ? (
        <div className={styles.card}>
          <ChoiceList<'yes' | 'no'>
            legend={t.extraHours}
            name={`${id}-extra-hours`}
            value={extraHours ?? ('' as 'yes')}
            options={[
              { value: 'yes', label: t.yes },
              { value: 'no', label: t.no },
            ]}
            onChange={setExtraHours}
          />
          {extraHours === 'yes' ? (
            <PayDetails
              id={id}
              form={detailsForm}
              set={setDetailsForm}
              errors={detailsErrors}
              incomes={withShifts}
              payday={shiftsPaydays[0]?.date ?? null}
              paydays={shiftsPaydays.map((one) => one.date)}
              today={step.today}
            />
          ) : null}
        </div>
      ) : null}
    </StepFrame>
  );
}

function IncomeFields({
  id,
  draft,
  heading,
  errors,
  setForm,
  onRemove,
  fieldId,
  today,
  holidays,
  accounts,
  canSetAside,
  refs,
}: {
  readonly id: string;
  readonly draft: Draft;
  readonly heading: string | null;
  readonly errors: IncomeErrors;
  readonly setForm: (change: Partial<IncomeForm>) => void;
  readonly onRemove: (() => void) | null;
  readonly fieldId: (field: string) => string;
  readonly today: string;
  readonly holidays: ReturnType<typeof useStep>['holidays'];
  readonly accounts: readonly { value: string; label: string }[];
  readonly canSetAside: boolean;
  readonly refs: ReturnType<typeof useWhenRefs>;
}) {
  const form = draft.form;
  const error = (field: keyof IncomeErrors) => {
    const mistake = errors[field];
    if (mistake === undefined) return undefined;
    if (mistake === 'beforeToday') return strings.setup.beforeToday;
    if (mistake === 'dateError') return strings.setup.dateError;
    if (mistake === 'datesError') return strings.addPayment.datesError;
    if (mistake === 'amountError') return strings.setup.amountError;
    if (mistake === 'sameAccount') return strings.setup.sameAccount;
    if (mistake === 'notLastWorkingDay') {
      return t.notLastWorkingDay(formatDay(nextLastWorkingDay(today, holidays), today));
    }
    return t[mistake];
  };
  const validDate = isDate(form.date);
  const irregular = form.often === 'irregular';
  const monthlyOptions: MonthlyOn[] = validDate
    ? monthlyChoices(form.date, holidays).filter((one) => one !== 'last-working-day')
    : [];
  const monthlyOn = monthlyOptions.includes(form.monthlyOn) ? form.monthlyOn : 'day';
  // The pattern's boxes say which payday each is, once the next payday is chosen.
  const patternDays =
    validDate && form.pattern
      ? firstPaydays(
          asSeries('preview', {
            accountId: form.accountId,
            name: form.name,
            direction: 'in',
            amount: 0,
            start: form.date,
            schedule: payScheduleOf(form, form.date, holidays),
            end: { kind: 'never' },
            holidayRule: form.holidayRule,
            type: form.kind,
            isEstimate: false,
          }),
          today,
          holidays,
          form.amounts.length,
        )
      : [];
  const whenForm = {
    date: form.date,
    howOften: 'dates' as const,
    weeks: '1',
    months: '1',
    monthlyOn: 'day' as const,
    leaveOut: false,
    leftOut: [],
    laterDates: form.laterDates,
    ends: 'never' as const,
    count: '',
    endDate: '',
    differentLast: false,
    lastAmount: '',
  };

  return (
    <SetupCard heading={heading} testId="income-form">
      <Field id={fieldId('name')} label={t.name} error={error('name')}>
        <input
          id={fieldId('name')}
          className={formStyles.input}
          type="text"
          autoComplete="off"
          value={form.name}
          aria-invalid={error('name') !== undefined}
          aria-describedby={describedBy(fieldId('name'), error('name'))}
          onChange={(event) => setForm({ name: event.target.value })}
        />
      </Field>

      <ChoiceList<IncomeForm['kind']>
        legend={t.kind}
        name={`${id}-${draft.key}-kind`}
        value={form.kind}
        options={(['pay', 'benefits', 'other'] as const).map((value) => ({
          value,
          label: t.kinds[value],
        }))}
        onChange={(kind) => setForm({ kind })}
      />

      <ChoiceList<PayOften>
        legend={t.often}
        name={`${id}-${draft.key}-often`}
        value={form.often}
        options={PAY_OFTEN.map((value) => ({ value, label: t.oftens[value] }))}
        onChange={(often) => setForm({ often })}
      />

      <DateField
        id={fieldId('date')}
        label={form.kind === 'pay' ? t.nextPayday : t.nextPayment}
        value={form.date}
        today={today}
        min={today}
        onChange={(date) => setForm({ date })}
        error={error('date')}
        extraHint={irregular ? { id: `${fieldId('date')}-irregular`, text: t.irregularHint } : null}
      />

      {form.often === 'monthly' && monthlyOptions.length > 1 ? (
        <ChoiceList<MonthlyOn>
          legend={strings.addPayment.onWhichDay}
          name={`${id}-${draft.key}-on`}
          value={monthlyOn}
          options={monthlyOptions.map((value) => ({
            value,
            label: monthlyLabel(value, form.date),
          }))}
          onChange={(monthlyOn) => setForm({ monthlyOn })}
        />
      ) : null}

      {form.often === 'dates' ? (
        <div>
          <ChosenDates
            id={`${id}-${draft.key}`}
            form={whenForm}
            set={(key, value) => {
              if (key === 'laterDates') setForm({ laterDates: value as readonly string[] });
            }}
            error={error('dates')}
            refs={refs}
            today={today}
          />
        </div>
      ) : null}

      {irregular ? null : (
        <CheckOption
          checked={form.pattern}
          onChange={(pattern) =>
            setForm({
              pattern,
              // The amount typed so far becomes the first payday's.
              amounts:
                pattern && form.amount.trim() !== '' && form.amounts.every((one) => one === '')
                  ? [form.amount, ...form.amounts.slice(1)]
                  : form.amounts,
            })
          }
        >
          {t.pattern}
        </CheckOption>
      )}

      {form.pattern && !irregular ? (
        <fieldset
          id={fieldId('amounts')}
          className={`${formStyles.stack} ${formStyles.plain}`}
          aria-describedby={describedBy(fieldId('amounts'), error('amounts'), [
            `${fieldId('amounts')}-hint`,
          ])}
        >
          <legend className={formStyles.label}>{t.amount}</legend>
          <p id={`${fieldId('amounts')}-hint`} className={formStyles.hint}>
            {t.patternHint}
          </p>
          <div className={styles.pairs}>
            {form.amounts.map((amount, index) => {
              const day = patternDays[index];
              const label =
                day === undefined
                  ? t.patternAmount(index + 1)
                  : t.patternAmountOn(index + 1, formatDay(day.date, today));
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: each box is one step of the pattern, so its place is what it is
                <Field key={`amount-${index + 1}`} id={fieldId(`amount-${index}`)} label={label}>
                  <MoneyInput
                    id={fieldId(`amount-${index}`)}
                    value={amount}
                    onChange={(value) =>
                      setForm({
                        amounts: form.amounts.map((one, at) => (at === index ? value : one)),
                      })
                    }
                    invalid={error('amounts') !== undefined && amount.trim() === ''}
                  />
                </Field>
              );
            })}
          </div>
          <div className={styles.row}>
            {form.amounts.length < MOST_IN_PATTERN ? (
              <button
                type="button"
                className={formStyles.outlined}
                onClick={() => setForm({ amounts: [...form.amounts, ''] })}
              >
                {t.addPayday}
              </button>
            ) : null}
            {form.amounts.length > 2 ? (
              <button
                type="button"
                className={formStyles.outlined}
                onClick={() => setForm({ amounts: form.amounts.slice(0, -1) })}
              >
                {t.removePayday}
              </button>
            ) : null}
          </div>
          {error('amounts') === undefined ? null : (
            <p id={`${fieldId('amounts')}-error`} className={formStyles.error}>
              {error('amounts')}
            </p>
          )}
        </fieldset>
      ) : (
        <Field
          id={fieldId('amount')}
          label={irregular ? t.amountWeekly : t.amount}
          error={error('amount')}
        >
          <MoneyInput
            id={fieldId('amount')}
            value={form.amount}
            onChange={(amount) => setForm({ amount })}
            invalid={error('amount') !== undefined}
            describedBy={describedBy(fieldId('amount'), error('amount'))}
          />
        </Field>
      )}

      {form.often === 'last-working-day' ? null : (
        <ChoiceList<HolidayRule>
          legend={strings.addPayment.weekend}
          name={`${id}-${draft.key}-weekend`}
          value={form.holidayRule}
          options={[
            { value: 'keep', label: strings.addPayment.keep },
            { value: 'working-day-before', label: strings.addPayment.before },
            { value: 'working-day-after', label: strings.addPayment.afterDay },
          ]}
          onChange={(holidayRule) => setForm({ holidayRule })}
        />
      )}

      {accounts.length > 1 ? (
        <ChoiceList<string>
          legend={t.into}
          name={`${id}-${draft.key}-into`}
          value={form.accountId}
          options={accounts}
          onChange={(accountId) => setForm({ accountId })}
        />
      ) : null}

      {irregular ? null : (
        <CheckOption checked={form.isEstimate} onChange={(isEstimate) => setForm({ isEstimate })}>
          {t.isEstimate}
        </CheckOption>
      )}

      {canSetAside ? (
        <>
          <CheckOption checked={form.setAside} onChange={(setAside) => setForm({ setAside })}>
            {t.setAside}
          </CheckOption>
          {form.setAside ? (
            <>
              <Field
                id={fieldId('percent')}
                label={t.percent}
                error={error('percent')}
                hint={t.percentHint}
              >
                <input
                  id={fieldId('percent')}
                  className={`${formStyles.input} num`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.percent}
                  aria-invalid={error('percent') !== undefined}
                  aria-describedby={describedBy(fieldId('percent'), error('percent'), [
                    `${fieldId('percent')}-hint`,
                  ])}
                  onChange={(event) => setForm({ percent: event.target.value })}
                />
              </Field>
              <div id={fieldId('setAsideTo')}>
                <ChoiceList<string>
                  legend={t.setAsideTo}
                  name={`${id}-${draft.key}-set-aside-to`}
                  value={form.setAsideTo}
                  options={accounts}
                  onChange={(setAsideTo) => setForm({ setAsideTo })}
                  describedBy={
                    error('setAsideTo') === undefined ? undefined : `${fieldId('setAsideTo')}-error`
                  }
                />
                {error('setAsideTo') === undefined ? null : (
                  <p id={`${fieldId('setAsideTo')}-error`} className={formStyles.error}>
                    {error('setAsideTo')}
                  </p>
                )}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {onRemove === null ? null : (
        <button type="button" className={formStyles.quiet} onClick={onRemove}>
          {t.removeForm}
        </button>
      )}
    </SetupCard>
  );
}

function PayDetails({
  id,
  form,
  set,
  errors,
  incomes,
  payday,
  paydays,
  today,
}: {
  readonly id: string;
  readonly form: PayDetailsForm;
  readonly set: (change: Partial<PayDetailsForm>) => void;
  readonly errors: PayDetailsErrors;
  readonly incomes: readonly { readonly id: string; readonly name: string }[];
  /** The next payday of the pay they're paid in, the day it lands. */
  readonly payday: string | null;
  readonly paydays: readonly string[];
  readonly today: string;
}) {
  const field = (name: string) => `${id}-details-${name}`;
  const error = (name: keyof PayDetailsErrors) => {
    const mistake = errors[name];
    return mistake === undefined ? undefined : t[mistake];
  };
  return (
    <>
      {incomes.length > 1 ? (
        <ChoiceList<string>
          legend={t.whichPay}
          name={`${id}-details-pay`}
          value={form.seriesId}
          options={incomes.map((one) => ({ value: one.id, label: one.name }))}
          onChange={(seriesId) => set({ seriesId })}
        />
      ) : null}
      <Field
        id={field('overtimeRate')}
        label={t.overtimeRate}
        error={error('overtimeRate')}
        hint={t.overtimeRateHint}
      >
        <MoneyInput
          id={field('overtimeRate')}
          value={form.overtimeRate}
          onChange={(overtimeRate) => set({ overtimeRate })}
          invalid={error('overtimeRate') !== undefined}
          describedBy={describedBy(field('overtimeRate'), error('overtimeRate'), [
            `${field('overtimeRate')}-hint`,
          ])}
        />
      </Field>
      <Field id={field('taxCode')} label={t.taxCode} error={error('taxCode')} hint={t.taxCodeHint}>
        <input
          id={field('taxCode')}
          className={formStyles.input}
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          value={form.taxCode}
          aria-invalid={error('taxCode') !== undefined}
          aria-describedby={describedBy(field('taxCode'), error('taxCode'), [
            `${field('taxCode')}-hint`,
          ])}
          onChange={(event) => set({ taxCode: event.target.value })}
        />
      </Field>
      <DateField
        id={field('coveredTo')}
        label={payday === null ? t.coveredTo(t.nextPayday) : t.coveredTo(formatDay(payday, today))}
        value={form.coveredTo}
        today={today}
        {...(payday === null ? {} : { max: payday })}
        onChange={(coveredTo) => set({ coveredTo })}
        error={error('coveredTo')}
        extraHint={{ id: `${field('coveredTo')}-hint`, text: t.coveredToHint }}
      />
      <ChoiceList<'now' | 'later'>
        legend={t.usual}
        name={`${id}-details-usual`}
        value={form.usual}
        options={[
          { value: 'now', label: t.usualNow },
          { value: 'later', label: t.usualLater },
        ]}
        onChange={(usual) => set({ usual })}
        describedBy={`${field('usual')}-hint`}
      />
      <p id={`${field('usual')}-hint`} className={formStyles.hint}>
        {t.usualHint}
      </p>
      {form.usual === 'now' ? (
        <>
          <Field id={field('rate')} label={t.rate} error={error('rate')}>
            <MoneyInput
              id={field('rate')}
              value={form.rate}
              onChange={(rate) => set({ rate })}
              invalid={error('rate') !== undefined}
              describedBy={describedBy(field('rate'), error('rate'))}
            />
          </Field>
          <div id={field('weeks')} className={formStyles.stack}>
            {form.weeks.map((week, index) => {
              const day = paydays[index];
              const which =
                form.weeks.length === 1
                  ? null
                  : day === undefined
                    ? t.patternAmount(index + 1)
                    : t.patternAmountOn(index + 1, formatDay(day, today));
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: each row is one step of the pattern, so its place is what it is
                <div key={`week-${index + 1}`} className={styles.pairs}>
                  <Field
                    id={field(`hours-${index}`)}
                    label={which === null ? t.hours : t.hoursFor(which)}
                  >
                    <input
                      id={field(`hours-${index}`)}
                      className={`${formStyles.input} num`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={week.hours}
                      aria-invalid={errors.weeks === 'hoursError' && week.hours.trim() === ''}
                      onChange={(event) =>
                        set({
                          weeks: form.weeks.map((one, at) =>
                            at === index ? { ...one, hours: event.target.value } : one,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field
                    id={field(`extras-${index}`)}
                    label={which === null ? t.extras : t.extrasFor(which)}
                  >
                    <MoneyInput
                      id={field(`extras-${index}`)}
                      value={week.extras}
                      onChange={(extras) =>
                        set({
                          weeks: form.weeks.map((one, at) =>
                            at === index ? { ...one, extras } : one,
                          ),
                        })
                      }
                      invalid={errors.weeks === 'extrasError'}
                    />
                  </Field>
                </div>
              );
            })}
            {error('weeks') === undefined ? null : (
              <p id={`${field('weeks')}-error`} className={formStyles.error} role="alert">
                {error('weeks')}
              </p>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
