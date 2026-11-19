import type { Metadata } from 'next';
import { SuggestScreen } from '../../../components/ContactScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.support.idea.heading };

export default function Page() {
  return <SuggestScreen />;
}
