// The root of every page: the language, the one font (Figtree, self-hosted,
// D23), the colours, the home-screen app details and, on a pull request's
// preview, the line saying it's a test version (D407).

import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { PreviewLine } from '../components/PreviewLine.tsx';
import { ServiceWorker } from '../components/ServiceWorker.tsx';
import { coloursScript, PAPER } from '../lib/theme.ts';
import { strings } from '../strings/en-GB.ts';
import '../styles/tokens.css';
import '../styles/globals.css';

// Served from PrePenny's own site, never from Google (D23). Latin covers
// every letter, the £ sign and the proper minus sign (D169).
const figtree = localFont({
  src: [
    {
      path: '../node_modules/@fontsource/figtree/files/figtree-latin-400-normal.woff2',
      weight: '400',
    },
    {
      path: '../node_modules/@fontsource/figtree/files/figtree-latin-500-normal.woff2',
      weight: '500',
    },
    {
      path: '../node_modules/@fontsource/figtree/files/figtree-latin-600-normal.woff2',
      weight: '600',
    },
    {
      path: '../node_modules/@fontsource/figtree/files/figtree-latin-700-normal.woff2',
      weight: '700',
    },
  ],
  variable: '--font-figtree',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: { default: strings.app.name, template: strings.app.title('%s') },
  description: strings.app.description,
  applicationName: strings.app.name,
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: strings.app.name, statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: PAPER.light },
    { media: '(prefers-color-scheme: dark)', color: PAPER.dark },
  ],
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en-GB" className={figtree.variable} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own fixed script, no data in it */}
        <script dangerouslySetInnerHTML={{ __html: coloursScript }} />
      </head>
      <body>
        <PreviewLine />
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
