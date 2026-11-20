import type { Metadata } from 'next';
import { ContactScreen } from '../../../components/ContactScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.support.contact.heading };

export default function Page() {
  return <ContactScreen />;
}
