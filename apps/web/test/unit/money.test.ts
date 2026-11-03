import { describe, expect, it } from 'vitest';
import { formatMoney, MINUS } from '../../lib/money.ts';

describe('formatMoney (brief Part 6, VOICE.md)', () => {
  it('shows pounds and pence with a £ sign', () => {
    expect(formatMoney(26754)).toBe('£267.54');
    expect(formatMoney(453)).toBe('£4.53');
    expect(formatMoney(5)).toBe('£0.05');
    expect(formatMoney(0)).toBe('£0.00');
  });

  it('puts commas between thousands', () => {
    expect(formatMoney(102460)).toBe('£1,024.60');
    expect(formatMoney(330487)).toBe('£3,304.87');
    expect(formatMoney(123456789)).toBe('£1,234,567.89');
  });

  it('uses a proper minus sign, never a hyphen', () => {
    expect(MINUS).toBe('−');
    expect(formatMoney(-3000)).toBe('−£30.00');
    expect(formatMoney(-9547)).toBe('−£95.47');
    expect(formatMoney(-3000)).not.toContain('-');
  });

  it('adds a plus sign above zero only when asked, for money coming in', () => {
    expect(formatMoney(50000, { sign: 'always' })).toBe('+£500.00');
    expect(formatMoney(-12500, { sign: 'always' })).toBe('−£125.00');
    expect(formatMoney(0, { sign: 'always' })).toBe('£0.00');
    expect(formatMoney(50000)).toBe('£500.00');
  });

  it('leaves off .00 for a whole number of pounds when asked (D166)', () => {
    expect(formatMoney(2000, { wholePounds: true })).toBe('£20');
    expect(formatMoney(2050, { wholePounds: true })).toBe('£20.50');
    expect(formatMoney(-100000, { wholePounds: true })).toBe('−£1,000');
  });

  it('refuses anything but whole pence', () => {
    expect(() => formatMoney(4.53)).toThrow();
    expect(() => formatMoney(Number.NaN)).toThrow();
    expect(() => formatMoney(2 ** 60)).toThrow();
  });
});
