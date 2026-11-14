// Holding up the phone's own database for a while, as a slow or busy phone
// can, so PrePenny's next save in one part of it waits until then (D510).
// What's on screen and what's kept must still agree when PrePenny is closed
// or reloaded in that moment.

import type { Page } from '@playwright/test';

/** Keeps one part of the phone's database (`store`) busy for `ms` milliseconds; reloading ends it. */
export async function holdPhoneStorage(page: Page, store: string, ms: number) {
  await page.evaluate(
    ([part, hold]) =>
      new Promise<void>((started, failed) => {
        const request = indexedDB.open('prepenny');
        request.onerror = () => failed(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const held = db.transaction(part, 'readwrite').objectStore(part);
          const until = performance.now() + hold;
          const again = () => {
            if (performance.now() < until) held.count().onsuccess = again;
          };
          again();
          // Closes once the held transaction ends.
          db.close();
          started();
        };
      }),
    [store, ms] as const,
  );
}

/** What the phone has noted as brought down from the account so far: its change numbers, added up. */
export async function seenOnPhone(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((found, failed) => {
        const request = indexedDB.open('prepenny');
        request.onerror = () => failed(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction('links').objectStore('links').getAll();
          all.onsuccess = () => {
            db.close();
            const links = all.result as { shared?: number; mine?: number }[];
            found(links.reduce((sum, one) => sum + (one.shared ?? 0) + (one.mine ?? 0), 0));
          };
          all.onerror = () => failed(all.error);
        };
      }),
  );
}

/**
 * Cuts off the phone's next rebuild of its plan from what it has brought down
 * from the account, as closing PrePenny at that moment would: the save that
 * puts the rebuilt plan on the phone is stopped before it's kept. It's the
 * only save that writes the plan, its records and its waiting changes, and
 * none of what it keeps for this device or the account's rows (D510).
 */
export async function cutOffNextRebuild(page: Page) {
  await page.evaluate(() => {
    const open = IDBDatabase.prototype.transaction;
    let armed = true;
    IDBDatabase.prototype.transaction = function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      const transaction = open.apply(this, args);
      const scope = Array.from(transaction.objectStoreNames);
      const rebuild =
        args[1] === 'readwrite' &&
        ['plans', 'records', 'unsent'].every((part) => scope.includes(part)) &&
        !scope.includes('rows') &&
        !scope.includes('device');
      if (armed && rebuild) {
        armed = false;
        transaction.abort();
      }
      return transaction;
    };
  });
}
