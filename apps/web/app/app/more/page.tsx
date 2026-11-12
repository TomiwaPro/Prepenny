import type { Metadata } from 'next';
import { AccountCard } from '../../../components/AccountCard.tsx';
import { ColourChoice } from '../../../components/ColourChoice.tsx';
import { MoreLinks } from '../../../components/MoreLinks.tsx';
import { SecurityCard } from '../../../components/SecurityCard.tsx';
import { SimplePage } from '../../../components/SimplePage.tsx';
import { StartAgain } from '../../../components/StartAgain.tsx';
import { YourDataCard } from '../../../components/YourDataCard.tsx';
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
      <AccountCard />
      <SecurityCard />
      <YourDataCard />
      <ColourChoice />
      <StartAgain />
    </SimplePage>
  );
}
