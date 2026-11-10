'use client';

// Edit a payment (brief 4.4 and 5.4, the edit sketch in ARCHITECTURE.md
// 4.6): tapping a row opens this sheet. At the top, the payment, its date,
// account, amount and what's left after it. Then the quick actions, the
// "two taps" of brief Part 3, principle 4: Mark as paid, Move to next payday
// and Skip this one. Then the amount, date, name, note and estimate, for
// just this one or this and all later ones, and Remove.
//
// Every change is made by the engine (D87), saved on the phone straight away,
// and can be undone from the undo bar. A change the engine refuses is
// explained with words from the strings file, never its code.

import type { EditCommand, JustThisOneEdits, Schedule, ThisAndLaterEdits } from '@prepenny/engine';
import Link from 'next/link';
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { nameOf, useSharedPlan } from '../data/shared-plan.ts';
import { amountForTyping, parseAmount } from '../lib/amount.ts';
import type { ChangeWords } from '../lib/bar-words.ts';
import { formatDay } from '../lib/dates.ts';
import { holidaysFor } from '../lib/holidays.ts';
import { newId, timeNow } from '../lib/ids.ts';
import { formatMoney } from '../lib/money.ts';
import {
  blankPayment,
  type PaymentErrors,
  repeatSchedule,
  sameSchedule,
  type WhenForm,
} from '../lib/new-payment.ts';
import { refusalMessage } from '../lib/refusals.ts';
import type { RowView } from '../lib/rows.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { ClaimPay } from './ClaimPay.tsx';
import { CheckOption } from './Fields.tsx';
import styles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import { StatusPill } from './StatusPill.tsx';
import { focusField, RepeatFields, useWhenRefs } from './WhenFields.tsx';

const t = strings.edit;

/**
 * What the sheet is for, in one plain sentence (D213). A budget's own rows
 * have their note instead, which says where they're changed.
 */
function introFor(row: RowView | null): string | null {
  if (row === null || row.editing === 'none') return null;
  if (row.editing === 'set-aside')
    return row.flow === 'transfer-in' ? t.introSetAsideIn : t.introSetAside;
  return t.intro;
}

export interface EditSheetProps {
  /** The row to edit, or null when the sheet is closed. */
  readonly row: RowView | null;
  readonly today: string;
  /** The sheet has closed: after a change, with the version of the records it made. */
  readonly onClose: (changedTo: number | null) => void;
}

export function EditSheet({ row, today, onClose }: EditSheetProps) {
  // The row stays on screen while the sheet closes, and the form starts
  // afresh each time the sheet opens. It's set while drawing, so the sheet's
  // name and form are the new row's before the sheet takes focus.
  const [shown, setShown] = useState<{ row: RowView; opened: number } | null>(null);
  if (row !== null && shown?.row !== row) {
    setShown({ row, opened: (shown?.opened ?? 0) + 1 });
  }
  // A change that finishes after its sheet has closed mustn't close the next one.
  const openNow = useRef<number | null>(null);
  openNow.current = row === null ? null : (shown?.opened ?? null);
  const current = row ?? shown?.row ?? null;
  return (
    <Sheet
      open={row !== null}
      title={current?.name ?? ''}
      intro={introFor(current)}
      onClose={() => onClose(null)}
    >
      {shown === null ? null : (
        <EditForm
          key={shown.opened}
          row={shown.row}
          today={today}
          onDone={(version) => {
            if (openNow.current === shown.opened) onClose(version);
          }}
        />
      )}
    </Sheet>
  );
}

type Scope = 'one' | 'later';
type PatternScope = 'every' | 'step';

interface FieldErrors {
  amount?: string;
  date?: string;
  name?: string;
}

