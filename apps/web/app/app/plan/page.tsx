import type { Metadata } from 'next';
import { PlanScreen } from '../../../components/PlanScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.plan.heading };

export default function PlanPage() {
  return <PlanScreen />;
}
