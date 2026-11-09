import type { Metadata } from 'next';
import { LockSettingsScreen } from '../../../components/LockSettingsScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.lock.heading };

export default function Page() {
  return <LockSettingsScreen />;
}