function Field({
  id,
  label,
  error,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly error: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      {error === undefined ? null : (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

function EditForm({
  row,
  today,
  onDone,
}: {
  readonly row: RowView;
  readonly today: string;
  readonly onDone: (version: number) => void;
}) {
  const { makeChange, loaded } = usePlanActions();
  const id = useId();
  const holidays = useMemo(
    () => holidaysFor(loaded?.records.settings?.nation ?? 'england-and-wales'),
    [loaded?.records.settings?.nation],
  );
  // "Change how often it repeats" (D96, step 2f): the boxes start at how it repeats now.
  const [changeOften, setChangeOften] = useState(false);
  const [repeat, setRepeat] = useState<WhenForm>(() => ({
    ...blankPayment(row.originalDate, '', ''),
    howOften: row.repeats?.howOften ?? 'monthly',
    weeks: String(row.repeats?.howOften === 'weekly' ? row.repeats.every : 1),
    months: String(row.repeats?.howOften === 'monthly' ? row.repeats.every : 1),
    monthlyOn: row.repeats?.monthlyOn ?? 'day',
    leaveOut: (row.repeats?.leftOut.length ?? 0) > 0,
    leftOut: [...(row.repeats?.leftOut ?? [])],
  }));
  const [repeatErrors, setRepeatErrors] = useState<PaymentErrors>({});
  const repeatRefs = useWhenRefs();
  const [view, setView] = useState<'main' | 'remove'>('main');
  const [busy, setBusy] = useState(false);
  // A refusal, shown beside what was tapped: the quick actions, Save or Remove.
  const [problem, setProblem] = useState<{
    text: string;
    at: 'actions' | 'save' | 'remove';
  } | null>(null);
  const [amountText, setAmountText] = useState(amountForTyping(row.amount));
  const [date, setDate] = useState(row.paymentDate);
  const [name, setName] = useState(row.name);
  const [note, setNote] = useState(row.note ?? '');
  const [scope, setScope] = useState<Scope>('one');
  const [patternScope, setPatternScope] = useState<PatternScope>('every');
  const [estimateChoice, setEstimateChoice] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const fields = {
    amount: useRef<HTMLInputElement>(null),
    date: useRef<HTMLInputElement>(null),
    name: useRef<HTMLInputElement>(null),
  };
  const removeHeading = useRef<HTMLHeadingElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);

  const cameBack = useRef(false);
  useEffect(() => {
    if (view === 'remove') removeHeading.current?.focus();
    else if (cameBack.current) removeButton.current?.focus();
  }, [view]);

  const day = (date: string) => formatDay(date, today);
  const ref = { seriesId: row.seriesId, originalDate: row.originalDate };
  const isPayment = row.editing === 'payment';
  const canChange = isPayment || row.editing === 'bill';
  const canTick = canChange || row.editing === 'set-aside';
  const setAside = row.editing === 'set-aside' ? ({ setAside: true } as const) : {};
  const showNameAndNote = isPayment && !row.sharedHalf;
  // What the plan's sharing says about this payment (step 3f).
  const planId = loaded !== null && !loaded.plan.isExample ? loaded.plan.id : null;
  const shared = useSharedPlan(planId, loaded?.version ?? 0);
  const lockedBy = shared?.lockedTo.get(row.seriesId);
  const paidBy = shared?.paidTo.get(row.seriesId);
  const claimable =
    shared !== null &&
    isPayment &&
    row.direction === 'in' &&
    (row.type === 'pay' || row.type === 'benefits') &&
    shared.sharedAccounts.has(row.accountId) &&
    paidBy !== undefined &&
    paidBy !== shared.personId;
  // Money coming into this account is marked as arrived, not paid (D278).
  const comingIn = row.flow === 'in' || row.flow === 'transfer-in';
  // A pattern on pay that isn't weekly goes round by payday, not by week (D280).
  const weeklyPay = row.repeats?.howOften === 'weekly' && row.repeats.every === 1;

  const amount = parseAmount(amountText);
  const amountChanged = amount !== null && amount !== row.amount;
  // Typing the real amount for just this one means it isn't an estimate any
  // more (brief 4.3), unless the person ticks the box again (D185).
  const later = isPayment && scope === 'later';
  const isEstimate = estimateChoice ?? (row.isEstimate && (later || !amountChanged));
  const askPattern = later && row.hasPattern && amountChanged;
  const canChangeOften = later && row.repeats !== null;
  // The new schedule starts from the payment's date in its schedule, before
  // any weekend or bank holiday move: rent due on Sun 1 Nov and paid on Mon
  // 2 Nov repeats on the 1st (D96). A date typed above is taken as that date.
  const scheduleDate = date === row.paymentDate ? row.originalDate : date;
  const oftenOn = canChangeOften && changeOften;

  async function change(
    command: EditCommand,
    message: ChangeWords,
    at: 'actions' | 'save' | 'remove',
  ) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const outcome = await makeChange(command, message);
    setBusy(false);
    if (outcome.ok) onDone(outcome.version);
    else setProblem({ text: refusalMessage(outcome.code), at });
  }

  function save() {
    const found: FieldErrors = {};
    if (amount === null) found.amount = t.amountError;
    if (date === '') found.date = t.dateError;
    if (showNameAndNote && name.trim() === '') found.name = t.nameError;
    setErrors(found);
    const first = (['amount', 'date', 'name'] as const).find((key) => found[key] !== undefined);
    if (first !== undefined) {
      fields[first].current?.focus();
      return;
    }
    // A new "how often" from this payment on, worked out from the date above (D96).
    let schedule: Schedule | null = null;
    if (oftenOn) {
      const mistakes: PaymentErrors = {};
      schedule = repeatSchedule({ ...repeat, date: scheduleDate }, holidays, mistakes);
      setRepeatErrors(mistakes);
      const wrong = (['weeks', 'months', 'leaveOut'] as const).find(
        (key) => mistakes[key] !== undefined,
      );
      if (wrong !== undefined) {
        focusField(repeatRefs[wrong].current, mistakes, { date: scheduleDate });
        return;
      }
      if (
        schedule !== null &&
        row.repeats !== null &&
        sameSchedule(schedule, row.repeats.schedule)
      ) {
        schedule = null;
      }
    }
    const edits: { -readonly [K in keyof JustThisOneEdits]: JustThisOneEdits[K] } = {};
    if (amountChanged) edits.amount = amount;
    if (date !== row.paymentDate) edits.date = date;
    if (showNameAndNote && name.trim() !== row.name) edits.name = name.trim();
    if (showNameAndNote && note.trim() !== (row.note ?? '')) edits.note = note.trim();
    if (isEstimate !== row.isEstimate) edits.isEstimate = isEstimate;
    // Unticking "This is an estimate" for just this one says the amount shown
    // is the real one, so it's sent as the real amount even when it's the
    // same as the estimate: a pay-later bill's real amount always stands (D111, D185).
    if (!later && row.isEstimate && !isEstimate && amount !== null) edits.amount = amount;
    if (Object.keys(edits).length === 0 && schedule === null) {
      setProblem({ text: t.nothingChanged, at: 'save' });
      return;
    }
    if (!later) {
      change(
        { kind: 'just-this-one', ...ref, edits },
        {
          full: strings.undo.changedJustThisOne(row.name),
          short: strings.undo.short.changed(row.name),
        },
        'save',
      );
      return;
    }
    const { amount: newAmount, ...rest } = edits;
    const laterEdits: ThisAndLaterEdits = {
      ...rest,
      ...(schedule === null ? {} : { schedule }),
      ...(newAmount === undefined
        ? {}
        : askPattern && patternScope === 'step'
          ? { stepAmount: newAmount }
          : { amount: newAmount }),
    };
    change(
      {
        kind: 'this-and-later',
        ...ref,
        edits: laterEdits,
        newSeriesId: newId(),
        newOtherHalfSeriesId: newId(),
      },
      {
        full: strings.undo.changedThisAndLater(row.name),
        short: strings.undo.short.changed(row.name),
      },
      'save',
    );
  }

  // The phone shows the date its own way, so it's also written PrePenny's way: "Sun 1 Nov".
  let dateWords: string | null = null;
  try {
    dateWords = date === '' ? null : day(date);
  } catch {
    // A date the engine can't read: the engine says so when it's saved.
  }

  const difference =
    row.isEstimate && amountChanged && amount !== null ? amount - row.amount : null;
  const describedBy = (key: keyof FieldErrors, extra?: string) =>
    [errors[key] === undefined ? null : `${id}-${key}-error`, extra ?? null]
      .filter((one) => one !== null)
      .join(' ') || undefined;

  const where =
    row.transfer === null
      ? t.where(day(row.date), row.accountName)
      : t.whereTransfer(day(row.date), row.transfer.from, row.transfer.to);

  const problemAt = (at: 'actions' | 'save' | 'remove') =>
    problem === null || problem.at !== at ? null : (
      <p className={styles.problem} role="alert">
        {problem.text}
      </p>
    );

  if (view === 'remove') {
    return (
      <div className={styles.form}>
        <h3 ref={removeHeading} tabIndex={-1} className={styles.subheading}>
          {t.removeHeading}
        </h3>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.outlined}
            aria-disabled={busy}
            onClick={() =>
              change(
                { kind: 'remove-this-one', ...ref },
                {
                  full: strings.undo.removedJustThisOne(row.name),
                  short: strings.undo.short.removed(row.name),
                },
                'remove',
              )
            }
          >
            {t.removeJustThisOne}
          </button>
          {isPayment ? (
            <button
              type="button"
              className={styles.outlined}
              aria-disabled={busy}
              onClick={() =>
                change(
                  { kind: 'remove-this-and-later', ...ref },
                  {
                    full: strings.undo.removedThisAndLater(row.name),
                    short: strings.undo.short.removed(row.name),
                  },
                  'remove',
                )
              }
            >
              {t.removeThisAndLater}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.quiet}
            onClick={() => {
              setProblem(null);
              cameBack.current = true;
              setView('main');
            }}
          >
            {t.keep}
          </button>
        </div>
        {problemAt('remove')}
      </div>
    );
  }

  const summary = (
    <div className={styles.summary}>
      <p className={styles.where}>{where}</p>
      <p className={styles.figures}>
        <span className={`${styles.amount} ${row.change > 0 ? styles.in : ''} num`}>
          {formatMoney(row.change, { sign: 'always' })}
        </span>
        <span className={styles.leftLine}>
          <span className="num">{strings.rows.left(formatMoney(row.leftAfter))}</span>
          {row.status === 'ok' ? null : <StatusPill status={row.status} />}
        </span>
      </p>
    </div>
  );

  // "From Jess" on Tom's phone: only Jess changes it (D16, D293).
  if (lockedBy !== undefined) {
    return (
      <div className={styles.form}>
        {summary}
        <p className={styles.lede} data-testid="locked-to">
          {strings.share.lockedTo(nameOf(shared, lockedBy) ?? strings.share.yourPartner)}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      {summary}
      {claimable && paidBy !== undefined ? (
        <ClaimPay
          planId={planId ?? ''}
          familyId={shared?.familyOf.get(row.seriesId) ?? row.seriesId}
          who={nameOf(shared, paidBy) ?? strings.clash.partner}
        />
      ) : null}

      {canTick ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.outlined}
            aria-disabled={busy}
            onClick={() =>
              row.ticked
                ? change(
                    { kind: 'untick', ...ref, ...setAside },
                    comingIn
                      ? strings.undo.markedNotArrived(row.name)
                      : strings.undo.markedNotPaid(row.name),
                    'actions',
                  )
                : change(
                    { kind: 'tick', ...ref, ...setAside, tickedAt: timeNow() },
                    comingIn
                      ? strings.undo.markedArrived(row.name)
                      : strings.undo.markedPaid(row.name),
                    'actions',
                  )
            }
          >
            {row.ticked
              ? comingIn
                ? t.markAsNotArrived
                : t.markAsNotPaid
              : comingIn
                ? t.markAsArrived
                : t.markAsPaid}
          </button>
          {canChange && !row.ticked && row.nextPayday !== null ? (
            <div className={styles.withHint}>
              <button
                type="button"
                className={styles.outlined}
                aria-disabled={busy}
                aria-describedby={`${id}-moves`}
                onClick={() =>
                  change(
                    { kind: 'move-to-next-payday', ...ref },
                    strings.undo.moved(row.name, day(row.nextPayday ?? row.paymentDate)),
                    'actions',
                  )
                }
              >
                {t.moveToNextPayday}
              </button>
              <p id={`${id}-moves`} className={styles.hint}>
                {t.movesItTo(day(row.nextPayday))}
              </p>
            </div>
          ) : null}
          {canChange ? (
            <button
              type="button"
              className={styles.outlined}
              aria-disabled={busy}
              onClick={() =>
                change(
                  { kind: 'remove-this-one', ...ref },
                  strings.undo.skipped(row.name),
                  'actions',
                )
              }
            >
              {t.skipThisOne}
            </button>
          ) : null}
          {problemAt('actions')}
        </div>
      ) : null}

      {row.editing === 'bill' ? <p className={styles.note}>{t.billRow}</p> : null}
      {row.editing === 'set-aside' ? <p className={styles.note}>{t.setAsideRow}</p> : null}
      {row.editing === 'none' ? <p className={styles.note}>{t.budgetRow}</p> : null}
      {row.editing === 'bill' || row.editing === 'none' ? (
        <Link className={styles.outlined} href="/app/budgets/">
          {t.goToBudgets}
        </Link>
      ) : null}

      {canChange ? (
        <form
          className={styles.changes}
          noValidate
          aria-labelledby={`${id}-change`}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <h3 id={`${id}-change`} className={styles.subheading}>
            {t.changeHeading}
          </h3>
          <Field id={`${id}-amount`} label={t.amount} error={errors.amount}>
            <div className={styles.money}>
              <span className={styles.pound} aria-hidden="true">
                {t.pound}
              </span>
              <input
                ref={fields.amount}
                id={`${id}-amount`}
                className={`${styles.input} num`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amountText}
                aria-invalid={errors.amount !== undefined}
                aria-describedby={describedBy(
                  'amount',
                  difference === null ? undefined : `${id}-difference`,
                )}
                onChange={(event) => setAmountText(event.target.value)}
              />
            </div>
            {difference === null ? null : (
              <p id={`${id}-difference`} className={styles.hint} aria-live="polite">
                {difference > 0
                  ? t.moreThanEstimate(formatMoney(difference))
                  : t.lessThanEstimate(formatMoney(-difference))}
              </p>
            )}
          </Field>
          <Field id={`${id}-date`} label={t.date} error={errors.date}>
            <input
              ref={fields.date}
              id={`${id}-date`}
              className={styles.input}
              type="date"
              value={date}
              aria-invalid={errors.date !== undefined}
              aria-describedby={describedBy('date', dateWords === null ? undefined : `${id}-day`)}
              onChange={(event) => setDate(event.target.value)}
            />
            {dateWords === null ? null : (
              <p id={`${id}-day`} className={styles.hint}>
                {dateWords}
              </p>
            )}
          </Field>
          {showNameAndNote ? (
            <>
              <Field id={`${id}-name`} label={t.name} error={errors.name}>
                <input
                  ref={fields.name}
                  id={`${id}-name`}
                  className={styles.input}
                  type="text"
                  autoComplete="off"
                  value={name}
                  aria-invalid={errors.name !== undefined}
                  aria-describedby={describedBy('name')}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field id={`${id}-note`} label={t.note} error={undefined}>
                <input
                  id={`${id}-note`}
                  className={styles.input}
                  type="text"
                  autoComplete="off"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Field>
            </>
          ) : null}
          <label className={styles.option}>
            <input
              type="checkbox"
              checked={isEstimate}
              onChange={(event) => setEstimateChoice(event.target.checked)}
            />
            <span>{t.isEstimate}</span>
          </label>
          {isPayment ? (
            <ChoiceList<Scope>
              legend={t.change}
              name={`${id}-scope`}
              value={scope}
              options={[
                { value: 'one', label: t.justThisOne },
                { value: 'later', label: t.thisAndLater },
              ]}
              onChange={setScope}
            />
          ) : null}
          {canChangeOften ? (
            <div className={styles.withHint}>
              <CheckOption
                checked={changeOften}
                onChange={setChangeOften}
                describedBy={`${id}-often-hint`}
              >
                {t.changeOften}
              </CheckOption>
              <p id={`${id}-often-hint`} className={styles.hint}>
                {t.changeOftenHint}
              </p>
            </div>
          ) : null}
          {oftenOn ? (
            <RepeatFields
              id={`${id}-often`}
              form={{ ...repeat, date: scheduleDate }}
              set={(key, value) => setRepeat((now) => ({ ...now, [key]: value }))}
              errors={repeatErrors}
              refs={repeatRefs}
              holidays={holidays}
              howOften={['weekly', 'monthly']}
            />
          ) : null}
          {askPattern ? (
            <ChoiceList<PatternScope>
              legend={t.whichPaydays}
              name={`${id}-pattern`}
              value={patternScope}
              options={[
                { value: 'every', label: t.everyPayday },
                { value: 'step', label: weeklyPay ? t.onlyThisWeek : t.onlyThisPayday },
              ]}
              onChange={setPatternScope}
            />
          ) : null}
          <button type="submit" className={styles.main} aria-disabled={busy}>
            {t.save}
          </button>
          {problemAt('save')}
          <button
            ref={removeButton}
            type="button"
            className={styles.quiet}
            onClick={() => {
              setProblem(null);
              setView('remove');
            }}
          >
            {t.remove}
          </button>
        </form>
      ) : null}
    </div>
  );
}
