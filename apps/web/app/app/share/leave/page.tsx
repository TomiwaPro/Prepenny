import type { Metadata } from 'next';
import { LeaveScreen } from '../../../../components/LeaveScreen.tsx';
import { strings } from '../../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.together.leave.heading };

export default function Page() {
  return <LeaveScreen />;
}
