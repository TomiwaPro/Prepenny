// What each "?" sheet says (step 4h, brief 4.16, D596), in the person's own
// figures. Each sentence matches what the app does; the rule behind each is
// beside it, and test/unit/why.test.ts checks them against the engine.

import type { Pence } from '@prepenny/engine';
import { strings } from '../strings/en-GB.ts';
import { formatDay } from './dates.ts';
import type { HomeView } from './home.ts';
import { formatMoney } from './money.ts';
import type { AccountView } from './plan-view.ts';
import type { RowView } from './rows.ts';

const w = strings.why;

/** The help articles the sheets link to, by their address and title (content/help). */
export const WHY_ARTICLES = {
  balance: {
    slug: 'how-the-balance-works',
    title: "Every payment shows what you'll have left after it",
  },
  updating: {
    slug: 'updating-your-balance',
    title: 'Updating your balance keeps your plan true to your bank',
  },
} as const;

export type WhyArticle = (typeof WHY_ARTICLES)[keyof typeof WHY_ARTICLES];

export interface WhyWords {
  readonly title: string;
  readonly intro: string;
  readonly lines: readonly string[];
  readonly article: WhyArticle;
}

/**
 * Home's lowest point: the least end-of-day balance from today, 12 months
 * ahead, the first such day on a tie, after that day's last payment (brief
 * 5.5, D85, D178); Short below the floor, Tight below the warning level (D10).
 */
export function lowestWhy(home: HomeView): WhyWords {
  const l = w.lowest;
  const day = (date: string) => formatDay(date, home.today);
  const { lowest } = home;
  const amount = formatMoney(lowest.balance);
  const lines = [
    lowest.after === null
      ? l.onNothingYet(day(lowest.date), amount)
      : l.on(day(lowest.date), lowest.after, amount),
  ];
  if (lowest.payAfter !== null) lines.push(l.payAfter(day(lowest.payAfter)));
  if (lowest.status === 'short') {
    lines.push(lowest.floor === 0 ? l.short : l.shortOverdraft(formatMoney(-lowest.floor)));
  } else if (lowest.status === 'tight') {
    lines.push(l.tight(formatMoney(home.account.warningLevel, { wholePounds: true })));
  }
  lines.push(l.raise);
  return {
    title: l.title(day(lowest.date)),
    intro: l.intro(home.account.name),
    lines,
    article: WHY_ARTICLES.balance,
  };
}

/**
 * Coming up's "Not ticked yet": a payment from before today that isn't
 * ticked stays there (D11); one dated on or before the balance check that
 * isn't ticked is counted on top of the bank's figure (brief 5.5, rules 1
 * and 2).
 */
export function notTickedWhy(account: AccountView, today: string): WhyWords {
  const n = w.notTicked;
  const rows = account.notTickedYet;
  const lines = [n.count(account.name, rows.length)];
  if (rows.some((row) => row.date <= account.checkedOn)) {
    lines.push(n.before(formatDay(account.checkedOn, today)));
  }
  lines.push(n.howToTick);
  return { title: n.title, intro: n.intro, lines, article: WHY_ARTICLES.balance };
}

/**
 * Update balance's ticking step: the new balance is checked today, so a
 * ticked payment from today or earlier is inside it, and one that isn't
 * ticked is still taken off or added (brief 5.5, rules 1 to 3, D46).
 */
export function tickingWhy(balance: Pence, account: string, toTick: readonly RowView[]): WhyWords {
  const k = w.ticking;
  const lines = [k.typed(formatMoney(balance), account)];
  const first = toTick[0];
  if (first !== undefined) {
    const amount = formatMoney(Math.abs(first.change));
    lines.push(first.change > 0 ? k.in(first.name, amount) : k.out(first.name, amount));
  }
  return { title: k.title, intro: k.intro, lines, article: WHY_ARTICLES.updating };
}
