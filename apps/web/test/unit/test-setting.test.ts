// The test-only setting (D201) is out of reach of the real app: it's read
// only when test software drives the browser, and only from a value put on
// the page.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_SETTING_KEY, testSetting } from '../../lib/test-setting.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('The test-only setting (D201)', () => {
  it('is never there outside a browser', () => {
    expect(testSetting()).toBeNull();
  });

  it('is ignored in a browser that test software isn’t driving, even with the value on the page', () => {
    vi.stubGlobal('navigator', { webdriver: false });
    vi.stubGlobal('window', { [TEST_SETTING_KEY]: { today: '2026-10-30' } });
    expect(testSetting()).toBeNull();
  });

  it('is read when test software drives the browser, keeping only a proper date and a plan', () => {
    vi.stubGlobal('navigator', { webdriver: true });
    vi.stubGlobal('window', { [TEST_SETTING_KEY]: { today: '2026-10-30' } });
    expect(testSetting()).toEqual({ today: '2026-10-30' });
    vi.stubGlobal('window', { [TEST_SETTING_KEY]: { today: 'Friday', plan: null } });
    expect(testSetting()).toEqual({});
    vi.stubGlobal('window', {});
    expect(testSetting()).toBeNull();
  });

  it('keeps "open on the example" only when it is exactly true (step 2e)', () => {
    vi.stubGlobal('navigator', { webdriver: true });
    vi.stubGlobal('window', { [TEST_SETTING_KEY]: { example: true } });
    expect(testSetting()).toEqual({ example: true });
    vi.stubGlobal('window', { [TEST_SETTING_KEY]: { example: 'yes' } });
    expect(testSetting()).toEqual({});
    vi.stubGlobal('navigator', { webdriver: false });
    vi.stubGlobal('window', { [TEST_SETTING_KEY]: { example: true } });
    expect(testSetting()).toBeNull();
  });
});
