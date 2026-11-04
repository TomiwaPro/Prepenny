// Money as people read it (brief Part 6, VOICE.md): £ and pence, a proper
// minus sign (U+2212) and commas between thousands. Amounts are whole pence
// from the engine; nothing here uses floating point for money.

import type { Pence } from '@prepenny/engine';
import { strings } from '../strings/en-GB.ts';
import { parseAmount } from './amount.ts';

/** The proper minus sign, never a hyphen (VOICE.md). */
export const MINUS = '−';

export interface MoneyOptions {
  /**
   * `negative` (the default) shows a minus sign below zero only. `always`
   * also shows a plus sign above zero, for money coming in on a payment row.
   */
  readonly sign?: 'negative' | 'always';
  /**
   * Leaves off ".00" for a whole number of pounds, for a warning level in a
   * sentence: "keep at least £20" (D166). Figures and rows always show pence.
   */
  readonly wholePounds?: boolean;
}

/** "£1,024.60", "−£30.00", "+£500.00" with `sign: 'always'`, "£20" with `wholePounds`. */
export function formatMoney(pence: Pence, options: MoneyOptions = {}): string {
  if (!Number.isSafeInteger(pence)) {
    throw new RangeError('An amount must be whole pence.');
  }
  const size = Math.abs(pence);
  const pounds = Math.floor(size / 100);
  const pennies = size % 100;
  const grouped = pounds.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const amount =
    options.wholePounds === true && pennies === 0
      ? `£${grouped}`
      : `£${grouped}.${pennies.toString().padStart(2, '0')}`;
  if (pence < 0) return `${MINUS}${amount}`;
  if (pence > 0 && options.sign === 'always') return `+${amount}`;
  return amount;
}

/** "£19.07" for a rate an hour kept as text, such as "19.07"; with more pence, as it was typed. */
export function rateWords(rate: string): string {
  const pence = parseAmount(rate);
  return pence === null ? `£${rate}` : formatMoney(pence);
}

const SIGNS: Readonly<Record<string, string>> = strings.setup.debts.signs;

/** The sign in front of an amount in a currency: "£", "€" or "$". */
export function currencySign(currency: string): string {
  return SIGNS[currency] ?? `${currency} `;
}

/**
 * An amount in a debt's own currency, in its smallest unit: "€1,400.57" for
 * 140057 cents in euros, or "£420.99" in pounds (brief 4.6: both currencies shown).
 */
export function formatIn(minor: number, currency: string, options: MoneyOptions = {}): string {
  const pounds = formatMoney(minor, options);
  return currency === 'GBP' ? pounds : pounds.replace('£', currencySign(currency));
}

/** "€1.1612": a rate per £1 as the person typed it, with its currency's sign. */
export function perPoundWords(rate: string, currency: string): string {
  return `${currencySign(currency)}${rate}`;
}
