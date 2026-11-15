// The security policy of each page, listing exactly the small scripts
// written into that page (step 4b, PLAN.md items 10 and 31, D529).
//
// Next.js writes a few small scripts into every page it builds: the one
// that sets Light or Dark before the page shows (D173), its loader, and the
// page's own content. The policy allowed any script written into a page
// ('unsafe-inline') so they could run, which also let a script slipped into
// a page run. Now each page's policy lists the fingerprint (SHA-256) of each
// of its own scripts and no others, so a script that isn't PrePenny's own
// can't run. Script files are allowed from PrePenny's own address only, as
// before ('self').
//
// Cloudflare sends a page's headers from out/_headers (D68): a general rule
// for everything, then one rule for each page that takes the general
// policy off and puts the page's own on. The not-found page is sent for any
// address with no file, so its scripts are in the general rule.

import { createHash } from 'node:crypto';

/** Cloudflare's limits for _headers, from Wrangler 4.151.3's own reading of it. */
export const MAX_RULES = 100;
export const MAX_LINE_LENGTH = 2000;

const POLICY = 'Content-Security-Policy';

/** Pages served for an address with no file of its own: their scripts go in the general rule. */
export const NOT_FOUND_PAGES: readonly string[] = [
  '404.html',
  '404/index.html',
  '_not-found/index.html',
];

/**
 * The text of each script written into a page, exactly as the browser
 * fingerprints it: everything between <script ...> and </script>, for
 * each script with no src. Script files (with src) are allowed by address.
 */
export function inlineScripts(html: string): string[] {
  const found: string[] = [];
  // A browser reads every line ending as "\n" before anything else, so a
  // script's text, and its fingerprint, never has "\r" in it. A script ends
  // at "</script" followed by a space, "/" or ">", as a browser ends it.
  // Anything stranger (a quote in an unquoted value, a script inside a
  // comment) reads differently here than in the browser: the page's own
  // script is then refused, and the page fails visibly, never the other way.
  for (const match of html
    .replace(/\r\n?/g, '\n')
    .matchAll(/<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script(?=[\s/>])[^>]*>/gi)) {
    const attributes = match[1] ?? '';
    if (/(?:^|\s)src\s*=/i.test(attributes)) continue;
    found.push(match[2] ?? '');
  }
  return found;
}

