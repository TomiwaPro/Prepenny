// After a change that takes away the button that made it, such as "Make it
// £20.99 and stop after it" or closing a debt, focus goes to the undo bar's
// Undo, so it isn't lost (WCAG 2.4.3, D186). It waits a moment for the bar
// to be drawn with the new change.

export function focusUndoBar(message: string, tries = 20): void {
  const bar = document.querySelector<HTMLElement>('[data-testid="undo-bar"]');
  const button = bar?.querySelector<HTMLElement>('button') ?? null;
  // The bar keeps its full words, even when it shows shorter ones (D284).
  const words = bar?.dataset.words ?? bar?.textContent ?? '';
  if (bar !== null && button !== null && words.includes(message)) {
    button.focus();
    return;
  }
  if (tries > 0) setTimeout(() => focusUndoBar(message, tries - 1), 50);
}
