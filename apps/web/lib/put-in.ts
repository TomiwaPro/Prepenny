// What each person has put into a shared savings goal so far (brief 4.14,
// D114, step 3g, D465): their own money ("From Jess", or pay that's theirs),
// money moved from each shared account, what was saved when the goal was
// made, and anything taken out. The lines add up to what's saved so far.
// Pure: what the plan's sharing says comes in.

import { strings } from '../strings/en-GB.ts';
import type { GoalCard } from './money-views.ts';

const g = strings.together;

export interface PutInSharing {
  readonly personId: string;
  readonly nicknames: Readonly<Record<string, string>>;
  /** Payments that are someone's own money: "From Jess" (locked to her), or pay that's hers. */
  readonly lockedToAnyone: ReadonlyMap<string, string>;
  readonly paidTo: ReadonlyMap<string, string>;
}

export function putInLines(
  goal: Pick<GoalCard, 'startingAmount' | 'savedFrom'>,
  shared: PutInSharing,
  accountName: (id: string) => string,
): { readonly label: string; readonly amount: number }[] {
  const lines = new Map<string, number>();
  const add = (label: string, amount: number) => lines.set(label, (lines.get(label) ?? 0) + amount);
  if (goal.startingAmount > 0) add(g.putInStart, goal.startingAmount);
  for (const one of goal.savedFrom) {
    if (one.amount < 0) {
      add(g.putInOut, one.amount);
      continue;
    }
    const person = shared.lockedToAnyone.get(one.seriesId) ?? shared.paidTo.get(one.seriesId);
    if (person !== undefined) {
      const name = shared.nicknames[person];
      add(
        person === shared.personId
          ? g.putInYou
          : name === undefined || name === ''
            ? strings.share.someone
            : name,
        one.amount,
      );
    } else if (one.fromAccountId !== null) {
      add(g.putInFrom(accountName(one.fromAccountId)), one.amount);
    } else {
      add(g.putInOther, one.amount);
    }
  }
  return [...lines].map(([label, amount]) => ({ label, amount }));
}
