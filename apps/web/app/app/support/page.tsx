import type { Metadata } from 'next';
import { SupportScreen } from '../../../components/SupportScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.supportTools.heading };

export default function Page() {
  return <SupportScreen />;
}
