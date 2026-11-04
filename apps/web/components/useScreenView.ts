'use client';

// What one of the screens under Debts or More shows (step 2f), worked out in
// the background from the plan's records, and again after every change, so
// the screen always shows the plan as it is now.

import { useEffect, useState } from 'react';
import { askInBackground } from '../worker/client.ts';
import type { Answers, Ask, ScreenKind } from '../worker/messages.ts';
import { usePlanActions } from './PlanProvider.tsx';

export interface ShownScreen<K extends ScreenKind> {
  readonly view: Answers[K] | null;
  /** The version of the records `view` was worked out from. */
  readonly version: number | null;
  readonly failed: boolean;
}

export function useScreenView<K extends ScreenKind>(kind: K): ShownScreen<K> {
  const { loaded } = usePlanActions();
  const [shown, setShown] = useState<{ view: Answers[K]; version: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loaded === null) return;
    let current = true;
    const question = { kind, records: loaded.records, today: loaded.today } as Extract<
      Ask,
      { kind: K }
    >;
    askInBackground(question).then(
      (view) => {
        if (!current) return;
        setShown({ view, version: loaded.version });
        setFailed(false);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [kind, loaded]);

  return { view: shown?.view ?? null, version: shown?.version ?? null, failed };
}
