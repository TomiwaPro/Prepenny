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
// tests, is served exactly as before. Nothing about a request is kept or
// written anywhere.

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const to = movedTo(request);
    if (to !== null) {
      return new Response(null, { status: 301, headers: { Location: to } });
    }
    return env.ASSETS.fetch(request);
  },
};
