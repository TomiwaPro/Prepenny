'use client';

// Loads the plan from the phone's database and works it out in the
// background worker. On first open it puts Sam's example plan on the phone
// (D15) and asks the browser to keep the data (ARCHITECTURE.md 3.8, 7).

import type { PlanRecords } from '@prepenny/engine';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { askToKeepData, loadRecords, openDb, type StoredPlan, savePlan } from '../data/db.ts';
import { EXAMPLE_PLAN_ID, EXAMPLE_VERSION, examplePlan } from '../data/example-plan.ts';
import type { HomeView } from '../lib/home.ts';
import { todayFor } from '../lib/today.ts';
import { workOutHomeInBackground } from '../worker/client.ts';

export type PlanState =
  | { readonly status: 'loading'; readonly plan: StoredPlan | null }
  | { readonly status: 'ready'; readonly plan: StoredPlan; readonly home: HomeView }
  | { readonly status: 'failed'; readonly plan: StoredPlan | null };

const PlanContext = createContext<PlanState>({ status: 'loading', plan: null });

const examplePlanRecord: StoredPlan = {
  id: EXAMPLE_PLAN_ID,
  isExample: true,
  exampleVersion: EXAMPLE_VERSION,
};

const ASKED_TO_KEEP = 'asked-to-keep-data';

/** The plan on this phone, putting the example there first if it isn't. */
async function planOnPhone(): Promise<{ plan: StoredPlan; records: PlanRecords }> {
  const db = openDb();
  try {
    const stored = await db.plans.get(EXAMPLE_PLAN_ID);
    if (stored === undefined || stored.exampleVersion !== EXAMPLE_VERSION) {
      await savePlan(db, examplePlanRecord, examplePlan);
    }
    if ((await db.device.get(ASKED_TO_KEEP)) === undefined) {
      await db.device.put({ key: ASKED_TO_KEEP, value: await askToKeepData() });
    }
    return { plan: examplePlanRecord, records: await loadRecords(db, EXAMPLE_PLAN_ID) };
  } finally {
    db.close();
  }
}

export function PlanProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<PlanState>({ status: 'loading', plan: null });

  useEffect(() => {
    let current = true;
    (async () => {
      let found: { plan: StoredPlan; records: PlanRecords };
      try {
        found = await planOnPhone();
      } catch {
        // No database on this phone, for example in some private windows:
        // the example still works, it just isn't saved.
        found = { plan: examplePlanRecord, records: examplePlan };
      }
      if (!current) return;
      setState({ status: 'loading', plan: found.plan });
      try {
        const home = await workOutHomeInBackground(found.records, todayFor(found.plan));
        if (current) setState({ status: 'ready', plan: found.plan, home });
      } catch {
        if (current) setState({ status: 'failed', plan: found.plan });
      }
    })();
    return () => {
      current = false;
    };
  }, []);

  return <PlanContext.Provider value={state}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanState {
  return useContext(PlanContext);
}
