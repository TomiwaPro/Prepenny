import type { Metadata } from 'next';
import { ShareAccountsScreen } from '../../../../components/ShareAccountsScreen.tsx';
import { strings } from '../../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.share.accountsTitle };

export default function Page() {
  return <ShareAccountsScreen />;
}
