'use client';

// Add or change a debt (brief 4.6, D98, D101, D106, D153): every kind in the
// brief, with a currency and rate for money owed to a person and a credit
// card's interest, "0% until", statement day and minimum. A new debt can
// come with its payments, as in setup. A debt's balance changes with Update
// from statement (D103), so the change sheet doesn't ask for it. Each save
// is one change with one Undo.

import type { Debt } from '@prepenny/engine';
import { useId, useMemo, useState } from 'react';
import { holidaysFor } from '../lib/holidays.ts';
import { newId, timeNow } from '../lib/ids.ts';
import type { PaymentErrors } from '../lib/new-payment.ts';
import { refusalMessage } from '../lib/refusals.ts';
import {
  blankDebt,
  buildDebt,
  buildDebtChange,
  type DebtErrors,
  type DebtForm,
  debtFormOf,
} from '../lib/setup-forms.ts';
import { strings } from '../strings/en-GB.ts';
import { DEBT_FIELD_ORDER, DebtFields } from './DebtFields.tsx';
import { CheckOption, Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import { focusFirst } from './setup/focus.ts';
import { OutgoingFields, outgoingFieldIds } from './setup/OutgoingFields.tsx';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.debtSheet;

export function DebtSheet({
  open,
  debt,
  onClose,
}: {
  readonly open: boolean;
  /** The debt to change, or null to add one. */
  readonly debt: Debt | null;
  readonly onClose: () => void;
}) {
  const opened = useOpenCount(open);
  // The boxes start from the plan, so they wait for it: a tap before it has
  // loaded would start them with no date or account (step 2g).
  const ready = usePlanActions().loaded !== null;
  return (
    <Sheet
      open={open}
      title={debt === null ? t.addTitle : t.changeTitle}
      intro={debt === null ? t.addIntro : t.changeIntro}
      onClose={onClose}
    >
      {opened === 0 || !ready ? null : <DebtSheetForm key={opened} debt={debt} onDone={onClose} />}
    </Sheet>
  );
}

function DebtSheetForm({
  debt,
  onDone,
}: {
  readonly debt: Debt | null;
  readonly onDone: () => void;
}) {
  const { loaded, makeChange, makeChanges } = usePlanActions();
  const id = useId();
  const records = loaded?.records ?? null;
  const today = loaded?.today ?? '';
  const accounts = useMemo(
    () =>
      (records?.accounts ?? [])
        .filter((one) => one.closed !== true)
        .map((one) => ({ value: one.id, label: one.name ?? '' })),
    [records],
  );
  const holidays = useMemo(
    () => holidaysFor(records?.settings?.nation ?? 'england-and-wales'),
    [records?.settings?.nation],
  );
  const firstAccount = accounts[0]?.value ?? '';
  const [form, setForm] = useState<DebtForm>(() =>
    debt === null ? blankDebt(firstAccount) : debtFormOf(debt, firstAccount),
  );
  const [errors, setErrors] = useState<DebtErrors>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (change: Partial<DebtForm>) => setForm((now) => ({ ...now, ...change }));
  const base = `${id}-debt`;

  function showMistakes(found: DebtErrors) {
    setErrors(found);
    focusFirst([
      ...DEBT_FIELD_ORDER.filter((field) => found[field] !== undefined).map(
        (field) => `${base}-${field}`,
      ),
      ...outgoingFieldIds(`${base}-pay`, found as PaymentErrors),
    ]);
  }

  async function save() {
    if (busy || records === null) return;
    setProblem(null);
    if (debt === null) {
      const built = buildDebt(
        form,
        today,
        holidays,
        { debtId: newId(), seriesId: newId() },
        timeNow(),
      );
      if (!built.ok) {
        showMistakes(built.errors);
        return;
      }
      setErrors({});
      setBusy(true);
      const outcome = await makeChanges(built.commands, t.added(form.name.trim()));
      setBusy(false);
      if (outcome.ok) onDone();
      else setProblem(refusalMessage(outcome.code));
      return;
    }
    const built = buildDebtChange(form, debt);
    if (!built.ok) {
      showMistakes(built.errors);
      return;
    }
    setErrors({});
    if (built.command === null) {
      setProblem(t.nothingChanged);
      return;
    }
    setBusy(true);
    const outcome = await makeChange(built.command, t.changed(form.name.trim()));
    setBusy(false);
    if (outcome.ok) onDone();
    else setProblem(refusalMessage(outcome.code));
  }

  if (records === null) return <p>{strings.sheet.working}</p>;
  return (
    <form
      className={styles.form}
      noValidate
      aria-label={debt === null ? t.addTitle : t.changeTitle}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <DebtFields
        base={base}
        form={form}
        set={set}
        errors={errors}
        today={today}
        showOwed={debt === null}
        currencyFixed={debt !== null}
      />
      {debt === null ? (
        <div className={styles.group}>
          <h3 className={styles.subheading}>{strings.setup.debts.payments}</h3>
          <CheckOption checked={form.noPayments} onChange={(noPayments) => set({ noPayments })}>
            {strings.setup.debts.noPayments}
          </CheckOption>
          {form.noPayments ? null : (
            <OutgoingFields
              id={`${base}-pay`}
              form={form}
              set={set}
              errors={errors as PaymentErrors}
              today={today}
              holidays={holidays}
              accounts={accounts}
              howOften={['monthly', 'weekly', 'once', 'dates']}
              amountLabel={strings.setup.debts.payment}
              showEnds
            />
          )}
        </div>
      ) : null}
      <button type="submit" className={styles.main} aria-disabled={busy}>
        {debt === null ? t.save : t.saveChanges}
      </button>
      <Problem text={problem} />
    </form>
  );
}
