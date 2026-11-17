// A copy of the built site with its rules in the live site's order, for
// e2e/live-order.spec.ts (D559). Run before Wrangler serves it on port 4175
// (../playwright.config.ts): `node e2e/live-order.ts`.
//
// public/_headers gives every file the general security policy ("/*"), and
// each page a rule of its own after it that takes it off and puts the page's
// own on (D529). Cloudflare's documentation says the rules come in the
// file's order, and Wrangler's own copy on this computer keeps it. The live
// site gives the front page, "/", its own rule before the general one, so
// it was sent two policies (PLAN.md item 89). Here "/"'s rule is moved to the
// top, so Wrangler does what the live site does, and the test can show the
// front page still gets exactly its own.

import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The rules with the front page's moved before the general one, as the live site applies them. */
export function inLiveOrder(headers: string): string {
  const lines = headers.split('\n');
  const front = lines.indexOf('/');
  const general = lines.indexOf('/*');
  if (front === -1 || general === -1 || general > front) {
    throw new Error(
      'The rules should have "/*" and then "/", as scripts/write-headers.ts writes them.',
    );
  }
  let end = front + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end] ?? '')) end += 1;
  const rule = lines.slice(front, end);
  const rest = [...lines.slice(0, front), ...lines.slice(end)];
  return [...rest.slice(0, general), ...rule, ...rest.slice(general)].join('\n');
}

if (import.meta.main) {
  const out = join(import.meta.dirname, '..', 'out');
  const copy = join(import.meta.dirname, '.live-order');
  rmSync(copy, { recursive: true, force: true });
  cpSync(out, copy, { recursive: true });
  writeFileSync(join(copy, '_headers'), inLiveOrder(readFileSync(join(out, '_headers'), 'utf8')));
}
