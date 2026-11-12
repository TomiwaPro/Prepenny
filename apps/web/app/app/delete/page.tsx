import type { Metadata } from 'next';
import { DeleteScreen } from '../../../components/DeleteScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.yourData.deleteHeading };

export default function Page() {
  return <DeleteScreen />;
}
