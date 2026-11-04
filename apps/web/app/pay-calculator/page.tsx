import type { Metadata } from 'next';
import { PublicPayScreen } from '../../components/PublicPayScreen.tsx';
import { strings } from '../../strings/en-GB.ts';

export const metadata: Metadata = {
  title: strings.pay.publicHeading,
  description: strings.pay.publicPurpose,
};

export default function PayCalculatorPage() {
  return <PublicPayScreen />;
}
