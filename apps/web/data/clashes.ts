'use client';

// The clashes and refused changes the person is told about (step 3d): kept
// on the phone until they've seen each one, oldest first, one at a time
// (VOICE.md). The words are made on the screen from the facts kept here,
// which come only from records this person can read (lib/clash.ts).

import { useSyncExternalStore } from 'react';
import { openDb, ownPlanOnPhone, type StoredClash } from './db.ts';

/** A clash to show, with whose change it was, as the screen says it. */
export interface ClashToShow extends StoredClash {
  /** The person's own other phone, or someone else in the plan with their nickname ('' when they have none). */
  readonly who:
    | { readonly kind: 'other-phone' }
    | { readonly kind: 'partner'; readonly nickname: string };
}

let showing: readonly ClashToShow[] = [];
const listeners = new Set<() => void>();
let looking: Promise<void> | null = null;
let lookAgain = false;

/** Reads the clashes not seen yet for the person's own plan, oldest first. */
async function look(): Promise<void> {
  const db = openDb();
  try {
    const own = await ownPlanOnPhone(db);
    const link = own === undefined ? undefined : await db.links.get(own.id);
    if (own === undefined || link === undefined) {
      showing = [];
      return;
    }
    const kept = await db.clashes.where('planId').equals(own.id).toArray();
    showing = kept
      .filter((one) => one.dismissed !== true)
      .sort((a, b) => a.at - b.at)
      .map((one) => ({
        ...one,
        who:
          one.facts.by === null || one.facts.by === link.personId
            ? { kind: 'other-phone' as const }
            : { kind: 'partner' as const, nickname: link.nicknames?.[one.facts.by] ?? '' },
      }));
  } catch {
    // No database: nothing to tell.
    showing = [];
  } finally {
    db.close();
  }
}

/** Looks again, and tells the screens. Called whenever a clash is kept or seen. */
export function clashesChanged(): void {
  if (looking !== null) {
    lookAgain = true;
    return;
  }
  looking = (async () => {
    do {
      lookAgain = false;
      await look();
    } while (lookAgain);
    looking = null;
    for (const listener of listeners) listener();
  })();
}

/** The clashes not seen yet, oldest first, kept up to date. */
export function useClashes(): readonly ClashToShow[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      if (listeners.size === 1) clashesChanged();
      return () => listeners.delete(listener);
    },
    () => showing,
    () => showing,
  );
}

/** The person has seen it: it isn't shown again, even if the server tells this phone again. */
export async function dismissClash(id: string): Promise<void> {
  const db = openDb();
  try {
    const clash = await db.clashes.get(id);
    if (clash !== undefined) await db.clashes.put({ ...clash, dismissed: true });
  } finally {
    db.close();
  }
  clashesChanged();
}