/** A script's fingerprint as a security policy names it: 'sha256-…'. */
export function scriptHash(text: string): string {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/**
 * The address a page's file is served at: "app/index.html" at "/app/",
 * "index.html" at "/". Null for the not-found pages, which are sent for
 * any address with no file.
 */
export function servedAt(file: string): string | null {
  if (NOT_FOUND_PAGES.includes(file)) return null;
  if (file === 'index.html') return '/';
  if (!file.endsWith('/index.html'))
    throw new Error(`${file} isn't a page Cloudflare serves at its own address.`);
  return `/${file.slice(0, -'index.html'.length)}`;
}

/** The policy with the scripts it allows added to script-src, each once, in order. */
export function withScripts(policy: string, hashes: readonly string[]): string {
  const parts = policy.split(';').map((part) => part.trim());
  const at = parts.findIndex((part) => part.startsWith('script-src '));
  if (at === -1) throw new Error('The security policy has no script-src.');
  const scriptSrc = parts[at] as string;
  if (scriptSrc.split(/\s+/).includes("'unsafe-inline'")) {
    throw new Error(
      "The security policy's script-src allows any script written into a page ('unsafe-inline'). It lists each one instead (D529).",
    );
  }
  parts[at] = [scriptSrc, ...[...new Set(hashes)]].join(' ');
  return parts.filter((part) => part !== '').join('; ');
}

/** One page: where it's served, and the fingerprints of its scripts. */
export interface Page {
  readonly file: string;
  readonly hashes: readonly string[];
}

/** The general rule's policy line in _headers. */
function generalPolicy(headers: string): { readonly line: string; readonly policy: string } {
  const lines = headers.split('\n');
  const start = lines.findIndex((line) => line.trim() === '/*');
  if (start === -1) throw new Error('_headers has no general rule ("/*").');
  for (let at = start + 1; at < lines.length; at += 1) {
    const line = lines[at] as string;
    if (!/^\s/.test(line) || line.trim() === '') break;
    const found = new RegExp(`^\\s*${POLICY}:\\s*(.*)$`).exec(line);
    if (found !== null) return { line, policy: (found[1] as string).trim() };
  }
  throw new Error(`_headers' general rule has no ${POLICY}.`);
}

/**
 * _headers with each page's own policy: the not-found pages' scripts in
 * the general rule, and a rule for every other page with its own.
 */
export function writePolicies(headers: string, pages: readonly Page[]): string {
  const general = generalPolicy(headers);
  const notFound = pages
    .filter((page) => servedAt(page.file) === null)
    .flatMap((page) => page.hashes);
  const indent = /^\s*/.exec(general.line)?.[0] ?? '  ';
  let text = headers.replace(
    general.line,
    () => `${indent}${POLICY}: ${withScripts(general.policy, notFound)}`,
  );
  const own = pages
    .filter((page) => servedAt(page.file) !== null)
    .sort((a, b) => (servedAt(a.file) as string).localeCompare(servedAt(b.file) as string));
  const rules = own.map(
    (page) =>
      `${servedAt(page.file)}\n  ! ${POLICY}\n  ${POLICY}: ${withScripts(general.policy, page.hashes)}\n`,
  );
  text = `${text.trimEnd()}\n\n# Each page's own security policy, listing exactly the scripts written into\n# it (step 4b, D529). Written by scripts/write-headers.ts after the build.\n${rules.join('')}`;
  checkLimits(text);
  return text;
}

/** Stops the build when Cloudflare would skip part of _headers, rather than serving pages without their policy. */
export function checkLimits(headers: string): void {
  const lines = headers.split('\n');
  const long = lines.findIndex((line) => line.trim().length > MAX_LINE_LENGTH);
  if (long !== -1) {
    throw new Error(
      `Line ${long + 1} of out/_headers is ${lines[long]?.trim().length} characters long. Cloudflare skips a line over ${MAX_LINE_LENGTH}, so that page would go out without its security policy.`,
    );
  }
  const rules = lines.filter((line) => line.startsWith('/')).length;
  if (rules > MAX_RULES) {
    throw new Error(
      `out/_headers has ${rules} rules. Cloudflare reads only the first ${MAX_RULES}, so some pages would go out without their security policy: the policies need another way to be sent (D529).`,
    );
  }
}

/**
 * Whether a _headers rule's pattern matches an address: "/*" and
 * "/_next/static/*" end in a star, others are exact. Cloudflare also reads
 * placeholders (":name"), a star elsewhere and other hosts, which PrePenny
 * doesn't use: such a rule stops the build, rather than the offline helper's
 * versions and the live check going quietly wrong.
 */
function matches(pattern: string, path: string): boolean {
  if (!pattern.startsWith('/') || pattern.includes(':') || pattern.slice(0, -1).includes('*')) {
    throw new Error(
      `out/_headers has a rule for "${pattern}", which scripts/page-policies.ts can't read: only exact addresses, and addresses ending in "*".`,
    );
  }
  return pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern;
}

/**
 * Every rule of _headers that applies to an address, in order, as text: what
 * Cloudflare sends with it. The offline helper keeps a page with the headers
 * it came with, so a page's kept copy is fetched again when these change
 * (serwist.config.js).
 */
export function rulesFor(headers: string, path: string): string {
  const applying: string[] = [];
  let current: string[] | null = null;
  for (const line of headers.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = matches(line.trim(), path) ? [line.trim()] : null;
      if (current !== null) applying.push(...current);
      continue;
    }
    if (current !== null) applying.push(line.trim());
  }
  return applying.join('\n');
}

/**
 * A page's version for the offline helper: from its file's own version and
 * the headers Cloudflare sends with it, so a phone fetches the page again
 * when only its policy changes (serwist.config.js).
 */
export function pageRevision(revision: string, headers: string, file: string): string {
  const rules = rulesFor(headers, servedAt(file) ?? `/${file}`);
  return createHash('sha256').update(`${revision}\n${rules}`).digest('hex').slice(0, 32);
}
