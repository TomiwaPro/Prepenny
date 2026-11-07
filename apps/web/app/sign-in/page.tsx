import type { Metadata } from 'next';
import { SignInScreen } from '../../components/SignInScreen.tsx';
import { strings } from '../../strings/en-GB.ts';

export const metadata: Metadata = {
  title: strings.signIn.signInHeading,
  description: strings.signIn.signInPurpose,
};

export default function SignInPage() {
  return <SignInScreen />;
}
