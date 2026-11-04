import type { Metadata } from 'next';
import { SetupScreen } from '../../components/setup/SetupScreen.tsx';
import { strings } from '../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.setup.pageTitle };

export default function SetupPage() {
  return <SetupScreen />;
}
