// Signing out removes the plan, and everything else PrePenny keeps, from this
// phone (brief 4.13, PLAN.md item 20), so a shared or borrowed phone keeps
// nothing behind: the phone's database (every plan, the example included,
// What if's practice changes and which plan was showing), the browser's small
// stores (the sign-in itself, Light or Dark, how Coming up is grouped,
// whether "How to read this" was seen, and pay from the calculator). Only the
// app's own files stay, which hold nothing of anyone's, so PrePenny still
// opens with no signal. Whatever is still in memory goes when the page is
// loaded afresh, straight after.

import { Dexie } from 'dexie';
import { openDb, ownPlanOnPhone } from './db.ts';

/** The phone database's name (data/db.ts). */
const DATABASE = 'prepenny';

/**
 * How long to wait for the database to go. PrePenny open in another tab can
 * hold it for a moment; that tab lets go as soon as it's asked, and the
 * removal finishes then, even after this page has moved on.
 */
const WAIT_MS = 3000;

/**
 * True when the person's own plan on this phone is safely in their account:
 * kept there, with nothing left to send, or there's no plan of their own at
 * all (step 3c). Only then does a sign-in that ends by itself remove it from
 * the phone (PLAN.md item 29); otherwise it stays, so nothing is lost.
 */
export async function planSafelyKept(): Promise<boolean> {
  try {
    const db = openDb();
    try {
      const own = await ownPlanOnPhone(db);
      if (own === undefined) return true;
      if ((await db.links.get(own.id)) === undefined) return false;
      return (await db.unsent.where('planId').equals(own.id).count()) === 0;
    } finally {
      db.close();
    }
  } catch {
    // No database on this phone, as in some private windows: nothing is kept.
    return true;
  }
}

export async function forgetEverything(): Promise<void> {
  try {
    await Promise.race([
      Dexie.delete(DATABASE),
      new Promise((resolve) => setTimeout(resolve, WAIT_MS)),
    ]);
  } catch {
    // No database on this phone, as in some private windows: nothing was kept.
  }
  try {
    localStorage.clear();
  } catch {
    // Nothing kept there either.
  }
  try {
    sessionStorage.clear();
  } catch {
    // Nor there.
  }
}
