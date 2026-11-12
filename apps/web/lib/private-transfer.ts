// Money between the person's own private account and a shared one (D16,
// D52, D94, step 3f). The server never lets one payment cross from private
// to shared, so "Add a payment" makes two linked halves instead: money going
// out of (or into) their own account, and "From Jess" arriving in (or "To
// Jess" leaving) the shared account, which is all their partner sees of it.
// Pure: the screens give it what the phone knows of the plan's sharing.

import type { EditCommand, NewSeries } from '@prepenny/engine';
import { strings } from '../strings/en-GB.ts';

export interface SharingNow {
  /** The accounts everyone in the plan sees. */
  readonly sharedAccounts: ReadonlySet<string>;
  /** This person's name in the plan, or null when they haven't given one. */
  readonly myName: string | null;
}

/**
 * The command that adds a new payment: as it is, or, for money between a
 * private account and a shared one, as the private half with its shared
 * half. A savings goal goes on the half in the account it's kept in; the
 * shared half carries nothing else but the money and its timing.
 */
export function addPaymentCommand(
  series: NewSeries,
  madeAt: string,
  sharing: SharingNow | null,
  otherHalfId: string,
  goalAccount: (goalId: string) => string | undefined,
): EditCommand {
  const plain: EditCommand = { kind: 'add-payment', series, madeAt };
  const to = series.toAccountId;
  if (sharing === null || series.direction !== 'transfer' || to === undefined) return plain;
  const fromShared = sharing.sharedAccounts.has(series.accountId);
  const toShared = sharing.sharedAccounts.has(to);
  if (fromShared === toShared) return plain;
  const name = sharing.myName ?? strings.share.yourPartner;
  const privateAccount = fromShared ? to : series.accountId;
  const sharedAccount = fromShared ? series.accountId : to;
  const { toAccountId: _to, goalId, ...rest } = series;
  const keepGoal = goalId !== undefined && goalAccount(goalId) === privateAccount;
  // A shared goal kept in the shared account goes on the shared half, so it
  // counts as this person's money towards it (step 3g, D464).
  const halfGoal = goalId !== undefined && goalAccount(goalId) === sharedAccount;
  return {
    kind: 'add-payment',
    series: {
      ...rest,
      accountId: privateAccount,
      direction: fromShared ? 'in' : 'out',
      ...(keepGoal ? { goalId } : {}),
    },
    madeAt,
    otherHalf: {
      id: otherHalfId,
      accountId: sharedAccount,
      name: fromShared ? strings.share.toPerson(name) : strings.share.fromPerson(name),
      ...(halfGoal ? { goalId } : {}),
    },
  };
}
