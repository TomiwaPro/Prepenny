// The help centre in the app, at /app/help/, under More (step 4g, brief
// 4.16, D587).

import type { Metadata } from 'next';
import { HelpCentre } from '../../../components/HelpCentre.tsx';
import { helpArticles } from '../../../lib/help-articles.ts';
import { searchEntries } from '../../../lib/help-search.ts';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.help.heading };

export default function AppHelpPage() {
  return <HelpCentre entries={searchEntries(helpArticles())} place="app" />;
}
