// Builds the service worker after `next build` (ARCHITECTURE.md 1.1): bundles
// service-worker/sw.ts with esbuild and lists every file of the static
// export in it, so the whole app works offline.

/** @type {import('@serwist/cli').BuildOptions} */
export default {
  swSrc: 'service-worker/sw.ts',
  swDest: 'out/sw.js',
  globDirectory: 'out',
  globPatterns: ['**/*.{html,js,css,woff2,png,svg,webmanifest,json,txt}'],
  globIgnores: ['sw.js', '**/*.map', '404/**', '_not-found/**'],
  // Turbopack's file names already change with their contents.
  dontCacheBustURLsMatching: /^_next\/static\//,
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  esbuildOptions: { minify: true, target: 'es2022', legalComments: 'none' },
};
