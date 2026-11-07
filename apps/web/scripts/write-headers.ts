// Writes the one Supabase address the app signs in with into the security
// policy of the built app (out/_headers), after `next build` (step 3b, PLAN.md
// item 20). The policy in public/_headers allows connections to PrePenny's
// own site only; this adds exactly that address, and no other: its web
// address, and from step 3c the same address for the live nudges, which
// arrive over a WebSocket ("wss:", or "ws:" for the local one in the tests).
// With signing in switched off, nothing is added.
//
// Usage: node scripts/write-headers.ts

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { signInConfig } from '../lib/sign-in-config.ts';

const file = join(import.meta.dirname, '..', 'out', '_headers');
const headers = readFileSync(file, 'utf8');
const ownSiteOnly = "connect-src 'self';";
if (!headers.includes(ownSiteOnly)) {
  throw new Error(`out/_headers should say "${ownSiteOnly}" before the sign-in address is added.`);
}
const config = signInConfig();
if (config !== null) {
  const live = config.url.replace(/^http/, 'ws');
  writeFileSync(file, headers.replace(ownSiteOnly, `connect-src 'self' ${config.url} ${live};`));
  console.log(`Security policy: connections to PrePenny's own site and ${config.url} only.`);
} else {
  console.log("Security policy: signing in is off, so connections to PrePenny's own site only.");
}
