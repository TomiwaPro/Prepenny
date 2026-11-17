// A stand-in push service and a stand-in phone for the reminders tests (step
// 4e). The test browser can't reach Google's real push service, so:
//
// - the page's browser is given a push address at a small server here, on
//   a port of this test's own, with a P-256 key pair and secret made here;
// - PrePenny's reminders function, running in the local Supabase, sends to
//   that address (host.docker.internal, which the local Supabase only allows,
//   supabase/seed.sql), sealed for the phone as it would be for a real one;
// - this server keeps what arrives, and the test opens it with the phone's
//   own private key, as the phone's browser would: so each check reads the
//   words the person would see, after the real encryption.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BrowserContext } from '@playwright/test';
import { base64url, openOnPhone } from '../lib/web-push.ts';

export interface Arrived {
  readonly path: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: Uint8Array<ArrayBuffer>;
}

export interface StandIn {
  readonly arrived: Arrived[];
  /** Addresses this push service says are gone (410), as when PrePenny is removed from a phone. */
  readonly gone: Set<string>;
  readonly address: (name: string) => string;
  readonly close: () => Promise<void>;
}

export async function standInPushService(): Promise<StandIn> {
  const arrived: Arrived[] = [];
  const gone = new Set<string>();
  const server: Server = createServer((request, response) => {
    const parts: Buffer[] = [];
    request.on('data', (part: Buffer) => parts.push(part));
    request.on('end', () => {
      const path = request.url ?? '';
      const body = new Uint8Array(Buffer.concat(parts));
      arrived.push({ path, headers: request.headers, body });
      response.statusCode = gone.has(path) ? 410 : 201;
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    arrived,
    gone,
    address: (name) => `http://host.docker.internal:${port}/push/${name}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** A phone's push keys, made here, so the test can open what it's sent. */
export async function phoneKeys() {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  return {
    keys,
    p256dh: base64url(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))),
    auth: base64url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

export type PhoneKeys = Awaited<ReturnType<typeof phoneKeys>>;

/** What the page's window says once its browser has forgotten the push address. */
export const UNSUBSCRIBED = 'test-push-unsubscribed';

/**
 * The page's browser makes this push address when asked (PushManager), as a
 * real phone's would with its push service, and allows notifications. It
 * keeps it for the tab, and forgets it when unsubscribed, counting how often.
 */
export async function givePushAddress(context: BrowserContext, endpoint: string, phone: PhoneKeys) {
  await context.grantPermissions(['notifications']);
  await context.addInitScript(
    ({ endpoint: address, p256dh, auth, UNSUBSCRIBED }) => {
      const KEY = 'test-push-address';
      const make = (key: unknown) => ({
        endpoint: address,
        options: { applicationServerKey: key, userVisibleOnly: true },
        toJSON: () => ({ endpoint: address, keys: { p256dh, auth } }),
        unsubscribe: async () => {
          sessionStorage.removeItem(KEY);
          // Kept where signing out doesn't clear it, so the test can see it happened.
          window.name = UNSUBSCRIBED;
          return true;
        },
      });
      const kept = () => {
        const text = sessionStorage.getItem(KEY);
        return text === null ? null : make(new Uint8Array(JSON.parse(text) as number[]));
      };
      PushManager.prototype.subscribe = async function subscribe(
        options?: PushSubscriptionOptionsInit,
      ) {
        const key = new Uint8Array(options?.applicationServerKey as ArrayBuffer);
        sessionStorage.setItem(KEY, JSON.stringify([...key]));
        return make(key) as unknown as PushSubscription;
      };
      PushManager.prototype.getSubscription = async function getSubscription() {
        return kept() as unknown as PushSubscription | null;
      };
      // Chrome's headless shell, used for the tests, always says notifications
      // are blocked: here the person has tapped Allow, as on a real phone.
      Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
      Notification.requestPermission = async () => 'granted';
    },
    { endpoint, p256dh: phone.p256dh, auth: phone.auth, UNSUBSCRIBED },
  );
}

/** The words of each reminder that arrived for this address, opened with the phone's own key. */
export async function wordsFor(service: StandIn, endpoint: string, phone: PhoneKeys) {
  const path = new URL(endpoint).pathname;
  const opened: { title: string; body: string; tag: string; url: string }[] = [];
  for (const one of service.arrived.filter((item) => item.path === path)) {
    opened.push(JSON.parse(await openOnPhone(one.body, phone)));
  }
  return opened;
}
