import type { Metadata } from 'next';
import { ShareScreen } from '../../../components/ShareScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.share.heading };

export default function Page() {
  return <ShareScreen />;
}
