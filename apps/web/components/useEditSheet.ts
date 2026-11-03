'use client';

// Opening the edit sheet from a row, and putting focus back afterwards: on
// the same row when it's still there, or on the undo bar when it has gone,
// such as after Skip this one. Closing without a change leaves focus where
// the browser puts it back, on the row (WCAG 2.4.3).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RowView } from '../lib/rows.ts';

/**
 * `shownVersion` is the version of the records the rows on screen were
 * worked out from, so focus waits until the changed plan is drawn.
 */
export function useEditSheet(shownVersion: number | null) {
  const [editing, setEditing] = useState<RowView | null>(null);
  const editingRef = useRef<RowView | null>(null);
  const focusAfter = useRef<{ key: string; version: number } | null>(null);

  useEffect(() => {
    const wanted = focusAfter.current;
    if (wanted === null || shownVersion === null || shownVersion < wanted.version) return;
    focusAfter.current = null;
    const row = document.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(wanted.key)}"]`);
    if (row !== null) {
      if (document.activeElement !== row) row.focus();
      return;
    }
    document.querySelector<HTMLElement>('[data-testid="undo-bar"] button')?.focus();
  }, [shownVersion]);

  const open = useCallback((row: RowView) => {
    editingRef.current = row;
    setEditing(row);
  }, []);

  const close = useCallback((changedTo: number | null) => {
    const row = editingRef.current;
    if (changedTo !== null && row !== null) {
      focusAfter.current = { key: row.key, version: changedTo };
    }
    editingRef.current = null;
    setEditing(null);
  }, []);

  return { editing, open, close };
}
