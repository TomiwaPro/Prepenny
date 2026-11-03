// The home-screen app's details (brief 7.1: installable). Built into
// /manifest.webmanifest, with its words from the strings file.

import type { MetadataRoute } from 'next';
import { strings } from '../strings/en-GB.ts';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app/',
    name: strings.app.name,
    short_name: strings.app.name,
    description: strings.app.description,
    lang: 'en-GB',
    dir: 'ltr',
    start_url: '/app/',
    scope: '/',
    display: 'standalone',
    background_color: '#f4efe6',
    theme_color: '#f4efe6',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
