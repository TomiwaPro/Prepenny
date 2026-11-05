'use client';

// The undo bar after every change (brief Part 3, principle 4; ARCHITECTURE.md
// 4.5): "Rent changed for this and all later ones. Undo". Screen readers
// hear it when it appears: the bar is its own live region, or sits in one
// that's always there (`announce={false}`), which screen readers hear more
// reliably. Without `onUndo` it's a message only, such as "Change undone.".
//
// With very large text the bar shows shorter words, such as "Rent changed.",
// so the bar and the navigation never cover half the screen (D284).

import { useSyncExternalStore } from 'react';
import { strings } from '../strings/en-GB.ts';
import styles from './UndoBar.module.css';

/**
 * The screen is short for its text size: fewer than 30 lines of text tall.
 * That's 200% text on any phone, and 150% on a small one; it also catches a
 * page zoomed in, which makes the screen fewer CSS pixels tall.
 */
export function isShortForItsText(): boolean {
  if (typeof window === 'undefined') return false;
  const line = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(line) && line > 0 && window.innerHeight < 30 * line;
}

function onResize(callback: () => void) {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

export interface UndoBarProps {
  readonly message: string;
  /** Shorter words for very large text (D284). The same as `message` when that's short already. */
  readonly short?: string;
  readonly onUndo?: () => void;
  /** Floating above the navigation (the default), or in the page's flow. */
  readonly placement?: 'floating' | 'inline';
  /** False when it sits inside a live region that's always on the page. */
  readonly announce?: boolean;
}

export function UndoBar({
  message,
  short = message,
  onUndo,
  placement = 'floating',
  announce = true,
}: UndoBarProps) {
  const shortWords = useSyncExternalStore(onResize, isShortForItsText, () => false);
  return (
    <div
      className={`${styles.bar} ${placement === 'floating' ? styles.floating : ''}`}
      role={announce ? 'status' : undefined}
      data-testid="undo-bar"
      data-undo-bar={placement}
      data-words={message}
    >
      <p className={styles.message} tabIndex={-1} data-undo-message>
        {shortWords ? short : message}
      </p>
      {onUndo === undefined ? null : (
        <button type="button" className={styles.undo} onClick={onUndo}>
          {strings.undo.undo}
        </button>
      )}
    </div>
  );
}
