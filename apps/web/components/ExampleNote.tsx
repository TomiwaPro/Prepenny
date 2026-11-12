'use client';

// The example plan banner with its way out, "Make my plan" or back to the
// person's own plan (step 2e), wherever it's shown: at the top of every
// screen of the example, except Home, where it sits under the lowest point
// so a 320 by 568 phone shows the account and the lowest point first; the
// account card there already says "Example plan, as on Sun 25 Oct 2026"
// (D440, D451).

import { usePathname, useRouter } from 'next/navigation';
import { ExampleBanner } from './Notes.tsx';
import { usePlan, usePlanActions } from './PlanProvider.tsx';

/** True on Home, whose example banner is under the lowest point (D451). */
export function useOnHome(): boolean {
  const path = usePathname() ?? '';
  return path === '/app' || path === '/app/';
}

export function ExampleNote() {
  const state = usePlan();
  const { ownPlan, showPlan } = usePlanActions();
  const router = useRouter();
  if (state.plan?.isExample !== true) return null;
  return (
    <ExampleBanner
      ownPlan={ownPlan}
      onLeave={async () => {
        await showPlan('own');
        // A plan still being set up carries on in setup (step 2e).
        if (ownPlan !== 'ready') router.push('/setup/');
      }}
    />
  );
}
