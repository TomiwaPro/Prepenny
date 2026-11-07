import type { Metadata } from 'next';
import { DebtScreen } from '../../../components/DebtScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.debts.heading };

// One debt, found by the id after the "#" (ARCHITECTURE.md 5, step 3c): a
// static page can't be made for each debt, and what's after a "#" never
// leaves the phone (lib/record-id.ts).
export default function DebtPage() {
  return <DebtScreen />;
}
