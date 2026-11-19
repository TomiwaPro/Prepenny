// Contact us on the website, at /contact/ (step 4i, brief 4.16, D601): for
// anyone, signed in or not, such as someone who can't sign in.

import type { Metadata } from 'next';
import { ContactSite } from '../../components/ContactScreen.tsx';
import { strings } from '../../strings/en-GB.ts';

export const metadata: Metadata = {
  title: strings.support.contact.heading,
  description: strings.support.contact.purpose,
};

export default function ContactPage() {
  return <ContactSite />;
}
