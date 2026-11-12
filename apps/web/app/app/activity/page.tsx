import type { Metadata } from 'next';
import { ActivityScreen } from '../../../components/ActivityScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.together.heading };

export default function Page() {
  return <ActivityScreen />;
}
