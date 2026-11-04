import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DebtScreen } from '../../../components/DebtScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.debts.heading };

// One debt, found by the id after the question mark (ARCHITECTURE.md 5): a
// static page can't be made for each debt.
export default function DebtPage() {
  return (
    <Suspense>
      <DebtScreen />
    </Suspense>
  );
}
