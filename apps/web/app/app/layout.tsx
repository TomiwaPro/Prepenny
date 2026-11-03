import type { ReactNode } from 'react';
import { AppShell } from '../../components/AppShell.tsx';

export default function AppLayout({ children }: { readonly children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
