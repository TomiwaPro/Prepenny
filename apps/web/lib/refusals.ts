// The words for a change the engine refused (D87). The engine answers with a
// short code; people only ever see a sentence from the strings file, never
// the code (CLAUDE.md: plain English, and no codes on screen).

import { strings } from '../strings/en-GB.ts';

type Refusals = typeof strings.refusals;

export function refusalMessage(code: string): string {
  return Object.hasOwn(strings.refusals, code)
    ? strings.refusals[code as keyof Refusals]
    : strings.refusals.other;
}
