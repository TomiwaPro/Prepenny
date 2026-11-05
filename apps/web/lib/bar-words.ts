// What the undo bar says after a change: its full words, and shorter ones
// for very large text, so the bar never covers half the screen (D284). A
// change whose words are already short gives one string for both.

export interface BarWords {
  readonly full: string;
  /** Shown instead of `full` when the screen is short for its text size. */
  readonly short: string;
}

export type ChangeWords = string | BarWords;

export function barWords(words: ChangeWords): BarWords {
  return typeof words === 'string' ? { full: words, short: words } : words;
}

/** The full words, for places that keep a change's words as text, such as What if's list. */
export function fullWords(words: ChangeWords): string {
  return typeof words === 'string' ? words : words.full;
}
