// The home-screen app's details (brief 7.1: installable). Built into
// /manifest.webmanifest, with its words from the strings file. Since step
// 4d, a long press of the icon on Android offers Update balance and I spent
// (D551).

import type { MetadataRoute } from 'next';
import { SHORTCUTS } from '../lib/shortcuts.ts';
import { PAPER } from '../lib/theme.ts';
import { strings } from '../strings/en-GB.ts';

export const dynamic = 'force-static';

/**
 * The opening screen's colours when the phone is in dark mode (step 4d,
 * D550): the manifest standard's own `color_scheme_dark` (W3C, April 2026).
 * Chrome on Android doesn't read it yet, having taken out its trial of it in
 * Chrome 127, so Android's opening screen stays light until it does; a
 * browser that doesn't know it leaves it alone.
 */
const darkColours = {
  color_scheme_dark: { background_color: PAPER.dark, theme_color: PAPER.dark },
};

export default function manifest(): MetadataRoute.Manifest {
  return {
    ...darkColours,
    id: '/app/',
    name: strings.app.name,
    short_name: strings.app.name,
    description: strings.app.description,
    lang: 'en-GB',
    dir: 'ltr',
    start_url: '/app/',
    scope: '/',
    display: 'standalone',
    background_color: PAPER.light,
    theme_color: PAPER.light,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    // PrePenny's own icon beside each, as Android asks for one at least 96 by 96.
    shortcuts: [
      {
        name: strings.actions.updateBalance,
        short_name: strings.actions.updateBalance,
        url: SHORTCUTS['update-balance'],
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: strings.actions.spent,
        short_name: strings.actions.spent,
        url: SHORTCUTS.spent,
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
