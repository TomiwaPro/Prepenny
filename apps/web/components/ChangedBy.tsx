'use client';

// "Changed by Tom, 2 hours ago" (brief 4.14, step 3g, D459), for every
// payment row and the edit sheet, from one read of the plan's sharing for the
// whole app. Only in a plan with someone else in it: on a plan of one's own,
// every change is one's own, and nothing is shown.

import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { hasPartner, type SharedPlan, useSharedPlan } from '../data/shared-plan.ts';
import { changedByWords, lastChange, rowLine } from '../lib/changed-by.ts';
import { serverNow } from '../lib/clock-offset.ts';
import { usePlanActions } from './PlanProvider.tsx';

const SharedContext = createContext<SharedPlan | null>(null);

export function ChangedByProvider({ children }: { readonly children: ReactNode }) {
  const { loaded } = usePlanActions();
  const planId = loaded !== null && !loaded.plan.isExample ? loaded.plan.id : null;
  const shared = useSharedPlan(planId, loaded?.version ?? 0);
  return <SharedContext.Provider value={shared}>{children}</SharedContext.Provider>;
}

interface Payment {
  readonly seriesId: string;
  readonly originalDate: string;
}

function useMark(payment: Payment | null) {
  const shared = useContext(SharedContext);
  return useMemo(() => {
    if (payment === null || shared === null || !hasPartner(shared)) return null;
    const mark = lastChange(
      shared.marks,
      payment.seriesId,
      payment.originalDate,
      shared.seriesVersion.get(payment.seriesId) ?? null,
    );
    return mark === null ? null : { mark, shared };
  }, [payment, shared]);
}

/** The line on a payment's row: the other person's change in the last 7 days, or null. */
export function useRowChangedBy(payment: Payment): string | null {
  const found = useMark(payment);
  if (found === null) return null;
  return rowLine(found.mark, found.shared.personId, found.shared.nicknames, serverNow());
}

/** The line in a payment's edit sheet: whoever changed it last, and when, or null. */
export function useSheetChangedBy(payment: Payment | null): string | null {
  const found = useMark(payment);
  if (found === null) return null;
  return changedByWords(found.mark, found.shared.personId, found.shared.nicknames, serverNow())
    .words;
}

/** The plan's sharing, read once for the whole app: who's in it, and what's shared. */
export function useShared(): SharedPlan | null {
  return useContext(SharedContext);
}
