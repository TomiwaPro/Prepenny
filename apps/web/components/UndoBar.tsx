'use client';

// The undo bar after every change (brief Part 3, principle 4; ARCHITECTURE.md
// 4.5): "Rent changed for this and all later ones. Undo". Screen readers
// hear it when it appears: the bar is its own live region, or sits in one
// that's always there (`announce={false}`), which screen readers hear more
// reliably. Without `onUndo` it's a message only, such as "Change undone.".

import { strings } from '../strings/en-GB.ts';
import styles from './UndoBar.module.css';

export interface UndoBarProps {
  readonly message: string;
  readonly onUndo?: () => void;
  /** Floating above the navigation (the default), or in the page's flow. */
  readonly placement?: 'floating' | 'inline';
  /** False when it sits inside a live region that's always on the page. */
  readonly announce?: boolean;
}

export function UndoBar({
  message,
  onUndo,
  placement = 'floating',
  announce = true,
}: UndoBarProps) {
  return (
    <div
      className={`${styles.bar} ${placement === 'floating' ? styles.floating : ''}`}
      role={announce ? 'status' : undefined}
      data-testid="undo-bar"
      data-undo-bar={placement}
    >
      <p className={styles.message} tabIndex={-1} data-undo-message>
        {message}
      </p>
      {onUndo === undefined ? null : (
        <button type="button" className={styles.undo} onClick={onUndo}>
          {strings.undo.undo}
        </button>
      )}
    </div>
  );
}
