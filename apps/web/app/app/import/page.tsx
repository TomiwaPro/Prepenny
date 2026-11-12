import type { Metadata } from 'next';
import { ImportScreen } from '../../../components/ImportScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.yourData.import };

export default function Page() {
  return <ImportScreen />;
}
