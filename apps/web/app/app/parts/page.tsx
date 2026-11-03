import type { Metadata } from 'next';
import { PartsScreen } from '../../../components/PartsScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.parts.heading, robots: { index: false } };

export default function PartsPage() {
  return <PartsScreen />;
}
