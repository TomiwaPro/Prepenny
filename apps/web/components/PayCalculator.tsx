'use client';

// The take-home pay calculator (brief 4.15, the Pay calculator sketch in
// ARCHITECTURE.md 4.6): pay lines of hours × rate with their kind, fixed
// extras, the payday, how often pay comes, the tax code on the cumulative
// basis or week 1/month 1, a workplace pension (percentage, earnings band,
// before or after tax), student loans and other deductions, and the year so
// far from the last payslip. The result is take-home pay with a plain
// breakdown, and "An estimate, not tax advice." always. Check my payslip
// lists each figure that differs, by how much, and ends with "Ask your
// payroll team." It never says the employer is wrong (D140).
//
// Shared by the app (under More) and the public page: the engine works it
// out right here on the phone, so nothing is sent anywhere. What's offered
// with a result, such as "Add to plan", comes from the screen around it.

import type { PayFrequency, PayLineKind, TakeHome, TakeHomeInput } from '@prepenny/engine';
import { formatDate, PAY_LINE_KINDS, taxYearsOf } from '@prepenny/engine';
import { type ReactNode, useId, useRef, useState } from 'react';
import { formatDay } from '../lib/dates.ts';
import { formatMoney } from '../lib/money.ts';
import {
  blankAmount,
  blankLine,
  blankPayslip,
  type CalculatorErrors,
  type CalculatorField,
  type CalculatorForm,
  type CalculatorMistake,
  checkPayslipForm,
  type LoanPlan,
  linesFromWeek,
  MOST_LINES,
  type NamedAmountForm,
  PAYSLIP_BOXES,
  type PayslipBox,
  type PayslipForm,
  periodBefore,
  periodOf,
  type SavedWeek,
  workOutCalculator,
} from '../lib/pay-calculator.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { CheckOption, DateField, describedBy, Field, MoneyInput, Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import styles from './PayCalculator.module.css';
import screenStyles from './Screens.module.css';
import { focusFirst } from './setup/focus.ts';

const t = strings.pay;

export interface Worked {
  readonly form: CalculatorForm;
  readonly input: TakeHomeInput;
  readonly result: TakeHome;
}

const lineName = (kind: PayLineKind) => t.kinds[kind];

/** The first and last days PrePenny has tax figures for, in words (D128). */
function taxYearsWords(today: string): { from: string; to: string } {
  const years = [...taxYearsOf().values()].sort((a, b) => a.firstDay - b.firstDay);
  const day = (value: number) => formatDay(formatDate(value), today);
  const first = years[0];
  const last = years[years.length - 1];
  return first === undefined || last === undefined
    ? { from: '', to: '' }
    : { from: day(first.firstDay), to: day(last.lastDay) };
}

function mistakeWords(
  mistake: CalculatorMistake | undefined,
  form: CalculatorForm,
  today: string,
): string | undefined {
  if (mistake === undefined) return undefined;
  const m = t.mistakes;
  const found = periodOf(form.payDate, form.frequency);
  const monthly = found?.table === 'month';
  switch (mistake) {
    case 'noTaxYear': {
      const { from, to } = taxYearsWords(today);
      return m.noTaxYear(from, to);
    }
    case 'periodError':
      return monthly ? m.periodErrorMonth : m.periodError;
    case 'periodAfter':
      return monthly ? m.periodAfterMonth(found?.period ?? 0) : m.periodAfter(found?.period ?? 0);
    default:
      return m[mistake];
  }
}

/** The boxes in the order they're on the page, for focus on the first mistake. */
function fieldOrder(form: CalculatorForm): CalculatorField[] {
  return [
    'lines',
    ...form.lines.flatMap((line) => [`hours-${line.key}`, `rate-${line.key}`] as const),
    ...form.extras.flatMap((one) => [`extraName-${one.key}`, `extra-${one.key}`] as const),
    'payDate',
    'taxCode',
    'pensionPercent',
    'pensionLower',
    'pensionUpper',
    ...form.deductions.flatMap(
      (one) => [`deductionName-${one.key}`, `deduction-${one.key}`] as const,
    ),
    'soFarPeriod',
    'grossSoFar',
    'taxSoFar',
  ];
}

