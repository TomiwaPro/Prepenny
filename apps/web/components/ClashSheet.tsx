'use client';

// "Changed on two phones" (step 3d, D59, ARCHITECTURE.md 4.4): when a
// change of the person's wasn't kept because a newer one from another phone
// was, or the account couldn't take a change, this sheet says so in plain
// words, with one tap to put theirs back: "Tom changed Rent on Tue 1 Dec to
// £650 after you changed it to £640. Tom's change is kept." It opens by
// itself, one at a time, oldest first, once no other sheet is open, so it
// never covers something the person is in the middle of.

import { useEffect, useState } from 'react';
import { dismissClash, useClashes } from '../data/clashes.ts';
import { clashWords } from '../lib/clash-words.ts';
import { localToday } from '../lib/today.ts';
import { strings } from '../strings/en-GB.ts';
import { Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';

export function ClashSheet() {
  const clashes = useClashes();
  const { loaded, makeChangesAgain } = usePlanActions();
  const clash = clashes[0];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const onExample = loaded?.plan.isExample === true;

  // Opens for the oldest clash once no other sheet is open, and looks again
  // each time one closes.
  useEffect(() => {
    if (clash === undefined || open || onExample) return;
    const tryToOpen = () => {
      if (document.querySelector('dialog[open]') === null) setOpen(true);
    };
    tryToOpen();
    const onSheetClosed = () => setTimeout(tryToOpen, 0);
    document.addEventListener('close', onSheetClosed, true);
    return () => document.removeEventListener('close', onSheetClosed, true);
  }, [clash, open, onExample]);

  if (clash === undefined) return null;
  const words = clashWords(clash, loaded?.today ?? localToday());
  const seen = async () => {
    setOpen(false);
    setProblem(null);
    await dismissClash(clash.id);
  };
  const putBack = clash.putBack;

  return (
    <Sheet open={open} title={words.title} intro={words.purpose} onClose={() => void seen()}>
      <div className={styles.actions} data-testid="clash">
        <p className={styles.lede} data-testid="clash-message">
          {words.message}
        </p>
        <Problem text={problem} />
        {words.putBack === null || putBack === undefined || problem !== null ? null : (
          <button
            type="button"
            className={styles.main}
            aria-disabled={busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              const outcome = await makeChangesAgain(
                putBack.commands,
                putBack.payments,
                strings.clash.putBackDone,
              );
              setBusy(false);
              if (outcome.ok) await seen();
              else setProblem(strings.clash.putBackFailed);
            }}
          >
            {words.putBack}
          </button>
        )}
        <button type="button" className={styles.outlined} onClick={() => void seen()}>
          {words.keep}
        </button>
      </div>
    </Sheet>
  );
}
