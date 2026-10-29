// Times for balance updates and ticks (D33): UTC only, compared exactly,
// with no clock and no time zone inside the engine.

import { describe, expect, it } from 'vitest';
import { EngineInputError, parseTime } from '../../src/index.ts';

describe('times', () => {
  it('orders UTC times exactly, down to the microsecond', () => {
    const times = [
      '2026-10-30T09:14:05Z',
      '2026-10-30T09:14:05.000001Z',
      '2026-10-30T09:14:05.5Z',
      '2026-10-30T09:14:06Z',
      '2026-10-31T00:00:00Z',
    ].map((text) => parseTime(text));
    for (let i = 1; i < times.length; i += 1) {
      expect((times[i] as bigint) > (times[i - 1] as bigint)).toBe(true);
    }
  });

  it('reads "+00:00" the same as "Z", and ".5" the same as ".500000"', () => {
    expect(parseTime('2026-10-30T09:14:05+00:00')).toBe(parseTime('2026-10-30T09:14:05Z'));
    expect(parseTime('2026-10-30T09:14:05.5Z')).toBe(parseTime('2026-10-30T09:14:05.500000Z'));
  });

  it('keeps the true order across the clocks going back on Sun 25 Oct 2026', () => {
    // 01:30 BST is 00:30 UTC. Half an hour after the clocks go back at 02:00
    // BST, the clock reads 01:15 GMT, which is 01:15 UTC: later, though the
    // clock on the wall reads earlier.
    const updateAt0130Bst = parseTime('2026-10-25T00:30:00Z');
    const tickAt0115Gmt = parseTime('2026-10-25T01:15:00Z');
    expect(tickAt0115Gmt > updateAt0130Bst).toBe(true);
  });

  it('starts from 1 Jan 1970', () => {
    expect(parseTime('1970-01-01T00:00:00Z')).toBe(0n);
    expect(parseTime('1970-01-02T00:00:00.000001Z')).toBe(86_400_000_001n);
  });

  it.each([
    ['no time', '2026-10-30'],
    ['another time zone', '2026-10-30T09:14:05+01:00'],
    ['no zone', '2026-10-30T09:14:05'],
    ['a space instead of T', '2026-10-30 09:14:05Z'],
    ['too many digits after the seconds', '2026-10-30T09:14:05.1234567Z'],
    ['hour 24', '2026-10-30T24:00:00Z'],
    ['minute 60', '2026-10-30T09:60:00Z'],
    ['a day that does not exist', '2027-02-29T09:00:00Z'],
  ])('refuses %s', (_why, text) => {
    expect(() => parseTime(text)).toThrow(EngineInputError);
  });
});
