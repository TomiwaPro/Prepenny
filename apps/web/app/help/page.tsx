// The help centre on the website, at /help/ (step 4g, brief 4.16, D587).

import type { Metadata } from 'next';
import { HelpCentre } from '../../components/HelpCentre.tsx';
import { HelpSite } from '../../components/HelpSite.tsx';
import { helpArticles } from '../../lib/help-articles.ts';
import { searchEntries } from '../../lib/help-search.ts';
import { strings } from '../../strings/en-GB.ts';

export const metadata: Metadata = {
  title: strings.help.heading,
  description: strings.help.purpose,
};

export default function HelpPage() {
  return (
    <HelpSite>
      <HelpCentre entries={searchEntries(helpArticles())} place="site" />
    </HelpSite>
  );
}
