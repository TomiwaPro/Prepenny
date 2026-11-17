// The check of the live site after each update (step 4b, D530):
// scripts/check-live-site.ts. A small server on this computer stands in for
// Cloudflare: it serves a built app's pages with their headers, and, when
// asked, does what Cloudflare did to the live site on 14 Nov 2026.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkOnce,
  comparePage,
  expectedHeader,
  headerNotes,
} from '../../scripts/check-live-site.ts';
import { scriptHash, writePolicies } from '../../scripts/page-policies.ts';

/** Exactly what Cloudflare wrote into every live page on 14 Nov 2026, with its token made up. */
const BEACON =
  '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/vce701823e78c4301a35b7e07294d87301792088814092" integrity="sha512-UKNk8GbxkABxKcXYuLkO16EleLGUkcvJWtpSNmExE0Too3ZaFAxTscNWEc1OdAv5/BikHawapSCaiD2XCmp+Bw==" data-cf-beacon=\'{"version":"2024.11.0","token":"0123456789abcdef0123456789abcdef","r":1,"spa":2}\' crossorigin="anonymous"></script>';

const NEL = '{"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}';

const GENERAL =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'";

const page = (script: string) =>
  `<!DOCTYPE html><html><head><script>${script}</script></head><body><h1>PrePenny</h1></body></html>`;

const FILES: Record<string, string> = {
  'index.html': page('welcome()'),
  'app/index.html': page('home()'),
  '404.html': page('missing()'),
};

let out: string;
let headers: string;
let server: Server;
let site: string;
/** What the stand-in for Cloudflare does: nothing, or what it did to the live site. */
let cloudflare: {
  beacon: boolean;
  nel: boolean;
  older: boolean;
  /** Policies sent instead of each page's own: one, or more than one, each on a line of its own. */
  policy: string | readonly string[] | null;
  status?: number;
} = { beacon: false, nel: false, older: false, policy: null };

/**
 * Each address's policy, written out here rather than worked out by the
 * code being tested, as Cloudflare would send it.
 */
const withScript = (script: string) =>
  GENERAL.replace("script-src 'self'", `script-src 'self' ${scriptHash(script)}`);
const POLICIES: Record<string, string> = {
  '/': withScript('welcome()'),
  '/app/': withScript('home()'),
};

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'prepenny-out-'));
  mkdirSync(join(out, 'app'));
  for (const [file, html] of Object.entries(FILES)) writeFileSync(join(out, file), html);
  headers = writePolicies(`/*\n  Content-Security-Policy: ${GENERAL}\n`, [
    { file: 'index.html', hashes: [scriptHash('welcome()')] },
    { file: 'app/index.html', hashes: [scriptHash('home()')] },
    { file: '404.html', hashes: [scriptHash('missing()')] },
  ]);
  writeFileSync(join(out, '_headers'), headers);
  server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname;
    const file = path === '/' ? 'index.html' : path === '/app/' ? 'app/index.html' : '404.html';
    let body = FILES[file] as string;
    if (cloudflare.older) body = body.replace('PrePenny', 'PrePenny, the version before');
    if (cloudflare.beacon) body = body.replace('</body>', `${BEACON}\n</body>`);
    response.statusCode = cloudflare.status ?? (file === '404.html' ? 404 : 200);
    response.setHeader('Content-Type', 'text/html');
    response.setHeader(
      'Content-Security-Policy',
      cloudflare.policy ?? POLICIES[path] ?? withScript('missing()'),
    );
    if (cloudflare.nel) {
      response.setHeader('NEL', NEL);
      response.setHeader(
        'Report-To',
        '{"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=x"}]}',
      );
    }
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  rmSync(out, { recursive: true, force: true });
});

