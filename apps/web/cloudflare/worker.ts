// The only code of PrePenny's that runs on Cloudflare (D68, D428): a few
// lines in front of the app's own files, which are served as before.
//
// A page opened at the live app's old address, prepenny.prepenny.workers.dev,
// goes to the same page on prepenny.co.uk, with its query; a browser keeps
// what follows a "#" (an invite's secret) across the move. Only a page the
// browser is opening moves: the app's other files are still served at the
// old address, so a phone that installed PrePenny there can update its
// offline helper, whose new version then moves the page itself
// (components/OldAddress.tsx).
//
// Every other address, prepenny.co.uk, a pull request's preview
// (pr-31-prepenny.prepenny.workers.dev) and this computer's own copy in the
// tests, is served as before, with one security policy per page (D559).
// Nothing about a request is kept or written anywhere.

import { LIVE_SITE, OLD_LIVE_HOST } from '../lib/site.ts';

interface Env {
  /** The app's own files, with their headers (public/_headers) and redirects (public/_redirects). */
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
}

/** True when the browser is opening a page, rather than fetching one of its files. */
function isPageVisit(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const mode = request.headers.get('Sec-Fetch-Mode');
  if (mode !== null) return mode === 'navigate';
  // Browsers too old to say: a request that asks for a web page first.
  return (request.headers.get('Accept') ?? '').startsWith('text/html');
}

/** Where a request goes instead, or null to serve it as before. */
export function movedTo(request: Request): string | null {
  const url = new URL(request.url);
  if (url.hostname !== OLD_LIVE_HOST || !isPageVisit(request)) return null;
  return `${LIVE_SITE}${url.pathname}${url.search}`;
}

/**
 * A page with exactly one security policy: its own (D559).
 *
 * public/_headers gives every file the general policy, and each page a rule
 * of its own that takes it off ("! Content-Security-Policy") and puts the
 * page's own on (D529). Cloudflare applies each rule as it comes: "!" takes
 * off only what a rule before it has put on, and a policy put on when there
 * is one already is added as a second policy. Cloudflare's documentation
 * says the rules come in the file's order, and Wrangler's own copy on this
 * computer keeps it; the live site doesn't for the front page, "/", which
 * gets its own rule before the general one, so it's sent its own policy and
 * then the general one. A browser applies every policy it's sent, so the
 * front page's own data, listed only in its own, was refused.
 *
 * In any order, a page's own policy comes first: its rule takes off
 * whatever policy came before it. Anything after it was added by the
 * general rule, so it's taken off here. A comma separates policies in the
 * header (the CSP standard), and never appears inside one of PrePenny's.
 */
export function onePolicy(response: Response): Response {
  const policies = response.headers.get('Content-Security-Policy');
  if (policies === null || !policies.includes(',')) return response;
  const own = policies.slice(0, policies.indexOf(',')).trim();
  const kept = new Response(response.body, response);
  kept.headers.set('Content-Security-Policy', own);
  return kept;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const to = movedTo(request);
    if (to !== null) {
      return new Response(null, { status: 301, headers: { Location: to } });
    }
    return onePolicy(await env.ASSETS.fetch(request));
  },
};
