import type { Metadata } from 'next';
import { RemindersScreen } from '../../../components/RemindersScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.reminders.heading };

export default function Page() {
  return <RemindersScreen />;
}
