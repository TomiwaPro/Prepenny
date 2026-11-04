import type { Metadata } from 'next';
import { JobScreen } from '../../../components/JobScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.job.heading };

export default function Page() {
  return <JobScreen />;
}
