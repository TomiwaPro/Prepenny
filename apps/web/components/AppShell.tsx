'use client';

// Every screen of the app: the example plan banner and the offline note at
// the top, the screen in a centred column, the undo bar after a change, and
// the bottom navigation.

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { refusalMessage } from '../lib/refusals.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './AppShell.module.css';
import { BottomNav } from './BottomNav.tsx';
import { KeepInStep } from './KeepInStep.tsx';
import { ExampleBanner, OfflineNote } from './Notes.tsx';
import { PlanProvider, usePlan, usePlanActions } from './PlanProvider.tsx';
import { UndoBar } from './UndoBar.tsx';
import { UpdateNote, useUpdated } from './UpdateNote.tsx';

function Notes() {
  const state = usePlan();
  const { ownPlan, showPlan } = usePlanActions();
  const router = useRouter();
  return (
    <div className={styles.notes}>
      {state.plan?.isExample === true ? (
        <ExampleBanner
          ownPlan={ownPlan}
          onLeave={async () => {
            await showPlan('own');
            // A plan still being set up carries on in setup (step 2e).
            if (ownPlan !== 'ready') router.push('/setup/');
          }}
        />
      ) : null}
      <OfflineNote />
    </div>
  );
}

/** Goes to setup when the person's own plan isn't set up yet (brief 4.1, step 2e). */
function ToSetup() {
  const { needsSetup } = usePlanActions();
  const router = useRouter();
  useEffect(() => {
    if (needsSetup) router.replace('/setup/');
  }, [needsSetup, router]);
  return null;
}

/**
 * The undo bar (brief Part 3, principle 4; ARCHITECTURE.md 4.5): it stays
 * until the next change or until the person goes to another screen, with no
 * time limit (WCAG 2.2.1, D186).
 */
function ChangeBar() {
  const { lastChange, undoLastChange, dismissLastChange } = usePlanActions();
  const [refused, setRefused] = useState<{ readonly full: string; readonly short: string } | null>(
    null,
  );
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

  const message = refused?.full ?? lastChange?.message ?? null;
  const short = refused?.short ?? lastChange?.short ?? message ?? '';
  const canUndo = refused === null && lastChange?.edit !== null && lastChange?.edit !== undefined;
  // The live region is always on the page, and each message is drawn afresh
  // inside it, so screen readers hear every one, even the same words twice.
  return (
    <div role="status" ref={holder}>
      {message === null || lastChange === null ? null : (
        <UndoBar
          key={refused === null ? lastChange.id : `${lastChange.id} refused`}
          announce={false}
          placement="inline"
          message={message}
          short={short}
          {...(canUndo
            ? {
                onUndo: async () => {
                  if (undoing.current) return;
                  undoing.current = true;
                  const outcome = await undoLastChange(lastChange.id);
                  if (!outcome.ok)
                    setRefused({
                      full: refusalMessage(outcome.code),
                      short: strings.undo.short.cantUndo,
                    });
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
  const updated = useUpdated();
  return (
    <div
      className={`${styles.column} ${lastChange === null && !updated ? '' : styles.withBar} ${lastChange !== null && updated ? styles.withBoth : ''}`}
    >
      <Notes />
      <main className={styles.main}>{children}</main>
    </div>
  );
}

export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <PlanProvider>
      <ToSetup />
      <KeepInStep />
      <Column>{children}</Column>
      {/* Above the navigation: the update note, then the undo bar (D186, D202). */}
      <div className={styles.bottom} data-bottom-notes>
        <UpdateNote />
        <ChangeBar />
      </div>
      <BottomNav />
    </PlanProvider>
  );
}
