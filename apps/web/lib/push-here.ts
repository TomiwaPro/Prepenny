'use client';

// This browser's own push address for PrePenny's reminders (step 4e), on
// its own so clearing the phone can forget it without loading anything else
// (data/forget.ts).

/** This browser's own push address for PrePenny, if it has one. Never waits for the offline helper. */
export async function browserAddress(): Promise<string | null> {
  try {
    if (!('serviceWorker' in navigator)) return null;
    const found = await navigator.serviceWorker.getRegistration();
    return (await found?.pushManager.getSubscription())?.endpoint ?? null;
  } catch {
    return null;
  }
}

/** The browser forgets PrePenny's push address, so its push service takes nothing more for it. */
export async function unsubscribeHere(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const found = await navigator.serviceWorker.getRegistration();
    await (await found?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // No push address here: nothing to forget.
  }
}
