// Step 4k (D643, D645): the status page's address, and telling PrePenny's
// server not answering apart from the phone's own signal.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const live = vi.hoisted(() => ({ version: null as { database: string; build: string } | null }));
vi.mock('../../lib/version.ts', () => ({ liveVersion: async () => live.version }));
vi.mock('../../lib/sign-in-config.ts', () => ({
  signInConfig: () => ({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    key: 'sb_publishable_test',
  }),
}));

const { answeredBy, serverDownNow, watchServer } = await import('../../lib/server-status.ts');
const { statusPageUrl } = await import('../../lib/status-page.ts');

/** What the status function says about saving: working, not, or no answer at all. */
let saving: 'working' | 'not' | 'no answer' = 'working';
const asked: string[] = [];

beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const address = String(input);
    asked.push(address);
    if (saving === 'no answer') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ part: 'saving', working: saving === 'working' }), {
      status: saving === 'working' ? 200 : 503,
    });
  });
  live.version = { database: '20261125200000', build: 'live' };
  saving = 'working';
  asked.length = 0;
  // Each test starts with the server answering.
  await watchServer(async () => new Response('{}', { status: 200 }))('https://server.test/');
  expect(serverDownNow()).toBe(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const answers = (status: number) => watchServer(async () => new Response('{}', { status }));
const noAnswer = watchServer(async () => {
  throw new TypeError('Failed to fetch');
});
/** Waits for any check a failure started: every answer here comes at once. */
const checked = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('An answer from the server, or its gateway saying it is down', () => {
  it("counts PrePenny's own answers, refusals and errors included, as answering", () => {
    for (const status of [200, 204, 400, 401, 403, 404, 409, 429, 500]) {
      expect(answeredBy(status), String(status)).toBe(true);
    }
  });

  it("counts the gateway's down answers, and Cloudflare's own, as not answering", () => {
    for (const status of [502, 503, 504, 520, 522, 540, 546]) {
      expect(answeredBy(status), String(status)).toBe(false);
    }
  });
});

describe('The server not answering a phone that has a signal (D645)', () => {
  it('says the server is down when it gives no answer, the site answers, and saving does not work', async () => {
    saving = 'not';
    await answers(503)('https://server.test/rest/v1/rpc/hello').catch(() => undefined);
    await checked();
    expect(serverDownNow()).toBe(true);
    expect(asked).toEqual([
      'https://abcdefghijklmnopqrst.supabase.co/functions/v1/status?part=saving',
    ]);
    // The next answer from the server ends it.
    await answers(200)('https://server.test/rest/v1/rpc/hello');
    expect(serverDownNow()).toBe(false);
  });

  it('says so when no request reaches it at all, and the status check gets no answer either', async () => {
    saving = 'no answer';
    await expect(noAnswer('https://server.test/rest/v1/rpc/hello')).rejects.toThrow();
    await checked();
    expect(serverDownNow()).toBe(true);
  });

  it("is the phone, not the server, when PrePenny's own site doesn't answer either", async () => {
    live.version = null;
    saving = 'not';
    await expect(noAnswer('https://server.test/rest/v1/rpc/hello')).rejects.toThrow();
    await checked();
    expect(serverDownNow()).toBe(false);
    // The server isn't asked again: the phone's signal is the problem.
    expect(asked).toEqual([]);
  });

  it('is a blip, not the server, when the server says saving works once asked again', async () => {
    saving = 'working';
    await expect(noAnswer('https://server.test/rest/v1/rpc/hello')).rejects.toThrow();
    await checked();
    expect(serverDownNow()).toBe(false);
  });

  it('is never the server when the phone has no signal: the offline note says so', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    saving = 'not';
    await expect(noAnswer('https://server.test/rest/v1/rpc/hello')).rejects.toThrow();
    await checked();
    expect(serverDownNow()).toBe(false);
    expect(asked).toEqual([]);
  });

  it('leaves out a request PrePenny itself stopped, as signing out does', async () => {
    saving = 'not';
    const stopped = new AbortController();
    stopped.abort();
    await expect(
      noAnswer('https://server.test/rest/v1/rpc/hello', { signal: stopped.signal }),
    ).rejects.toThrow();
    await checked();
    expect(serverDownNow()).toBe(false);
    expect(asked).toEqual([]);
  });
});

describe("The status page's address (D643)", () => {
  it('is the address given, when it is a plain https address', () => {
    expect(statusPageUrl('https://stats.uptimerobot.com/AbCdEf123')).toBe(
      'https://stats.uptimerobot.com/AbCdEf123',
    );
    expect(statusPageUrl('  https://status.prepenny.co.uk/  ')).toBe(
      'https://status.prepenny.co.uk/',
    );
  });

  it('is none until one is given, and never anything but a plain https address', () => {
    expect(statusPageUrl(undefined)).toBeNull();
    expect(statusPageUrl('')).toBeNull();
    expect(statusPageUrl('http://stats.uptimerobot.com/AbCdEf')).toBeNull();
    expect(statusPageUrl('javascript:alert(1)')).toBeNull();
    expect(statusPageUrl('https://stats.uptimerobot.com/a b')).toBeNull();
    expect(statusPageUrl('https://stats.uptimerobot.com/?from=app')).toBeNull();
    expect(statusPageUrl(`https://stats.uptimerobot.com/${'a'.repeat(200)}`)).toBeNull();
  });
});
