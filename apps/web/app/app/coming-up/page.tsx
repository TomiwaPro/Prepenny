import type { Metadata } from 'next';
import { ComingUpScreen } from '../../../components/ComingUpScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.comingUp.heading };

export default function ComingUpPage() {
  return <ComingUpScreen />;
}
