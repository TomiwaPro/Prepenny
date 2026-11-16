// Adding PrePenny to the home screen (step 4d, D546 to D551): which phone
// it is, when it's suggested, what's kept, the opening screens on an iPhone
// and the long-press shortcuts on Android.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import manifest from '../../app/manifest.ts';
import {
  type HomeScreenState,
  isSafari,
  phoneOf,
  readKept,
  suggestOnHome,
  suggestOnWelcome,
} from '../../lib/install.ts';
import { SHORTCUTS, shortcutFor } from '../../lib/shortcuts.ts';
import {
  IPHONE_SCREENS,
  splashFile,
  splashMedia,
  startupImages,
} from '../../lib/splash-screens.ts';
import { PAPER } from '../../lib/theme.ts';
import { strings } from '../../strings/en-GB.ts';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1';
const IPAD =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const LAPTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const state = (change: Partial<HomeScreenState> = {}): HomeScreenState => ({
  phone: 'android',
  safari: false,
  asApp: false,
  kept: { firstDay: '2026-11-16' },
  canInstall: false,
  ...change,
});

describe('which phone this is', () => {
  it('knows an iPhone, an iPad, an Android phone and a laptop', () => {
    expect(phoneOf(IPHONE_SAFARI)).toBe('iphone');
    expect(phoneOf(IPHONE_CHROME)).toBe('iphone');
    // An iPad says it's a Mac; only its touch screen tells them apart.
    expect(phoneOf(IPAD, 5)).toBe('iphone');
    expect(phoneOf(IPAD, 0)).toBe('other');
    expect(phoneOf(ANDROID_CHROME)).toBe('android');
    expect(phoneOf(LAPTOP_CHROME)).toBe('other');
  });

  it("knows Safari from Chrome and an app's own browser on an iPhone", () => {
    expect(isSafari(IPHONE_SAFARI)).toBe(true);
    expect(isSafari(IPHONE_CHROME)).toBe(false);
    expect(isSafari(`${IPHONE_SAFARI} Instagram 360.0`)).toBe(false);
  });
});

describe('what this phone keeps', () => {
  it('reads only what was written as it should be', () => {
    expect(readKept(null)).toEqual({});
    expect(readKept('not json')).toEqual({});
    expect(readKept('[1]')).toEqual({});
    expect(readKept('{"firstDay":"2026-11-16","answered":true,"installed":true}')).toEqual({
      firstDay: '2026-11-16',
      answered: true,
      installed: true,
    });
    expect(readKept('{"firstDay":"16 Nov","answered":"yes","installed":1,"other":2}')).toEqual({});
  });
});

describe('on Home, once, on the second day someone uses their own plan (D546)', () => {
  it('not on the first day, then on any later day', () => {
    expect(suggestOnHome(state(), '2026-11-16')).toBe(false);
    expect(suggestOnHome(state(), '2026-11-17')).toBe(true);
    expect(suggestOnHome(state(), '2026-12-25')).toBe(true);
    // Before Home has shown the person's own plan at all.
    expect(suggestOnHome(state({ kept: {} }), '2026-11-17')).toBe(false);
  });

  it('never again once answered or on the home screen, and never on a laptop', () => {
    expect(
      suggestOnHome(state({ kept: { firstDay: '2026-11-16', answered: true } }), '2026-11-17'),
    ).toBe(false);
    expect(
      suggestOnHome(state({ kept: { firstDay: '2026-11-16', installed: true } }), '2026-11-17'),
    ).toBe(false);
    expect(suggestOnHome(state({ asApp: true }), '2026-11-17')).toBe(false);
    expect(suggestOnHome(state({ phone: 'other' }), '2026-11-17')).toBe(false);
    expect(suggestOnHome(state({ phone: 'iphone', safari: true }), '2026-11-17')).toBe(true);
  });
});