describe('the live site, checked after an update', () => {
  it('passes when every page is exactly as built, with its own policy', async () => {
    cloudflare = { beacon: false, nel: false, older: false, policy: null };
    const result = await checkOnce(site, out);
    expect(result.pages).toBe(2);
    expect(result.findings).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it("fails on Cloudflare's Real User Monitoring (RUM) script, naming it as Cloudflare does, on every page", async () => {
    cloudflare = { beacon: true, nel: false, older: false, policy: null };
    const result = await checkOnce(site, out);
    expect(result.findings.map((one) => one.kind)).toEqual([
      'cloudflare',
      'cloudflare',
      'cloudflare',
    ]);
    expect(result.findings[0]?.words).toBe(
      '/: Cloudflare wrote its Real User Monitoring (RUM) script (static.cloudflareinsights.com) into the page.',
    );
  });

  it("says which page's policy a page was sent instead of its own, such as the general one", async () => {
    // As on the live site on 15 Nov 2026, when "/" was sent a policy other than its own (D553).
    cloudflare = { beacon: false, nel: false, older: false, policy: withScript('missing()') };
    const result = await checkOnce(site, out);
    expect(result.findings.map((one) => one.kind)).toEqual(['policy', 'policy']);
    expect(result.findings[0]?.words).toBe(
      `/ has a different security policy from the one written for it: it was sent the general one, written for the not-found page. Its scripts part: script-src 'self' ${scriptHash('missing()')}`,
    );
    cloudflare = { beacon: false, nel: false, older: false, policy: withScript('home()') };
    const other = await checkOnce(site, out);
    expect(other.findings[0]?.words).toBe(
      `/ has a different security policy from the one written for it: it was sent the one written for /app/. Its scripts part: script-src 'self' ${scriptHash('home()')}`,
    );
  });

  it('names each policy a page was sent when it was sent more than one', async () => {
    // As on the live site on 17 Nov 2026: "/" was sent its own, then the general one (D559).
    cloudflare = {
      beacon: false,
      nel: false,
      older: false,
      policy: [withScript('welcome()'), withScript('missing()')],
    };
    const result = await checkOnce(site, out);
    expect(result.findings[0]?.words).toBe(
      `/ has a different security policy from the one written for it: it was sent 2 policies, and a browser applies every one: its own, then the general one, written for the not-found page. Its scripts part: script-src 'self' ${scriptHash('welcome()')}, then script-src 'self' ${scriptHash('missing()')}`,
    );
    expect(result.findings[1]?.words).toBe(
      `/app/ has a different security policy from the one written for it: it was sent 2 policies, and a browser applies every one: the one written for /, then the general one, written for the not-found page. Its scripts part: script-src 'self' ${scriptHash('welcome()')}, then script-src 'self' ${scriptHash('missing()')}`,
    );
  });

  it('fails when a page has a different security policy, such as the one from before step 4b', async () => {
    cloudflare = {
      beacon: false,
      nel: false,
      older: false,
      policy: GENERAL.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
    };
    const result = await checkOnce(site, out);
    expect(result.findings.map((one) => one.kind)).toEqual(['policy', 'policy', 'policy']);
  });

  it("notes Cloudflare's network error reports as a warning, not a failure", async () => {
    cloudflare = { beacon: false, nel: true, older: false, policy: null };
    const result = await checkOnce(site, out);
    expect(result.findings).toEqual([]);
    expect(result.notes).toEqual([
      '"nel": asks phones to report failed connections to Cloudflare (Network Error Logging), with nothing about money in them',
      '"report-to": says where phones send those reports (Network Error Logging), with nothing about money in them',
    ]);
  });

  it('a server error, or no answer at all, is worth asking again', async () => {
    cloudflare = { beacon: false, nel: false, older: false, policy: null, status: 503 };
    const result = await checkOnce(site, out);
    expect(result.findings.map((one) => one.kind)).toEqual([
      'unreachable',
      'unreachable',
      'unreachable',
    ]);
    expect(result.findings[0]?.words).toBe('/ answered with a server error, 503.');
    // An address where nothing answers.
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));
    const nobody = await checkOnce(`http://127.0.0.1:${port}`, out);
    expect(nobody.findings.map((one) => one.kind)).toEqual([
      'unreachable',
      'unreachable',
      'unreachable',
    ]);
    expect(nobody.findings[0]?.words).toBe("/ didn't answer: TypeError.");
  });

  it('says when a page is still the version before, so it can be asked for again', async () => {
    cloudflare = { beacon: false, nel: false, older: true, policy: null };
    const result = await checkOnce(site, out);
    expect(result.findings.map((one) => one.kind)).toEqual(['older', 'older', 'older']);
  });
});

