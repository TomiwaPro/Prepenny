// Step 3e's pieces that work on the phone alone: a signed-in device's plain
// name and when it was last used (lib/device-words.ts), the words for a
// replaced change made on another device (PLAN.md item 39), which version
// is which (lib/version.ts), the times written inside the plan by the
// server's clock (D378), and the app lock's PIN (lib/app-lock.ts).

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClashToShow } from '../../data/clashes.ts';
import {
  changePin,
  checkPin,
  lockOn,
  secondsToWait,
  turnOffLock,
  turnOnLock,
} from '../../lib/app-lock.ts';
import { clashWords } from '../../lib/clash-words.ts';
import { setClockOffset } from '../../lib/clock-offset.ts';
import {
  deviceInSentence,
  deviceName,
  lastUsedWords,
  momentWords,
} from '../../lib/device-words.ts';
import { timeInOrder, timeNow } from '../../lib/ids.ts';
import { differs } from '../../lib/version.ts';

/** A small store in memory, as the browser's own. */
function store(): Storage {
  const kept = new Map<string, string>();
  return {
    get length() {
      return kept.size;
    },
    clear: () => kept.clear(),
    getItem: (key) => kept.get(key) ?? null,
    key: (index) => [...kept.keys()][index] ?? null,
    removeItem: (key) => {
      kept.delete(key);
    },
    setItem: (key, value) => {
      kept.set(key, value);
    },
  };
}

describe('A signed-in device in plain words', () => {
  it('names the browser and the kind of device', () => {
    expect(deviceName('chrome', 'android-phone')).toBe('Chrome on an Android phone');
    expect(deviceName('safari', 'iphone')).toBe('Safari on an iPhone');
    expect(deviceName('samsung', 'android-phone')).toBe('Samsung Internet on an Android phone');
    expect(deviceName('edge', 'windows')).toBe('Edge on a Windows computer');
  });

  it("names only the device when the browser can't be told, as for an app on the home screen", () => {
    expect(deviceName('', 'iphone')).toBe('An iPhone');
    expect(deviceName('', '')).toBe('A phone or computer');
    expect(deviceInSentence('', 'iphone')).toBe('an iPhone');
  });

  it('says when it was last used: today, yesterday, or the day', () => {
    const now = new Date('2026-11-09T10:00:00Z');
    expect(lastUsedWords('2026-11-09T08:00:00Z', now)).toBe('Last used today');
    expect(lastUsedWords('2026-11-08T23:30:00Z', now)).toBe('Last used yesterday');
    expect(lastUsedWords('2026-11-03T12:00:00Z', now).replaceAll('\u00a0', ' ')).toBe(
      'Last used Tue 3 Nov',
    );
    expect(lastUsedWords('2025-12-24T12:00:00Z', now).replaceAll('\u00a0', ' ')).toBe(
      'Last used Wed 24 Dec 2025',
    );
  });
});

describe('When getting back in can be finished, in plain words (step 3e hardening)', () => {
  const words = (time: string, now: string) =>
    momentWords(time, new Date(now)).replaceAll('\u00a0', ' ');

  it('says the time, then the day', () => {
    expect(words('2026-11-10T14:05:00Z', '2026-11-09T14:05:00Z')).toBe('2:05pm on Tue 10 Nov');
    expect(words('2026-11-10T00:05:00Z', '2026-11-09T00:05:00Z')).toBe('12:05am on Tue 10 Nov');
    expect(words('2026-11-10T12:00:00Z', '2026-11-09T12:00:00Z')).toBe('12:00pm on Tue 10 Nov');
  });

  it("adds the year only when it isn't this year", () => {
    expect(words('2027-01-01T09:00:00Z', '2026-12-31T09:00:00Z')).toBe('9:00am on Fri 1 Jan 2027');
  });
});

describe('A replaced change made on another device (item 39)', () => {
  const base: ClashToShow = {
    id: 'one',
    planId: 'plan',
    kind: 'elsewhere',
    facts: {
      by: 'sam',
      name: 'Rent',
      on: '2026-11-01',
      theirs: { kind: 'changed' },
      ours: { kind: 'changed' },
    },
    madeOn: { browser: 'chrome', device: 'android-phone' },
    at: 0,
    who: { kind: 'other-phone' },
  };

  it("names the device it was made on, and keeps the other phone's change", () => {
    const words = clashWords(base, '2026-10-25');
    expect(words.message.replaceAll('\u00a0', ' ')).toBe(
      "Your other phone changed Rent on Sun 1 Nov after you changed it on Chrome on an Android phone. Your other phone's change is kept.",
    );
    expect(words.putBack).toBeNull();
    expect(words.keep).toBe('Got it');
  });

  it('names a partner, and a device it can only call a phone or computer', () => {
    const { madeOn: _none, ...unknown } = base;
    const words = clashWords(
      { ...unknown, who: { kind: 'partner', nickname: 'Tom' } },
      '2026-10-25',
    );
    expect(words.message.replaceAll('\u00a0', ' ')).toBe(
      "Tom changed Rent on Sun 1 Nov after you changed it on another phone or computer. Tom's change is kept.",
    );
  });
});

describe('Which version is which', () => {
  it('differs when the database or the build does', () => {
    const own = { database: '20261110100000', build: 'abc' };
    expect(differs({ ...own }, own)).toBe(false);
    expect(differs({ ...own, build: 'def' }, own)).toBe(true);
    expect(differs({ ...own, database: '20261111100000' }, own)).toBe(true);
  });
});

describe("The times written inside the plan, by the server's clock (D378)", () => {
  afterEach(() => setClockOffset(0));

  it("follow the difference from the server's clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T10:00:00.000Z'));
    try {
      expect(timeNow()).toBe('2026-11-09T10:00:00.000Z');
      // This phone is an hour fast: the server's time is an hour behind it.
      setClockOffset(-3_600_000);
      expect(timeNow()).toBe('2026-11-09T09:00:00.000Z');
      expect(Date.parse(timeInOrder())).toBeLessThanOrEqual(Date.parse('2026-11-09T09:00:00.001Z'));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('The app lock', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', store());
    vi.stubGlobal('sessionStorage', store());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the PIN only scrambled, and opens with the right one only', async () => {
    expect(lockOn()).toBe(false);
    await turnOnLock('2580');
    expect(lockOn()).toBe(true);
    expect(JSON.stringify({ ...localStorage })).not.toContain('2580');
    expect(await checkPin('1111')).toBe('wrong');
    expect(await checkPin('2580')).toBe('right');
  });

  it('waits after 5 wrong tries, longer each time after that', async () => {
    await turnOnLock('2580');
    for (let i = 0; i < 4; i += 1) expect(await checkPin('0000')).toBe('wrong');
    expect(await checkPin('0000')).toEqual({ wait: 30 });
    expect(secondsToWait()).toBeGreaterThan(0);
    // While waiting, even the right PIN isn't tried.
    expect(await checkPin('2580')).toEqual({ wait: expect.any(Number) });
  });

  it('changes the PIN, and turns off, only with the PIN now', async () => {
    await turnOnLock('2580');
    expect(await changePin('1234', '9999')).toBe('wrong');
    expect(await changePin('2580', '9999')).toBe('right');
    expect(await checkPin('2580')).toBe('wrong');
    expect(await turnOffLock('2580')).toBe('wrong');
    expect(await turnOffLock('9999')).toBe('right');
    expect(lockOn()).toBe(false);
  });
});
