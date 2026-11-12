'use client';

// Add or change a savings goal (brief 4.7, D114, D153). A new goal asks the
// same as setup's old step 7 did, with the money moved into it each payday
// or another way (D226). Setup's "Here's your plan" opens it too, with
// setup's own plan put under it (D356). Changing it asks for its own details: what it's for,
// the target, the date, the account it's kept in and what was already
// saved. Each save is one change with one Undo.

import type { EditCommand, GoalEdits } from '@prepenny/engine';
import { useId, useMemo, useState } from 'react';
import { myName } from '../data/shared-plan.ts';
import { amountForTyping, parseAmount } from '../lib/amount.ts';
import { holidaysFor } from '../lib/holidays.ts';
import { newId, timeNow } from '../lib/ids.ts';
import type { GoalCard } from '../lib/money-views.ts';
import { type PaymentErrors, readDate } from '../lib/new-payment.ts';
import { addPaymentCommand } from '../lib/private-transfer.ts';
import { refusalMessage } from '../lib/refusals.ts';
import {
  blankGoal,
  buildGoal,
  eachPaydayOf,
  type GoalErrors,
  type GoalForm,
} from '../lib/setup-forms.ts';
import { strings } from '../strings/en-GB.ts';
import { useShared } from './ChangedBy.tsx';
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

/** Where a new goal's boxes start: the account it's kept in, and the one money moves from. */
export interface GoalStart {
  readonly keptIn: string;
  readonly from: string;
}

export function GoalSheet({
  open,
  goal,
  onClose,
  madeAt = timeNow,
  start,
}: {
  readonly open: boolean;
  /** The goal to change, or null to add one. */
  readonly goal: GoalCard | null;
  readonly onClose: () => void;
  /** When a new goal's records are made. Setup gives each a moment after the last (D229). */
  readonly madeAt?: () => string;
  /** Where a new goal's boxes start, when not the usual accounts. */
  readonly start?: GoalStart;
}) {
  const opened = useOpenCount(open);
  // The boxes start from the plan, so they wait for it: a tap before it has
  // loaded would start them with no date or account (step 2g).
  const ready = usePlanActions().loaded !== null;
  return (
    <Sheet
      open={open}
      title={goal === null ? t.addTitle : t.changeTitle}
      intro={goal === null ? t.addIntro : t.changeIntro}
      onClose={onClose}
    >
      {opened === 0 || !ready ? null : (
        <GoalSheetForm
          key={opened}
          goal={goal}
          onDone={onClose}
          madeAt={madeAt}
          {...(start === undefined ? {} : { start })}
        />
      )}
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
  madeAt,
  start,
}: {
  readonly goal: GoalCard | null;
  readonly onDone: () => void;
  readonly madeAt: () => string;
  readonly start?: GoalStart;
}) {
  const { loaded, makeChange, makeChanges } = usePlanActions();
  const shared = useShared();
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
    if (start !== undefined) return blankGoal(start.keptIn, start.from, eachPayday !== null);
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

  async function run(made: readonly EditCommand[], message: string) {
    // Money from one's own account into a goal kept in a shared account is two
    // halves, "From Jess" going towards the goal, as in Add a payment (D16, D464).
    const goals = made.flatMap((one) => (one.kind === 'add-goal' ? [one.goal] : []));
    const goalAccount = (goalId: string) =>
      goals.find((one) => one.id === goalId)?.accountId ??
      loaded?.records.goals?.find((one) => one.id === goalId)?.accountId;
    const commands = made.map((one) =>
      one.kind === 'add-payment' && one.otherHalf === undefined
        ? addPaymentCommand(
            one.series,
            one.madeAt,
            shared === null
              ? null
              : { sharedAccounts: shared.sharedAccounts, myName: myName(shared) },
            newId(),
            goalAccount,
          )
        : one,
    );
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
        madeAt(),
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
