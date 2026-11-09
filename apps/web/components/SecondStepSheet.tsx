'use client';

// A sheet that asks once before something that can't be undone from the
// undo bar, such as signing out everywhere (step 3e): what it does in one
// plain sentence (D213), and, when two-step sign-in is on, a box for the
// code from the authenticator app, checked just before, as the server asks.

import { useId, useState } from 'react';
import { type Done, passSecondStep, type SecurityProblem } from '../lib/security.ts';
import { strings } from '../strings/en-GB.ts';
import { CodeBox, sixDigits } from './CodeBox.tsx';
import { Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { Sheet } from './Sheet.tsx';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.security;

/** A problem in words. */
export function securityWords(problem: SecurityProblem, wait?: number): string {
  switch (problem) {
    case 'offline':
      return t.offline;
    case 'code-wrong':
      return t.emailCodeWrong;
    case 'code-ran-out':
      return t.emailCodeRanOut;
    case 'too-many':
      return wait === undefined ? t.tooMany : t.wait(wait);
    case 'email-off':
      return t.emailOff;
    default:
      return t.server;
  }
}

export function SecondStepSheet({
  open,
  title,
  intro,
  codeIntro,
  needsCode,
  confirm,
  keep,
  onConfirm,
  onClose,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly intro: string;
  /** The sentence instead of `intro` when a code from the authenticator app is asked for. */
  readonly codeIntro: string;
  /** Two-step sign-in is on, so the code is asked for. */
  readonly needsCode: boolean;
  readonly confirm: string;
  readonly keep: string;
  readonly onConfirm: () => Promise<Done<unknown>>;
  /** Closed: `done` says whether it was done. */
  readonly onClose: (done: boolean) => void;
}) {
  const opened = useOpenCount(open);
  return (
    <Sheet
      open={open}
      title={title}
      intro={needsCode ? codeIntro : intro}
      closeLabel={strings.sheet.goBack}
      onClose={() => onClose(false)}
    >
      <Ask
        key={opened}
        needsCode={needsCode}
        confirm={confirm}
        keep={keep}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    </Sheet>
  );
}

function Ask({
  needsCode,
  confirm,
  keep,
  onConfirm,
  onClose,
}: {
  readonly needsCode: boolean;
  readonly confirm: string;
  readonly keep: string;
  readonly onConfirm: () => Promise<Done<unknown>>;
  readonly onClose: (done: boolean) => void;
}) {
  const id = useId();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={styles.actions}
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setProblem(null);
        if (needsCode) {
          const typed = sixDigits(code);
          if (typed === null) {
            setCodeError(t.appCodeMissing);
            document.getElementById(`${id}-code`)?.focus();
            return;
          }
          setCodeError(undefined);
          setBusy(true);
          const passed = await passSecondStep(typed);
          if (!passed.ok) {
            setBusy(false);
            if (passed.problem === 'code-wrong') {
              setCodeError(t.appCodeWrong);
              document.getElementById(`${id}-code`)?.focus();
            } else {
              setProblem(securityWords(passed.problem));
            }
            return;
          }
        }
        setBusy(true);
        const done = await onConfirm();
        setBusy(false);
        if (done.ok) {
          onClose(true);
          return;
        }
        if (done.problem === 'second-step-needed') {
          setCodeError(t.appCodeWrong);
          return;
        }
        setProblem(securityWords(done.problem));
      }}
    >
      {needsCode ? (
        <CodeBox
          id={`${id}-code`}
          label={t.appCodeLabel}
          hint={t.appCodeHint}
          error={codeError}
          value={code}
          onChange={setCode}
        />
      ) : null}
      <button type="submit" className={styles.main} aria-disabled={busy}>
        {confirm}
      </button>
      <button type="button" className={styles.quiet} onClick={() => onClose(false)}>
        {keep}
      </button>
      <Problem text={problem} />
    </form>
  );
}
