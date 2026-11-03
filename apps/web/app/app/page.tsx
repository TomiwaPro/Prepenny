import type { Metadata } from 'next';
import { HomeScreen } from '../../components/HomeScreen.tsx';
import { strings } from '../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.home.heading };

export default function HomePage() {
  return <HomeScreen />;
}
