'use client';

// The undo bar after every change (brief Part 3, principle 4; ARCHITECTURE.md
// 4.5): "Rent changed for this and all later ones. Undo". Screen readers
// hear it when it appears. Without `onUndo` it's a message only, such as
// "Change undone.".

import { strings } from '../strings/en-GB.ts';
import styles from './UndoBar.module.css';

export interface UndoBarProps {
  readonly message: string;
  readonly onUndo?: () => void;
  /** Floating above the navigation (the default), or in the page's flow. */
  readonly placement?: 'floating' | 'inline';
}

export function UndoBar({ message, onUndo, placement = 'floating' }: UndoBarProps) {
  return (
    <div
      className={`${styles.bar} ${placement === 'floating' ? styles.floating : ''}`}
      role="status"
      data-testid="undo-bar"
    >
      <p className={styles.message}>{message}</p>
      {onUndo === undefined ? null : (
        <button type="button" className={styles.undo} onClick={onUndo}>
          {strings.undo.undo}
        </button>
      )}
    </div>
  );
}
