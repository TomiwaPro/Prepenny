'use client';

// Update balance (brief 4.2, D33, D46, D87, the Update balance sketch in
// ARCHITECTURE.md 4.6, D197), in three steps:
//
// 1. Choose the account and type what the bank shows now.
// 2. What the plan expected by the end of today, and the difference.
// 3. Tick anything from today or earlier that has gone out or come in:
//    all of it, oldest first, with "Tick all".
//
// Done saves the new balance with everything ticked in its steps as one
// change, so one Undo takes all of it back (D87). Then it shows the new
// lowest point ahead.

import type { EditCommand, Pence, TickInUpdate } from '@prepenny/engine';
import { useEffect, useId, useRef, useState } from 'react';
import type { BalanceAccount } from '../lib/actions-view.ts';
import { parseSignedAmount } from '../lib/amount.ts';
import { formatDay, formatTime } from '../lib/dates.ts';
import { newId, timeNow } from '../lib/ids.ts';
import { formatMoney } from '../lib/money.ts';
import { refusalMessage } from '../lib/refusals.ts';
import type { RowView } from '../lib/rows.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { CheckOption, describedBy, Field, MoneyInput, Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import { StatusPill } from './StatusPill.tsx';
import { type ShownActions, useActionsView } from './useActionsView.ts';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.updateBalance;

export function UpdateBalanceSheet({
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
      {opened === 0 ? null : <UpdateBalanceForm key={opened} shown={shown} onClose={onClose} />}
    </Sheet>
  );
}

type Step = 'type' | 'compare' | 'tick' | 'done';

/** "Sun 25 Oct, Spending money until payday, −£30.00", for each tick box. */
function TickRow({
  row,
  today,
  checked,
  onChange,
}: {
  readonly row: RowView;
  readonly today: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <li>
      <label className={styles.tickRow}>
        <input
          type="checkbox"
          checked={checked}
          aria-label={t.tickLabel(
            formatDay(row.date, today),
            row.name,
            formatMoney(row.change, { sign: 'always' }),
          )}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={styles.tickWords} aria-hidden="true">
          <span className={styles.tickDate}>{formatDay(row.date, today)}</span>
          <span className={styles.tickLine}>
            <span>{row.name}</span>
            <span className={`${styles.tickAmount} ${row.change > 0 ? styles.in : ''} num`}>
              {formatMoney(row.change, { sign: 'always' })}
            </span>
          </span>
        </span>
      </label>
    </li>
  );
}

