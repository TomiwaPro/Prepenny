// The small helpers behind the edit sheet: reading a typed amount without
// floating point (brief 5.1), new ids (ARCHITECTURE.md 3.3), and the words
// for a refused change, never its code (D87).

import { describe, expect, it } from 'vitest';
import { amountForTyping, parseAmount } from '../../lib/amount.ts';
import { newId, timeNow } from '../../lib/ids.ts';
import { refusalMessage } from '../../lib/refusals.ts';
import { strings } from '../../strings/en-GB.ts';

describe('parseAmount', () => {
  it('reads amounts as people type them, as whole pence', () => {
    expect(parseAmount('640')).toBe(64000);
    expect(parseAmount('640.00')).toBe(64000);
    expect(parseAmount(' 560.5 ')).toBe(56050);
    expect(parseAmount('£1,024.60')).toBe(102460);
    expect(parseAmount('£ 25')).toBe(2500);
    expect(parseAmount('0.07')).toBe(7);
    expect(parseAmount('0')).toBe(0);
  });

  it('refuses anything that isn’t an amount', () => {
    for (const text of ['', 'ten', '-3', '6.405', '1,02', '12,34.00', '£', '1.2.3', '1e3']) {
      expect(parseAmount(text), text).toBeNull();
    }
  });

  it('starts a text box with the amount in pounds and pence', () => {
    expect(amountForTyping(60000)).toBe('600.00');
    expect(amountForTyping(453)).toBe('4.53');
    expect(amountForTyping(7)).toBe('0.07');
  });
});

describe('newId', () => {
  it('makes a UUID version 7 that starts with the time', () => {
    const id = newId(Date.UTC(2026, 9, 25, 8, 30), (bytes) => bytes.fill(0xff));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // Sun 25 Oct 2026 at 08:30 UTC is 1,792,917,000,000 milliseconds: 01a1722e4f40 in hex.
    expect(id.replaceAll('-', '').slice(0, 12)).toBe('01a1722e4f40');
    expect(newId()).not.toBe(newId());
  });

  it('gives the time in UTC, as the engine stores it', () => {
    expect(timeNow(new Date(Date.UTC(2026, 10, 3, 21, 5, 9, 12)))).toBe('2026-11-03T21:05:09.012Z');
  });
});

describe('refusalMessage', () => {
  it('says to untick a payment first when one is ticked (D92)', () => {
    expect(refusalMessage('ticked')).toBe(
      'One of these payments is ticked as paid. Untick it first.',
    );
  });

  it('never shows a code, even one it doesn’t know', () => {
    expect(refusalMessage('edit-breaks-plan')).toBe(strings.refusals.other);
    expect(refusalMessage('toString')).toBe(strings.refusals.other);
    for (const message of Object.values(strings.refusals)) {
      // A sentence, never a code such as "date-before-earlier-payment".
      expect(message).toMatch(/^[A-Z].*\.$/);
    }
  });
});
