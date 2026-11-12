// Whether this page's code has started on the phone (step 3i, D487).
//
// Every page is built ahead of time, so the phone shows its words before
// the code behind them has arrived and started. A form shown in that moment
// looks ready but isn't: on a slow phone, someone who types their address
// and taps "Send me a code" straight away has the browser send the form
// itself, which loads the page again, empty. So a page shows its forms only
// once this is true. Found by `your-plan.spec.ts` test 9 (PLAN.md item 65).

import { useSyncExternalStore } from 'react';

const nothingToHear = () => () => {};

/** False in the page built ahead of time and while React takes it over, then true. */
export function useStarted(): boolean {
  return useSyncExternalStore(
    nothingToHear,
    () => true,
    () => false,
  );
}
