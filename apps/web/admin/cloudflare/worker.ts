// The support dashboard's few lines on Cloudflare (step 4j, D641), in front
// of every one of its files. A request is served only when both hold:
//
// - it came to admin.prepenny.co.uk, the dashboard's one address. The
//   dashboard has no workers.dev address and no preview links
//   (wrangler.jsonc), so this is a second lock on the same door.
// - Cloudflare Access let it through, and signed it (cloudflare/access.ts):
//   the dashboard is never served without Access in front of it, even if
//   Access were switched off by mistake.
//
// Anything else gets "This page isn't here." and nothing of the dashboard.
// Then the database still checks support's own account, with two-step
// sign-in passed, for every step (app.support_only). Nothing about a
// request is kept or written anywhere.

import { onePolicy } from '../../cloudflare/worker.ts';
import {
  type AccessSettings,
  accessAllows,
  accessSettings,
  fetchedKeys,
  type KeysFor,
} from './access.ts';

export interface Env {
  /** The dashboard's own files, with their headers (public/_headers). */
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
  /** "admin.prepenny.co.uk", from wrangler.jsonc. */
  readonly ADMIN_HOST?: string;
  /** From GitHub variables at deploy (README.md, part W). */
  readonly ACCESS_TEAM_DOMAIN?: string;
  readonly ACCESS_AUD?: string;
}

/** The same words as supportStrings.supportDashboard.notFound, kept here so this file stays small. */
export const NOT_HERE = "This page isn't here.";

/** True when the request may be served. */
export async function mayServe(
  request: Request,
  env: Env,
  keysFor: KeysFor,
  nowMs: number,
): Promise<boolean> {
  const host = new URL(request.url).hostname;
  if (env.ADMIN_HOST === undefined || env.ADMIN_HOST === '' || host !== env.ADMIN_HOST)
    return false;
  const settings: AccessSettings | null = accessSettings(env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
  if (settings === null) return false;
  return accessAllows(request.headers.get('Cf-Access-Jwt-Assertion'), settings, keysFor, nowMs);
}

const keys = fetchedKeys();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!(await mayServe(request, env, keys, Date.now()))) {
      return new Response(NOT_HERE, {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    return onePolicy(await env.ASSETS.fetch(request));
  },
};
