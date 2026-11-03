'use client';

// What the four actions on Home need from the plan (lib/actions-view.ts),
// worked out in the background while a sheet is open, and again after each
// change, so a sheet can show the figures its change made (D197).

import { useEffect, useState } from 'react';
import type { ActionsView } from '../lib/actions-view.ts';
import { workOutActionsInBackground } from '../worker/client.ts';
import { usePlanActions } from './PlanProvider.tsx';

export interface ShownActions {
  readonly view: ActionsView | null;
  /** The version of the records `view` was worked out from. */
  readonly version: number | null;
  readonly failed: boolean;
}

export function useActionsView(open: boolean): ShownActions {
  const { loaded } = usePlanActions();
  const [shown, setShown] = useState<{ view: ActionsView; version: number } | null>(null);
  const [failed, setFailed] = useState(false);
  // Each time a sheet opens it waits for figures worked out now, never the
  // ones from the last time it was open: a change made since would be missing.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setShown(null);
      setFailed(false);
    }
  }

  useEffect(() => {
    if (!open || loaded === null) return;
    let current = true;
    workOutActionsInBackground(loaded.records, loaded.today).then(
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
  }, [open, loaded]);

  return { view: shown?.view ?? null, version: shown?.version ?? null, failed };
}
