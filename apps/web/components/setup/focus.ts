// Moves focus to the first box with a mistake, so it's read out with its
// explanation (WCAG 3.3.1, D203). In a group of choices, the one picked, or
// the first.

export function focusFirst(ids: readonly string[]) {
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element === null) continue;
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
      element.focus();
      return;
    }
    const inside =
      element.querySelector<HTMLInputElement>('input:checked') ??
      element.querySelector<HTMLInputElement>('input');
    (inside ?? element).focus();
    return;
  }
}
