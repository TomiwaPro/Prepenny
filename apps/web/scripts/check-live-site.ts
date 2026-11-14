// Checks the live site's pages are PrePenny's own, after each update goes
// live (step 4b, PLAN.md items 20 and 31, D530). Run by the Deploy workflow
// straight after `wrangler deploy`, with the same build it put online.
//
// Cloudflare can add things of its own to the pages it serves: on 14 Nov
// 2026 it wrote its Web Analytics script into every live page. So every page
// is fetched as a phone opens it, and must be exactly the file that was
// built, with exactly the security policy written for it (D529). Anything
// Cloudflare wrote into a page, or a different policy, fails the check and
// says what it is. Headers Cloudflare adds that ask a phone to send it
// something (network error reports) or set a cookie are warnings: they hold
// nothing about money, and the owner chooses whether to switch them off
// (README.md part N).
//
// Just after an update, Cloudflare can still send the version before it for
// a few seconds, so a page that's simply the older version is fetched again,
// for up to 2 minutes, before the check fails.
//
// Usage: node scripts/check-live-site.ts [https://prepenny.co.uk]

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { LIVE_SITE } from '../lib/site.ts';
import { rulesFor, servedAt } from './page-policies.ts';

const OUT = join(import.meta.dirname, '..', 'out');
const POLICY = 'content-security-policy';

