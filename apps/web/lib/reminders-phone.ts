'use client';

// Reminders on this phone (step 4e, D560 to D566): the person's choices,
// kept in their account, and this phone's push address, which its browser
// makes with its push service (Apple's, Google's or Mozilla's) when the
// person turns a reminder on.
//
// - Reminders need an account (D562): the server sends them, even when
//   PrePenny is closed.
// - On an iPhone, only PrePenny opened from the Home Screen can get them
//   (D22, D562).
// - The push address and the phone's keys go to PrePenny's server only, for
//   this sign-in. Signing out forgets them first, and the phone tells its
//   push service to forget the address too (D563).
// - Nothing about money is sent: a reminder's words are worked out on the
//   server and sealed for this phone alone (D564).

import { signedInClient } from './account.ts';
import { phoneOf } from './install.ts';
import { browserAddress, unsubscribeHere } from './push-here.ts';
import { fromBase64url } from './web-push.ts';

export { browserAddress, unsubscribeHere };

export interface RemindersState {
  readonly payday: boolean;
  readonly evening: boolean;
  readonly shortfall: boolean;
  readonly weekly: boolean;
  readonly hideAmounts: boolean;
  /** The push address PrePenny's server has for this phone's sign-in, or null. */
  readonly thisPhone: string | null;
  /** PrePenny's public key, for this phone's browser, or null until the server has one. */
  readonly publicKey: string | null;
}

export type Choices = Pick<
  RemindersState,
  'payday' | 'evening' | 'shortfall' | 'weekly' | 'hideAmounts'
>;

export type Problem = 'offline' | 'server' | 'not-allowed' | 'in-use' | 'bad-address';

export type Done<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: Problem };

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<Done<T>> {
  if (offline()) return { ok: false, problem: 'offline' };
  try {
    const client = await signedInClient();
    if (client === null) return { ok: false, problem: 'not-allowed' };
    const { data, error } = await client.rpc(name, args);
    if (error !== null) {
      const message = (error as { message?: unknown }).message;
      if (message === 'in-use' || message === 'bad-address' || message === 'not-allowed') {
        return { ok: false, problem: message };
      }
      return { ok: false, problem: offline() ? 'offline' : 'server' };
    }
    return { ok: true, value: data as T };
  } catch {
    return { ok: false, problem: offline() ? 'offline' : 'server' };
  }
}

interface ServerState {
  readonly payday: boolean;
  readonly evening: boolean;
  readonly shortfall: boolean;
  readonly weekly: boolean;
  readonly hide_amounts: boolean;
  readonly this_phone: string | null;
  readonly public_key: string | null;
}

const stateOf = (server: ServerState): RemindersState => ({
  payday: server.payday,
  evening: server.evening,
  shortfall: server.shortfall,
  weekly: server.weekly,
  hideAmounts: server.hide_amounts,
  thisPhone: server.this_phone,
  publicKey: server.public_key,
});

export const anyOn = (choices: Choices) =>
  choices.payday || choices.evening || choices.shortfall || choices.weekly;

/** The person's own choices, and whether this phone gets them. */
export async function myReminders(): Promise<Done<RemindersState>> {
  const answer = await call<ServerState>('my_reminders');
  return answer.ok ? { ok: true, value: stateOf(answer.value) } : answer;
}

/** Saves the person's choices (D560, D561). With every one off, the server forgets their phones. */
export async function chooseReminders(choices: Choices): Promise<Done<RemindersState>> {
  const answer = await call<ServerState>('choose_reminders', {
    payday: choices.payday,
    evening: choices.evening,
    shortfall: choices.shortfall,
    weekly: choices.weekly,
    hide_amounts: choices.hideAmounts,
  });
  if (!answer.ok) return answer;
  if (!anyOn(choices)) await unsubscribeHere();
  return { ok: true, value: stateOf(answer.value) };
}

/**
 * Whether this phone can get reminders: yes; an iPhone that needs PrePenny
 * opened from its Home Screen first (D22, D562); or a browser that can't
 * show notifications from a website at all.
 */
export type PhoneCan = 'yes' | 'iphone-home-screen' | 'no';

export function phoneCan(asApp: boolean): PhoneCan {
  if (typeof window === 'undefined') return 'no';
  const phone = phoneOf(navigator.userAgent, navigator.maxTouchPoints);
  if (phone === 'iphone' && !asApp) return 'iphone-home-screen';
  const can = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return can ? 'yes' : phone === 'iphone' ? 'iphone-home-screen' : 'no';
}

/** Whether the person has blocked notifications from PrePenny on this phone. */
export function blocked(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'denied';
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
  ]);
}

const sameKey = (one: ArrayBuffer | null, two: Uint8Array) =>
  one !== null &&
  one.byteLength === two.length &&
  new Uint8Array(one).every((byte, index) => byte === two[index]);

export type Subscribed = Done<RemindersState> | { readonly ok: false; readonly problem: 'refused' };

/**
 * Gets reminders on this phone: asks the phone to allow notifications (only
 * from a tap, as phones ask), has its browser make a push address for
 * PrePenny with PrePenny's public key, and gives the address and the
 * phone's keys to PrePenny's server, for this sign-in.
 */
export async function getOnThisPhone(publicKey: string): Promise<Subscribed> {
  try {
    if (Notification.permission !== 'granted') {
      const allowed = await Notification.requestPermission();
      if (allowed !== 'granted') return { ok: false, problem: 'refused' };
    }
    const ready = await registration();
    if (ready === null) return { ok: false, problem: 'server' };
    const key = fromBase64url(publicKey);
    let subscription = await ready.pushManager.getSubscription();
    // An address made with another key, or someone else's from before, isn't used.
    if (subscription !== null && !sameKey(subscription.options.applicationServerKey, key)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      subscription ??= await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const json = subscription.toJSON();
      const answer = await call<ServerState>('add_push_address', {
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth_secret: json.keys?.auth ?? '',
      });
      if (answer.ok) return { ok: true, value: stateOf(answer.value) };
      // The address is still someone else's, as on a phone shared before:
      // a new one, once.
      if (answer.problem !== 'in-use') return answer;
      await subscription.unsubscribe();
      subscription = null;
    }
    return { ok: false, problem: 'server' };
  } catch {
    return { ok: false, problem: offline() ? 'offline' : 'server' };
  }
}

/**
 * Before signing out (D563): if this phone gets reminders, PrePenny's server
 * forgets its push address for this sign-in, waiting 2 seconds at most, and
 * the browser forgets it. A phone without reminders isn't held up at all.
 */
export async function forgetThisPhone(): Promise<void> {
  if ((await browserAddress()) === null) return;
  if (!offline()) {
    await Promise.race([
      call('remove_push_address'),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
  await unsubscribeHere();
}
