'use client';

// The live app's old address, prepenny.prepenny.workers.dev, sends people to
// the same page on prepenny.co.uk (step 3f-2, D428). Cloudflare does it for a
// page opened fresh (cloudflare/worker.ts). A phone that installed PrePenny
// at the old address has its offline helper serve the page itself, so this
// does it there, once the helper has the new version.
//
// A browser keeps each address's things apart, so something kept only on
// this phone at the old address couldn't be reached from prepenny.co.uk: a
// plan never saved in an account, or changes not sent yet. Such a phone
// stays, and says why, until it has all gone to the account.

import { useEffect, useState } from 'react';
import { liveAddressFor } from '../lib/site.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './PreviewLine.module.css';

export function OldAddress() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const target = liveAddressFor(window.location);
    if (target === null) return;
    void (async () => {
      const { heldOnlyHere } = await import('../data/sync.ts');
      if (await heldOnlyHere()) {
        setHeld(true);
        return;
      }
      window.location.replace(target);
    })();
  }, []);
  if (!held) return null;
  return (
    <p className={styles.line} role="status" data-testid="old-address">
      {strings.oldAddress.line}
    </p>
  );
}
