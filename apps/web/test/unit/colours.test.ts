// Every colour pair passes WCAG 2.2 AA, in light and dark mode (DESIGN.md,
// brief Part 6): 4.5:1 for text, 3:1 for the text box border and the focus
// outline against the colours around them (WCAG 1.4.11). The values are read
// from styles/tokens.css itself, so a changed colour can't slip through.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8').replaceAll(
  '"',
  "'",
);

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`No ${selector} in tokens.css.`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function colours(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of text.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/g)) {
    found[match[1] as string] = match[2] as string;
  }
  return found;
}

const light = colours(block(':root {'));
const dark = colours(block(":root:not([data-theme='light'])"));
const darkPicked = colours(block(":root[data-theme='dark']"));

function luminance(hex: string): number {
  const channel = (at: number) => {
    const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/** Text and the backgrounds it's shown on. */
const textPairs: readonly [string, string][] = [
  ['ink', 'paper'],
  ['ink', 'card'],
  ['ink', 'sunk'],
  ['ink-muted', 'paper'],
  ['ink-muted', 'card'],
  ['ink-muted', 'sunk'],
  ['on-navy', 'navy'],
  ['on-navy', 'navy-raised'],
  ['on-navy-muted', 'navy'],
  ['on-navy-muted', 'navy-raised'],
  ['money-in', 'paper'],
  ['money-in', 'card'],
  ['money-in', 'sunk'],
  ['tight-text', 'tight-bg'],
  ['short-text', 'short-bg'],
  ['accent-text', 'paper'],
  ['accent-text', 'card'],
  ['accent-text', 'nav-active'],
  ['ink-muted', 'nav-active'],
];

/** Lines that must be seen (WCAG 1.4.11): the text box border and the focus outline. */
const linePairs: readonly [string, string][] = [
  ['field-border', 'paper'],
  ['field-border', 'card'],
  ['field-border', 'sunk'],
  ['focus', 'paper'],
  ['focus', 'card'],
  ['focus', 'sunk'],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s mode', (_mode, palette) => {
  const pick = (name: string) => {
    const value = palette[name];
    if (value === undefined) throw new Error(`No --${name}.`);
    return value;
  };

  it.each(textPairs)('%s text on %s passes 4.5:1', (text, background) => {
    expect(contrast(pick(text), pick(background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(linePairs)('%s on %s passes 3:1', (line, background) => {
    expect(contrast(pick(line), pick(background))).toBeGreaterThanOrEqual(3);
  });
});

describe('the tokens', () => {
  it('keep the light colours DESIGN.md sets', () => {
    expect(light).toMatchObject({
      paper: '#f4efe6',
      card: '#fffdf8',
      sunk: '#efe8da',
      ink: '#1a2238',
      'ink-muted': '#4a5060',
      navy: '#14213d',
      'navy-raised': '#22304f',
      'on-navy': '#f4efe6',
      'on-navy-muted': '#c9bfa8',
      brass: '#a8864b',
      divider: '#ede5d6',
      'card-edge': '#e3d9c6',
      'button-border': '#d9d2c3',
      'nav-active': '#e6e2d6',
      'money-in': '#1e6b3a',
      'tight-text': '#7a4e00',
      'tight-bg': '#fbf0d9',
      'short-text': '#a1281e',
      'short-bg': '#fbe4e1',
    });
  });

  it('give dark mode a value for every colour role, the same both ways in', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    expect(darkPicked).toEqual(dark);
  });

  it('matches DESIGN.md’s lowest light pair, Money in on Sunk at 5.35:1', () => {
    expect(contrast(light['money-in'] as string, light.sunk as string).toFixed(2)).toBe('5.35');
  });
});
