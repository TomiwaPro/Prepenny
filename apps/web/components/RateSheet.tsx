'use client';

// Change the rate of a debt in another currency (brief 4.6: "the user sets
// the rate"): how many of that currency make £1. Every payment is then
// converted at the new rate, rounded once (D9).

import { useId, useRef, useState } from 'react';
import type { DebtView } from '../lib/debts-view.ts';
import { refusalMessage } from '../lib/refusals.ts';
import { strings } from '../strings/en-GB.ts';
import { describedBy, Field, Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.rate;
const RATE = /^\d{1,4}(?:\.\d{1,4})?$/;

export function RateSheet({
  open,
  debt,
  onClose,
}: {
  readonly open: boolean;
  readonly debt: DebtView;
  readonly onClose: () => void;
}) {
  const opened = useOpenCount(open);
  const names: Readonly<Record<string, string>> = strings.debt.currencyNames;
  return (
    <Sheet
      open={open}
      title={t.title}
      intro={t.intro(names[debt.currency] ?? debt.currency)}
      onClose={onClose}
    >
      {opened === 0 ? null : <RateForm key={opened} debt={debt} onDone={onClose} />}
    </Sheet>
  );
}

function RateForm({ debt, onDone }: { readonly debt: DebtView; readonly onDone: () => void }) {
  const { makeChange } = usePlanActions();
  const id = useId();
  const [rate, setRate] = useState(debt.rate ?? '');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLInputElement>(null);
  return (
    <form
      className={styles.form}
      noValidate
      aria-label={t.title}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const typed = rate.trim();
        if (!RATE.test(typed) || Number(typed) <= 0) {
          setError(strings.setup.debts.rateError);
          box.current?.focus();
          return;
        }
        setError(undefined);
        if (typed === debt.rate) {
          setProblem(strings.debtSheet.nothingChanged);
          return;
        }
        setBusy(true);
        setProblem(null);
        const outcome = await makeChange(
          { kind: 'change-debt', debtId: debt.id, edits: { rate: typed } },
          t.saved(debt.name),
        );
        setBusy(false);
        if (outcome.ok) onDone();
        else setProblem(refusalMessage(outcome.code));
      }}
    >
      <Field
        id={`${id}-rate`}
        label={strings.setup.debts.rate(debt.currency)}
        error={error}
        hint={strings.setup.debts.rateHint}
      >
        <input
          ref={box}
          id={`${id}-rate`}
          className={`${styles.input} num`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={rate}
          aria-invalid={error !== undefined}
          aria-describedby={describedBy(`${id}-rate`, error, [`${id}-rate-hint`])}
          onChange={(event) => setRate(event.target.value)}
        />
      </Field>
      <button type="submit" className={styles.main} aria-disabled={busy}>
        {strings.sheet.save}
      </button>
      <Problem text={problem} />
    </form>
  );
}
