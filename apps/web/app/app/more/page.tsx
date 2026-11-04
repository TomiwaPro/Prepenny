import type { Metadata } from 'next';
import { ColourChoice } from '../../../components/ColourChoice.tsx';
import { MoreLinks } from '../../../components/MoreLinks.tsx';
import { SimplePage } from '../../../components/SimplePage.tsx';
import { StartAgain } from '../../../components/StartAgain.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.more.heading };

export default function MorePage() {
  return (
    <SimplePage
      heading={strings.more.heading}
      purpose={strings.more.purpose}
      line={strings.more.stillBeingBuilt}
    >
      <MoreLinks />
      <ColourChoice />
      <StartAgain />
    </SimplePage>
  );
}
