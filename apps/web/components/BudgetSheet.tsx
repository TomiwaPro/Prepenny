'use client';

// Add, change or end a budget (brief 4.5, D29 to D32, D152, D161). A new
// budget starts today or a later day, and its first week or month is the
// one with that day in it, at the whole amount (D107): the safe choice. A
// change counts from this week or month on; weeks and months that have ended
// stay as they were (D161). Ending it sets its last week or month (D152).
// Each is one change with one Undo.
//
// A new budget that starts today asks the same optional "Already spent this
// week" (or "this month") as setup, saved the same way (D230, D246), from
// the owner's answer to step 2f.
//
// In a shared account, a budget that leaves on this person's paydays gives
// their partner's phone those paydays, the dates only, so it leaves on the
// same days there (D508, D512). The sheet says so before it's saved:
// "Tom will see this money leave on your paydays." (D514).

import type { BudgetEvery, BudgetLeaves, EditCommand } from '@prepenny/engine';
import { useId, useRef, useState } from 'react';
import { partnerOf } from '../data/shared-plan.ts';
import { amountForTyping, parseAmount } from '../lib/amount.ts';
import { followsMyPaydays } from '../lib/budget-paydays.ts';
import { formatDay } from '../lib/dates.ts';
import { newId, timeNow } from '../lib/ids.ts';
import type { BudgetCard } from '../lib/money-views.ts';
import { readDate } from '../lib/new-payment.ts';
import { refusalMessage } from '../lib/refusals.ts';
import { alreadySpentCommand, latestBalanceAt, optionalAmount } from '../lib/setup-forms.ts';
import { strings } from '../strings/en-GB.ts';
import { useShared } from './ChangedBy.tsx';
import { ChoiceList } from './ChoiceList.tsx';
import { CheckOption, DateField, describedBy, Field, MoneyInput, Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import { focusFirst } from './setup/focus.ts';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.budgetSheet;
const words = strings.setup.spending;

interface Form {
  readonly name: string;
  readonly amount: string;
  readonly every: BudgetEvery;
  readonly leaves: BudgetLeaves;
  readonly billDay: string;
  readonly statementDay: string;
  readonly accountId: string;
  readonly startsOn: string;
  readonly rollOver: boolean;
  /** "Already spent this week" (or "this month"), for a new budget that starts today. */
  readonly alreadySpent: string;
}

type Mistakes = Partial<
  Record<'name' | 'amount' | 'billDay' | 'statementDay' | 'startsOn' | 'alreadySpent', string>
>;

const DAY = /^\d{1,2}$/;
const dayOfMonth = (text: string): number | null => {
  const typed = text.trim();
  if (!DAY.test(typed)) return null;
  const day = Number(typed);
  return day >= 1 && day <= 31 ? day : null;
};

export function BudgetSheet({
  open,
  budget,
  onClose,
}: {
  readonly open: boolean;
  /** The budget to change, or null to add one. */
  readonly budget: BudgetCard | null;
  /** Closed: `added` says a new budget was saved. */
  readonly onClose: (added: boolean) => void;
}) {
  const opened = useOpenCount(open);
  // The boxes start from the plan, so they wait for it: a tap before it has
  // loaded would start them with no date or account (step 2g).
  const ready = usePlanActions().loaded !== null;
  return (
    <Sheet
      open={open}
      title={budget === null ? t.addTitle : t.changeTitle}
      intro={budget === null ? t.addIntro : t.changeIntro}
      onClose={() => onClose(false)}
    >
      {opened === 0 || !ready ? null : (
        <BudgetForm key={opened} budget={budget} onDone={(added) => onClose(added)} />
      )}
    </Sheet>
  );
}

function BudgetForm({
  budget,
  onDone,
}: {
  readonly budget: BudgetCard | null;
  readonly onDone: (added: boolean) => void;
}) {
  const { loaded, makeChange, makeChanges } = usePlanActions();
  const id = useId();
  const today = loaded?.today ?? '';
  const accounts = (loaded?.records.accounts ?? [])
    .filter((one) => one.closed !== true)
    .map((one) => ({ value: one.id, label: one.name ?? '' }));
  const stored = budget?.budget ?? null;
  const [form, setForm] = useState<Form>(() => ({
    name: stored?.name ?? '',
    amount: stored === null ? '' : amountForTyping(budget?.current.base ?? stored.amount),
    every: stored?.every ?? 'week',
    leaves: stored?.leaves ?? 'at-start',
    billDay: stored?.billDay === undefined ? '' : String(stored.billDay),
    statementDay: stored?.statementDay === undefined ? '' : String(stored.statementDay),
    accountId: stored?.accountId ?? accounts[0]?.value ?? '',
    startsOn: today,
    rollOver: stored?.rollOver ?? false,
    alreadySpent: '',
  }));
  const [errors, setErrors] = useState<Mistakes>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; at: 'save' | 'end' } | null>(null);
  const [endsOn, setEndsOn] = useState(today);
  const [endError, setEndError] = useState<string | undefined>(undefined);
  const endRef = useRef<HTMLInputElement>(null);
  const set = (change: Partial<Form>) => setForm((now) => ({ ...now, ...change }));
  const payLater = form.leaves === 'pay-later';
  // A change can switch to or from a pay-later card only for a monthly
  // budget with no spending recorded (D107, D161); otherwise only the
  // choices that can work are offered.
  const leavesChoices: { value: BudgetLeaves; label: string }[] = [
    { value: 'at-start', label: words.atStart },
    { value: 'spread', label: words.spread },
    ...(budget === null || (stored?.every === 'month' && !budget.hasSpends)
      ? [{ value: 'pay-later' as const, label: words.payLater }]
      : []),
  ];
  const every: BudgetEvery = payLater ? 'month' : form.every;
  // Only a new budget that starts today has a week or month already under way,
  // and a pay-later card's spending never leaves the bank (D246).
  const asksSpent = budget === null && !payLater && readDate(form.startsOn) === today;
  // Its money leaves on this person's paydays, in an account their partner
  // sees: they're told before it's saved (D514).
  const shared = useShared();
  const accountId = stored?.accountId ?? form.accountId;
  // Off a pay-later card, someone else's budget follows this person's
  // paydays from now on, not its own person's (D523).
  const followsMe =
    stored === null ||
    stored.followsPayOf === undefined ||
    (stored.leaves === 'pay-later' && form.leaves !== 'pay-later');
  const yourPaydays =
    shared !== null &&
    loaded !== null &&
    shared.sharedAccounts.has(accountId) &&
    followsMe &&
    followsMyPaydays(loaded.records, every, form.leaves)
      ? t.partnerWillSee(partnerOf(shared)?.name ?? strings.share.partnerFallback)
      : null;

  async function change(
    command: EditCommand | readonly EditCommand[],
    message: string,
    at: 'save' | 'end',
  ) {
    setBusy(true);
    setProblem(null);
    const outcome = Array.isArray(command)
      ? await makeChanges(command, message)
      : await makeChange(command as EditCommand, message);
    setBusy(false);
    if (outcome.ok) onDone(budget === null && at === 'save');
    else setProblem({ text: refusalMessage(outcome.code), at });
  }

  function save() {
    if (busy) return;
    const found: Mistakes = {};
    const name = form.name.trim();
    if (name === '') found.name = strings.setup.nameError;
    const amount = parseAmount(form.amount);
    if (amount === null || amount === 0) found.amount = strings.form.amountError;
    const billDay = payLater ? dayOfMonth(form.billDay) : null;
    if (payLater && billDay === null) found.billDay = words.billDayError;
    const statementDay = form.statementDay.trim() === '' ? null : dayOfMonth(form.statementDay);
    if (payLater && form.statementDay.trim() !== '' && statementDay === null) {
      found.statementDay = t.statementDayError;
    }
    const startsOn = readDate(form.startsOn);
    if (budget === null && (startsOn === null || startsOn < today)) {
      found.startsOn = strings.setup.startBeforeToday;
    }
    const spent = asksSpent ? optionalAmount(form.alreadySpent) : null;
    if (spent === 'bad') found.alreadySpent = words.alreadySpentError;
    setErrors(found);
    const order = [
      'name',
      'amount',
      'billDay',
      'statementDay',
      'startsOn',
      'alreadySpent',
    ] as const;
    if (order.some((field) => found[field] !== undefined)) {
      focusFirst(order.filter((field) => found[field] !== undefined).map((f) => `${id}-${f}`));
      return;
    }
    if (amount === null || spent === 'bad') return;
    if (budget === null || stored === null) {
      const budgetId = newId();
      const now = timeNow();
      const add: EditCommand = {
        kind: 'add-budget',
        budget: {
          id: budgetId,
          accountId: form.accountId,
          name,
          amount,
          every,
          leaves: form.leaves,
          rollOver: form.rollOver,
          startsOn: startsOn ?? today,
          ...(billDay === null ? {} : { billDay }),
          ...(payLater && statementDay !== null ? { statementDay } : {}),
          createdAt: now,
        },
      };
      if (spent === null || spent === 0) {
        change(add, t.added(name), 'save');
        return;
      }
      const balance = latestBalanceAt(loaded?.records.balanceUpdates ?? [], form.accountId);
      change(
        [add, alreadySpentCommand({ budgetId, spendId: newId() }, spent, today, now, balance)],
        t.added(name),
        'save',
      );
      return;
    }
    const edits: {
      name?: string;
      amount?: number;
      leaves?: BudgetLeaves;
      rollOver?: boolean;
      billDay?: number;
      statementDay?: number | null;
    } = {};
    if (name !== stored.name) edits.name = name;
    if (amount !== budget.current.base) edits.amount = amount;
    if (form.leaves !== stored.leaves) edits.leaves = form.leaves;
    if (form.rollOver !== stored.rollOver) edits.rollOver = form.rollOver;
    if (payLater && billDay !== null && billDay !== stored.billDay) edits.billDay = billDay;
    if (payLater && statementDay !== (stored.statementDay ?? null)) {
      edits.statementDay = statementDay;
    }
    if (Object.keys(edits).length === 0) {
      setProblem({ text: t.nothingChanged, at: 'save' });
      return;
    }
    change({ kind: 'change-budget', budgetId: stored.id, edits }, t.changed(name), 'save');
  }

  const error = (field: keyof Mistakes) => errors[field];
  const dayBox = (field: 'billDay' | 'statementDay', label: string, hint: string | null) => (
    <Field id={`${id}-${field}`} label={label} error={error(field)} hint={hint}>
      <input
        id={`${id}-${field}`}
        className={`${styles.input} num`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={form[field]}
        aria-invalid={error(field) !== undefined}
        aria-describedby={describedBy(`${id}-${field}`, error(field), [
          hint === null ? null : `${id}-${field}-hint`,
        ])}
        onChange={(event) => set({ [field]: event.target.value })}
      />
    </Field>
  );

  return (
    <div className={styles.form}>
      <form
        className={styles.form}
        noValidate
        aria-label={budget === null ? t.addTitle : t.changeTitle}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Field id={`${id}-name`} label={words.name} error={error('name')}>
          <input
            id={`${id}-name`}
            className={styles.input}
            type="text"
            autoComplete="off"
            value={form.name}
            aria-invalid={error('name') !== undefined}
            aria-describedby={describedBy(`${id}-name`, error('name'))}
            onChange={(event) => set({ name: event.target.value })}
          />
        </Field>
        <Field
          id={`${id}-amount`}
          label={words.amount}
          error={error('amount')}
          hint={budget === null ? null : every === 'week' ? t.amountFromWeek : t.amountFromMonth}
        >
          <MoneyInput
            id={`${id}-amount`}
            value={form.amount}
            onChange={(amount) => set({ amount })}
            invalid={error('amount') !== undefined}
            describedBy={describedBy(`${id}-amount`, error('amount'), [
              budget === null ? null : `${id}-amount-hint`,
            ])}
          />
        </Field>
        {payLater ? (
          <p className={styles.hint}>{words.payLaterHint}</p>
        ) : budget !== null ? null : (
          <ChoiceList<BudgetEvery>
            legend={words.every}
            name={`${id}-every`}
            value={form.every}
            options={[
              { value: 'week', label: words.week },
              { value: 'month', label: words.month },
            ]}
            onChange={(value) => set({ every: value })}
          />
        )}
        {stored?.leaves === 'pay-later' ? (
          <p className={styles.hint}>{t.staysPayLater}</p>
        ) : (
          <ChoiceList<BudgetLeaves>
            legend={form.name.trim() === '' ? words.leavesNoName : words.leaves(form.name.trim())}
            name={`${id}-leaves`}
            value={form.leaves}
            options={leavesChoices}
            onChange={(leaves) => set({ leaves })}
          />
        )}
        {budget !== null && stored?.leaves !== 'pay-later' && leavesChoices.length < 3 ? (
          <p className={styles.hint}>{t.noPayLaterSwitch}</p>
        ) : null}
        {payLater ? (
          <>
            {dayBox('billDay', words.billDay, null)}
            {dayBox('statementDay', t.statementDay, t.statementDayHint)}
          </>
        ) : null}
        {budget === null && accounts.length > 1 ? (
          <ChoiceList<string>
            legend={words.from}
            name={`${id}-from`}
            value={form.accountId}
            options={accounts}
            onChange={(accountId) => set({ accountId })}
          />
        ) : null}
        {budget === null ? (
          <DateField
            id={`${id}-startsOn`}
            label={t.starts}
            value={form.startsOn}
            today={today}
            min={today}
            onChange={(startsOn) => set({ startsOn })}
            error={error('startsOn')}
            extraHint={{ id: `${id}-startsOn-hint`, text: t.startsHint }}
          />
        ) : null}
        {asksSpent ? (
          <Field
            id={`${id}-alreadySpent`}
            label={every === 'week' ? words.alreadySpentWeek : words.alreadySpentMonth}
            error={error('alreadySpent')}
            hint={words.alreadySpentHint}
          >
            <MoneyInput
              id={`${id}-alreadySpent`}
              value={form.alreadySpent}
              onChange={(alreadySpent) => set({ alreadySpent })}
              invalid={error('alreadySpent') !== undefined}
              describedBy={describedBy(`${id}-alreadySpent`, error('alreadySpent'), [
                `${id}-alreadySpent-hint`,
              ])}
            />
          </Field>
        ) : null}
        <CheckOption checked={form.rollOver} onChange={(rollOver) => set({ rollOver })}>
          {t.rollOver}
        </CheckOption>
        {yourPaydays === null ? null : (
          <p className={styles.hint} data-testid="your-paydays">
            {yourPaydays}
          </p>
        )}
        <button type="submit" className={styles.main} aria-disabled={busy}>
          {budget === null ? t.save : t.saveChanges}
        </button>
        {problem?.at === 'save' ? <Problem text={problem.text} /> : null}
      </form>

      {budget === null || stored === null ? null : (
        <form
          className={styles.group}
          noValidate
          aria-labelledby={`${id}-end-heading`}
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            const day = readDate(endsOn);
            if (day === null || day < today) {
              setEndError(t.endError);
              endRef.current?.focus();
              return;
            }
            setEndError(undefined);
            change(
              { kind: 'end-budget', budgetId: stored.id, endsOn: day },
              t.ended(stored.name, formatDay(day, today)),
              'end',
            );
          }}
        >
          <h3 id={`${id}-end-heading`} className={styles.subheading}>
            {t.endHeading}
          </h3>
          <p className={styles.hint}>{t.endIntro}</p>
          <DateField
            id={`${id}-endsOn`}
            label={t.endOn}
            value={endsOn}
            today={today}
            min={today}
            onChange={setEndsOn}
            error={endError}
            inputRef={endRef}
          />
          <button type="submit" className={styles.outlined} aria-disabled={busy}>
            {t.end}
          </button>
          {problem?.at === 'end' ? <Problem text={problem.text} /> : null}
        </form>
      )}
    </div>
  );
}
