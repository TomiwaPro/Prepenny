import type { Metadata } from 'next';
import { PayScreen } from '../../../components/PayScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.pay.heading };

export default function PayPage() {
  return <PayScreen />;
}
