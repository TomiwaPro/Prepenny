import type { Metadata } from 'next';
import { ColourChoice } from '../../../components/ColourChoice.tsx';
import { SimplePage } from '../../../components/SimplePage.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.more.heading };

export default function MorePage() {
  return (
    <SimplePage heading={strings.more.heading} line={strings.more.stillBeingBuilt}>
      <ColourChoice />
    </SimplePage>
  );
}
