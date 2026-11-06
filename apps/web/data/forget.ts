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

/** The phone database's name (data/db.ts). */
const DATABASE = 'prepenny';

export async function forgetEverything(): Promise<void> {
  try {
    await Dexie.delete(DATABASE);
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
