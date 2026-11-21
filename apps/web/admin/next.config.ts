// The support dashboard (step 4j, D641): its own site, built on its own from
// this folder, with only the dashboard's page in it. It reuses the app's
// screens, words and styles from the folders above, but none of the app's
// pages are in it, and the dashboard's page isn't in the app. A static
// export (D17), as the app is: plain files, put online by Cloudflare at
// admin.prepenny.co.uk only (wrangler.jsonc), behind Cloudflare Access.
// scripts/build-admin.ts builds it.

import { join } from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  images: { unoptimized: true },
  transpilePackages: ['@prepenny/engine'],
  // The dashboard's code comes from apps/web and the engine, outside this folder.
  turbopack: { root: join(import.meta.dirname, '..', '..', '..') },
};

export default config;
