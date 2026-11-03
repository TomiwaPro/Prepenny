import { describe, expect, it } from 'vitest';
import { figureStyle, figureWidth } from '../../lib/figure.ts';

describe('figureWidth (D175)', () => {
  it('adds up Figtree Bold’s widths, with tabular figures', () => {
    expect(figureWidth('£267.54')).toBe(4.003);
    expect(figureWidth('£4.53')).toBe(2.739);
    expect(figureWidth('−£95.47')).toBe(4.003);
    expect(figureWidth('£3,304.87')).toBe(4.892);
  });

  it('gives the CSS variable the figures are sized from', () => {
    expect(figureStyle('£4.53')).toEqual({ '--figure-width': '2.739' });
  });
});
