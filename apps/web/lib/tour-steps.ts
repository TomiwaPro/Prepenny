// The tour's steps (step 4h, D597): a few short steps around Home itself,
// each about one part of it, in the person's own figures where it can.
// Each step says only what Home does (checked by test/unit/tour.test.ts).

import { strings } from '../strings/en-GB.ts';
import { formatDay } from './dates.ts';
import type { HomeView } from './home.ts';
import { formatMoney } from './money.ts';

const t = strings.tour;

export interface TourStep {
  /** The part of Home it's about, found by this selector. */
  readonly target: string;
  readonly title: string;
  readonly text: string;
}

/** The bottom navigation: the panel goes above Home rather than over it. */
export const NAV_TARGET = '[data-tour="nav"]';

export function tourSteps(home: HomeView): readonly TourStep[] {
  const balance = t.balance.text(home.account.name);
  return [
    {
      target: '[data-tour="balance"]',
      title: t.balance.title,
      text: home.leftToSpend === null ? balance : `${balance} ${t.balance.leftToSpend}`,
    },
    {
      target: '[data-testid="lowest-point"]',
      title: t.lowest.title,
      text: `${t.lowest.text(formatMoney(home.lowest.balance), formatDay(home.lowest.date, home.today))} ${t.lowest.why}`,
    },
    { target: '[data-testid="next-due"]', title: t.nextDue.title, text: t.nextDue.text },
    { target: '[data-tour="actions"]', title: t.actions.title, text: t.actions.text },
    { target: NAV_TARGET, title: t.nav.title, text: t.nav.text },
  ];
}
