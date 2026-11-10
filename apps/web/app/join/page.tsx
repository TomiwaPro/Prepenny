import type { Metadata } from 'next';
import { JoinScreen } from '../../components/JoinScreen.tsx';
import { strings } from '../../strings/en-GB.ts';

export const metadata: Metadata = {
  title: strings.join.heading,
  description: strings.join.purpose,
};

export default function JoinPage() {
  return <JoinScreen />;
}
