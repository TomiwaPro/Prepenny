// PrePenny's own web address (D304): prepenny.co.uk. The live app also had
// an older address on Cloudflare, prepenny.prepenny.workers.dev (D68), which
// now sends people to the same page on prepenny.co.uk (step 3f-2, D428):
// Cloudflare does it for a page opened fresh (cloudflare/worker.ts), and the
// app itself for a phone whose offline helper still serves the old address.
//
// A pull request's preview (pr-31-prepenny.prepenny.workers.dev) and this
// computer's own copy keep their own address: only the old live one moves.

/** The live app's address. */
export const LIVE_SITE = 'https://prepenny.co.uk';

/** The live app's old address on Cloudflare, which sends people to LIVE_SITE. */
export const OLD_LIVE_HOST = 'prepenny.prepenny.workers.dev';

type Where = Pick<Location, 'origin' | 'hostname'>;
type Page = Pick<Location, 'hostname' | 'pathname' | 'search' | 'hash'>;

/**
 * The address links to PrePenny use, such as an invite link: the live app's
 * own, even when the phone has the old address open, and the address in use
 * on a preview or on this computer, where the link has to come back to it.
 */
export function siteOrigin(where: Where = window.location): string {
  return where.hostname === OLD_LIVE_HOST ? LIVE_SITE : where.origin;
}

/** The same page on prepenny.co.uk, for a page opened at the old address; null anywhere else. */
export function liveAddressFor(page: Page): string | null {
  if (page.hostname !== OLD_LIVE_HOST) return null;
  return `${LIVE_SITE}${page.pathname}${page.search}${page.hash}`;
}
