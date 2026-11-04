import type { Metadata } from 'next';
import { AccountsScreen } from '../../../components/AccountsScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.accounts.heading };

export default function Page() {
  return <AccountsScreen />;
}