/** "Tax £58.80, National Insurance £24.89, Pension £17.33". */
function breakdown(result: TakeHome, form: CalculatorForm): string {
  const parts = [
    result.tax < 0 ? t.refund(formatMoney(-result.tax)) : t.tax(formatMoney(result.tax)),
    t.nationalInsurance(formatMoney(result.nationalInsurance)),
  ];
  if (form.pension) parts.push(t.pensionAmount(formatMoney(result.pension)));
  if (form.studentLoan !== 'none') parts.push(t.studentLoanAmount(formatMoney(result.studentLoan)));
  if (form.postgraduate) parts.push(t.postgraduateAmount(formatMoney(result.postgraduateLoan)));
  for (const one of result.otherDeductions) {
    parts.push(t.otherAmount(one.name, formatMoney(one.amount)));
  }
  return parts.join(', ');
}

/** Why the result is an estimate, in words, or null when it isn't one. */
function estimateWords(worked: Worked): string | null {
  const { result, input, form } = worked;
  if (!result.isEstimate) return null;
  if (result.estimateReason === 'year-so-far-earlier' && input.soFar !== undefined) {
    const found = periodOf(form.payDate, form.frequency);
    if (found !== null) {
      return t.estimateEarlier(
        found.table,
        input.soFar.period,
        input.soFar.period + found.step,
        found.period - found.step,
      );
    }
  }
  if (result.estimateReason === 'year-so-far-last-year') return t.estimateLastYear;
  return t.estimateNoSoFar;
}

function refusedWords(code: string): string {
  const words: Readonly<Record<string, string>> = t.refused;
  return words[code] ?? t.refused.other;
}

/** Rows of named amounts: fixed extras, or other deductions. */
function NamedAmounts({
  rows,
  base,
  kind,
  errors,
  form,
  today,
  nameLabel,
  amountLabel,
  removeLabel,
  onChange,
  onRemove,
}: {
  readonly rows: readonly NamedAmountForm[];
  readonly base: string;
  readonly kind: 'extra' | 'deduction';
  readonly errors: CalculatorErrors;
  readonly form: CalculatorForm;
  readonly today: string;
  readonly nameLabel: string;
  readonly amountLabel: string;
  readonly removeLabel: string;
  readonly onChange: (key: string, change: Partial<NamedAmountForm>) => void;
  readonly onRemove: (key: string) => void;
}) {
  return (
    <>
      {rows.map((row) => {
        const nameField = `${kind}Name-${row.key}` as CalculatorField;
        const amountField = `${kind}-${row.key}` as CalculatorField;
        const nameError = mistakeWords(errors[nameField], form, today);
        const amountError = mistakeWords(errors[amountField], form, today);
        return (
          <div key={row.key} className={styles.row} data-testid={kind}>
            <Field id={`${base}-${nameField}`} label={nameLabel} error={nameError}>
              <input
                id={`${base}-${nameField}`}
                className={formStyles.input}
                type="text"
                autoComplete="off"
                value={row.name}
                aria-invalid={nameError !== undefined}
                aria-describedby={describedBy(`${base}-${nameField}`, nameError)}
                onChange={(event) => onChange(row.key, { name: event.target.value })}
              />
            </Field>
            <Field id={`${base}-${amountField}`} label={amountLabel} error={amountError}>
              <MoneyInput
                id={`${base}-${amountField}`}
                value={row.amount}
                onChange={(amount) => onChange(row.key, { amount })}
                invalid={amountError !== undefined}
                describedBy={describedBy(`${base}-${amountField}`, amountError)}
              />
            </Field>
            <button type="button" className={formStyles.quiet} onClick={() => onRemove(row.key)}>
              {removeLabel}
            </button>
          </div>
        );
      })}
    </>
  );
}

