// Checks that Cloudflare Access let a request through to the support
// dashboard (step 4j, D641), as Cloudflare's own documentation says to:
// "To secure your origin, you must validate the application token issued by
// Cloudflare Access." Access signs each request it allows with a token in
// the Cf-Access-Jwt-Assertion header. This checks, with the public keys
// Access publishes for the team, that the token is Access's own (RS256),
// for this application (its AUD tag), from this team, and not out of date.
// Nothing about the request is kept or written anywhere.

/** The team's address and the application's AUD tag, from GitHub variables at deploy. */
export interface AccessSettings {
  /** "yourteam.cloudflareaccess.com". */
  readonly team: string;
  readonly aud: string;
}

/** One of the team's public keys, as Access publishes them. */
export interface AccessKey extends JsonWebKey {
  readonly kid: string;
}

/** Fetches the team's public keys: Cloudflare publishes them at /cdn-cgi/access/certs. */
export type KeysFor = (team: string) => Promise<readonly AccessKey[]>;

const TEAM = /^[a-z0-9-]+\.cloudflareaccess\.com$/;
/** Cloudflare's AUD tags are 64 letters and numbers; any long one is taken, as Cloudflare doesn't promise the length. */
const AUD = /^[0-9a-f]{32,128}$/;
/** A minute either way for the clocks of Cloudflare's machines. */
const LEEWAY_S = 60;

/** The settings, or null when they're missing or aren't the right shape: then nothing is let through. */
export function accessSettings(team: unknown, aud: unknown): AccessSettings | null {
  if (typeof team !== 'string' || typeof aud !== 'string') return null;
  const cleanTeam = team.trim().toLowerCase();
  const cleanAud = aud.trim().toLowerCase();
  return TEAM.test(cleanTeam) && AUD.test(cleanAud) ? { team: cleanTeam, aud: cleanAud } : null;
}

function bytesOf(part: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(part)) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    return Uint8Array.from(binary, (letter) => letter.charCodeAt(0));
  } catch {
    return null;
  }
}

function jsonOf(part: string): Record<string, unknown> | null {
  const bytes = bytesOf(part);
  if (bytes === null) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** True only for a token Access signed for this application, now. */
export async function accessAllows(
  token: string | null,
  settings: AccessSettings,
  keysFor: KeysFor,
  nowMs: number,
): Promise<boolean> {
  if (token === null) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = jsonOf(headerPart);
  const payload = jsonOf(payloadPart);
  const signature = bytesOf(signaturePart);
  if (header === null || payload === null || signature === null) return false;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return false;

  const now = nowMs / 1000;
  if (payload.iss !== `https://${settings.team}`) return false;
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(settings.aud)) return false;
  if (typeof payload.exp !== 'number' || payload.exp + LEEWAY_S <= now) return false;
  if (
    payload.nbf !== undefined &&
    (typeof payload.nbf !== 'number' || payload.nbf - LEEWAY_S > now)
  ) {
    return false;
  }

  const key = (await keysFor(settings.team)).find((one) => one.kid === header.kid);
  if (key === undefined || key.kty !== 'RSA') return false;
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      { kty: key.kty, n: key.n, e: key.e } as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      signature as Uint8Array<ArrayBuffer>,
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
  } catch {
    return false;
  }
}

/** The team's keys, fetched from Cloudflare, kept for 10 minutes, as Access changes them every 6 weeks. */
export function fetchedKeys(fetcher: typeof fetch = fetch): KeysFor {
  let kept: { team: string; at: number; keys: readonly AccessKey[] } | null = null;
  return async (team) => {
    if (kept !== null && kept.team === team && Date.now() - kept.at < 10 * 60 * 1000) {
      return kept.keys;
    }
    const response = await fetcher(`https://${team}/cdn-cgi/access/certs`);
    if (!response.ok) return [];
    const body = (await response.json()) as { keys?: unknown };
    const keys = Array.isArray(body.keys)
      ? (body.keys.filter(
          (one) => one !== null && typeof one === 'object' && typeof one.kid === 'string',
        ) as AccessKey[])
      : [];
    kept = { team, at: Date.now(), keys };
    return keys;
  };
}
