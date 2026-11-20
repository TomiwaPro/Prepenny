import type { Metadata } from 'next';
import { StopGetBackInScreen } from '../../components/StopGetBackInScreen.tsx';
import { strings } from '../../strings/en-GB.ts';

export const metadata: Metadata = {
  title: strings.stopTwoStepOff.heading,
  description: strings.stopTwoStepOff.purpose,
};

export default function StopTwoStepOffPage() {
  return <StopGetBackInScreen kind="two-step-off" />;
}
