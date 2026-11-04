import type { Metadata } from 'next';
import { DebtsScreen } from '../../../components/DebtsScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.debts.heading };

export default function DebtsPage() {
  return <DebtsScreen />;
}
