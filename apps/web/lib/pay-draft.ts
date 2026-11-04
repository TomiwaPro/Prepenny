// "Start a free plan with this pay" (brief 4.13 "Try first", 4.15, step 2g):
// the public calculator's take-home pay, kept on this phone for setup's pay
// step to fill in, then forgotten once it has. It's kept in the browser's
// own small store, never in the web address, so no amount is ever sent to a
// server or written in its logs (CLAUDE.md). Nothing else is kept.

import type { PayFrequency, Pence } from '@prepenny/engine';
import { amountForTyping } from './amount.ts';
import type { IncomeForm } from './setup-forms.ts';

const KEY = 'prepenny-pay-draft';

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
export function savePayDraft(draft: PayDraft): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** The pay kept for setup, read once: it's forgotten as it's read. */
export function takePayDraft(): PayDraft | null {
  let text: string | null;
  try {
    text = localStorage.getItem(KEY);
    if (text !== null) localStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as Partial<PayDraft>;
    if (
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
