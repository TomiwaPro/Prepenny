// The root of the support dashboard's one page (step 4j, D641, D642): the
// language, the one font (Figtree, self-hosted, D23) and the colours, as in
// the app. Nothing that keeps anything on the computer: no offline helper,
// no home-screen app details, no install.

import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { coloursScript, PAPER } from '../../lib/theme.ts';
import { supportStrings } from '../../strings/support-en-GB.ts';
import '../../styles/tokens.css';
import '../../styles/globals.css';

const figtree = localFont({
  src: [
    {
      path: '../../node_modules/@fontsource/figtree/files/figtree-latin-400-normal.woff2',
      weight: '400',
    },
    {
      path: '../../node_modules/@fontsource/figtree/files/figtree-latin-500-normal.woff2',
      weight: '500',
    },
    {
      path: '../../node_modules/@fontsource/figtree/files/figtree-latin-600-normal.woff2',
      weight: '600',
    },
    {
      path: '../../node_modules/@fontsource/figtree/files/figtree-latin-700-normal.woff2',
      weight: '700',
    },
  ],
  variable: '--font-figtree',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: supportStrings.supportDashboard.title,
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: PAPER.light },
    { media: '(prefers-color-scheme: dark)', color: PAPER.dark },
  ],
};

export default function DashboardLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en-GB" className={figtree.variable} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own fixed script, no data in it */}
        <script dangerouslySetInnerHTML={{ __html: coloursScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
