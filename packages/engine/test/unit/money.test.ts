// ARCHITECTURE.md test 1: money in whole pence; rounding to the nearest penny,
// halves away from zero, once per pay line or payment (brief 5.1, D9).

import { describe, expect, it } from 'vitest';
import {
  checkPence,
  divideRounded,
  EngineInputError,
  formatPounds,
  fromOtherCurrency,
  isPence,
  multiplyPence,
  multiplyToPence,
  parseDecimal,
  parsePounds,
  sumPence,
  toOtherCurrency,
} from '../../src/index.ts';

describe('money is whole pence', () => {
  it('reads pounds as whole pence, with no floating point', () => {
    expect(parsePounds('603.06')).toBe(60306);
    expect(parsePounds('4.53')).toBe(453);
    expect(parsePounds('-30')).toBe(-3000);
    expect(parsePounds('0.1')).toBe(10);
    expect(parsePounds('0')).toBe(0);
    // 0.1 + 0.2 is not 0.3 in floating point, but it is in pence.
    expect(parsePounds('0.1') + parsePounds('0.2')).toBe(parsePounds('0.3'));
  });

  it('writes pence back as pounds', () => {
    expect(formatPounds(60306)).toBe('603.06');
    expect(formatPounds(-3000)).toBe('-30.00');
    expect(formatPounds(5)).toBe('0.05');
    expect(formatPounds(974896)).toBe('9748.96');
  });

  it('refuses anything that is not whole pence', () => {
    expect(isPence(453)).toBe(true);
    expect(isPence(4.53)).toBe(false);
    expect(isPence(Number.NaN)).toBe(false);
    expect(isPence(2 ** 53)).toBe(false);
    expect(isPence('453')).toBe(false);
    expect(() => checkPence(4.53, 'Rent')).toThrow(EngineInputError);
    expect(() => parsePounds('4.535')).toThrow(EngineInputError);
    expect(() => parsePounds('1,000')).toThrow(EngineInputError);
    expect(() => parsePounds('£5')).toThrow(EngineInputError);
    expect(() => parsePounds('')).toThrow(EngineInputError);
  });

  it('adds up exactly', () => {
    expect(sumPence([60306, 61846, 46906])).toBe(169058);
    expect(sumPence([])).toBe(0);
  });

  it("never puts an amount in an error message, so errors are safe to report", () => {
    try {
      checkPence(123.45, 'Rent amount');
    } catch (error) {
      expect((error as Error).message).not.toContain('123');
    }
  });
});

describe('rounding: nearest penny, halves away from zero (D9)', () => {
  it('rounds halves away from zero, both ways', () => {
    expect(divideRounded(25n, 10n)).toBe(3n); // 2.5 → 3
    expect(divideRounded(-25n, 10n)).toBe(-3n); // −2.5 → −3
    expect(divideRounded(24n, 10n)).toBe(2n);
    expect(divideRounded(26n, 10n)).toBe(3n);
    expect(divideRounded(-24n, 10n)).toBe(-2n);
    expect(divideRounded(-26n, 10n)).toBe(-3n);
    expect(divideRounded(0n, 7n)).toBe(0n);
  });

  it('reads exact decimals as text', () => {
    expect(parseDecimal('1.1612')).toEqual({ units: 11612n, scale: 4 });
    expect(parseDecimal('34.5')).toEqual({ units: 345n, scale: 1 });
    expect(parseDecimal('-2')).toEqual({ units: -2n, scale: 0 });
    expect(() => parseDecimal('1.2.3')).toThrow(EngineInputError);
    expect(() => parseDecimal('.5')).toThrow(EngineInputError);
    expect(() => parseDecimal('1e3')).toThrow(EngineInputError);
  });

  it('works out hours × rate exactly, then rounds once per pay line (D9)', () => {
    // 34.5 h × £12.71 = £438.495, which rounds to £438.50.
    expect(multiplyToPence('34.5', '12.71')).toBe(43850);
    // Week 26's gross of £553.19 only adds up if that line is £438.50 (D9).
    expect(multiplyToPence('34.5', '12.71') + parsePounds('114.69')).toBe(parsePounds('553.19'));
    // 46 h × £12.71 = £584.66, exactly.
    expect(multiplyToPence('46', '12.71')).toBe(58466);
    // 11.5 h × £19.07 = £219.305, which rounds to £219.31.
    expect(multiplyToPence('11.5', '19.07')).toBe(21931);
  });

  it('multiplies pence by an exact decimal, rounding once', () => {
    // 4% of £433.19 is £17.3276, so £17.33 (the week 26 pension in brief 8.6).
    expect(multiplyPence(43319, '0.04')).toBe(1733);
    expect(multiplyPence(-5, '0.5')).toBe(-3); // −2.5p → −3p
    expect(multiplyPence(5, '0.5')).toBe(3); // 2.5p → 3p
  });
});

describe('currency conversion, rounded once per payment (D9)', () => {
  const rate = '1.1612'; // euros per £1, the Family loan (brief 8.1)

  it("converts each payment at the person's rate", () => {
    expect(toOtherCurrency(parsePounds('125.00'), rate)).toBe(14515); // €145.15
    expect(toOtherCurrency(parsePounds('250.00'), rate)).toBe(29030); // €290.30
    // £206.15 × 1.1612 = €239.38138, so €239.38.
    expect(toOtherCurrency(parsePounds('206.15'), rate)).toBe(23938);
  });

  it("leaves the Family loan at −€0.01 after its six payments (ARCHITECTURE.md 2.6)", () => {
    const payments = ['125.00', '125.00', '250.00', '250.00', '250.00', '206.15'];
    const paidInEuros = sumPence(payments.map((p) => toOtherCurrency(parsePounds(p), rate)));
    expect(paidInEuros).toBe(140058); // €1,400.58
    expect(140057 - paidInEuros).toBe(-1); // €1,400.57 owed, so −€0.01 left
  });

  it('rounds each payment, never the total', () => {
    // Three payments of 1p at 1.5 are 1.5c each, so 2c each: 6c.
    const each = sumPence([1, 1, 1].map((p) => toOtherCurrency(p, '1.5')));
    expect(each).toBe(6);
    // Rounding the total instead would give 4.5c, so 5c. That's not the rule.
    expect(toOtherCurrency(3, '1.5')).toBe(5);
  });

  it('converts back into pounds for showing both currencies', () => {
    // €1,400.57 at €1.1612 per £1 is about £1,206.14 (ARCHITECTURE.md 4.6).
    expect(fromOtherCurrency(140057, rate)).toBe(120614);
  });

  it('refuses a rate of zero or below', () => {
    expect(() => toOtherCurrency(100, '0')).toThrow(EngineInputError);
    expect(() => toOtherCurrency(100, '-1.1')).toThrow(EngineInputError);
    expect(() => fromOtherCurrency(100, '0')).toThrow(EngineInputError);
  });
});
