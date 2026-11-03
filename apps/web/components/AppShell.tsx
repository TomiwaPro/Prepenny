'use client';

// Every screen of the app: the example plan banner and the offline note at
// the top, the screen in a centred column, and the bottom navigation.

import type { ReactNode } from 'react';
import styles from './AppShell.module.css';
import { BottomNav } from './BottomNav.tsx';
import { ExampleBanner, OfflineNote } from './Notes.tsx';
import { PlanProvider, usePlan } from './PlanProvider.tsx';

function Notes() {
  const state = usePlan();
  return (
    <div className={styles.notes}>
      {state.plan?.isExample === true ? <ExampleBanner /> : null}
      <OfflineNote />
    </div>
  );
}

export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <PlanProvider>
      <div className={styles.column}>
        <Notes />
        <main className={styles.main}>{children}</main>
      </div>
      <BottomNav />
    </PlanProvider>
  );
}
