// How wide a big figure is, so it can grow with the phone's text size as far
// as its card allows and still stay on one line (D175). The widths are
// Figtree Bold's own, with tabular figures, in em.

const widths: Readonly<Record<string, number>> = {
  '£': 0.595,
  '.': 0.248,
  ',': 0.257,
  '−': 0.632,
  '+': 0.632,
};

/** A figure's width in em, such as 4.003 for "£267.54". */
export function figureWidth(text: string): number {
  let width = 0;
  for (const char of text) width += widths[char] ?? 0.632;
  return Math.round(width * 1000) / 1000;
}

/**
 * The CSS variable the big figures' size is worked out from. `extra` is room
 * for words beside the figure on the same line, in the figure's own em, as
 * "About" and "now" on Home (D430).
 */
export function figureStyle(text: string, extra = 0) {
  return {
    '--figure-width': String(Math.round((figureWidth(text) + extra) * 1000) / 1000),
  } as Record<string, string>;
}
