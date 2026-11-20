import type { Metadata } from 'next';
import { SupportAccessScreen } from '../../../components/SupportAccessScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.supportAccess.heading };

export default function Page() {
  return <SupportAccessScreen />;
}
