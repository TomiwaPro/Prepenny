import type { Metadata } from 'next';
import { InstallScreen } from '../../../components/InstallScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.homeScreen.heading };

export default function Page() {
  return <InstallScreen />;
}
