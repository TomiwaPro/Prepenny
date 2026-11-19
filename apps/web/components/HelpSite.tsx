// The help centre on the website (step 4g, D587): for anyone, signed in or
// not, such as someone who can't sign in. PrePenny's name at the top, which
// goes to the website's first page, and "Open PrePenny"; then the same
// help as in the app, in the same column.

import type { ReactNode } from 'react';
import { strings } from '../strings/en-GB.ts';
import styles from './Help.module.css';

export function HelpSite({ children }: { readonly children: ReactNode }) {
  return (
    <div className={styles.site}>
      <div className={styles.siteTop}>
        {/* Plain links, so nothing is fetched ahead of a tap. */}
        <a className={styles.wordmark} href="/">
          {strings.help.siteHome}
        </a>
        <a className={styles.openApp} href="/app/">
          {strings.help.openApp}
        </a>
      </div>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
