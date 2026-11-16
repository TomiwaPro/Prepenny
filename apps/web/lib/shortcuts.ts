// The two shortcuts a long press of PrePenny's icon offers on Android (step
// 4d, D551): each opens Home with its sheet open. They're after a "#", so
// the offline helper serves Home for them as it is, with no signal too, and
// nothing about them reaches PrePenny's site.

export const SHORTCUTS = {
  'update-balance': '/app/#update-balance',
  spent: '/app/#i-spent',
} as const;

export type ShortcutSheet = keyof typeof SHORTCUTS;

/** Which of Home's sheets an address opens, if any. */
export function shortcutFor(hash: string): ShortcutSheet | null {
  for (const [sheet, url] of Object.entries(SHORTCUTS) as [ShortcutSheet, string][]) {
    if (url.slice(url.indexOf('#')) === hash) return sheet;
  }
  return null;
}
