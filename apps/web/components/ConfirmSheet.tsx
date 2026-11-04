'use client';

// A sheet that asks once before a change, such as closing a debt or a goal:
// what it does in one plain sentence (D213), the button that does it, and
// one that keeps things as they are. It can ask one more question first, with
// Yes and No, such as "Also remove its 3 planned payments?" (step 2g). Neither
// answer is chosen to start with, so the person picks one (step 2h). The
// change can be undone from the undo bar like any other.

import { useId, useState } from 'react';
import { refusalMessage } from '../lib/refusals.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { Problem } from './Fields.tsx';
import styles from './Form.module.css';
import type { ChangeOutcome } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import { useOpenCount } from './useOpenCount.ts';

export function ConfirmSheet({
  open,
  title,
  intro,
  confirm,
  keep,
  question = null,
  onConfirm,
  onClose,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly intro: string;
  readonly confirm: string;
  readonly keep: string;
  /** One more question, answered Yes or No, such as "Also remove its 3 planned payments?". */
  readonly question?: string | null;
  /** Makes the change; `yes` is the answer to the question, false when there's none. */
  readonly onConfirm: (yes: boolean) => Promise<ChangeOutcome>;
  /** Closed: `changed` says whether the change was made, and `yes` the answer. */
  readonly onClose: (changed: boolean, yes: boolean) => void;
}) {
  const opened = useOpenCount(open);
  return (
    <Sheet
      open={open}
      title={title}
      intro={intro}
      closeLabel={strings.sheet.goBack}
      onClose={() => onClose(false, false)}
    >
      <Choices
        key={opened}
        confirm={confirm}
        keep={keep}
        question={question}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    </Sheet>
  );
}

/** The two buttons, starting afresh each time the sheet opens. */
function Choices({
  confirm,
  keep,
  question,
  onConfirm,
  onClose,
}: {
  readonly confirm: string;
  readonly keep: string;
  readonly question: string | null;
  readonly onConfirm: (yes: boolean) => Promise<ChangeOutcome>;
  readonly onClose: (changed: boolean, yes: boolean) => void;
}) {
  const name = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [answer, setAnswer] = useState<'yes' | 'no' | ''>('');
  const [unanswered, setUnanswered] = useState(false);
  const yes = question !== null && answer === 'yes';
  return (
    <div className={styles.actions}>
      {question === null ? null : (
        <div id={`${name}-question`}>
          <ChoiceList<'yes' | 'no' | ''>
            legend={question}
            name={name}
            value={answer}
            options={[
              { value: 'yes', label: strings.sheet.yes },
              { value: 'no', label: strings.sheet.no },
            ]}
            onChange={(next) => {
              setAnswer(next);
              setUnanswered(false);
            }}
            describedBy={unanswered ? `${name}-unanswered` : undefined}
            invalid={unanswered}
          />
          {unanswered ? (
            // Read with the radio that takes focus, on every tap (step 2h).
            <p id={`${name}-unanswered`} className={styles.error}>
              {strings.sheet.chooseYesOrNo}
            </p>
          ) : null}
        </div>
      )}
      <button
        type="button"
        className={styles.main}
        aria-disabled={busy}
        onClick={async () => {
          if (busy) return;
          if (question !== null && answer === '') {
            setUnanswered(true);
            document
              .getElementById(`${name}-question`)
              ?.querySelector<HTMLInputElement>('input')
              ?.focus();
            return;
          }
          setBusy(true);
          setProblem(null);
          const outcome = await onConfirm(yes);
          setBusy(false);
          if (outcome.ok) onClose(true, yes);
          else setProblem(refusalMessage(outcome.code));
        }}
      >
        {confirm}
      </button>
      <button type="button" className={styles.quiet} onClick={() => onClose(false, false)}>
        {keep}
      </button>
      <Problem text={problem} />
    </div>
  );
}
