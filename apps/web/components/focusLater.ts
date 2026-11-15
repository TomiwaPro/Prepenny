// Moves focus a moment later, once React has drawn what it's for: a new
// form's first box after "Add another", or "Add another" once a row has gone
// (WCAG 2.4.3). Only if focus is still where it was when this was asked for,
// or nowhere: on a slow phone that moment can come late, and by then the
// person may already be typing in another box. Taking the cursor from it
// would put what they type in the wrong box (D533, found by setup test 6 on
// GitHub, where "453.77" went into the debt's name).

/** Focuses what `target` finds once the next frame is drawn, unless focus has moved on since. */
export function focusLater(
  target: () => HTMLElement | null | undefined,
  from: Element | null = typeof document === 'undefined' ? null : document.activeElement,
): void {
  requestAnimationFrame(() => {
    const now = document.activeElement;
    if (now !== null && now !== document.body && now !== from) return;
    target()?.focus();
  });
}
