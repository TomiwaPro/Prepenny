'use client';

// Add or change a savings goal (brief 4.7, D114, D153). A new goal asks the
// same as setup's step 7, with the money moved into it each payday or
// another way (D226). Changing it asks for its own details: what it's for,
// the target, the date, the account it's kept in and what was already
// saved. Each save is one change with one Undo.

import type { EditCommand, GoalEdits } from '@prepenny/engine';
import { useId, useMemo, useState } from 'react';
import { amountForTyping, parseAmount } from '../lib/amount.ts';
import { holidaysFor } from '../lib/holidays.ts';
import { newId, timeNow } from '../lib/ids.ts';
import type { GoalCard } from '../lib/money-views.ts';
import { type PaymentErrors, readDate } from '../lib/new-payment.ts';
import { refusalMessage } from '../lib/refusals.ts';
import {
  blankGoal,
  buildGoal,
  eachPaydayOf,
  type GoalErrors,
  type GoalForm,
} from '../lib/setup-forms.ts';
import { strings } from '../strings/en-GB.ts';
import { Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { GOAL_FIELD_ORDER, GoalFields } from './GoalFields.tsx';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import { focusFirst } from './setup/focus.ts';
import { outgoingFieldIds } from './setup/OutgoingFields.tsx';
import { useOpenCount } from './useOpenCount.ts';
import { useWhenRefs } from './WhenFields.tsx';

const t = strings.goalSheet;

export function GoalSheet({
  open,
  goal,
  onClose,
}: {
  readonly open: boolean;
  /** The goal to change, or null to add one. */
  readonly goal: GoalCard | null;
  readonly onClose: () => void;
}) {
  const opened = useOpenCount(open);
  return (
    <Sheet
      open={open}
      title={goal === null ? t.addTitle : t.changeTitle}
      intro={goal === null ? t.addIntro : t.changeIntro}
      onClose={onClose}
    >
      {opened === 0 ? null : <GoalSheetForm key={opened} goal={goal} onDone={onClose} />}
    </Sheet>
  );
}

/** What changed about a goal, or the mistakes in the boxes (D153). */
function changeOf(
  form: GoalForm,
  goal: GoalCard,
  today: string,
): { ok: true; edits: GoalEdits } | { ok: false; errors: GoalErrors } {
  const errors: GoalErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'nameError';
  const target = parseAmount(form.target);
  if (target === null || target === 0) errors.target = 'targetError';
  let targetDate: string | null = null;
  if (form.targetDate.trim() !== '') {
    targetDate = readDate(form.targetDate);
    if (targetDate === null || targetDate < today) errors.targetDate = 'targetDateError';
  }
  const saved = form.saved.trim() === '' ? 0 : parseAmount(form.saved);
  if (saved === null) errors.saved = 'savedError';
  if (Object.keys(errors).length > 0 || target === null || saved === null) {
    return { ok: false, errors };
  }
  const edits: { -readonly [K in keyof GoalEdits]: GoalEdits[K] } = {};
  const stored = goal.goal;
  if (name !== stored.name) edits.name = name;
  if (target !== stored.target) edits.target = target;
  if (targetDate !== (stored.targetDate ?? null)) edits.targetDate = targetDate;
  if (form.keptIn !== stored.accountId) edits.accountId = form.keptIn;
  if (saved !== stored.startingAmount) edits.startingAmount = saved;
  return { ok: true, edits };
}

function GoalSheetForm({
  goal,
  onDone,
}: {
  readonly goal: GoalCard | null;
  readonly onDone: () => void;
}) {
  const { loaded, makeChange, makeChanges } = usePlanActions();
  const id = useId();
  const refs = useWhenRefs();
  const records = loaded?.records ?? null;
  const today = loaded?.today ?? '';
  const holidays = useMemo(
    () => holidaysFor(records?.settings?.nation ?? 'england-and-wales'),
    [records?.settings?.nation],
  );
  const open = (records?.accounts ?? []).filter((one) => one.closed !== true);
  const accounts = open.map((one) => ({ value: one.id, label: one.name ?? '' }));
  const eachPayday = useMemo(
    () =>
      records === null
        ? null
        : eachPaydayOf(records.series, records.settings?.mainPayFamilyId ?? null, today, holidays),
    [records, today, holidays],
  );
  const [form, setForm] = useState<GoalForm>(() => {
    if (goal !== null) {
      return {
        ...blankGoal(goal.accountId, '', false),
        name: goal.name,
        target: amountForTyping(goal.target),
        targetDate: goal.targetDate ?? '',
        saved: goal.goal.startingAmount === 0 ? '' : amountForTyping(goal.goal.startingAmount),
      };
    }
    const keptIn =
      open.find((one) => one.kind === 'savings')?.id ?? open[1]?.id ?? open[0]?.id ?? '';
    const from = open.find((one) => one.id !== keptIn)?.id ?? open[0]?.id ?? '';
    return blankGoal(keptIn, from, eachPayday !== null);
  });
  const [errors, setErrors] = useState<GoalErrors>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const base = `${id}-goal`;

  function showMistakes(found: GoalErrors) {
    setErrors(found);
    focusFirst([
      ...GOAL_FIELD_ORDER.filter((field) => found[field] !== undefined).map(
        (field) => `${base}-${field}`,
      ),
      ...outgoingFieldIds(`${base}-move`, found as PaymentErrors),
    ]);
  }

  async function run(commands: readonly EditCommand[], message: string) {
    setErrors({});
    setBusy(true);
    setProblem(null);
    const outcome =
      commands.length === 1 && commands[0] !== undefined
        ? await makeChange(commands[0], message)
        : await makeChanges(commands, message);
    setBusy(false);
    if (outcome.ok) onDone();
    else setProblem(refusalMessage(outcome.code));
  }

  function save() {
    if (busy || records === null) return;
    if (goal === null) {
      const built = buildGoal(
        form,
        today,
        holidays,
        { goalId: newId(), seriesId: newId(), accountId: newId(), balanceId: newId() },
        timeNow(),
        eachPayday,
        strings.setup.savings.moveName,
      );
      if (!built.ok) {
        showMistakes(built.errors);
        return;
      }
      run(built.commands, t.added(form.name.trim()));
      return;
    }
    const changed = changeOf(form, goal, today);
    if (!changed.ok) {
      showMistakes(changed.errors);
      return;
    }
    if (Object.keys(changed.edits).length === 0) {
      setErrors({});
      setProblem(t.nothingChanged);
      return;
    }
    run(
      [{ kind: 'change-goal', goalId: goal.id, edits: changed.edits }],
      t.changed(form.name.trim()),
    );
  }

  if (records === null) return <p>{strings.sheet.working}</p>;
  return (
    <form
      className={styles.form}
      noValidate
      aria-label={goal === null ? t.addTitle : t.changeTitle}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <GoalFields
        base={base}
        form={form}
        set={(change) => setForm((now) => ({ ...now, ...change }))}
        errors={errors}
        today={today}
        holidays={holidays}
        accounts={accounts}
        eachPayday={eachPayday}
        refs={refs}
        changing={goal !== null}
      />
      <button type="submit" className={styles.main} aria-disabled={busy}>
        {goal === null ? t.save : t.saveChanges}
      </button>
      <Problem text={problem} />
    </form>
  );
}
