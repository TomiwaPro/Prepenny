import type { Metadata } from 'next';
import { SimplePage } from '../../../components/SimplePage.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.plan.heading };

export default function PlanPage() {
  return <SimplePage heading={strings.plan.heading} line={strings.plan.stillBeingBuilt} />;
}
