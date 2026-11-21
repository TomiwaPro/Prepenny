// Writes the security policy of the built app (out/_headers), after `next
// build` and before the offline helper is built:
//
// - the one Supabase address the app signs in with (step 3b, PLAN.md item
//   20). The policy in public/_headers allows connections to PrePenny's own
//   site only; this adds exactly that address, and no other: its web address,
//   and from step 3c the same address for the live nudges, which arrive over
//   a WebSocket ("wss:", or "ws:" for the local one in the tests). With
//   signing in switched off, nothing is added.
// - each page's own scripts, listed exactly (step 4b, D529): the not-found
//   page's in the general rule, and a rule of its own for every other page
//   (scripts/page-policies.ts). public/_headers allows no script written
//   into a page at all, so a page left out couldn't run, rather than run
//   anything.
//
// Usage: node scripts/write-headers.ts [folder]
// The folder is out/ unless given: the support dashboard's is admin/out
// (scripts/build-admin.ts, D641).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { signInConfig } from '../lib/sign-in-config.ts';
import { inlineScripts, type Page, scriptHash, writePolicies } from './page-policies.ts';

const given = process.argv[2];
const out = given === undefined ? join(import.meta.dirname, '..', 'out') : resolve(given);
const file = join(out, '_headers');
let headers = readFileSync(file, 'utf8');
const ownSiteOnly = "connect-src 'self';";
if (!headers.includes(ownSiteOnly)) {
  throw new Error(`out/_headers should say "${ownSiteOnly}" before the sign-in address is added.`);
}
const config = signInConfig();
if (config !== null) {
  const live = config.url.replace(/^http/, 'ws');
  headers = headers.replace(ownSiteOnly, () => `connect-src 'self' ${config.url} ${live};`);
  console.log(`Security policy: connections to PrePenny's own site and ${config.url} only.`);
} else {
  console.log("Security policy: signing in is off, so connections to PrePenny's own site only.");
}

/** Every page Next.js built, as its path inside out/. */
function pagesIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => relative(out, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .sort();
}

const pages: Page[] = pagesIn(out).map((page) => ({
  file: page,
  hashes: inlineScripts(readFileSync(join(out, page), 'utf8')).map(scriptHash),
}));
writeFileSync(file, writePolicies(headers, pages));
const scripts = new Set(pages.flatMap((page) => page.hashes)).size;
console.log(
  `Security policy: ${pages.length} pages, each allowed only its own scripts (${scripts} different ones in all), and script files from PrePenny's own site.`,
);
