'use client';

// A sheet that asks once before a change, such as closing a debt or a goal:
// what it does in one plain sentence (D213), the button that does it, and
// one that keeps things as they are. The change can be undone from the undo
// bar like any other.

import { useState } from 'react';
import { refusalMessage } from '../lib/refusals.ts';
import { Problem } from './Fields.tsx';
import styles from './Form.module.css';
import type { ChangeOutcome } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';

export function ConfirmSheet({
  open,
  title,
  intro,
  confirm,
  keep,
  onConfirm,
  onClose,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly intro: string;
  readonly confirm: string;
  readonly keep: string;
  readonly onConfirm: () => Promise<ChangeOutcome>;
  /** Closed: `changed` says whether the change was made. */
  readonly onClose: (changed: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Sheet open={open} title={title} intro={intro} onClose={() => onClose(false)}>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.main}
          aria-disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setProblem(null);
            const outcome = await onConfirm();
            setBusy(false);
            if (outcome.ok) onClose(true);
            else setProblem(refusalMessage(outcome.code));
          }}
        >
          {confirm}
        </button>
        <button type="button" className={styles.quiet} onClick={() => onClose(false)}>
          {keep}
        </button>
        <Problem text={problem} />
      </div>
    </Sheet>
  );
}
