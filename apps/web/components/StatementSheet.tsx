'use client';

// Update from statement (brief 4.6, D62, D103): what the statement shows
// now, in the debt's own currency, and any linked payment from today or
// earlier to tick, because the statement already shows it. Saved as one
// change, so one Undo takes all of it back; the ticks count as before the
// update, so nothing comes off the debt twice.

import { useId, useRef, useState } from 'react';
import { parseAmount } from '../lib/amount.ts';
import { formatDay } from '../lib/dates.ts';
import type { DebtView } from '../lib/debts-view.ts';
import { timeNow } from '../lib/ids.ts';
import { currencySign, formatMoney } from '../lib/money.ts';
import { refusalMessage } from '../lib/refusals.ts';
import { strings } from '../strings/en-GB.ts';
import { describedBy, Field, MoneyInput, Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.statement;

export function StatementSheet({
  open,
  debt,
  today,
  onClose,
}: {
  readonly open: boolean;
  readonly debt: DebtView;
  readonly today: string;
  readonly onClose: () => void;
}) {
  const opened = useOpenCount(open);
  return (
    <Sheet open={open} title={t.title} intro={t.intro} onClose={onClose}>
      {opened === 0 ? null : (
        <StatementForm key={opened} debt={debt} today={today} onDone={onClose} />
      )}
    </Sheet>
  );
}

function StatementForm({
  debt,
  today,
  onDone,
}: {
  readonly debt: DebtView;
  readonly today: string;
  readonly onDone: () => void;
}) {
  const { makeChange } = usePlanActions();
  const id = useId();
  const [amountText, setAmountText] = useState('');
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const keyOf = (one: { seriesId: string; originalDate: string }) =>
    `${one.seriesId} ${one.originalDate}`;

  async function save() {
    if (busy) return;
    const balance = parseAmount(amountText);
    if (balance === null) {
      setError(t.amountError);
      amountRef.current?.focus();
      return;
    }
    setError(undefined);
    setBusy(true);
    setProblem(null);
    const at = timeNow();
    const ticks = debt.toTick
      .filter((one) => ticked.has(keyOf(one)))
      .map((one) => ({ seriesId: one.seriesId, originalDate: one.originalDate, tickedAt: at }));
    const outcome = await makeChange(
      {
        kind: 'update-from-statement',
        debtId: debt.id,
        balance,
        balanceOn: today,
        balanceAt: at,
        ticks,
      },
      {
        full: ticks.length === 0 ? t.updated(debt.name) : t.updatedTicked(debt.name, ticks.length),
        short: strings.undo.short.updated(debt.name),
      },
    );
    setBusy(false);
    if (outcome.ok) onDone();
    else setProblem(refusalMessage(outcome.code));
  }

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
      <h3 className={styles.subheading}>{debt.name}</h3>
      <Field id={`${id}-amount`} label={t.amount} error={error}>
        <MoneyInput
          id={`${id}-amount`}
          inputRef={amountRef}
          symbol={currencySign(debt.currency)}
          value={amountText}
          onChange={setAmountText}
          invalid={error !== undefined}
          describedBy={describedBy(`${id}-amount`, error)}
        />
      </Field>
      {debt.toTick.length === 0 ? null : (
        <fieldset className={styles.plain}>
          <legend className={styles.legend}>{t.tickHeading}</legend>
          <p className={styles.hint}>{t.tickIntro}</p>
          <ul className={styles.tickList}>
            {debt.toTick.map((one) => {
              const key = keyOf(one);
              const day = formatDay(one.date, today);
              const amount = formatMoney(one.amount);
              return (
                <li key={key}>
                  <label className={styles.tickRow}>
                    <input
                      type="checkbox"
                      checked={ticked.has(key)}
                      aria-label={t.tickLabel(day, one.name, amount)}
                      onChange={(event) =>
                        setTicked((now) => {
                          const next = new Set(now);
                          if (event.target.checked) next.add(key);
                          else next.delete(key);
                          return next;
                        })
                      }
                    />
                    <span className={styles.tickWords}>
                      <span className={styles.tickDate}>{day}</span>
                      <span className={styles.tickLine}>
                        <span>{one.name}</span>
                        <span className={`${styles.tickAmount} num`}>{amount}</span>
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
      <button type="submit" className={styles.main} aria-disabled={busy}>
        {t.save}
      </button>
      <Problem text={problem} />
    </form>
  );
}
