// Builds the service worker after `next build` (ARCHITECTURE.md 1.1): bundles
// service-worker/sw.ts with esbuild and lists every file of the static
// export in it, so the whole app works offline.

import { readFileSync } from 'node:fs';
import { pageRevision } from './scripts/page-policies.ts';

/**
 * The offline helper keeps each page with the headers it was fetched with,
 * its security policy included, and fetches a page again only when its
 * version changes. So each page's version comes from its file and the
 * headers Cloudflare sends with it: a phone that has PrePenny already gets
 * every page again, with its new policy, when only the policy changes (step
 * 4b, D529). Needs out/_headers, which scripts/write-headers.ts writes first.
 * @type {import('@serwist/build').ManifestTransform}
 */
function pagesWithTheirHeaders(entries) {
  const headers = readFileSync(new URL('./out/_headers', import.meta.url), 'utf8');
  const manifest = entries.map((entry) => {
    if (!entry.url.endsWith('.html') || entry.revision === null) return entry;
    return { ...entry, revision: pageRevision(entry.revision, headers, entry.url) };
  });
  return { manifest, warnings: [] };
}

/** @type {import('@serwist/cli').BuildOptions} */
export default {
  swSrc: 'service-worker/sw.ts',
  swDest: 'out/sw.js',
  globDirectory: 'out',
  globPatterns: ['**/*.{html,js,css,woff2,png,svg,webmanifest,json,txt}'],
  // version.json says which version is live now, so it's always fetched fresh (lib/version.ts),
  // and so is the bank holiday list, which can change without a new version (step 4c, D537).
  // An iPhone fetches its one opening screen only when PrePenny is added to its
  // Home Screen, so the 26 aren't downloaded to every phone (step 4d, D550).
  // The help pages are reached by plain links only, so Next.js's data for
  // moving between pages isn't needed for them: their pages are kept, and
  // about 1.3 MB less is downloaded to every phone (step 4g, D588).
  globIgnores: [
    'help/**/*.txt',
    'app/help/**/*.txt',
    'sw.js',
    'version.json',
    'bank-holidays.json',
    'splash/**',
    '**/*.map',
    '404/**',
    '_not-found/**',
  ],
  // Turbopack's file names already change with their contents.
  dontCacheBustURLsMatching: /^_next\/static\//,
  manifestTransforms: [pagesWithTheirHeaders],
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  esbuildOptions: { minify: true, target: 'es2022', legalComments: 'none' },
};