describe('one page', () => {
  it('names each thing Cloudflare can write into a page', () => {
    const built = page('home()');
    const served = (body: string) => ({ status: 200, body, headers: new Headers() });
    const words = (body: string) => comparePage('/app/', built, undefined, served(body))[0]?.words;
    expect(
      words(
        built.replace(
          '</body>',
          '<a class="__cf_email__" href="/cdn-cgi/l/email-protection">[email&#160;protected]</a></body>',
        ),
      ),
    ).toBe('/app/: Cloudflare wrote its Email Address Obfuscation into the page.');
    expect(
      words(
        built.replace(
          '</body>',
          '<script>(function(){a.src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"})()</script></body>',
        ),
      ),
    ).toBe('/app/: Cloudflare wrote its bot checks (JavaScript detections) into the page.');
    expect(
      words(
        built.replace(
          '</body>',
          '<script src="/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js"></script></body>',
        ),
      ),
    ).toBe('/app/: Cloudflare wrote its Rocket Loader into the page.');
    expect(
      words(built.replace('</body>', '<script src="/cdn-cgi/zaraz/i.js"></script></body>')),
    ).toBe('/app/: Cloudflare wrote its Zaraz into the page.');
    expect(
      words(built.replace('</body>', '<script src="/cdn-cgi/new-thing.js"></script></body>')),
    ).toBe('/app/: Cloudflare wrote something else of its own (under /cdn-cgi/) into the page.');
  });

  it('expects the status the page should have', () => {
    const served = { status: 403, body: '', headers: new Headers() };
    expect(comparePage('/app/', 'x', undefined, served)[0]?.words).toBe(
      '/app/ answered 403, not 200.',
    );
  });

  it('reads the policy Cloudflare sends for an address, as it applies the rules', () => {
    expect(expectedHeader(headers, '/app/', 'content-security-policy')).toBe(
      `${GENERAL.replace("script-src 'self'", `script-src 'self' ${scriptHash('home()')}`)}`,
    );
    expect(expectedHeader(headers, '/no-such-page/', 'content-security-policy')).toBe(
      `${GENERAL.replace("script-src 'self'", `script-src 'self' ${scriptHash('missing()')}`)}`,
    );
    expect(expectedHeader(headers, '/app/', 'x-not-there')).toBeUndefined();
  });

  it('notes a cookie or fetching ahead too', () => {
    const headersWith = new Headers({
      'Set-Cookie': '__cf_bm=x',
      'Speculation-Rules': '"/cdn-cgi/speculation"',
    });
    expect(headerNotes(headersWith)).toEqual([
      '"set-cookie": keeps a cookie on the phone, which PrePenny never sets itself',
      '"speculation-rules": asks phones to fetch pages ahead (Speed Brain)',
    ]);
  });
});

describe('what a wrong policy says', () => {
  it("names only the scripts part, never the rest, such as the database's address", () => {
    const served = {
      status: 200,
      body: 'x',
      headers: new Headers({
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://abcdefghijklmnopqrst.supabase.co",
      }),
    };
    const [finding] = comparePage('/app/', 'x', "script-src 'self'", served);
    expect(finding?.words).toBe(
      "/app/ has a different security policy from the one written for it: it was sent one this build didn't write. Its scripts part: script-src 'self' 'unsafe-inline'",
    );
  });
});
