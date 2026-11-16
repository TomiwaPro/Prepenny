'use client';

// The steps to add PrePenny to the home screen (step 4d, D548): for an
// Android phone in Chrome and an iPhone in Safari, in the phone's own button
// names, this phone's first. Where the browser offers its own install, one
// tap asks it, with its own confirm. On an iPhone, a plan made in Safari
// without an account stays in Safari, so someone with a plan who isn't
// signed in is told to sign up first, so it comes with them.

import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { answerSuggestion, installWithBrowser, useHomeScreen } from '../lib/install.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import styles from './Install.module.css';
import { Sheet } from './Sheet.tsx';

const t = strings.homeScreen;

function PhoneSteps({
  phone,
  level,
  signUpFirst,
}: {
  readonly phone: 'android' | 'iphone';
  readonly level: 2 | 3;
  readonly signUpFirst: boolean;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  const words = phone === 'android' ? t.android : t.iphone;
  return (
    <section className={styles.phone} data-testid={`steps-${phone}`}>
      <Heading className={styles.phoneHeading}>{words.heading}</Heading>
      <ol className={styles.list}>
        {words.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {words.notes.map((note) => (
        <p key={note} className={styles.note}>
          {note}
        </p>
      ))}
      {phone === 'iphone' && signUpFirst ? (
        <div className={styles.signUp} data-testid="sign-up-first">
          <p>{t.iphone.signUpFirst}</p>
          <Link href="/sign-in/?to=sign-up&from=more">{t.iphone.signUp}</Link>
        </div>
      ) : null}
    </section>
  );
}

export function InstallSteps({
  level,
  signUpFirst,
}: {
  readonly level: 2 | 3;
  /** On an iPhone, with a plan of one's own and no account: sign up first, so the plan comes along. */
  readonly signUpFirst: boolean;
}) {
  const state = useHomeScreen();
  const [said, setSaid] = useState('');
  const order =
    state.phone === 'iphone' ? (['iphone', 'android'] as const) : (['android', 'iphone'] as const);
  return (
    <div className={styles.steps}>
      {state.asApp ? (
        <p className={styles.status} data-testid="on-home-screen">
          {t.usingApp}
        </p>
      ) : null}
      {state.canInstall ? (
        <div className={styles.install}>
          <button
            type="button"
            className={formStyles.main}
            onClick={async () => {
              // The browser's own install answers the suggestion too (D546).
              answerSuggestion();
              const outcome = await installWithBrowser();
              setSaid(outcome === 'accepted' ? t.added : t.notAdded);
            }}
          >
            {t.addNow}
          </button>
          <p className={styles.note}>{t.addNowHint}</p>
        </div>
      ) : null}
      {/* Said aloud as soon as the browser has answered. */}
      <p className={styles.status} role="status" data-testid="install-said">
        {said}
      </p>
      {order.map((phone) => (
        <PhoneSteps
          key={phone}
          phone={phone}
          level={level}
          signUpFirst={signUpFirst && state.phone === 'iphone' && !state.asApp}
        />
      ))}
    </div>
  );
}

/** The steps in a sheet: from Home's suggestion, and before setup on an iPhone. */
export function InstallSheet({
  open,
  signUpFirst,
  onClose,
  children,
}: {
  readonly open: boolean;
  readonly signUpFirst: boolean;
  readonly onClose: () => void;
  /** Anything after the steps, such as "Make my plan here in Safari". */
  readonly children?: ReactNode;
}) {
  return (
    <Sheet open={open} title={t.heading} intro={t.purpose} onClose={onClose}>
      <InstallSteps level={3} signUpFirst={signUpFirst} />
      {children}
    </Sheet>
  );
}
