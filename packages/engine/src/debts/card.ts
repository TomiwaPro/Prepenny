// Credit card estimates (brief 4.6, 5.6, D101): the month's interest and the
// minimum from a rule, worked out on the statement day.

import type { Day } from '../dates/day.ts';
import type { MinorUnits } from '../money/currency.ts';
import { type Decimal, divideRounded, powerOfTen } from '../money/decimal.ts';
import { penceFromBigInt } from '../money/pence.ts';
import type { CheckedDebt, CheckedMinimum } from './check.ts';

/**
 * A month's interest: balance × yearly rate ÷ 12, rounded once to the
 * nearest penny or cent, halves away from zero (D9). Nothing on a balance of
 * zero or less. £420.99 at "24.9" is £8.7355..., so £8.74.
 */
export function monthlyInterest(balance: MinorUnits, yearlyPercent: Decimal): MinorUnits {
  if (balance <= 0) return 0;
  const exact = BigInt(balance) * yearlyPercent.units;
  return penceFromBigInt(divideRounded(exact, 1200n * powerOfTen(yearlyPercent.scale)), 'interest');
}

/**
 * The minimum from a rule like "interest plus 1% of the balance, at least
 * £5" (D101): `percent` of the balance before the month's interest is added,
 * rounded once (D9), plus the interest, at least `atLeast`, and never more
 * than the balance once the interest is added. £420.99 with £8.74 interest
 * is £4.21 + £8.74 = £12.95.
 */
export function minimumFromRule(
  before: MinorUnits,
  interest: MinorUnits,
  rule: Extract<CheckedMinimum, { kind: 'rule' }>,
): MinorUnits {
  const owed = before + interest;
  if (owed <= 0) return 0;
  const share =
    before <= 0
      ? 0
      : penceFromBigInt(
          divideRounded(BigInt(before) * rule.percent.units, 100n * powerOfTen(rule.percent.scale)),
          'minimum',
        );
  return Math.min(owed, Math.max(rule.atLeast, interest + share));
}

/** What a statement day does to a card: its interest, its minimum and the balance after (D101). */
export interface Statement {
  readonly interest: MinorUnits;
  /** Null when the card has no minimum rule (its minimum is typed, or there's none). */
  readonly minimum: MinorUnits | null;
  readonly after: MinorUnits;
}

/**
 * The yearly rate on a statement day: none before a card's "0% until" date
 * ends, so a statement day on or before it adds nothing (D106).
 */
export function rateOn(card: CheckedDebt, day: Day): Decimal | null {
  if (card.zeroInterestUntil !== null && day <= card.zeroInterestUntil) return null;
  return card.interestRate;
}

/** A statement day on a card, from the balance just before it. */
export function statementOf(card: CheckedDebt, before: MinorUnits, day: Day): Statement {
  const rate = rateOn(card, day);
  const interest = rate === null ? 0 : monthlyInterest(before, rate);
  const minimum =
    card.minimum?.kind === 'rule' ? minimumFromRule(before, interest, card.minimum) : null;
  return { interest, minimum, after: before + interest };
}

/** True when the card has statement days to show: interest, or a minimum rule (D13). */
export function hasStatements(card: CheckedDebt): boolean {
  return (
    card.statementDay !== null && (card.interestRate !== null || card.minimum?.kind === 'rule')
  );
}
