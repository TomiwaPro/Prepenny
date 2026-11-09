import type { Metadata } from 'next';
import { DevicesScreen } from '../../../components/DevicesScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.devices.heading };

export default function Page() {
  return <DevicesScreen />;
}
