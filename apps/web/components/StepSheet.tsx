'use client';

// A sheet that asks first, then runs one of the server's own steps (step 3g):
// making an account, debt or goal private again, sharing a debt or goal. It
// says what will happen in one plain sentence under its title (D213), shows
// while it's working, and says plainly why when the server refuses.

import { useEffect, useState } from 'react';
import { strings } from '../strings/en-GB.ts';
import { Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { Sheet } from './Sheet.tsx';

export function StepSheet({
  open,
  title,
  intro,
  yes,
  no,
  working,
  run,
  onClose,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly intro: string;
  readonly yes: string;
  readonly no: string;
  /** Said while the step runs, such as "Sharing." */
  readonly working: string;
  /** Runs the step: null when it's done, or the words for why it wasn't. */
  readonly run: () => Promise<string | null>;
  /** Closed: `done` says whether the step was made. */
  readonly onClose: (done: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setBusy(false);
      setProblem(null);
    }
  }, [open]);

  async function go() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const why = await run();
    setBusy(false);
    if (why === null) onClose(true);
    else setProblem(why);
  }

  return (
    <Sheet
      open={open}
      title={title}
      intro={intro}
      closeLabel={strings.sheet.goBack}
      onClose={() => onClose(false)}
    >
      <div className={formStyles.actions}>
        <p className={formStyles.lede} role="status">
          {busy ? working : ''}
        </p>
        <Problem text={problem} />
        <button
          type="button"
          className={formStyles.main}
          aria-disabled={busy}
          onClick={() => void go()}
        >
          {yes}
        </button>
        <button type="button" className={formStyles.outlined} onClick={() => onClose(false)}>
          {no}
        </button>
      </div>
    </Sheet>
  );
}