describe('before setup, on an iPhone in Safari only (D546, D549)', () => {
  const iphone = state({ phone: 'iphone', safari: true, kept: {} });
  it('before setup starts, and never again once answered or on the Home Screen', () => {
    expect(suggestOnWelcome(iphone, false)).toBe(true);
    expect(suggestOnWelcome(iphone, true)).toBe(false);
    expect(suggestOnWelcome({ ...iphone, kept: { answered: true } }, false)).toBe(false);
    expect(suggestOnWelcome({ ...iphone, kept: { installed: true } }, false)).toBe(false);
    expect(suggestOnWelcome({ ...iphone, asApp: true }, false)).toBe(false);
  });

  it('not on Android, a laptop, or another browser on an iPhone', () => {
    expect(suggestOnWelcome(state({ kept: {} }), false)).toBe(false);
    expect(suggestOnWelcome(state({ phone: 'other', kept: {} }), false)).toBe(false);
    expect(suggestOnWelcome({ ...iphone, safari: false }, false)).toBe(false);
  });
});

/** A PNG's width, height and top left pixel, read from the file itself. */
function pngFacts(file: string) {
  const data = readFileSync(file);
  expect(data.subarray(1, 4).toString('latin1')).toBe('PNG');
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const colourType = data[25];
  const chunks: Buffer[] = [];
  for (let at = 8; at < data.length; ) {
    const length = data.readUInt32BE(at);
    const type = data.subarray(at + 4, at + 8).toString('latin1');
    if (type === 'IDAT') chunks.push(data.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  // The first row's first pixel comes straight after its filter byte, whatever the filter.
  const first = inflateSync(Buffer.concat(chunks)).subarray(1, 4);
  const corner = `#${first.toString('hex')}`;
  return { width, height, colourType, corner };
}

describe('the opening screen on an iPhone (D550)', () => {
  it('has a picture for every iPhone size, light and dark, at its exact size and colours', () => {
    expect(IPHONE_SCREENS.length).toBe(13);
    const files = new Set<string>();
    for (const screen of IPHONE_SCREENS) {
      for (const colours of ['light', 'dark'] as const) {
        const file = splashFile(screen, colours);
        files.add(file);
        const facts = pngFacts(join(import.meta.dirname, '..', '..', 'public', file));
        expect(facts.width).toBe(screen.width * screen.scale);
        expect(facts.height).toBe(screen.height * screen.scale);
        expect(facts.corner).toBe(PAPER[colours]);
      }
    }
    // No two sizes share a file.
    expect(files.size).toBe(26);
  });

  it("is listed in every page's head for that screen, upright, in that colour scheme", () => {
    const images = startupImages();
    expect(images).toHaveLength(26);
    expect(images[0]).toEqual({
      url: '/splash/iphone-1320x2868-light.png',
      media:
        '(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)',
    });
    const se = IPHONE_SCREENS.find((one) => one.width === 375 && one.height === 667);
    expect(se === undefined ? '' : splashMedia(se, 'dark')).toContain(
      '(-webkit-device-pixel-ratio: 2)',
    );
  });
});

describe("the opening screen's colours in dark mode, for when Android reads them (D550)", () => {
  it("are the dark paper colour, in the manifest standard's own member", () => {
    expect(Reflect.get(manifest(), 'color_scheme_dark')).toEqual({
      background_color: PAPER.dark,
      theme_color: PAPER.dark,
    });
    expect(manifest().background_color).toBe(PAPER.light);
  });
});

describe('a long press of the icon on Android (D551)', () => {
  it('offers Update balance and I spent, each opening its sheet on Home', () => {
    const shortcuts = manifest().shortcuts ?? [];
    expect(shortcuts.map((one) => [one.name, one.url])).toEqual([
      [strings.actions.updateBalance, '/app/#update-balance'],
      [strings.actions.spent, '/app/#i-spent'],
    ]);
    // Android asks for an icon of at least 96 by 96 beside each.
    for (const one of shortcuts) {
      expect(one.icons?.[0]?.sizes).toBe('192x192');
    }
    expect(shortcutFor('#update-balance')).toBe('update-balance');
    expect(shortcutFor('#i-spent')).toBe('spent');
    expect(shortcutFor('')).toBeNull();
    expect(shortcutFor('#')).toBeNull();
    expect(shortcutFor('#id=abc')).toBeNull();
    expect(shortcutFor('#balance')).toBeNull();
    expect(Object.keys(SHORTCUTS)).toEqual(['update-balance', 'spent']);
  });
});
