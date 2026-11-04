import type { Metadata } from 'next';
import { GoalsScreen } from '../../../components/GoalsScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.goals.heading };

export default function Page() {
  return <GoalsScreen />;
}