function PayslipCheck({
  form,
  base,
  onBoxesWrong,
}: {
  readonly form: CalculatorForm;
  readonly base: string;
  /** The calculator's own boxes need a change before a payslip can be checked. */
  readonly onBoxesWrong: (errors: CalculatorErrors) => void;
}) {
  const [open, setOpen] = useState(false);
  const [slip, setSlip] = useState<PayslipForm>(blankPayslip);
  const [bad, setBad] = useState<readonly PayslipBox[]>([]);
  const [outcome, setOutcome] = useState<ReactNode>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const regionId = useId();
  const shown = PAYSLIP_BOXES.filter((box) => {
    if (box === 'pension') return form.pension;
    if (box === 'studentLoan') return form.studentLoan !== 'none';
    if (box === 'postgraduateLoan') return form.postgraduate;
    return true;
  });

  const check = () => {
    const worked = workOutCalculator(form, lineName);
    if (!worked.ok) {
      if ('errors' in worked) {
        onBoxesWrong(worked.errors);
        setOutcome(<Problem text={t.mistakes.fixTheBoxes} />);
      } else setOutcome(<Problem text={refusedWords(worked.refused)} />);
      return;
    }
    const typed: PayslipForm = Object.fromEntries(
      PAYSLIP_BOXES.map((box) => [box, shown.includes(box) ? slip[box] : '']),
    ) as unknown as PayslipForm;
    const checked = checkPayslipForm(worked.input, typed);
    if (!checked.ok) {
      if ('boxes' in checked) {
        setBad(checked.boxes);
        setOutcome(null);
        focusFirst(checked.boxes.map((box) => `${base}-slip-${box}`));
      } else {
        setBad([]);
        setOutcome(<Problem text={t.checkNone} />);
      }
      return;
    }
    setBad([]);
    setOutcome(
      checked.differences.length === 0 ? (
        <p className={screenStyles.line}>{t.checkSame}</p>
      ) : (
        <>
          <p className={screenStyles.line}>{t.checkDiffer}</p>
          <ul className={styles.differences} data-testid="payslip-differences">
            {checked.differences.map((one) => (
              <li key={one.figure} className="num">
                {t.checkLine(
                  t.checkBoxes[one.figure],
                  formatMoney(one.onPayslip),
                  formatMoney(one.expected),
                )}{' '}
                {one.difference > 0
                  ? t.checkMore(formatMoney(one.difference))
                  : t.checkLess(formatMoney(-one.difference))}
              </li>
            ))}
          </ul>
          <p className={screenStyles.line}>{t.askPayroll}</p>
        </>
      ),
    );
    setTimeout(() => outcomeRef.current?.focus(), 0);
  };

  return (
    <section className={screenStyles.card} aria-labelledby={`${base}-check`}>
      <h2 id={`${base}-check`} className={screenStyles.cardTitle}>
        <button
          type="button"
          className={styles.disclosure}
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((now) => !now)}
        >
          {t.check}
        </button>
      </h2>
      <div id={regionId} hidden={!open} data-testid="payslip-check">
        {open ? (
          <div className={formStyles.form}>
            <p className={screenStyles.second}>{t.checkIntro}</p>
            {shown.map((box) => {
              const error = bad.includes(box) ? t.mistakes.amountError : undefined;
              const boxId = `${base}-slip-${box}`;
              return (
                <Field key={box} id={boxId} label={t.checkBoxes[box]} error={error}>
                  <MoneyInput
                    id={boxId}
                    value={slip[box]}
                    onChange={(value) => {
                      setSlip((now) => ({ ...now, [box]: value }));
                      setOutcome(null);
                    }}
                    invalid={error !== undefined}
                    describedBy={describedBy(boxId, error)}
                  />
                </Field>
              );
            })}
            <button type="button" className={formStyles.main} onClick={check}>
              {t.checkButton}
            </button>
            <div
              ref={outcomeRef}
              tabIndex={-1}
              role="status"
              className={styles.outcome}
              data-testid="payslip-outcome"
            >
              {outcome}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function PayCalculator({
  initial,
  today,
  weeks = [],
  actions,
}: {
  readonly initial: CalculatorForm;
  readonly today: string;
  /** Saved pay weeks to start from (D5), in the app. */
  readonly weeks?: readonly SavedWeek[];
  /** What's offered with a result: "Add to plan" in the app, "Start a free plan" on the public page. */
  readonly actions: (worked: Worked) => ReactNode;
}) {
  const id = useId();
  const [form, setForm] = useState<CalculatorForm>(initial);
  const [errors, setErrors] = useState<CalculatorErrors>({});
  const [worked, setWorked] = useState<Worked | null>(null);
  const [stale, setStale] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [used, setUsed] = useState<string | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  /** Any change clears the result, so a figure on screen always matches the boxes. */
  const change = (next: (now: CalculatorForm) => CalculatorForm) => {
    setForm(next);
    if (worked !== null) {
      setWorked(null);
      setStale(true);
    }
    setProblem(null);
  };
  const set = (part: Partial<CalculatorForm>) => change((now) => ({ ...now, ...part }));

  /** A new payday or frequency moves the payslip's week on, unless it was typed. */
  const setWhen = (part: Partial<Pick<CalculatorForm, 'payDate' | 'frequency'>>) =>
    change((now) => {
      const next = { ...now, ...part };
      const wasDefault = now.soFarPeriod === periodBefore(now.payDate, now.frequency);
      return wasDefault
        ? { ...next, soFarPeriod: periodBefore(next.payDate, next.frequency) }
        : next;
    });

  const showErrors = (found: CalculatorErrors) => {
    setErrors(found);
    focusFirst(
      fieldOrder(form)
        .filter((field) => found[field] !== undefined)
        .map((field) => `${id}-${field}`),
    );
  };

  const workOut = () => {
    const outcome = workOutCalculator(form, lineName);
    if (!outcome.ok) {
      setWorked(null);
      if ('errors' in outcome) {
        setProblem(null);
        showErrors(outcome.errors);
      } else {
        setErrors(outcome.refused === 'bad-tax-code' ? { taxCode: 'taxCodeError' } : {});
        setProblem(refusedWords(outcome.refused));
      }
      return;
    }
    setErrors({});
    setStale(false);
    setWorked({ form, input: outcome.input, result: outcome.result });
    setTimeout(() => resultRef.current?.focus(), 0);
  };

  const error = (field: CalculatorField) => mistakeWords(errors[field], form, today);
  const found = periodOf(form.payDate, form.frequency);
  const monthly = form.frequency === 'monthly';
  const yearWords = found === null ? '' : t.taxYearWords(found.taxYear);
  const periodWord = t.periodWords[form.frequency];

  const setLine = (key: string, part: Partial<CalculatorForm['lines'][number]>) =>
    change((now) => ({
      ...now,
      lines: now.lines.map((line) => (line.key === key ? { ...line, ...part } : line)),
    }));
  const setRow = (list: 'extras' | 'deductions') => (key: string, part: Partial<NamedAmountForm>) =>
    change((now) => ({
      ...now,
      [list]: now[list].map((row) => (row.key === key ? { ...row, ...part } : row)),
    }));
  const removeRow = (list: 'extras' | 'deductions') => (key: string) =>
    change((now) => ({ ...now, [list]: now[list].filter((row) => row.key !== key) }));

  return (
    <div className={styles.calculator}>
      <p className={styles.notAdvice}>{t.notAdvice}</p>

      {weeks.length === 0 ? null : (
        <section className={screenStyles.card} aria-labelledby={`${id}-weeks`}>
          <h2 id={`${id}-weeks`} className={screenStyles.cardTitle}>
            {t.startFrom}
          </h2>
          <p className={screenStyles.second}>{t.startFromIntro}</p>
          <div className={formStyles.actions}>
            {weeks.map((week) => (
              <button
                key={week.id}
                type="button"
                className={formStyles.outlined}
                onClick={() => {
                  change((now) => ({ ...now, ...linesFromWeek(week) }));
                  setUsed(t.weekFilled(week.name));
                }}
              >
                {t.weekButton(week.name)}
              </button>
            ))}
          </div>
          <p className={screenStyles.second} role="status">
            {used}
          </p>
        </section>
      )}

      <form
        className={styles.calculator}
        noValidate
        aria-label={t.heading}
        onSubmit={(event) => {
          event.preventDefault();
          workOut();
        }}
      >
        <section className={screenStyles.card} aria-labelledby={`${id}-pay`}>
          <h2 id={`${id}-pay`} className={screenStyles.cardTitle}>
            {t.payHeading}
          </h2>
          <p id={`${id}-lines`} className={screenStyles.second} tabIndex={-1}>
            {t.payIntro}
          </p>
          {form.lines.map((line, index) => {
            const hoursError = error(`hours-${line.key}`);
            const rateError = error(`rate-${line.key}`);
            return (
              <fieldset key={line.key} className={styles.line} data-testid="pay-line">
                <legend className={styles.lineLegend}>{t.line(index + 1)}</legend>
                <Field id={`${id}-kind-${line.key}`} label={t.kind}>
                  <select
                    id={`${id}-kind-${line.key}`}
                    className={formStyles.select}
                    value={line.kind}
                    onChange={(event) =>
                      setLine(line.key, { kind: event.target.value as PayLineKind })
                    }
                  >
                    {PAY_LINE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {t.kinds[kind]}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className={styles.pair}>
                  <Field id={`${id}-hours-${line.key}`} label={t.hours} error={hoursError}>
                    <input
                      id={`${id}-hours-${line.key}`}
                      className={`${formStyles.input} num`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={line.hours}
                      aria-invalid={hoursError !== undefined}
                      aria-describedby={describedBy(`${id}-hours-${line.key}`, hoursError)}
                      onChange={(event) => setLine(line.key, { hours: event.target.value })}
                    />
                  </Field>
                  <Field id={`${id}-rate-${line.key}`} label={t.rate} error={rateError}>
                    <MoneyInput
                      id={`${id}-rate-${line.key}`}
                      value={line.rate}
                      onChange={(rate) => setLine(line.key, { rate })}
                      invalid={rateError !== undefined}
                      describedBy={describedBy(`${id}-rate-${line.key}`, rateError)}
                    />
                  </Field>
                </div>
                {form.lines.length > 1 ? (
                  <button
                    type="button"
                    className={formStyles.quiet}
                    onClick={() =>
                      change((now) => ({
                        ...now,
                        lines: now.lines.filter((one) => one.key !== line.key),
                      }))
                    }
                  >
                    {t.removeLine}
                  </button>
                ) : null}
              </fieldset>
            );
          })}
          {form.lines.length < MOST_LINES ? (
            <button
              type="button"
              className={formStyles.outlined}
              onClick={() => change((now) => ({ ...now, lines: [...now.lines, blankLine()] }))}
            >
              {t.addLine}
            </button>
          ) : null}
          <NamedAmounts
            rows={form.extras}
            base={id}
            kind="extra"
            errors={errors}
            form={form}
            today={today}
            nameLabel={t.extraName}
            amountLabel={t.extraAmount}
            removeLabel={t.removeExtra}
            onChange={setRow('extras')}
            onRemove={removeRow('extras')}
          />
          {form.extras.length < MOST_LINES ? (
            <button
              type="button"
              className={formStyles.outlined}
              onClick={() => change((now) => ({ ...now, extras: [...now.extras, blankAmount()] }))}
            >
              {t.addExtra}
            </button>
          ) : null}
          {error('lines') === undefined ? null : (
            <p className={formStyles.error} role="alert">
              {error('lines')}
            </p>
          )}
        </section>

        <section className={screenStyles.card} aria-labelledby={`${id}-tax`}>
          <h2 id={`${id}-tax`} className={screenStyles.cardTitle}>
            {t.taxHeading}
          </h2>
          <DateField
            id={`${id}-payDate`}
            label={t.payday}
            value={form.payDate}
            today={today}
            onChange={(payDate) => setWhen({ payDate })}
            error={error('payDate')}
            extraHint={
              found === null
                ? null
                : {
                    id: `${id}-payDate-period`,
                    text: monthly
                      ? t.inTaxMonth(found.period, yearWords)
                      : t.inTaxWeek(found.period, yearWords),
                  }
            }
          />
          <ChoiceList<PayFrequency>
            legend={t.often}
            name={`${id}-often`}
            value={form.frequency}
            options={(['weekly', 'two-weekly', 'four-weekly', 'monthly'] as const).map((value) => ({
              value,
              label: t.frequencies[value],
            }))}
            onChange={(frequency) => setWhen({ frequency })}
          />
          <Field
            id={`${id}-taxCode`}
            label={t.taxCode}
            error={error('taxCode')}
            hint={t.taxCodeHint}
          >
            <input
              id={`${id}-taxCode`}
              className={formStyles.input}
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={form.taxCode}
              aria-invalid={error('taxCode') !== undefined}
              aria-describedby={describedBy(`${id}-taxCode`, error('taxCode'), [
                `${id}-taxCode-hint`,
              ])}
              onChange={(event) => set({ taxCode: event.target.value })}
            />
          </Field>
          <ChoiceList<CalculatorForm['basis']>
            legend={t.basis}
            name={`${id}-basis`}
            value={form.basis}
            options={[
              { value: 'cumulative', label: t.cumulative },
              { value: 'week-one', label: t.weekOne },
            ]}
            onChange={(basis) => set({ basis })}
          />
          <CheckOption checked={form.pension} onChange={(pension) => set({ pension })}>
            {t.pension}
          </CheckOption>
          {form.pension ? (
            <div className={styles.indented}>
              <Field
                id={`${id}-pensionPercent`}
                label={t.pensionPercent}
                error={error('pensionPercent')}
              >
                <span className={styles.percentBox}>
                  <input
                    id={`${id}-pensionPercent`}
                    className={`${formStyles.input} num`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={form.pensionPercent}
                    aria-invalid={error('pensionPercent') !== undefined}
                    aria-describedby={describedBy(`${id}-pensionPercent`, error('pensionPercent'))}
                    onChange={(event) => set({ pensionPercent: event.target.value })}
                  />
                  <span aria-hidden="true">%</span>
                </span>
              </Field>
              <p id={`${id}-band-hint`} className={formStyles.hint}>
                {t.pensionBandHint}
              </p>
              <div className={styles.pair}>
                <Field
                  id={`${id}-pensionLower`}
                  label={t.pensionLower(periodWord)}
                  error={error('pensionLower')}
                >
                  <MoneyInput
                    id={`${id}-pensionLower`}
                    value={form.pensionLower}
                    onChange={(pensionLower) => set({ pensionLower })}
                    invalid={error('pensionLower') !== undefined}
                    describedBy={describedBy(`${id}-pensionLower`, error('pensionLower'), [
                      `${id}-band-hint`,
                    ])}
                  />
                </Field>
                <Field
                  id={`${id}-pensionUpper`}
                  label={t.pensionUpper(periodWord)}
                  error={error('pensionUpper')}
                >
                  <MoneyInput
                    id={`${id}-pensionUpper`}
                    value={form.pensionUpper}
                    onChange={(pensionUpper) => set({ pensionUpper })}
                    invalid={error('pensionUpper') !== undefined}
                    describedBy={describedBy(`${id}-pensionUpper`, error('pensionUpper'), [
                      `${id}-band-hint`,
                    ])}
                  />
                </Field>
              </div>
              <ChoiceList<CalculatorForm['pensionWhen']>
                legend={t.pensionWhen}
                name={`${id}-pensionWhen`}
                value={form.pensionWhen}
                options={[
                  { value: 'before-tax', label: t.beforeTax },
                  { value: 'after-tax', label: t.afterTax },
                ]}
                onChange={(pensionWhen) => set({ pensionWhen })}
              />
            </div>
          ) : null}
          <ChoiceList<LoanPlan>
            legend={t.studentLoan}
            name={`${id}-loan`}
            value={form.studentLoan}
            options={[
              { value: 'none', label: t.noLoan },
              ...(['plan-1', 'plan-2', 'plan-4', 'plan-5'] as const).map((value) => ({
                value,
                label: t.plans[value],
              })),
            ]}
            onChange={(studentLoan) => set({ studentLoan })}
          />
          <CheckOption
            checked={form.postgraduate}
            onChange={(postgraduate) => set({ postgraduate })}
          >
            {t.postgraduate}
          </CheckOption>
          <NamedAmounts
            rows={form.deductions}
            base={id}
            kind="deduction"
            errors={errors}
            form={form}
            today={today}
            nameLabel={t.deductionName}
            amountLabel={t.deductionAmount}
            removeLabel={t.removeDeduction}
            onChange={setRow('deductions')}
            onRemove={removeRow('deductions')}
          />
          {form.deductions.length < MOST_LINES ? (
            <button
              type="button"
              className={formStyles.outlined}
              onClick={() =>
                change((now) => ({ ...now, deductions: [...now.deductions, blankAmount()] }))
              }
            >
              {t.addDeduction}
            </button>
          ) : null}
        </section>

        <section className={screenStyles.card} aria-labelledby={`${id}-so-far`}>
          <h2 id={`${id}-so-far`} className={screenStyles.cardTitle}>
            {t.soFarHeading}
          </h2>
          <p className={screenStyles.second}>{t.soFarIntro}</p>
          <Field
            id={`${id}-soFarPeriod`}
            label={monthly ? t.soFarMonth : t.soFarWeek}
            error={error('soFarPeriod')}
            hint={t.soFarWeekHint}
          >
            <input
              id={`${id}-soFarPeriod`}
              className={`${formStyles.input} num`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={form.soFarPeriod}
              aria-invalid={error('soFarPeriod') !== undefined}
              aria-describedby={describedBy(`${id}-soFarPeriod`, error('soFarPeriod'), [
                `${id}-soFarPeriod-hint`,
              ])}
              onChange={(event) => set({ soFarPeriod: event.target.value })}
            />
          </Field>
          <Field id={`${id}-grossSoFar`} label={t.grossSoFar} error={error('grossSoFar')}>
            <MoneyInput
              id={`${id}-grossSoFar`}
              value={form.grossSoFar}
              onChange={(grossSoFar) => set({ grossSoFar })}
              invalid={error('grossSoFar') !== undefined}
              describedBy={describedBy(`${id}-grossSoFar`, error('grossSoFar'))}
            />
          </Field>
          <Field id={`${id}-taxSoFar`} label={t.taxSoFar} error={error('taxSoFar')}>
            <MoneyInput
              id={`${id}-taxSoFar`}
              value={form.taxSoFar}
              onChange={(taxSoFar) => set({ taxSoFar })}
              invalid={error('taxSoFar') !== undefined}
              describedBy={describedBy(`${id}-taxSoFar`, error('taxSoFar'))}
            />
          </Field>
        </section>

        <button type="submit" className={formStyles.main}>
          {t.workOut}
        </button>
        <Problem text={problem} />
      </form>

      {worked === null ? (
        stale ? (
          <p className={screenStyles.card} role="status" data-testid="pay-stale">
            {t.changedSince}
          </p>
        ) : null
      ) : (
        <section
          className={`${screenStyles.card} ${styles.result}`}
          aria-labelledby={`${id}-result`}
          data-testid="pay-result"
        >
          <h2 id={`${id}-result`} ref={resultRef} tabIndex={-1} className={screenStyles.label}>
            {t.resultHeading}
          </h2>
          <p className={`${screenStyles.figure} num`} data-testid="take-home">
            {formatMoney(worked.result.takeHome)}
          </p>
          <p className={`${screenStyles.line} num`} data-testid="breakdown">
            {breakdown(worked.result, worked.form)}
          </p>
          <p className={`${screenStyles.second} num`}>
            {t.gross(formatMoney(worked.result.gross))}
          </p>
          {worked.result.taxHeldBack > 0 ? (
            <p className={screenStyles.second}>
              {t.heldBack(formatMoney(worked.result.taxHeldBack))}
            </p>
          ) : null}
          {estimateWords(worked) === null ? null : (
            <p className={screenStyles.second} data-testid="pay-estimate">
              {estimateWords(worked)}
            </p>
          )}
          <p className={styles.notAdvice}>{t.notAdvice}</p>
          {actions(worked)}
        </section>
      )}

      <PayslipCheck form={form} base={id} onBoxesWrong={showErrors} />
    </div>
  );
}