/** Things Cloudflare can write into a page, and how to recognise them. */
export const CLOUDFLARE_ADDITIONS: readonly { readonly name: string; readonly mark: RegExp }[] = [
  {
    name: "Cloudflare's Web Analytics script",
    mark: /static\.cloudflareinsights\.com|data-cf-beacon/,
  },
  {
    name: "Cloudflare's Email Address Obfuscation",
    mark: /__cf_email__|\/cdn-cgi\/l\/email-protection/,
  },
  {
    name: "Cloudflare's bot checks (JavaScript detections)",
    mark: /\/cdn-cgi\/challenge-platform\//,
  },
  { name: "Cloudflare's Rocket Loader", mark: /rocket-loader|data-cf-settings/ },
  { name: "Cloudflare's Zaraz", mark: /\/cdn-cgi\/zaraz\// },
  { name: 'something else of Cloudflare’s', mark: /\/cdn-cgi\// },
];

/** Headers Cloudflare can add that send something from the phone, or keep something on it. */
export const CLOUDFLARE_HEADERS: readonly { readonly name: string; readonly what: string }[] = [
  {
    name: 'nel',
    what: 'asks phones to report failed connections to Cloudflare (Network Error Logging)',
  },
  { name: 'report-to', what: 'says where phones send those reports (Network Error Logging)' },
  { name: 'set-cookie', what: 'keeps a cookie on the phone' },
  { name: 'speculation-rules', what: 'asks phones to fetch pages ahead (Speed Brain)' },
];

/** Every page that was built, and the address it's served at. */
export function builtPages(out = OUT): { readonly path: string; readonly file: string }[] {
  return readdirSync(out, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => relative(out, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .flatMap((file) => {
      const path = servedAt(file);
      return path === null ? [] : [{ path, file }];
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** The value Cloudflare sends for a header at an address, from _headers, as it applies the rules. */
export function expectedHeader(headers: string, path: string, name: string): string | undefined {
  let value: string | undefined;
  let set = false;
  for (const line of rulesFor(headers, path).split('\n')) {
    if (line.toLowerCase() === `! ${name}`) {
      value = undefined;
      continue;
    }
    const at = line.indexOf(':');
    if (at === -1 || line.startsWith('/') || line.slice(0, at).trim().toLowerCase() !== name)
      continue;
    const next = line.slice(at + 1).trim();
    value = set && value !== undefined ? `${value}, ${next}` : next;
    set = true;
  }
  return value;
}

/** What one page looks like on the live site. */
export interface Served {
  readonly status: number;
  readonly body: string;
  readonly headers: Headers;
}

/** What's wrong with one page, if anything. */
export interface Finding {
  readonly path: string;
  /** "older" when it's simply not the new version yet, so worth asking again. */
  readonly kind: 'cloudflare' | 'policy' | 'older' | 'status';
  readonly words: string;
}

/** Compares a page from the live site with the file that was built and its policy. */
export function comparePage(
  path: string,
  built: string,
  expectedPolicy: string | undefined,
  served: Served,
  expectedStatus = 200,
): Finding[] {
  const found: Finding[] = [];
  if (served.status !== expectedStatus) {
    found.push({
      path,
      kind: 'status',
      words: `${path} answered ${served.status}, not ${expectedStatus}.`,
    });
    return found;
  }
  if (served.body !== built) {
    const added = CLOUDFLARE_ADDITIONS.filter(
      (one) => one.mark.test(served.body) && !one.mark.test(built),
    );
    if (added.length > 0) {
      // "Something else" only when nothing more exact matched.
      const exact = added.filter((one) => one !== CLOUDFLARE_ADDITIONS.at(-1));
      const named = exact.length > 0 ? exact : added;
      found.push({
        path,
        kind: 'cloudflare',
        words: `${path}: Cloudflare wrote ${named.map((one) => one.name).join(' and ')} into the page.`,
      });
    } else {
      found.push({ path, kind: 'older', words: `${path} isn't the page that was just built.` });
    }
  }
  const policy = served.headers.get(POLICY) ?? undefined;
  if (policy !== expectedPolicy) {
    found.push({
      path,
      kind: 'policy',
      words: `${path} has a different security policy from the one written for it. Its scripts part: ${
        policy === undefined
          ? 'none at all'
          : (/(?:^|;\s*)(script-src [^;]*)/.exec(policy)?.[1] ?? 'none')
      }`,
    });
  }
  return found;
}

/** Notes for headers Cloudflare added that send something from the phone, or keep something on it. */
export function headerNotes(headers: Headers): string[] {
  return CLOUDFLARE_HEADERS.filter((one) => headers.has(one.name)).map(
    (one) => `"${one.name}": ${one.what}`,
  );
}

/** Fetches a page as a phone opens it. */
async function fetchPage(site: string, path: string): Promise<Served> {
  const response = await fetch(`${site}${path}`, {
    redirect: 'manual',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-GB',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36',
    },
  });
  return { status: response.status, body: await response.text(), headers: response.headers };
}

/** Checks every page once: what's wrong, and the notes for headers. */
export async function checkOnce(site: string, out = OUT) {
  const headers = readFileSync(join(out, '_headers'), 'utf8');
  const findings: Finding[] = [];
  const notes = new Set<string>();
  const pages = [
    ...builtPages(out).map((page) => ({ ...page, status: 200 })),
    // An address with no page: Cloudflare sends the not-found page, with the general policy.
    { path: `/no-such-page-${Date.now()}/`, file: '404.html', status: 404 },
  ];
  for (const { path, file, status } of pages) {
    const served = await fetchPage(site, path);
    const built = readFileSync(join(out, file), 'utf8');
    findings.push(
      ...comparePage(path, built, expectedHeader(headers, path, POLICY), served, status),
    );
    for (const note of headerNotes(served.headers)) notes.add(note);
  }
  return { pages: pages.length, findings, notes: [...notes] };
}

async function main() {
  const site = (process.argv[2] ?? LIVE_SITE).replace(/\/$/, '');
  let result = await checkOnce(site);
  for (
    let tries = 1;
    tries < 8 && result.findings.some((one) => one.kind === 'older');
    tries += 1
  ) {
    console.log(`Some pages on ${site} are still the version before; asking again in 15 seconds.`);
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    result = await checkOnce(site);
  }
  for (const note of result.notes) {
    console.log(
      `::warning title=Cloudflare adds a header::${site} sends ${note}. It holds nothing about money. README.md part N says how to switch it off.`,
    );
  }
  if (result.findings.length > 0) {
    for (const finding of result.findings)
      console.log(`::error title=Live page not as built::${finding.words}`);
    const cloudflare = result.findings.some((one) => one.kind === 'cloudflare');
    console.log(
      `::error title=Live site::The update is online, but ${result.findings.length} ${result.findings.length === 1 ? 'thing on the live site isn’t' : 'things on the live site aren’t'} as built.${cloudflare ? ' Cloudflare is adding something of its own: README.md part N says how to switch it off.' : ''}`,
    );
    process.exit(1);
  }
  console.log(
    `Live site: ${result.pages} pages on ${site}, each exactly as built, with its own security policy, and nothing of Cloudflare's written into them.`,
  );
}

if (import.meta.main) await main();
