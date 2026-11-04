// Reads an amount someone types, such as "640", "640.00", "£1,024.60" or
// " 25 ", as whole pence, without floating point (brief 5.1). Anything else,
// such as "6.405", "-3" or "ten", isn't an amount.

import type { Pence } from '@prepenny/engine';

const AMOUNT = /^£?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/** Whole pence, or null when the text isn't an amount. */
export function parseAmount(text: string): Pence | null {
  const match = AMOUNT.exec(text.trim());
  if (match === null) return null;
  const pounds = (match[1] ?? '').replaceAll(',', '');
  const pennies = (match[2] ?? '').padEnd(2, '0');
  const pence = Number(pounds) * 100 + Number(pennies);
  return Number.isSafeInteger(pence) ? pence : null;
}

/** An amount as it starts in a text box: "600.00", with no £ and no commas. */
export function amountForTyping(pence: Pence): string {
  const size = Math.abs(pence);
  return `${Math.floor(size / 100)}.${(size % 100).toString().padStart(2, '0')}`;
}

const MINUS_SIGNS = /^\s*[-−]\s*|^(\s*£\s*)[-−]\s*/;

/**
 * Whole pence for a balance, which can be below zero in an overdraft:
 * "-300", "−£300.00" or "£-300". Null when the text isn't an amount.
 */
export function parseSignedAmount(text: string): Pence | null {
  const match = MINUS_SIGNS.exec(text);
  if (match === null) return parseAmount(text);
  const size = parseAmount(text.replace(MINUS_SIGNS, '$1'));
  if (size === null) return null;
  return size === 0 ? 0 : -size;
}
