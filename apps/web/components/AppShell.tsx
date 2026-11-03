'use client';

// Every screen of the app: the example plan banner and the offline note at
// the top, the screen in a centred column, the undo bar after a change, and
// the bottom navigation.

import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { refusalMessage } from '../lib/refusals.ts';
import styles from './AppShell.module.css';
import { BottomNav } from './BottomNav.tsx';
import { ExampleBanner, OfflineNote } from './Notes.tsx';
import { PlanProvider, usePlan, usePlanActions } from './PlanProvider.tsx';
import { UndoBar } from './UndoBar.tsx';

function Notes() {
  const state = usePlan();
  return (
    <div className={styles.notes}>
      {state.plan?.isExample === true ? <ExampleBanner /> : null}
      <OfflineNote />
    </div>
  );
}

/**
 * The undo bar (brief Part 3, principle 4; ARCHITECTURE.md 4.5): it stays
 * until the next change or until the person goes to another screen, with no
 * time limit (WCAG 2.2.1, D186).
 */
function ChangeBar() {
  const { lastChange, undoLastChange, dismissLastChange } = usePlanActions();
  const [refused, setRefused] = useState<string | null>(null);
  const path = usePathname();
  const firstPath = useRef(path);

  useEffect(() => {
    if (path === firstPath.current) return;
    firstPath.current = path;
    setRefused(null);
    dismissLastChange();
  }, [path, dismissLastChange]);

  useEffect(() => {
    if (lastChange !== null) setRefused(null);
  }, [lastChange]);

  // After Undo its button goes, so focus moves to the bar's words rather
  // than being lost (WCAG 2.4.3).
  const undoing = useRef(false);
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!undoing.current) return;
    undoing.current = false;
    holder.current?.querySelector<HTMLElement>('[data-undo-message]')?.focus();
  });

  const message = refused ?? lastChange?.message ?? null;
  const canUndo = refused === null && lastChange?.edit !== null && lastChange?.edit !== undefined;
  // The live region is always on the page, and each message is drawn afresh
  // inside it, so screen readers hear every one, even the same words twice.
  return (
    <div role="status" ref={holder}>
      {message === null || lastChange === null ? null : (
        <UndoBar
          key={refused === null ? lastChange.id : `${lastChange.id} refused`}
          announce={false}
          message={message}
          {...(canUndo
            ? {
                onUndo: async () => {
                  if (undoing.current) return;
                  undoing.current = true;
                  const outcome = await undoLastChange(lastChange.id);
                  if (!outcome.ok) setRefused(refusalMessage(outcome.code));
                },
              }
            : {})}
        />
      )}
    </div>
  );
}

function Column({ children }: { readonly children: ReactNode }) {
  const { lastChange } = usePlanActions();
  return (
    <div className={`${styles.column} ${lastChange === null ? '' : styles.withBar}`}>
      <Notes />
      <main className={styles.main}>{children}</main>
    </div>
  );
}

export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <PlanProvider>
      <Column>{children}</Column>
      <ChangeBar />
      <BottomNav />
    </PlanProvider>
  );
}
