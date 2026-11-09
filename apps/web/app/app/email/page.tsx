import type { Metadata } from 'next';
import { EmailsScreen } from '../../../components/EmailsScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.emails.heading };

export default function Page() {
  return <EmailsScreen />;
}
