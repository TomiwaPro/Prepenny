import type { Metadata } from 'next';
import { GetBackInScreen } from '../../components/GetBackInScreen.tsx';
import { strings } from '../../strings/en-GB.ts';

export const metadata: Metadata = {
  title: strings.getBackIn.heading,
  description: strings.getBackIn.purpose,
};

export default function GetBackInPage() {
  return <GetBackInScreen />;
}
