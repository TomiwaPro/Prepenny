import type { Metadata } from 'next';
import { DownloadScreen } from '../../../components/DownloadScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.yourData.download };

export default function Page() {
  return <DownloadScreen />;
}
