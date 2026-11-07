'use client';

// The id of the record a screen is for, such as one debt, kept after a "#"
// in the web address: /app/debt/#id=… (step 3c, PLAN.md items 20 and 31).
// What comes after a "#" stays on the phone: it's never sent to PrePenny's
// site, written in its logs or fetched ahead, so a record's id, now also its
// id on the server, never leaves the phone that way. An older address with
// "?id=" still opens the same screen, and becomes the "#" one.

import { useSyncExternalStore } from 'react';

/** The address of a screen for one record. */
export const recordAddress = (path: string, id: string) => `${path}#id=${encodeURIComponent(id)}`;

function idNow(): string {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('id');
  if (fromHash !== null) return fromHash;
  const search = new URLSearchParams(window.location.search);
  const old = search.get('id');
  if (old === null) return '';
  // An older link: the id moves after the "#", and leaves the address it was in.
  search.delete('id');
  const rest = search.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${rest === '' ? '' : `?${rest}`}#id=${encodeURIComponent(old)}`,
  );
  return old;
}

function listen(changed: () => void) {
  window.addEventListener('hashchange', changed);
  window.addEventListener('popstate', changed);
  return () => {
    window.removeEventListener('hashchange', changed);
    window.removeEventListener('popstate', changed);
  };
}

/** The id this screen is for, kept up to date. Empty before the page is running. */
export function useRecordId(): string {
  return useSyncExternalStore(listen, idNow, () => '');
}
