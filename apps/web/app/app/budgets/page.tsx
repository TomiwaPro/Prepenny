import type { Metadata } from 'next';
import { BudgetsScreen } from '../../../components/BudgetsScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.budgets.heading };

export default function Page() {
  return <BudgetsScreen />;
}
