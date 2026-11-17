// The few lines in front of PrePenny's files on Cloudflare
// (cloudflare/worker.ts): a page is sent exactly one security policy, its
// own, whatever order Cloudflare applies the rules in (PLAN.md item 89, D559).

import { describe, expect, it } from 'vitest';
import worker, { onePolicy } from '../../cloudflare/worker.ts';
import { inLiveOrder } from '../../e2e/live-order.ts';

const GENERAL = "default-src 'self'; script-src 'self' 'sha256-notFoundPage='";
const FRONT = "default-src 'self'; script-src 'self' 'sha256-frontPage='";
const APP = "default-src 'self'; script-src 'self' 'sha256-home='";

/** Rules as scripts/write-headers.ts writes them: the general one first, then each page's. */
const RULES = [
  '# Sent with every file by Cloudflare (D68).',
  '/*',
  `  Content-Security-Policy: ${GENERAL}`,
  '  X-Content-Type-Options: nosniff',
  '',
  '/sw.js',
  '  Cache-Control: no-cache',
  '',
  "# Each page's own security policy.",
  '/',
  '  ! Content-Security-Policy',
  `  Content-Security-Policy: ${FRONT}`,
  '/app/',
  '  ! Content-Security-Policy',
  `  Content-Security-Policy: ${APP}`,
  '',
].join('\n');

/**
 * What Cloudflare sends for an address, applying each rule that matches in
 * the order given, as its own code does (workers-shared,
 * asset-worker/src/utils/headers.ts, in Wrangler 4.151.3): "!" takes a header
 * off, then each header is put on, beside one an earlier rule put on.
 */
function cloudflare(rules: string, path: string): Response {
  const response = new Response('<!doctype html>', { status: 200 });
  const putOn = new Set<string>();
  let applies = false;
  for (const line of rules.split('\n')) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = line.trim();
      applies = pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern;
      continue;
    }
    if (!applies) continue;
    const off = /^\s+! (.+)$/.exec(line);
    if (off?.[1] !== undefined) {
      response.headers.delete(off[1]);
      continue;
    }
    const [, name = '', value = ''] = /^\s+([^:]+): (.*)$/.exec(line) ?? [];
    if (putOn.has(name.toLowerCase())) response.headers.append(name, value);
    else {
      response.headers.set(name, value);
      putOn.add(name.toLowerCase());
    }
  }
  return response;
}

describe('one security policy per page', () => {
  it("in the rules file's order, the front page gets its own policy alone, and nothing changes", () => {
    const sent = cloudflare(RULES, '/');
    expect(sent.headers.get('Content-Security-Policy')).toBe(FRONT);
    expect(onePolicy(sent)).toBe(sent);
  });

  it("in the live site's order, the front page gets its own and the general one, and keeps only its own", () => {
    const sent = cloudflare(inLiveOrder(RULES), '/');
    expect(sent.headers.get('Content-Security-Policy')).toBe(`${FRONT}, ${GENERAL}`);
    const kept = onePolicy(sent);
    expect(kept.headers.get('Content-Security-Policy')).toBe(FRONT);
    expect(kept.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(kept.status).toBe(200);
  });

  it('in either order, every other page and the not-found page keep the one they are sent', () => {
    for (const rules of [RULES, inLiveOrder(RULES)]) {
      expect(onePolicy(cloudflare(rules, '/app/')).headers.get('Content-Security-Policy')).toBe(
        APP,
      );
      expect(
        onePolicy(cloudflare(rules, '/no-such-page/')).headers.get('Content-Security-Policy'),
      ).toBe(GENERAL);
    }
  });

  it('a response with no policy is passed on as it is', () => {
    const plain = new Response(null, { status: 304 });
    expect(onePolicy(plain)).toBe(plain);
  });

  it("the worker keeps the page's own policy, its file and its other headers", async () => {
    const env = {
      ASSETS: {
        fetch: async () => {
          const response = cloudflare(inLiveOrder(RULES), '/');
          return new Response('the front page', response);
        },
      },
    };
    const served = await worker.fetch(new Request('https://prepenny.co.uk/'), env);
    expect(served.headers.get('Content-Security-Policy')).toBe(FRONT);
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await served.text()).toBe('the front page');
  });

  it('the old address still moves a page to prepenny.co.uk, without asking for the file', async () => {
    let asked = false;
    const env = {
      ASSETS: {
        fetch: async () => {
          asked = true;
          return new Response('');
        },
      },
    };
    const moved = await worker.fetch(
      new Request('https://prepenny.prepenny.workers.dev/app/?x=1', {
        headers: { 'Sec-Fetch-Mode': 'navigate' },
      }),
      env,
    );
    expect(moved.status).toBe(301);
    expect(moved.headers.get('Location')).toBe('https://prepenny.co.uk/app/?x=1');
    expect(asked).toBe(false);
  });
});

describe("the test copy's rules in the live site's order (e2e/live-order.ts)", () => {
  it("moves only the front page's rule, to just before the general one", () => {
    const lines = inLiveOrder(RULES).split('\n');
    expect(lines.indexOf('/')).toBeLessThan(lines.indexOf('/*'));
    expect(lines.slice(lines.indexOf('/'), lines.indexOf('/') + 3)).toEqual([
      '/',
      '  ! Content-Security-Policy',
      `  Content-Security-Policy: ${FRONT}`,
    ]);
    expect([...lines].sort()).toEqual([...RULES.split('\n')].sort());
  });

  it('stops if the rules are not as scripts/write-headers.ts writes them', () => {
    expect(() => inLiveOrder(RULES.replace('\n/\n', '\n/home/\n'))).toThrow(/"\/\*" and then "\/"/);
    expect(() => inLiveOrder(inLiveOrder(RULES))).toThrow(/"\/\*" and then "\/"/);
  });
});
