import type { Metadata } from 'next';
import { StopGetBackInScreen } from '../../components/StopGetBackInScreen.tsx';
import { strings } from '../../strings/en-GB.ts';

export const metadata: Metadata = {
  title: strings.stopGetBackIn.heading,
  description: strings.stopGetBackIn.purpose,
};

export default function StopGetBackInPage() {
  return <StopGetBackInScreen />;
}
