'use client';

// Contact us (step 4i, brief 4.16, D601): under More in the app, and on the
// website at /contact/ for anyone, signed in or not, such as someone who
// can't sign in. Suggest a feature (brief 4.16) is the same form for ideas,
// under More.

import { HELP_ROUTES } from '../lib/help-routes.ts';
import { strings } from '../strings/en-GB.ts';
import { HelpSite } from './HelpSite.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import screenStyles from './Screens.module.css';
import styles from './Support.module.css';
import { SupportForm } from './SupportForm.tsx';

const t = strings.support;

function ContactForm() {
  return (
    <SupportForm
      kind="contact"
      wordsLabel={t.contact.wordsLabel}
      wordsHint={t.contact.wordsHint}
      wordsMissing={t.contact.wordsMissing}
      after={<p className={styles.added}>{t.contact.or}</p>}
      onWriteAnother={() => {}}
    />
  );
}

/** Contact us in the app, under More. */
export function ContactScreen() {
  return (
    <>
      <ScreenHeader
        heading={t.contact.heading}
        purpose={t.contact.purpose}
        back={{ label: strings.security.backToMore, href: '/app/more/' }}
      />
      <section className={screenStyles.card} aria-label={t.contact.heading}>
        <ContactForm />
      </section>
    </>
  );
}

/** Contact us on the website, for anyone, signed in or not. */
export function ContactSite() {
  return (
    <HelpSite contact={false}>
      <header className={screenStyles.header}>
        <h1 className={screenStyles.heading}>{t.contact.heading}</h1>
        <p className={screenStyles.purpose}>{t.contact.purpose}</p>
      </header>
      <section className={styles.siteCard} aria-label={t.contact.heading}>
        <ContactForm />
      </section>
      <p>
        <a className={styles.footerLink} href={HELP_ROUTES.site.index}>
          {strings.support.help}
        </a>
      </p>
    </HelpSite>
  );
}

/** Suggest a feature, under More. */
export function SuggestScreen() {
  return (
    <>
      <ScreenHeader
        heading={t.idea.heading}
        purpose={t.idea.purpose}
        back={{ label: strings.security.backToMore, href: '/app/more/' }}
      />
      <section className={screenStyles.card} aria-label={t.idea.heading}>
        <SupportForm
          kind="idea"
          wordsLabel={t.idea.wordsLabel}
          wordsHint={t.idea.wordsHint}
          wordsMissing={t.idea.wordsMissing}
          onWriteAnother={() => {}}
        />
      </section>
    </>
  );
}
