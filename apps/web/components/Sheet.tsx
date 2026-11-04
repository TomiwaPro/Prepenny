'use client';

// Editing opens here (brief Part 6, DESIGN.md): a bottom sheet on phones and
// a centred dialog on laptops. It's the browser's own dialog element, styled
// with PrePenny's tokens, so it gets the keyboard, focus and screen reader
// behaviour for free (D56). Escape or the Close button closes it. Under its
// title, one plain sentence says what the sheet is for (D213).

import { type ReactNode, useEffect, useId, useRef } from 'react';
import { strings } from '../strings/en-GB.ts';
import styles from './Sheet.module.css';

export interface SheetProps {
  readonly open: boolean;
  readonly title: string;
  /** What the sheet is for, in one plain sentence, under its title (D213). */
  readonly intro?: string | null;
  /** The words on the button that closes it: "Close", or "Done" where every choice applies at once. */
  readonly closeLabel?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function Sheet({
  open,
  title,
  intro = null,
  closeLabel = strings.sheet.close,
  onClose,
  children,
}: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const introId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    // A tap on the dim area around the sheet closes it too. Escape does the
    // same from the keyboard, so no key handler is needed here.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes the dialog
    <dialog
      ref={dialog}
      className={styles.sheet}
      aria-labelledby={titleId}
      aria-describedby={intro === null ? undefined : introId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.inner}>
        <span className={styles.handle} aria-hidden="true" />
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose}>
            {closeLabel}
          </button>
        </div>
        {intro === null ? null : (
          <p id={introId} className={styles.intro}>
            {intro}
          </p>
        )}
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}
