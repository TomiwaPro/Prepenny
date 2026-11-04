// "Start a free plan with this pay" (brief 4.13 "Try first", 4.15, step 2g):
// the public calculator's take-home pay, kept on this phone for setup's pay
// step to fill in, then forgotten once it has. It's kept in the browser's
// own small store, never in the web address, so no amount is ever sent to a
// server or written in its logs (CLAUDE.md). Nothing else is kept.
//
// Step 2h, from the privacy review: it's kept for this tab only, which the
// browser forgets when the tab closes, and for an hour at most, and it's
// forgotten too when setup can't use it: when the person looks at the
// example instead, when their plan is already set up, or when the pay step
// already has an income. So the next person on a shared phone never finds
// someone else's pay filled in.

import type { PayFrequency, Pence } from '@prepenny/engine';
import { amountForTyping } from './amount.ts';
import type { IncomeForm } from './setup-forms.ts';

const KEY = 'prepenny-pay-draft';
/** How long it's kept: long enough to go from the calculator through setup's first step. */
const KEPT_FOR_MS = 60 * 60 * 1000;

export interface PayDraft {
  /** Take-home pay, whole pence. */
  readonly amount: Pence;
  readonly frequency: PayFrequency;
  /** The payday the calculator worked it out for, "YYYY-MM-DD". */
  readonly payDate: string;
}

const FREQUENCIES: readonly string[] = ['weekly', 'two-weekly', 'four-weekly', 'monthly'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Keeps the pay for setup. False when this phone can't keep it, as in some private windows. */
export function savePayDraft(draft: PayDraft, now = Date.now()): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

/** Forgets the pay kept for setup, if there is any. */
export function forgetPayDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
    // A copy kept by step 2g's version, before it moved to this tab only.
    localStorage.removeItem(KEY);
  } catch {
    // Nothing could be kept, so there's nothing to forget.
  }
}

/** The pay kept for setup, read once: it's forgotten as it's read. */
export function takePayDraft(now = Date.now()): PayDraft | null {
  let text: string | null;
  try {
    text = sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  forgetPayDraft();
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as Partial<PayDraft> & { savedAt?: unknown };
    if (
      typeof value.savedAt === 'number' &&
      now - value.savedAt >= 0 &&
      now - value.savedAt <= KEPT_FOR_MS &&
      typeof value.amount === 'number' &&
      Number.isSafeInteger(value.amount) &&
      value.amount >= 0 &&
      typeof value.frequency === 'string' &&
      FREQUENCIES.includes(value.frequency) &&
      typeof value.payDate === 'string' &&
      DATE.test(value.payDate)
    ) {
      return { amount: value.amount, frequency: value.frequency, payDate: value.payDate };
    }
  } catch {
    // Not something PrePenny kept: it's left out.
  }
  return null;
}

/**
 * The pay from the calculator as setup's first income: its amount after
 * everything comes off, how often it comes and, when it's today or later,
 * its payday, marked as an estimate (brief 4.3).
 */
export function incomeFromDraft(draft: PayDraft, today: string): Partial<IncomeForm> {
  return {
    kind: 'pay',
    often: draft.frequency,
    monthlyOn: 'day',
    date: draft.payDate >= today ? draft.payDate : '',
    amount: amountForTyping(draft.amount),
    isEstimate: true,
  };
}
