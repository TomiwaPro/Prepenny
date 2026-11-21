// The support dashboard's few lines on Cloudflare (admin/cloudflare/worker.ts,
// step 4j, D641): nothing of the dashboard is served unless the request came
// to admin.prepenny.co.uk and Cloudflare Access signed it for the dashboard's
// own application, now. Every other address (prepenny.co.uk, a workers.dev
// address, a preview link) and every request Access didn't sign gets "This
// page isn't here." and none of the dashboard's files.

import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type AccessKey, accessSettings, fetchedKeys } from '../../admin/cloudflare/access.ts';
import worker, { type Env, mayServe, NOT_HERE } from '../../admin/cloudflare/worker.ts';
import { supportStrings } from '../../strings/support-en-GB.ts';

const TEAM = 'prepenny-test.cloudflareaccess.com';
const AUD = 'a'.repeat(64);
const NOW = Date.UTC(2026, 10, 21, 12, 0, 0);

/** A key pair, as Access has, and its public half as Access publishes it. */
function keyPair(kid: string) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  return { privateKey, published: { ...jwk, kid, alg: 'RS256', use: 'sig' } as AccessKey };
}

const access = keyPair('access-key-1');
const stranger = keyPair('stranger-key');

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** A token as Access signs one, with anything changed that a test asks for. */
function token(
  claims: Record<string, unknown> = {},
  { key = access.privateKey, kid = 'access-key-1', alg = 'RS256' } = {},
): string {
  const header = base64url(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: `https://${TEAM}`,
      aud: [AUD],
      email: 'sam@example.com',
      iat: NOW / 1000 - 60,
      nbf: NOW / 1000 - 60,
      exp: NOW / 1000 + 3600,
      ...claims,
    }),
  );
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), key);
  return `${header}.${payload}.${base64url(signature)}`;
}

const keysFor = async (team: string) => (team === TEAM ? [access.published] : []);

const env = (more: Partial<Env> = {}): Env => ({
  ASSETS: {
    fetch: async () =>
      new Response('<h1>Support</h1>', {
        headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'" },
      }),
  },
  ADMIN_HOST: 'admin.prepenny.co.uk',
  ACCESS_TEAM_DOMAIN: TEAM,
  ACCESS_AUD: AUD,
  ...more,
});

const request = (url: string, jwt: string | null = token()) =>
  new Request(url, jwt === null ? {} : { headers: { 'Cf-Access-Jwt-Assertion': jwt } });

describe('The support dashboard on Cloudflare', () => {
  it('serves admin.prepenny.co.uk when Access signed the request for the dashboard, now', async () => {
    expect(await mayServe(request('https://admin.prepenny.co.uk/'), env(), keysFor, NOW)).toBe(
      true,
    );
    // Its files too: every one goes through this first (run_worker_first).
    expect(
      await mayServe(
        request('https://admin.prepenny.co.uk/_next/static/x.js'),
        env(),
        keysFor,
        NOW,
      ),
    ).toBe(true);
  });

  it('serves nothing at any other address: the app, workers.dev, a preview link', async () => {
    for (const url of [
      'https://prepenny.co.uk/',
      'https://prepenny.co.uk/app/support/',
      'https://prepenny-admin.prepenny.workers.dev/',
      'https://pr-49-prepenny-admin.prepenny.workers.dev/',
      'https://abc123-prepenny-admin.prepenny.workers.dev/',
      'https://admin.prepenny.co.uk.example.com/',
      'https://evil-admin.prepenny.co.uk/',
    ]) {
      expect(await mayServe(request(url), env(), keysFor, NOW), url).toBe(false);
    }
  });

  it('serves nothing that Access did not sign for this application, now', async () => {
    const refused: Record<string, string | null> = {
      'no token': null,
      'not a token': 'hello',
      'signed by someone else': token({}, { key: stranger.privateKey }),
      'a key Access never published': token({}, { key: stranger.privateKey, kid: 'stranger-key' }),
      'another team': token({ iss: 'https://someone-else.cloudflareaccess.com' }),
      'another application': token({ aud: ['b'.repeat(64)] }),
      'out of date': token({ exp: NOW / 1000 - 120 }),
      'not yet': token({ nbf: NOW / 1000 + 600 }),
      'with no end': token({ exp: undefined }),
      'an unsigned token': token({}, { alg: 'none' }),
    };
    for (const [why, jwt] of Object.entries(refused)) {
      expect(
        await mayServe(request('https://admin.prepenny.co.uk/', jwt), env(), keysFor, NOW),
        why,
      ).toBe(false);
    }
    // A signed token with its words changed afterwards.
    const [header, , signature] = token().split('.');
    const changed = `${header}.${base64url(JSON.stringify({ iss: `https://${TEAM}`, aud: AUD, exp: NOW / 1000 + 9999, email: 'someone@example.com' }))}.${signature}`;
    expect(
      await mayServe(request('https://admin.prepenny.co.uk/', changed), env(), keysFor, NOW),
    ).toBe(false);
  });

  it('serves nothing until the Access settings are given, or when they are wrong', async () => {
    for (const more of [
      { ACCESS_TEAM_DOMAIN: undefined },
      { ACCESS_AUD: undefined },
      { ACCESS_TEAM_DOMAIN: '' },
      { ACCESS_TEAM_DOMAIN: 'prepenny.co.uk' },
      { ACCESS_AUD: 'not-a-tag' },
      { ADMIN_HOST: undefined },
      { ADMIN_HOST: '' },
    ] as Partial<Env>[]) {
      expect(
        await mayServe(request('https://admin.prepenny.co.uk/'), env(more), keysFor, NOW),
        JSON.stringify(more),
      ).toBe(false);
    }
    expect(accessSettings(` ${TEAM.toUpperCase()} `, AUD)).toEqual({ team: TEAM, aud: AUD });
  });

  it('answers a refused request with "This page isn\'t here." and none of the dashboard', async () => {
    expect(NOT_HERE).toBe(`${supportStrings.supportDashboard.notFound}.`);
    const answer = await worker.fetch(request('https://prepenny.co.uk/', null), env());
    expect(answer.status).toBe(404);
    expect(await answer.text()).toBe(NOT_HERE);
    expect(answer.headers.get('Cache-Control')).toBe('no-store');
    expect(answer.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it("fetches Access's published keys from the team's own address, and keeps them a while", async () => {
    const asked: string[] = [];
    const keys = fetchedKeys(async (url) => {
      asked.push(String(url));
      return new Response(JSON.stringify({ keys: [access.published, { kty: 'RSA' }] }));
    });
    expect((await keys(TEAM)).map((one) => one.kid)).toEqual(['access-key-1']);
    await keys(TEAM);
    expect(asked).toEqual([`https://${TEAM}/cdn-cgi/access/certs`]);
  });
});
