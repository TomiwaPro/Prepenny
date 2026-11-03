import type { Metadata } from 'next';
import { SimplePage } from '../../../components/SimplePage.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.debts.heading };

export default function DebtsPage() {
  return <SimplePage heading={strings.debts.heading} line={strings.debts.stillBeingBuilt} />;
}