function UpdateBalanceForm({
  shown,
  onClose,
}: {
  readonly shown: ShownActions;
  readonly onClose: () => void;
}) {
  const { makeChange } = usePlanActions();
  const id = useId();
  const [step, setStep] = useState<Step>('type');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [overdrawn, setOverdrawn] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<{
    accountId: string;
    balance: Pence;
    checkedAt: string;
    ticked: number;
    version: number;
  } | null>(null);
  // The rows to tick, as they were when step 3 opened, so the list doesn't
  // change under the person's thumb.
  const [toTick, setToTick] = useState<readonly RowView[]>([]);
  const amountRef = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);

  // Each step's heading takes focus, so a screen reader starts at the top of it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: it runs when the step changes
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  const view = shown.view;
  if (view === null) {
    return shown.failed ? <Problem text={strings.errors.plan} /> : <p>{strings.sheet.working}</p>;
  }
  const today = view.today;
  const day = (date: string) => formatDay(date, today);
  const account: BalanceAccount | undefined =
    view.accounts.find((one) => one.id === (accountId ?? view.homeAccountId)) ?? view.accounts[0];
  if (account === undefined) return <Problem text={strings.errors.plan} />;

  const typed = parseSignedAmount(amountText);
  const balance = typed === null ? null : overdrawn && typed > 0 ? -typed : typed;

  function next() {
    if (balance === null) {
      setError(t.amountError);
      amountRef.current?.focus();
      return;
    }
    setError(undefined);
    setStep('compare');
  }

  async function done() {
    if (busy || balance === null || account === undefined) return;
    setBusy(true);
    setProblem(null);
    const checkedAt = timeNow();
    const updateId = newId();
    const ticks: TickInUpdate[] = toTick
      .filter((row) => ticked.has(row.key))
      .map((row) => ({
        seriesId: row.seriesId,
        originalDate: row.originalDate,
        tickedAt: checkedAt,
        ...(row.editing === 'set-aside' ? { setAside: true as const } : {}),
      }));
    const command: EditCommand = {
      kind: 'update-balance',
      update: {
        id: updateId,
        accountId: account.id,
        balance,
        checkedOn: today,
        checkedAt,
      },
      ticks,
    };
    const outcome = await makeChange(
      command,
      ticks.length === 0
        ? strings.undo.balanceUpdated(account.name)
        : strings.undo.balanceUpdatedTicked(account.name, ticks.length),
    );
    setBusy(false);
    if (!outcome.ok) {
      setProblem(refusalMessage(outcome.code));
      return;
    }
    setSaved({
      accountId: account.id,
      balance,
      checkedAt,
      ticked: ticks.length,
      version: outcome.version,
    });
    setStep('done');
  }

  const stepLabel = (number: number) => (
    <p className={styles.step}>{strings.sheet.stepOf(number, 3)}</p>
  );

  if (step === 'type') {
    return (
      <form
        className={styles.form}
        noValidate
        aria-labelledby={`${id}-heading`}
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
      >
        {stepLabel(1)}
        <h3 id={`${id}-heading`} ref={heading} tabIndex={-1} className={styles.subheading}>
          {account.name}
        </h3>
        {view.accounts.length > 1 ? (
          <ChoiceList<string>
            legend={t.whichAccount}
            name={`${id}-account`}
            value={account.id}
            options={view.accounts.map((one) => ({ value: one.id, label: one.name }))}
            onChange={setAccountId}
          />
        ) : null}
        <Field id={`${id}-amount`} label={t.typeWhatBankShows} error={error}>
          <MoneyInput
            id={`${id}-amount`}
            inputRef={amountRef}
            value={amountText}
            onChange={setAmountText}
            invalid={error !== undefined}
            describedBy={describedBy(`${id}-amount`, error)}
          />
        </Field>
        <CheckOption checked={overdrawn} onChange={setOverdrawn}>
          {t.overdrawn}
        </CheckOption>
        <button type="submit" className={styles.main}>
          {strings.sheet.next}
        </button>
      </form>
    );
  }

  if (step === 'compare' && balance !== null) {
    const difference = balance - account.expected;
    return (
      <div className={styles.form}>
        {stepLabel(2)}
        <h3 ref={heading} tabIndex={-1} className={styles.subheading}>
          {account.name}
        </h3>
        <div className={styles.stack} data-testid="balance-compare">
          <p className={`${styles.lede} num`}>{t.expected(formatMoney(account.expected))}</p>
          <p className={`${styles.lede} num`}>{t.bankShows(formatMoney(balance))}</p>
          <p className={`${styles.lede} num`}>
            <strong>
              {difference === 0
                ? t.match
                : difference < 0
                  ? t.less(formatMoney(-difference))
                  : t.more(formatMoney(difference))}
            </strong>
          </p>
        </div>
        <button
          type="button"
          className={styles.main}
          onClick={() => {
            setToTick(account.toTick);
            setStep('tick');
          }}
        >
          {strings.sheet.next}
        </button>
        <button type="button" className={styles.quiet} onClick={() => setStep('type')}>
          {strings.sheet.back}
        </button>
      </div>
    );
  }

  if (step === 'tick') {
    const allTicked = toTick.length > 0 && toTick.every((row) => ticked.has(row.key));
    return (
      <div className={styles.form}>
        {stepLabel(3)}
        <h3 ref={heading} tabIndex={-1} className={styles.subheading}>
          {toTick.length === 0 ? t.nothingToTick : t.tickHeading}
        </h3>
        {toTick.length === 0 ? null : (
          <>
            <p className={styles.hint}>{t.tickIntro}</p>
            <ul className={styles.tickList} data-testid="to-tick">
              {toTick.map((row) => (
                <TickRow
                  key={row.key}
                  row={row}
                  today={today}
                  checked={ticked.has(row.key)}
                  onChange={(checked) => {
                    const next = new Set(ticked);
                    if (checked) next.add(row.key);
                    else next.delete(row.key);
                    setTicked(next);
                  }}
                />
              ))}
            </ul>
            <button
              type="button"
              className={styles.outlined}
              onClick={() =>
                setTicked(allTicked ? new Set() : new Set(toTick.map((row) => row.key)))
              }
            >
              {allTicked ? t.untickAll : t.tickAll}
            </button>
          </>
        )}
        <button type="button" className={styles.main} aria-disabled={busy} onClick={done}>
          {strings.sheet.done}
        </button>
        <Problem text={problem} />
        <button type="button" className={styles.quiet} onClick={() => setStep('compare')}>
          {strings.sheet.back}
        </button>
      </div>
    );
  }

  // Done: the new balance and the lowest point ahead, once the plan has been
  // worked out again with the change.
  const after =
    saved !== null && shown.version !== null && shown.version >= saved.version
      ? view.accounts.find((one) => one.id === saved.accountId)
      : undefined;
  const lowest = after?.lowest;
  return (
    <div className={styles.form}>
      <h3 ref={heading} tabIndex={-1} className={styles.subheading}>
        {t.updated}
      </h3>
      {saved === null ? null : (
        <>
          <p className={`${styles.lede} num`}>
            {t.updatedAt(formatMoney(saved.balance), day(today), formatTime(saved.checkedAt))}
          </p>
          {saved.ticked === 0 ? null : <p className={styles.hint}>{t.ticked(saved.ticked)}</p>}
        </>
      )}
      <section className={styles.panel} data-testid="balance-lowest" aria-live="polite">
        <div className={styles.panelHead}>
          <h4 className={styles.panelLabel}>{t.lowestPointAhead}</h4>
          {lowest === undefined || lowest.status === 'ok' ? null : (
            <StatusPill status={lowest.status} />
          )}
        </div>
        <p className="num">
          {lowest === undefined
            ? strings.sheet.working
            : lowest.after === null
              ? t.lowestOn(formatMoney(lowest.balance), day(lowest.date))
              : t.lowestOnAfter(formatMoney(lowest.balance), day(lowest.date), lowest.after)}
        </p>
      </section>
      <button type="button" className={styles.main} onClick={onClose}>
        {strings.sheet.done}
      </button>
    </div>
  );
}
