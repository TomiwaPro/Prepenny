import type { Metadata } from 'next';
import { TwoStepScreen } from '../../../components/TwoStepScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.twoStep.heading };

export default function Page() {
  return <TwoStepScreen />;
}
