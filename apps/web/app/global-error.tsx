'use client';

// Used only when the root of every page fails, so it brings its own page and styles.

import { ErrorScreen } from '../components/ErrorScreen.tsx';
import '../styles/tokens.css';
import '../styles/globals.css';

export default function GlobalError({ reset }: { readonly reset: () => void }) {
  return (
    <html lang="en-GB">
      <body>
        <ErrorScreen onTryAgain={reset} />
      </body>
    </html>
  );
}
