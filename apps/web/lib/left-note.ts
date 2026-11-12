'use client';

// "You've left the plan" (D468), kept for this visit only: leaving brings
// the person's new plan down in place of the shared one, and the app starts
// afresh on Home with it, so the words wait here to be shown there. Nothing
// about money or the plan is kept: only whether the copy came.

const KEY = 'prepenny-left';

export type LeftNote = 'copied' | 'not-copied' | 'own-only';

export function keepLeftNote(note: LeftNote): void {
  try {
    sessionStorage.setItem(KEY, note);
  } catch {
    // No storage here: the note isn't shown, and nothing else changes.
  }
}

export function leftNote(): LeftNote | null {
  try {
    const kept = sessionStorage.getItem(KEY);
    return kept === 'copied' || kept === 'not-copied' || kept === 'own-only' ? kept : null;
  } catch {
    return null;
  }
}

export function forgetLeftNote(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}
