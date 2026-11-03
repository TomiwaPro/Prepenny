'use client';

import { ErrorScreen } from '../components/ErrorScreen.tsx';

export default function ScreenError({ reset }: { readonly reset: () => void }) {
  return <ErrorScreen onTryAgain={reset} />;
}
