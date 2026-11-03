import type { NextConfig } from 'next';

// A static export (D17): plain files, no server, so the same build can become
// the phone apps with Capacitor in Phase 6.
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  images: { unoptimized: true },
  transpilePackages: ['@prepenny/engine'],
};

export default config;
